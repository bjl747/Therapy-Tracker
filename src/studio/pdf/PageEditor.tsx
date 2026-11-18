import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  EyeOff,
  Highlighter,
  ImagePlus,
  MousePointer2,
  PenLine,
  Square,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import clsx from 'clsx'
import {
  type Annotation,
  type ImageAnn,
  type Rect,
  type TextAnn,
  TEXT_PAD,
  clamp,
  clampRectToPage,
  displaySize,
  rectToPage,
  rectToView,
  textBoxSize,
  uid,
  viewToPage,
} from './lib'
import { Modal } from './Modal'
import { renderPage } from './raster'
import { SignaturePad } from './SignaturePad'
import { usePdfStudio } from './store'

type Tool = 'select' | 'text' | 'whiteout' | 'highlight' | 'redact'

const TOOL_BTNS: { id: Tool; label: string; icon: typeof Type }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'whiteout', label: 'White-out', icon: Eraser },
  { id: 'highlight', label: 'Highlight', icon: Highlighter },
  { id: 'redact', label: 'Redact', icon: EyeOff },
]

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}
function imgSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve({ w: i.naturalWidth, h: i.naturalHeight })
    i.onerror = () => reject(new Error('decode'))
    i.src = url
  })
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
  const index = pages.findIndex((p) => p.id === pageId)
  const page = pages[index]

  const [tool, setTool] = useState<Tool>('select')
  const [selId, setSelId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [opts, setOpts] = useState({ size: 16, color: '#111827', bold: false })
  const [sigOpen, setSigOpen] = useState(false)
  const [draft, setDraft] = useState<Rect | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [availW, setAvailW] = useState(600)
  const [rendering, setRendering] = useState(true)
  const stageRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const focusNewText = useRef(false)

  // keep latest page for window-level drag handlers
  const pageRef = useRef(page)
  pageRef.current = page

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setAvailW(Math.max(200, el.clientWidth - 24)))
    ro.observe(el)
    setAvailW(Math.max(200, el.clientWidth - 24))
    return () => ro.disconnect()
  }, [])

  const rot = page?.rotation ?? 0
  const d = page ? displaySize(page.w, page.h, rot) : { w: 1, h: 1 }
  // Fit to width, but never taller than ~1.5x the viewport for the default zoom.
  const cssW = Math.max(120, Math.min(availW, (typeof window !== 'undefined' ? window.innerHeight * 0.8 : 800) * (d.w / d.h)) * zoom)
  const k = cssW / d.w
  const cssH = d.h * k

  // (re)render the page bitmap
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
            setError('This page could not be rendered for editing.')
          }
        })
    }, 60)
    return () => {
      stale = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.src, page?.rotation, page?.baseRot, renderW])

  const annots = page?.annotations ?? []
  const selected = annots.find((a) => a.id === selId) ?? null

  useEffect(() => {
    if (selected?.kind === 'text') setOpts({ size: selected.size, color: selected.color, bold: selected.bold })
    if (selected?.kind === 'text' && focusNewText.current) {
      focusNewText.current = false
      setTimeout(() => {
        textRef.current?.focus()
        textRef.current?.select()
      }, 30)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId])

  useEffect(() => {
    setSelId(null)
    setDraft(null)
  }, [pageId])

  const toBase = useCallback(
    (clientX: number, clientY: number) => {
      const el = overlayRef.current
      const pg = pageRef.current
      if (!el || !pg) return { x: 0, y: 0 }
      const r = el.getBoundingClientRect()
      const v = { x: ((clientX - r.left) / r.width) * displaySize(pg.w, pg.h, pg.rotation).w, y: ((clientY - r.top) / r.height) * displaySize(pg.w, pg.h, pg.rotation).h }
      return viewToPage(v, pg.w, pg.h, pg.rotation)
    },
    [],
  )

  const commitAnnots = (next: Annotation[], select?: string | null) => {
    if (!page) return
    setAnnotations(page.id, next)
    if (select !== undefined) setSelId(select)
  }

  const patchSelected = (patch: Partial<TextAnn>) => {
    if (!page || !selected || selected.kind !== 'text') return
    const merged = { ...selected, ...patch }
    const sz = textBoxSize(merged.text, merged.size, merged.bold)
    commitAnnots(annots.map((a) => (a.id === selected.id ? { ...merged, w: sz.w, h: sz.h } : a)))
  }

  const deleteSelected = useCallback(() => {
    const pg = pageRef.current
    if (!pg || !selId) return
    setAnnotations(
      pg.id,
      pg.annotations.filter((a) => a.id !== selId),
    )
    setSelId(null)
  }, [selId, setAnnotations])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selId) {
        e.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selId, deleteSelected])

  /* ---------- placing things ---------- */

  const placeImage = async (dataUrl: string, nw: number, nh: number, mime: ImageAnn['mime'], width: number) => {
    if (!page) return
    const w = Math.min(width, page.w * 0.9)
    const h = (w * nh) / nw
    const a: ImageAnn = {
      id: uid('an'),
      kind: 'image',
      dataUrl,
      mime,
      ...clampRectToPage({ x: (page.w - w) / 2, y: (page.h - h) / 2, w, h }, page.w, page.h),
    }
    commitAnnots([...annots, a], a.id)
    setTool('select')
  }

  const onPickImage = async (file: File | undefined) => {
    if (!file) return
    try {
      if (!/^image\/(png|jpeg)$/.test(file.type)) {
        setError('Please choose a PNG or JPG image (logo or signature).')
        return
      }
      const url = await readDataUrl(file)
      const s = await imgSize(url)
      await placeImage(url, s.w, s.h, file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 140)
      setError(null)
    } catch {
      setError('That image could not be read.')
    }
  }

  /* ---------- pointer: draw new things on the background ---------- */

  const onOverlayDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!page || e.target !== e.currentTarget) return
    setSelId(null)
    if (tool === 'select') return
    e.preventDefault()
    const start = toBase(e.clientX, e.clientY)
    if (tool === 'text') {
      const text = 'Text'
      const sz = textBoxSize(text, opts.size, opts.bold)
      const a: TextAnn = {
        id: uid('an'),
        kind: 'text',
        text,
        size: opts.size,
        color: opts.color,
        bold: opts.bold,
        ...clampRectToPage({ x: start.x, y: start.y, ...sz }, page.w, page.h),
      }
      focusNewText.current = true
      commitAnnots([...annots, a], a.id)
      setTool('select')
      return
    }
    const kind = tool
    const move = (ev: PointerEvent) => {
      const p = toBase(ev.clientX, ev.clientY)
      setDraft({ x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) })
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      const p = toBase(ev.clientX, ev.clientY)
      const r = clampRectToPage(
        { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) },
        pageRef.current?.w ?? 0,
        pageRef.current?.h ?? 0,
      )
      setDraft(null)
      const pg = pageRef.current
      if (!pg || r.w < 4 || r.h < 4) return
      const a: Annotation = { id: uid('an'), kind, ...r }
      setAnnotations(pg.id, [...pg.annotations, a])
      setSelId(a.id)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  /* ---------- pointer: move / resize an annotation ---------- */

  const startDrag = (e: React.PointerEvent, a: Annotation, mode: 'move' | 'resize') => {
    if (!page) return
    e.stopPropagation()
    e.preventDefault()
    setSelId(a.id)
    const pg0 = page
    const startX = e.clientX
    const startY = e.clientY
    const orig = a
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
      const dx = (ev.clientX - startX) / k
      const dy = (ev.clientY - startY) / k
      if (mode === 'move') {
        const o = viewToPage({ x: 0, y: 0 }, pg0.w, pg0.h, pg0.rotation)
        const v = viewToPage({ x: dx, y: dy }, pg0.w, pg0.h, pg0.rotation)
        const r = clampRectToPage({ x: orig.x + v.x - o.x, y: orig.y + v.y - o.y, w: orig.w, h: orig.h }, pg0.w, pg0.h)
        apply({ ...orig, x: r.x, y: r.y })
        return
      }
      let vw = Math.max(10, vr0.w + dx)
      let vh = Math.max(10, vr0.h + dy)
      if (orig.kind === 'image' || orig.kind === 'text') {
        const ar = vr0.w / vr0.h
        vh = vw / ar
        if (vh < 10) {
          vh = 10
          vw = 10 * ar
        }
      }
      if (orig.kind === 'text') {
        const size = clamp(Math.round((orig.size * vw) / vr0.w), 6, 200)
        const sz = textBoxSize(orig.text, size, orig.bold)
        apply({ ...orig, size, w: sz.w, h: sz.h })
        return
      }
      const nv = { x: vr0.x, y: vr0.y, w: vw, h: vh }
      const r = clampRectToPage(rectToPage(nv, pg0.w, pg0.h, pg0.rotation), pg0.w, pg0.h)
      apply({ ...orig, ...r })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      endTx()
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

  const renderAnn = (a: Annotation) => {
    const vr = viewRect(a)
    const isSel = a.id === selId
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
          return (
            <div
              className="pointer-events-none select-none whitespace-pre"
              style={{
                fontFamily: 'Helvetica, Arial, sans-serif',
                fontSize: a.size * k,
                lineHeight: 1.2,
                color: a.color,
                fontWeight: a.bold ? 700 : 400,
                padding: TEXT_PAD * k,
                width: '100%',
                height: '100%',
              }}
            >
              {a.text}
            </div>
          )
      }
    })()
    const rotated = a.kind === 'text' || a.kind === 'image'
    return (
      <div
        key={a.id}
        role="button"
        tabIndex={0}
        aria-label={`${a.kind} annotation`}
        className={clsx('absolute cursor-move touch-none', isSel ? 'outline outline-2 outline-accent' : 'outline outline-1 outline-dashed outline-accent/40')}
        style={vr}
        onPointerDown={(e) => startDrag(e, a, 'move')}
      >
        {rotated ? (
          <div
            className="absolute left-1/2 top-1/2"
            style={{ width: a.w * k, height: a.h * k, transform: `translate(-50%,-50%) rotate(${page.rotation}deg)` }}
          >
            {inner}
          </div>
        ) : (
          inner
        )}
        {isSel && (
          <>
            <button
              type="button"
              aria-label="Delete annotation"
              className="absolute -top-3 -right-3 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface-1 text-ink shadow"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={deleteSelected}
            >
              <Trash2 size={14} />
            </button>
            <div
              aria-label="Resize"
              className="absolute -bottom-3 -right-3 h-6 w-6 cursor-nwse-resize rounded-full border-2 border-accent bg-surface-1 touch-none"
              onPointerDown={(e) => startDrag(e, a, 'resize')}
            />
          </>
        )}
      </div>
    )
  }

  const prev = pages[index - 1]
  const next = pages[index + 1]
  const drawTool = tool !== 'select'

  return (
    <>
      <Modal
        wide
        eyebrow={`Page ${index + 1} of ${pages.length}`}
        title="Edit page"
        onClose={onClose}
        footer={
          <p className="text-xs text-ink-3">
            White-out only hides content visually. <b className="text-ink-2">Redact</b> removes it for good: pages with redactions are exported as images. Everything stays in your browser.
          </p>
        }
      >
        <div className="flex min-w-0 flex-col lg:flex-row">
          <aside className="flex w-full min-w-0 shrink-0 flex-col gap-4 border-b border-line p-3 lg:w-[260px] lg:border-b-0 lg:border-r">
            <div>
              <div className="eyebrow mb-2">Tools</div>
              <div className="flex flex-wrap gap-1.5">
                {TOOL_BTNS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={clsx('btn', tool === t.id && 'btn-primary')}
                    aria-pressed={tool === t.id}
                    onClick={() => setTool(t.id)}
                  >
                    <t.icon size={14} /> {t.label}
                  </button>
                ))}
                <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                  <ImagePlus size={14} /> Image
                </button>
                <button type="button" className="btn" onClick={() => setSigOpen(true)}>
                  <PenLine size={14} /> Signature
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    void onPickImage(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-ink-3">
                {tool === 'text'
                  ? 'Click on the page to place a text box.'
                  : drawTool
                    ? 'Drag on the page to draw a rectangle.'
                    : 'Click an item to move or resize it.'}
              </p>
            </div>

            {(tool === 'text' || selected?.kind === 'text') && (
              <div className="space-y-2">
                <div className="eyebrow">Text</div>
                {selected?.kind === 'text' && (
                  <textarea
                    ref={textRef}
                    className="input !h-20 resize-y !py-2"
                    aria-label="Text content"
                    value={selected.text}
                    onChange={(e) => patchSelected({ text: e.target.value })}
                  />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-ink-2">
                    Size
                    <input
                      type="number"
                      min={6}
                      max={200}
                      className="input !w-16 tabular-nums"
                      value={opts.size}
                      onChange={(e) => {
                        const size = clamp(Number(e.target.value) || 12, 6, 200)
                        setOpts((o) => ({ ...o, size }))
                        patchSelected({ size })
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
                      onChange={(e) => {
                        setOpts((o) => ({ ...o, color: e.target.value }))
                        patchSelected({ color: e.target.value })
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className={clsx('chip !h-8 font-bold', opts.bold && 'chip-on')}
                    aria-pressed={opts.bold}
                    onClick={() => {
                      setOpts((o) => ({ ...o, bold: !o.bold }))
                      patchSelected({ bold: !opts.bold })
                    }}
                  >
                    Bold
                  </button>
                </div>
              </div>
            )}

            {selected && (
              <button type="button" className="btn" onClick={deleteSelected}>
                <Trash2 size={14} /> Delete selected
              </button>
            )}

            <div className="mt-auto flex flex-wrap items-center gap-1.5">
              <button type="button" className="btn !px-2" aria-label="Previous page" disabled={!prev} onClick={() => prev && onNavigate(prev.id)}>
                <ChevronLeft size={16} />
              </button>
              <button type="button" className="btn !px-2" aria-label="Next page" disabled={!next} onClick={() => next && onNavigate(next.id)}>
                <ChevronRight size={16} />
              </button>
              <button type="button" className="btn !px-2" aria-label="Zoom out" onClick={() => setZoom((z) => clamp(z - 0.25, 0.5, 3))}>
                <ZoomOut size={16} />
              </button>
              <span className="w-10 text-center text-xs tabular-nums text-ink-2">{Math.round(zoom * 100)}%</span>
              <button type="button" className="btn !px-2" aria-label="Zoom in" onClick={() => setZoom((z) => clamp(z + 0.25, 0.5, 3))}>
                <ZoomIn size={16} />
              </button>
              <button type="button" className="btn !px-2" aria-label="Fit to width" title="Fit" onClick={() => setZoom(1)}>
                <Square size={14} />
              </button>
            </div>
            {error && (
              <p role="alert" className="text-xs text-[rgb(var(--status-bad))]">
                {error}
              </p>
            )}
          </aside>

          <div ref={stageRef} className="min-h-[300px] min-w-0 flex-1 overflow-auto bg-surface-2 p-3">
            <div className="relative mx-auto shadow-lg" style={{ width: cssW, height: cssH }}>
              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full bg-white" />
              {rendering && <div className="absolute inset-0 animate-pulse bg-surface-3/60" aria-hidden />}
              <div
                ref={overlayRef}
                className={clsx('absolute inset-0', drawTool ? 'cursor-crosshair touch-none' : '')}
                onPointerDown={onOverlayDown}
              >
                {annots.map(renderAnn)}
                {draft && tool !== 'select' && tool !== 'text' && (
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
      </Modal>
      {sigOpen && (
        <SignaturePad
          onClose={() => setSigOpen(false)}
          onDone={(url, w, h) => {
            setSigOpen(false)
            void placeImage(url, w, h, 'image/png', 160)
          }}
        />
      )}
    </>
  )
}
