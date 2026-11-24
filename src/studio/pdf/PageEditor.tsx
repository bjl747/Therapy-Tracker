import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  EyeOff,
  Highlighter,
  ImagePlus,
  Move,
  PenLine,
  Redo2,
  Square,
  TextCursorInput,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import clsx from 'clsx'
import {
  type Annotation,
  type ImageAnn,
  type Rect,
  type TextAnn,
  LINE_HEIGHT,
  TEXT_PAD,
  clamp,
  clampRectToPage,
  displaySize,
  rectToPage,
  rectToView,
  uid,
  viewToPage,
} from './lib'
import { annRot, boxSizeFor, contentSize, uprightRot } from './annot'
import { layerCount } from './layers'
import { MAX_FILE_MB, tooBig } from './ingest'
import { Modal } from './Modal'
import { renderPage } from './raster'
import { SignaturePad } from './SignaturePad'
import { usePdfStudio } from './store'
import { TEXT_PLACEHOLDER, overlapShare, padRect, replacementFor, resizeContent, runIndexAt, sampleColors, textContentSize } from './textGroup'
import { type RunsResult, getTextRuns, runsMessage } from './textRuns'

type Tool = 'edittext' | 'text' | 'whiteout' | 'highlight' | 'redact' | 'move'
type DrawTool = 'whiteout' | 'highlight' | 'redact'

const TOOL: Record<Tool, { label: string; icon: typeof Type }> = {
  edittext: { label: 'Edit text', icon: TextCursorInput },
  text: { label: 'Add text', icon: Type },
  whiteout: { label: 'White-out', icon: Eraser },
  highlight: { label: 'Highlight', icon: Highlighter },
  redact: { label: 'Redact', icon: EyeOff },
  move: { label: 'Move', icon: Move },
}

const HINT: Record<Tool, string> = {
  edittext:
    "Click a line of the page's own text to retype it. Lines you can change get an outline when you point at them. The old words are covered, not deleted: software that reads the file can still find them. Use Redact to remove words for good.",
  text: 'Click on the page where the new text goes, then type. Esc or a click elsewhere finishes.',
  whiteout: 'Drag over anything you want to hide behind white.',
  highlight: 'Drag over the words you want to highlight.',
  redact: 'Drag over anything to remove it for good. A page with a redaction is saved as a picture, so ATS software cannot read it.',
  move: 'Drag an item to move it, or the round handle to resize it. Double-click text to change it.',
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('decode'))
    i.src = url
  })
}

/** Redraw a picked image upright (the browser applies JPEG EXIF rotation; pdf-lib would not) and at most 2000px. */
async function prepareImage(file: File): Promise<{ dataUrl: string; w: number; h: number; mime: ImageAnn['mime'] }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await decodeImage(url)
    const s = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * s))
    const h = Math.max(1, Math.round(img.naturalHeight * s))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('canvas')
    ctx.drawImage(img, 0, 0, w, h)
    const mime: ImageAnn['mime'] = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
    return { dataUrl: c.toDataURL(mime, 0.9), w, h, mime }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** One inline text edit: everything from opening the box to leaving it is one undo step. */
interface Session {
  id: string
  pageId: string
  /** The item was created by this session (cancelling removes it). */
  isNew: boolean
  /** "Edit text" replacement. */
  replace: boolean
  /** Nothing changed yet (text or style). */
  fresh: boolean
  original: string
}

interface Props {
  pageId: string
  onClose: () => void
  onNavigate: (id: string) => void
}

export function PageEditor({ pageId, onClose, onNavigate }: Props) {
  const pages = usePdfStudio((s) => s.pages)
  const setAnnotations = usePdfStudio((s) => s.setAnnotations)
  const beginTx = usePdfStudio((s) => s.beginTx)
  const endTx = usePdfStudio((s) => s.endTx)
  const canUndo = usePdfStudio((s) => s.hist.past.length > 0)
  const canRedo = usePdfStudio((s) => s.hist.future.length > 0)
  const index = pages.findIndex((p) => p.id === pageId)
  const page = pages[index]

  const [tool, setToolState] = useState<Tool>(() => (page?.src.kind === 'pdf' ? 'edittext' : 'text'))
  const [selId, setSelId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [opts, setOpts] = useState({ size: 14, color: '#111827', bold: false })
  const [sizeText, setSizeText] = useState('14')
  const [sigOpen, setSigOpen] = useState(false)
  const [redactAsk, setRedactAsk] = useState(false)
  const [draft, setDraft] = useState<Rect | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [avail, setAvail] = useState({ w: 600, h: 0 })
  const [rendering, setRendering] = useState(true)
  const [runs, setRuns] = useState<RunsResult | null>(null)
  const [hover, setHover] = useState(-1)

  const stageRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const textCtlRef = useRef<HTMLDivElement>(null)
  const session = useRef<Session | null>(null)
  const focusPending = useRef<string | null>(null)
  const toolTouched = useRef(false)
  const createdAt = useRef(0)
  const skipClick = useRef(false)
  const panelTx = useRef(false)
  const panelPointerAt = useRef(0)

  // latest values for window-level handlers
  const pageRef = useRef(page)
  pageRef.current = page
  const selRef = useRef(selId)
  selRef.current = selId

  /* ---------- layout: fit the page to the stage (width and, from 1024px up, height) ---------- */

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => {
      const lg = window.matchMedia('(min-width: 1024px)').matches
      setAvail({ w: Math.max(200, el.clientWidth - 24), h: lg ? Math.max(200, el.clientHeight - 24) : 0 })
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  const rot = page?.rotation ?? 0
  const d = page ? displaySize(page.w, page.h, rot) : { w: 1, h: 1 }
  const fitH = avail.h > 0 ? avail.h : (typeof window !== 'undefined' ? window.innerHeight : 800) * 0.75
  const cssW = Math.max(120, Math.min(avail.w, fitH * (d.w / d.h)) * zoom)
  const k = cssW / d.w
  const cssH = d.h * k

  /* ---------- page bitmap ---------- */

  const renderW = Math.round((cssW * Math.min(2, window.devicePixelRatio || 1)) / 40) * 40
  useEffect(() => {
    if (!page) return
    let stale = false
    setRendering(true)
    const t = setTimeout(() => {
      const plain = { ...page, annotations: [] }
      renderPage(plain, { width: renderW })
        .then((c) => {
          if (stale) return
          const target = canvasRef.current
          if (!target) return
          target.width = c.width
          target.height = c.height
          target.getContext('2d')?.drawImage(c, 0, 0)
          setRendering(false)
          setError(null)
        })
        .catch(() => {
          if (!stale) {
            setRendering(false)
            setError('This page could not be shown for editing.')
          }
        })
    }, 60)
    return () => {
      stale = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.src, page?.rotation, page?.baseRot, renderW])

  /* ---------- the page's own text (Edit text) ---------- */

  useEffect(() => {
    if (!page) return
    let live = true
    setRuns(null)
    setHover(-1)
    void getTextRuns(page).then((res) => {
      if (!live) return
      setRuns(res)
      if (!toolTouched.current) setToolState(res.ok ? 'edittext' : 'text')
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.src])

  const annots = page?.annotations ?? []
  const selected = annots.find((a) => a.id === selId) ?? null

  /* ---------- inline text editing ---------- */

  const cancelTx = () => usePdfStudio.setState((s) => (s.txBase ? { pages: s.txBase, txBase: null } : {}))

  /** Close the edit session: one undo step, or nothing at all when it added nothing. */
  const finishSession = useCallback(
    () => {
      const s = session.current
      if (!s) return
      session.current = null
      setEditingId(null)
      const st = usePdfStudio.getState()
      const a = st.pages.find((p) => p.id === s.pageId)?.annotations.find((x) => x.id === s.id)
      if (s.isNew && a?.kind === 'text') {
        const emptyNew = !s.replace && !a.text.trim()
        const untouched = s.replace && s.fresh && a.text === s.original
        if (emptyNew || untouched) {
          cancelTx()
          setSelId((cur) => (cur === s.id ? null : cur))
          return
        }
      }
      endTx()
    },
    [endTx],
  )
  const finishRef = useRef(finishSession)
  finishRef.current = finishSession

  /** Leave inline editing (if any) now. */
  const endEditing = useCallback(() => {
    const el = textareaRef.current
    finishRef.current()
    if (el && document.activeElement === el) el.blur()
  }, [])

  // closing the editor (Done, Esc, backdrop) or moving to another page ends the edit
  useEffect(() => () => finishRef.current(), [])
  useEffect(() => {
    setSelId(null)
    setDraft(null)
    setNote(null)
    return () => finishRef.current()
  }, [pageId])

  const openSession = (a: TextAnn, isNew: boolean, replace: boolean) => {
    const pg = pageRef.current
    if (!pg) return
    beginTx()
    if (isNew) {
      setAnnotations(pg.id, [...pg.annotations, a], true)
      createdAt.current = Date.now()
    }
    session.current = { id: a.id, pageId: pg.id, isNew, replace, fresh: true, original: a.text }
    focusPending.current = a.id
    setSelId(a.id)
    setEditingId(a.id)
  }

  const editExisting = (a: Annotation) => {
    if (a.kind !== 'text') return
    endEditing()
    const cur = pageRef.current?.annotations.find((x) => x.id === a.id)
    if (cur?.kind !== 'text') return
    openSession(cur, false, !!cur.cover)
  }

  /** Replace a text item (keeping its content's top-left in place); transient while editing or in a panel tx. */
  const writeText = (id: string, patch: Partial<TextAnn>) => {
    const pg = pageRef.current
    const a = pg?.annotations.find((x) => x.id === id)
    if (!pg || a?.kind !== 'text') return
    const merged: TextAnn = { ...a, ...patch }
    if (merged.text === a.text && merged.size === a.size && merged.bold === a.bold && merged.color === a.color) return
    const cs = textContentSize(merged.text, merged.size, merged.bold)
    const next = resizeContent(merged, cs.w, cs.h)
    const s = session.current
    if (s?.id === id && (patch.size !== undefined || patch.bold !== undefined || patch.color !== undefined || merged.text !== s.original)) s.fresh = false
    const transient = s?.id === id || panelTx.current
    setAnnotations(
      pg.id,
      pg.annotations.map((x) => (x.id === id ? next : x)),
      transient,
    )
  }

  const onEditBlur = (e: React.FocusEvent) => {
    if (!session.current) return
    const to = e.relatedTarget as Node | null
    if (to && (to === textareaRef.current || textCtlRef.current?.contains(to))) return
    // a click on the text controls (Safari does not focus buttons): stay in the session
    if (Date.now() - panelPointerAt.current < 400) return
    finishSession()
  }

  /* ---------- selection sync ---------- */

  useEffect(() => {
    if (selected?.kind === 'text') {
      setOpts({ size: selected.size, color: selected.color, bold: selected.bold })
      setSizeText(String(selected.size))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, selected?.kind === 'text' ? selected.size : null])

  const deleteSelected = useCallback(() => {
    const pg = pageRef.current
    const id = selRef.current
    if (!pg || !id) return
    if (session.current?.id === id) {
      // deleting the item being typed into: drop the session first
      session.current = null
      setEditingId(null)
      endTx()
    }
    setAnnotations(
      pg.id,
      pg.annotations.filter((a) => a.id !== id),
    )
    setSelId(null)
  }, [setAnnotations, endTx])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || layerCount() > 1) return
      const id = selRef.current
      if (!id) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        if (Date.now() - createdAt.current < 400) return
        deleteSelected()
      } else if (e.key === 'Enter') {
        // only from the page itself, so Enter on a focused button still presses it
        const t = e.target as Node | null
        if (t !== document.body && !overlayRef.current?.contains(t)) return
        const a = pageRef.current?.annotations.find((x) => x.id === id)
        if (a?.kind === 'text') {
          e.preventDefault()
          editExisting(a)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteSelected])

  /** Esc: leave text editing, then drop the selection, then close. */
  const onEscape = () => {
    if (session.current) {
      endEditing()
      return true
    }
    if (selRef.current) {
      setSelId(null)
      return true
    }
    return false
  }

  /* ---------- tools ---------- */

  const setTool = (t: Tool) => {
    // Redact turns the page into a picture, which résumé-reading software (ATS) cannot read: ask first
    if (t === 'redact' && tool !== 'redact') { endEditing(); setRedactAsk(true); return }
    toolTouched.current = true
    endEditing()
    setToolState(t)
    setNote(null)
    setHover(-1)
  }

  const toView = (clientX: number, clientY: number) => {
    const el = overlayRef.current
    const pg = pageRef.current
    if (!el || !pg) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    const dd = displaySize(pg.w, pg.h, pg.rotation)
    return { x: ((clientX - r.left) / r.width) * dd.w, y: ((clientY - r.top) / r.height) * dd.h }
  }
  const toBase = (clientX: number, clientY: number) => {
    const pg = pageRef.current
    const v = toView(clientX, clientY)
    return pg ? viewToPage(v, pg.w, pg.h, pg.rotation) : v
  }

  const placeImage = (dataUrl: string, nw: number, nh: number, mime: ImageAnn['mime'], width: number) => {
    const pg = pageRef.current
    if (!pg) return
    endEditing()
    // upright as the page is shown, centred, at most 90% of the shown page
    const r = uprightRot(pg.rotation)
    const dd = displaySize(pg.w, pg.h, pg.rotation)
    let cw = Math.min(width, dd.w * 0.9)
    let ch = (cw * nh) / nw
    if (ch > dd.h * 0.9) {
      ch = dd.h * 0.9
      cw = (ch * nw) / nh
    }
    const b = boxSizeFor(cw, ch, r)
    const a: ImageAnn = {
      id: uid('an'),
      kind: 'image',
      dataUrl,
      mime,
      rot: r,
      ...clampRectToPage({ x: (pg.w - b.w) / 2, y: (pg.h - b.h) / 2, w: b.w, h: b.h }, pg.w, pg.h),
    }
    setAnnotations(pg.id, [...pg.annotations, a])
    createdAt.current = Date.now()
    setSelId(a.id)
    toolTouched.current = true
    setToolState('move')
    setNote('Drag it into place; the round handle resizes it.')
  }

  const onPickImage = async (file: File | undefined) => {
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setError('Please choose a PNG, JPG or WebP image.')
      return
    }
    if (tooBig(file)) {
      setError(`That image is over the ${MAX_FILE_MB} MB limit.`)
      return
    }
    try {
      const img = await prepareImage(file)
      placeImage(img.dataUrl, img.w, img.h, img.mime, 140)
      setError(null)
    } catch {
      setError('That image could not be read.')
    }
  }

  /** Add text: a new box with the click point at the left of its first line, upright as the page is shown. */
  const placeText = (clientX: number, clientY: number) => {
    const pg = pageRef.current
    if (!pg) return
    const v = toView(clientX, clientY)
    const dd = displaySize(pg.w, pg.h, pg.rotation)
    const cs = textContentSize('', opts.size, opts.bold)
    const vr = {
      x: clamp(v.x - TEXT_PAD, 0, Math.max(0, dd.w - cs.w)),
      y: clamp(v.y - TEXT_PAD - (opts.size * LINE_HEIGHT) / 2, 0, Math.max(0, dd.h - cs.h)),
      w: cs.w,
      h: cs.h,
    }
    const a: TextAnn = {
      id: uid('an'),
      kind: 'text',
      text: '',
      size: opts.size,
      color: opts.color,
      bold: opts.bold,
      rot: uprightRot(pg.rotation),
      ...rectToPage(vr, pg.w, pg.h, pg.rotation),
    }
    openSession(a, true, false)
  }

  /** Colours under a base-space rect, read from the page bitmap (no annotations on it). */
  const sampleAt = (r: Rect) => {
    const pg = pageRef.current
    const c = canvasRef.current
    const ctx = c?.getContext('2d', { willReadFrequently: true })
    if (!pg || !c || !ctx || rendering) return { text: '#000000', cover: '#ffffff' }
    const vr = rectToView(padRect(r, 2), pg.w, pg.h, pg.rotation)
    const s = c.width / displaySize(pg.w, pg.h, pg.rotation).w
    const x0 = clamp(Math.floor(vr.x * s), 0, c.width - 1)
    const y0 = clamp(Math.floor(vr.y * s), 0, c.height - 1)
    const x1 = clamp(Math.ceil((vr.x + vr.w) * s), x0 + 1, c.width)
    const y1 = clamp(Math.ceil((vr.y + vr.h) * s), y0 + 1, c.height)
    try {
      const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0)
      return sampleColors(img.data, img.width, img.height)
    } catch {
      return { text: '#000000', cover: '#ffffff' }
    }
  }

  /** Edit text: replace the line under the pointer with a pre-filled text item over a cover. */
  const editTextAt = (clientX: number, clientY: number) => {
    const pg = pageRef.current
    if (!pg) return
    if (!runs) {
      setNote("Still reading this page's text. Try again in a moment.")
      return
    }
    if (!runs.ok) {
      setNote(runsMessage(runs.reason))
      return
    }
    const p = toBase(clientX, clientY)
    const i = runIndexAt(runs.runs, p, 2)
    if (i < 0) {
      setNote('No text right there. Point at the words: lines you can change get an outline.')
      return
    }
    const run = runs.runs[i]
    // already replaced: open that edit again instead of stacking a second one
    const prior = pg.annotations.find((a) => a.kind === 'text' && a.cover && overlapShare(run.rect, a.cover) > 0.6)
    if (prior) {
      setNote(null)
      editExisting(prior)
      return
    }
    if (run.garbled) {
      setNote("This line's font can't be read back reliably. Use White-out, then Add text, to retype it.")
      return
    }
    const c = sampleAt(run.rect)
    setNote(null)
    openSession(replacementFor(run, c.text, c.cover, pg.w, pg.h), true, true)
  }

  /* ---------- pointer on the page background ---------- */

  const onOverlayDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!page || e.target !== e.currentTarget) return
    // with Add text, the click that finishes a box with words in it does not start another one
    const s = session.current
    const item = s ? pageRef.current?.annotations.find((x) => x.id === s.id) : undefined
    skipClick.current = tool === 'text' && item?.kind === 'text' && item.text.trim().length > 0
    endEditing()
    setSelId(null)
    setNote(null)
    if (tool !== 'whiteout' && tool !== 'highlight' && tool !== 'redact') return
    e.preventDefault()
    const kind: DrawTool = tool
    const start = toBase(e.clientX, e.clientY)
    const move = (ev: PointerEvent) => {
      const p = toBase(ev.clientX, ev.clientY)
      setDraft({ x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) })
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      const p = toBase(ev.clientX, ev.clientY)
      const pg = pageRef.current
      setDraft(null)
      if (!pg) return
      const r = clampRectToPage(
        { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) },
        pg.w,
        pg.h,
      )
      if (r.w < 4 || r.h < 4) return
      const a: Annotation = { id: uid('an'), kind, ...r }
      setAnnotations(pg.id, [...pg.annotations, a])
      setSelId(a.id)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // text is placed on click (after the browser has moved focus for the press), so the new box keeps the focus
  const onOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (skipClick.current) {
      // this click only finished the previous edit
      skipClick.current = false
      return
    }
    if (tool === 'text') placeText(e.clientX, e.clientY)
    else if (tool === 'edittext') editTextAt(e.clientX, e.clientY)
  }

  const onOverlayMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== 'edittext' || !runs?.ok || e.pointerType === 'touch') return
    const i = runIndexAt(runs.runs, toBase(e.clientX, e.clientY), 2)
    if (i !== hover) setHover(i)
  }

  /* ---------- pointer on an item: move / resize ---------- */

  const startDrag = (e: React.PointerEvent, a0: Annotation, mode: 'move' | 'resize') => {
    if (!page) return
    e.stopPropagation()
    e.preventDefault()
    const wasSelected = selRef.current === a0.id
    endEditing()
    // ending the edit may have removed an untouched item
    const a = pageRef.current?.annotations.find((x) => x.id === a0.id)
    if (!a) return
    setSelId(a.id)
    const pg0 = pageRef.current!
    const startX = e.clientX
    const startY = e.clientY
    let moved = false
    const vr0 = rectToView(a, pg0.w, pg0.h, pg0.rotation)
    beginTx()
    const apply = (next: Annotation) => {
      const pg = pageRef.current
      if (!pg) return
      setAnnotations(
        pg.id,
        pg.annotations.map((x) => (x.id === next.id ? next : x)),
        true,
      )
    }
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 3) return
      moved = true
      const dx = (ev.clientX - startX) / k
      const dy = (ev.clientY - startY) / k
      if (mode === 'move') {
        const o = viewToPage({ x: 0, y: 0 }, pg0.w, pg0.h, pg0.rotation)
        const v = viewToPage({ x: dx, y: dy }, pg0.w, pg0.h, pg0.rotation)
        const r = clampRectToPage({ x: a.x + v.x - o.x, y: a.y + v.y - o.y, w: a.w, h: a.h }, pg0.w, pg0.h)
        // a text item's cover stays where the original words are
        apply({ ...a, x: r.x, y: r.y })
        return
      }
      let vw = Math.max(10, vr0.w + dx)
      let vh = Math.max(10, vr0.h + dy)
      if (a.kind === 'image' || a.kind === 'text') {
        const ar = vr0.w / vr0.h
        vh = vw / ar
        if (vh < 10) {
          vh = 10
          vw = 10 * ar
        }
      }
      if (a.kind === 'text') {
        const size = clamp(Math.round(((a.size * vw) / vr0.w) * 2) / 2, 4, 200)
        const cs = textContentSize(a.text, size, a.bold)
        apply(resizeContent({ ...a, size }, cs.w, cs.h))
        return
      }
      const r = clampRectToPage(rectToPage({ x: vr0.x, y: vr0.y, w: vw, h: vh }, pg0.w, pg0.h, pg0.rotation), pg0.w, pg0.h)
      apply({ ...a, ...r })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      endTx()
      // a plain click on text that was already selected opens it for typing
      if (!moved && mode === 'move' && wasSelected && a.kind === 'text') editExisting(a)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const viewRect = useMemo(
    () => (r: Rect) => {
      if (!page) return { left: 0, top: 0, width: 0, height: 0 }
      const v = rectToView(r, page.w, page.h, page.rotation)
      return { left: v.x * k, top: v.y * k, width: v.w * k, height: v.h * k }
    },
    [page, k],
  )

  if (!page) return null

  /* ---------- side panel controls ---------- */

  const selText = selected?.kind === 'text' ? selected : null
  const applySize = (n: number) => {
    setOpts((o) => ({ ...o, size: n }))
    if (selText) writeText(selText.id, { size: n })
  }
  const refocusText = () => {
    if (session.current && textareaRef.current) textareaRef.current.focus({ preventScroll: true })
  }

  const textFont = (a: TextAnn): React.CSSProperties => ({
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: a.size * k,
    lineHeight: LINE_HEIGHT,
    color: a.color,
    fontWeight: a.bold ? 700 : 400,
    padding: TEXT_PAD * k,
  })

  const renderAnn = (a: Annotation) => {
    const vr = viewRect(a)
    const isSel = a.id === selId
    const editing = a.id === editingId && a.kind === 'text'
    const cs = contentSize(a)
    const turn = (page.rotation + annRot(a)) % 360
    const inner = (() => {
      switch (a.kind) {
        case 'whiteout':
          return <div className="h-full w-full bg-white" />
        case 'highlight':
          return <div className="h-full w-full" style={{ background: 'rgba(255,230,0,.4)' }} />
        case 'redact':
          return (
            <div
              className="flex h-full w-full items-center justify-center overflow-hidden text-[10px] font-bold tracking-widest text-white/70"
              style={{ background: 'repeating-linear-gradient(45deg,#000 0 8px,#1c1c1c 8px 16px)' }}
            >
              REDACT
            </div>
          )
        case 'image':
          return <img src={a.dataUrl} alt="" draggable={false} className="pointer-events-none h-full w-full select-none" />
        case 'text':
          return editing ? (
            <textarea
              ref={(el) => {
                textareaRef.current = el
                if (el && focusPending.current === a.id) {
                  focusPending.current = null
                  el.focus({ preventScroll: true })
                  // new box: type straight away; replaced line: caret at the end
                  el.setSelectionRange(el.value.length, el.value.length)
                }
              }}
              aria-label="Text"
              value={a.text}
              placeholder={TEXT_PLACEHOLDER}
              wrap="off"
              spellCheck
              className="block h-full w-full resize-none overflow-hidden whitespace-pre border-0 bg-transparent outline-none placeholder:text-[#9ca3af]"
              style={{ ...textFont(a), caretColor: a.color }}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => writeText(a.id, { text: e.target.value })}
              onBlur={onEditBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  endEditing()
                }
              }}
            />
          ) : (
            <div className="pointer-events-none h-full w-full select-none whitespace-pre" style={textFont(a)}>
              {a.text || <span className="text-[#9ca3af]">{TEXT_PLACEHOLDER}</span>}
            </div>
          )
      }
    })()
    const framed = a.kind === 'text' || a.kind === 'image'
    return (
      <div key={a.id} className="contents">
        {a.kind === 'text' && a.cover && (
          <div aria-hidden className="pointer-events-none absolute" style={{ ...viewRect(a.cover), background: a.coverColor ?? '#ffffff' }} />
        )}
        <div
          role="button"
          tabIndex={0}
          aria-label={a.kind === 'text' ? `Text: ${a.text || 'empty'}` : `${a.kind} item`}
          className={clsx(
            'absolute touch-none',
            editing ? 'cursor-text outline outline-2 outline-accent' : 'cursor-move',
            !editing && (isSel ? 'outline outline-2 outline-accent' : 'outline outline-1 outline-dashed outline-accent/40'),
          )}
          style={vr}
          onPointerDown={(e) => startDrag(e, a, 'move')}
          onDoubleClick={() => {
            if (session.current?.id !== a.id) editExisting(a)
          }}
        >
          {framed ? (
            <div
              className="absolute left-1/2 top-1/2"
              style={{ width: cs.w * k, height: cs.h * k, transform: `translate(-50%,-50%) rotate(${turn}deg)` }}
            >
              {inner}
            </div>
          ) : (
            inner
          )}
          {isSel && !editing && (
            <>
              <button
                type="button"
                aria-label="Delete item"
                title="Delete"
                className="absolute -top-3 -right-3 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface-1 text-ink shadow"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={deleteSelected}
              >
                <Trash2 size={14} />
              </button>
              <div
                aria-label="Resize"
                className="absolute -bottom-3 -right-3 h-6 w-6 cursor-nwse-resize touch-none rounded-full border-2 border-accent bg-surface-1"
                onPointerDown={(e) => startDrag(e, a, 'resize')}
              />
            </>
          )}
        </div>
      </div>
    )
  }

  const prev = pages[index - 1]
  const next = pages[index + 1]
  const drawTool = tool === 'whiteout' || tool === 'highlight' || tool === 'redact'
  const runsNote = tool === 'edittext' && runs && !runs.ok ? runsMessage(runs.reason) : null
  const emptyLine =
    tool === 'edittext' && runs?.ok
      ? 'Point at the text on the page: outlined lines can be retyped. Click one to change it.'
      : tool === 'text'
        ? 'Click anywhere on the page to type. Signature and Image add a picture.'
        : 'Pick a tool on the left to change this page.'
  const pill = note ?? runsNote ?? (annots.length ? `${annots.length} ${annots.length === 1 ? 'change' : 'changes'} on this page. Undo takes back the last one.` : emptyLine)

  const toolBtn = (t: Tool) => {
    const T = TOOL[t]
    return (
      <button
        key={t}
        type="button"
        className={clsx('btn !justify-start', tool === t && 'btn-primary')}
        aria-pressed={tool === t}
        onClick={() => setTool(t)}
      >
        <T.icon size={14} /> {T.label}
      </button>
    )
  }

  return (
    <>
      <Modal
        wide
        fill
        eyebrow={`Page ${index + 1} of ${pages.length}`}
        title="Edit page"
        onClose={onClose}
        onEscape={onEscape}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="min-w-0 flex-1 basis-64 text-xs text-ink-3">
              Changes are kept as you go and stay in your browser. White-out and Edit text only cover words;{' '}
              <b className="text-ink-2">Redact</b> removes them for good, but that page is saved as a picture that ATS software cannot read.
            </p>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        }
      >
        <div className="flex min-w-0 flex-col lg:h-full lg:flex-row">
          <aside className="flex w-full min-w-0 shrink-0 flex-col gap-4 border-b border-line p-3 lg:w-[272px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div>
              <div className="eyebrow mb-2">Tools</div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
                {toolBtn('edittext')}
                {toolBtn('text')}
                <button type="button" className="btn !justify-start" onClick={() => setSigOpen(true)}>
                  <PenLine size={14} /> Signature
                </button>
                <button type="button" className="btn !justify-start" onClick={() => fileRef.current?.click()}>
                  <ImagePlus size={14} /> Image
                </button>
                {toolBtn('whiteout')}
                {toolBtn('highlight')}
                {toolBtn('redact')}
                {toolBtn('move')}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    void onPickImage(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-3">{HINT[tool]}</p>
            </div>

            {(tool === 'text' || selText) && (
              <div
                ref={textCtlRef}
                className="space-y-2"
                onPointerDown={() => {
                  panelPointerAt.current = Date.now()
                }}
                onBlur={onEditBlur}
              >
                <div className="eyebrow">{selText ? 'Selected text' : 'New text'}</div>
                {selText && !editingId && (
                  <p className="text-xs text-ink-3">Double-click the text on the page (or press Enter) to change the words.</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-ink-2">
                    Size
                    <input
                      type="number"
                      inputMode="decimal"
                      min={4}
                      max={200}
                      step={0.5}
                      className="input !w-[72px] tabular-nums"
                      value={sizeText}
                      onChange={(e) => {
                        setSizeText(e.target.value)
                        const n = Number(e.target.value)
                        if (e.target.value.trim() !== '' && n >= 4 && n <= 200) applySize(n)
                      }}
                      onBlur={(e) => {
                        const n = clamp(Number(sizeText) || opts.size, 4, 200)
                        setSizeText(String(n))
                        applySize(n)
                        onEditBlur(e)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const n = clamp(Number(sizeText) || opts.size, 4, 200)
                          setSizeText(String(n))
                          applySize(n)
                          refocusText()
                        }
                      }}
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-ink-2">
                    Colour
                    <input
                      type="color"
                      aria-label="Text colour"
                      className="h-8 w-9 cursor-pointer rounded-lg border border-line bg-surface-1 p-0.5"
                      value={opts.color}
                      onFocus={() => {
                        if (!session.current && selText) {
                          beginTx()
                          panelTx.current = true
                        }
                      }}
                      onBlur={(e) => {
                        if (panelTx.current) {
                          panelTx.current = false
                          endTx()
                        }
                        onEditBlur(e)
                      }}
                      onChange={(e) => {
                        setOpts((o) => ({ ...o, color: e.target.value }))
                        if (selText) writeText(selText.id, { color: e.target.value })
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className={clsx('chip !h-8 !px-3 font-bold', opts.bold && 'chip-on')}
                    aria-pressed={opts.bold}
                    onClick={() => {
                      const bold = !opts.bold
                      setOpts((o) => ({ ...o, bold }))
                      if (selText) writeText(selText.id, { bold })
                      refocusText()
                    }}
                  >
                    Bold
                  </button>
                </div>
                {selText?.cover && (
                  <p className="text-xs text-ink-3">The original words are covered, not deleted. Delete this item to bring them back.</p>
                )}
              </div>
            )}

            {selected && (
              <button type="button" className="btn !justify-start" onClick={deleteSelected}>
                <Trash2 size={14} /> Delete selected
              </button>
            )}

            <div className="mt-auto space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className="btn"
                  disabled={!canUndo}
                  title="Undo (Ctrl/Cmd+Z)"
                  onClick={() => {
                    endEditing()
                    usePdfStudio.getState().undo()
                  }}
                >
                  <Undo2 size={14} /> Undo
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!canRedo}
                  title="Redo (Shift+Ctrl/Cmd+Z)"
                  onClick={() => {
                    endEditing()
                    usePdfStudio.getState().redo()
                  }}
                >
                  <Redo2 size={14} /> Redo
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" className="btn !px-2" aria-label="Previous page" title="Previous page" disabled={!prev} onClick={() => prev && onNavigate(prev.id)}>
                  <ChevronLeft size={16} />
                </button>
                <button type="button" className="btn !px-2" aria-label="Next page" title="Next page" disabled={!next} onClick={() => next && onNavigate(next.id)}>
                  <ChevronRight size={16} />
                </button>
                <button type="button" className="btn !px-2" aria-label="Zoom out" title="Zoom out" onClick={() => setZoom((z) => clamp(z - 0.25, 0.5, 3))}>
                  <ZoomOut size={16} />
                </button>
                <span className="w-10 text-center text-xs tabular-nums text-ink-2">{Math.round(zoom * 100)}%</span>
                <button type="button" className="btn !px-2" aria-label="Zoom in" title="Zoom in" onClick={() => setZoom((z) => clamp(z + 0.25, 0.5, 3))}>
                  <ZoomIn size={16} />
                </button>
                <button type="button" className="btn !px-2" aria-label="Fit page" title="Fit page" onClick={() => setZoom(1)}>
                  <Square size={14} />
                </button>
              </div>
            </div>
            {error && (
              <p role="alert" className="text-xs text-[rgb(var(--status-bad))]">
                {error}
              </p>
            )}
          </aside>

          <div className="flex min-h-[300px] min-w-0 flex-1 flex-col bg-surface-2 lg:min-h-0">
            <div className="shrink-0 px-3 pt-3">
              <p role="status" className="rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-xs text-ink-2">
                {pill}
              </p>
            </div>
            <div ref={stageRef} className="min-h-0 min-w-0 flex-1 overflow-auto p-3">
              <div className="relative mx-auto shadow-lg" style={{ width: cssW, height: cssH }}>
                <canvas ref={canvasRef} className="absolute inset-0 h-full w-full bg-white" />
                {rendering && <div className="absolute inset-0 animate-pulse bg-surface-3/60" aria-hidden />}
                <div
                  ref={overlayRef}
                  className={clsx(
                    'absolute inset-0',
                    drawTool && 'cursor-crosshair touch-none',
                    tool === 'text' && 'cursor-text',
                    tool === 'edittext' && hover >= 0 && 'cursor-text',
                  )}
                  onPointerDown={onOverlayDown}
                  onPointerMove={onOverlayMove}
                  onPointerLeave={() => setHover(-1)}
                  onClick={onOverlayClick}
                >
                  {tool === 'edittext' &&
                    runs?.ok &&
                    runs.runs.map((r, i) => (
                      <div
                        key={i}
                        aria-hidden
                        className={clsx(
                          'pointer-events-none absolute rounded-[2px]',
                          i === hover ? 'bg-accent/10 outline outline-2 outline-accent' : 'outline outline-1 outline-dashed outline-accent/30',
                        )}
                        style={viewRect(padRect(r.rect, 1))}
                      />
                    ))}
                  {annots.map(renderAnn)}
                  {draft && drawTool && (
                    <div
                      className={clsx(
                        'pointer-events-none absolute outline outline-1 outline-accent',
                        tool === 'redact' ? 'bg-black/70' : tool === 'highlight' ? 'bg-yellow-300/40' : 'bg-white/90',
                      )}
                      style={viewRect(draft)}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>
      {redactAsk && (
        <Modal
          eyebrow="Before you redact"
          title="This page will not be readable by ATS"
          onClose={() => setRedactAsk(false)}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn" onClick={() => setRedactAsk(false)}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                autoFocus
                onClick={() => {
                  setRedactAsk(false)
                  toolTouched.current = true
                  endEditing()
                  setToolState('redact')
                  setNote(null)
                  setHover(-1)
                }}
              >
                I understand, use Redact
              </button>
            </div>
          }
        >
          <div className="space-y-2 p-4 text-sm text-ink-2">
            <p>
              Redact removes the covered words for good by saving the <b className="text-ink">whole page as a picture</b>. Résumé-reading software (ATS) cannot read the text on a picture page, not even the parts you did not cover.
            </p>
            <p>Use it only when private details must be gone. To just hide something visually, White-out keeps the page readable (the covered words stay in the file).</p>
          </div>
        </Modal>
      )}
      {sigOpen && (
        <SignaturePad
          onClose={() => setSigOpen(false)}
          onDone={(url, w, h) => {
            setSigOpen(false)
            placeImage(url, w, h, 'image/png', 160)
          }}
        />
      )}
    </>
  )
}
