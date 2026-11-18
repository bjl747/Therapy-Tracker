// ─────────────────────────────────────────────────────────────
// Studio editor shell: loads a design, autosaves it, wires the keyboard and
// clipboard, and lays out the chrome around the stage. Docked panels on
// wide screens; bottom toolbar + sheets on phones.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { ClipboardList, Image as ImageIcon, Layers, Palette, Shapes, SlidersHorizontal, Sparkles, Type, X } from 'lucide-react'
import type { Design } from '../engine/model'
import { drawPage } from '../engine/render'
import { repo } from '../data'
import { resolveImage } from '../services'
import { currentPage, useEditor } from './store'
import { stageApi, useUi, type LeftTab } from './uiStore'
import { addText, copySelection, cutSelection, enterElement, pasteClip, uploadAndAdd } from './actions'
import { CLIP_MARKER } from './clipboard'
import { useWidth } from './hooks'
import { anyLayerOpen, IconBtn, Portal, Skeleton } from './ui'
import { Stage } from './Stage'
import { Inspector } from './Inspector'
import { PageStrip } from './PageStrip'
import { PreviewModal, TopBar, ZoomControl, type SaveStatus } from './TopBar'
import { CommandPalette, ContextMenu } from './Menus'
import { FieldsPanel } from './panels/FieldsPanel'
import { BrandPanel, ElementsPanel, PhotosPanel, TextPanel } from './panels/AddPanels'
import { LayersPanel } from './panels/LayersPanel'
import { AnimatePanel } from './panels/AnimatePanel'

export interface EditorProps {
  designId: string
  onExit: () => void
  /** managers may edit brand-locked elements */
  canEditLocked?: boolean
  /** access level "view" */
  readOnly?: boolean
}

const TABS: { id: LeftTab; label: string; icon: ReactNode; title: string }[] = [
  { id: 'fields', label: 'Fields', icon: <ClipboardList size={18} />, title: 'Job details' },
  { id: 'text', label: 'Text', icon: <Type size={18} />, title: 'Add text' },
  { id: 'photos', label: 'Photos', icon: <ImageIcon size={18} />, title: 'City photos' },
  { id: 'brand', label: 'Brand', icon: <Palette size={18} />, title: 'Brand & uploads' },
  { id: 'elements', label: 'Elements', icon: <Shapes size={18} />, title: 'Shapes & badges' },
  { id: 'layers', label: 'Layers', icon: <Layers size={18} />, title: 'Layers' },
  { id: 'animate', label: 'Animate', icon: <Sparkles size={18} />, title: 'Animation' },
]

const PANELS: Record<LeftTab, () => JSX.Element | null> = {
  fields: FieldsPanel,
  text: TextPanel,
  photos: PhotosPanel,
  brand: BrandPanel,
  elements: ElementsPanel,
  layers: LayersPanel,
  animate: AnimatePanel,
}

/** small PNG of the first page for the design grid */
export function makeThumb(d: Design, max = 320): string | undefined {
  try {
    const k = max / Math.max(d.w, d.h)
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(d.w * k))
    c.height = Math.max(1, Math.round(d.h * k))
    drawPage(c.getContext('2d')!, d, d.pages[0], { scale: k, resolveImage })
    return c.toDataURL('image/png')
  } catch {
    return undefined // tainted canvas (cross-origin image without CORS) — keep the previous thumbnail
  }
}

let mountSeq = 0

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)

export function Editor({ designId, onExit, canEditLocked = false, readOnly = false }: EditorProps) {
  const loaded = useEditor((s) => s.design?.id === designId)
  const [missing, setMissing] = useState(false)
  const [status, setStatus] = useState<SaveStatus>(readOnly ? 'readonly' : 'saved')
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const width = useWidth(root)
  const compact = width > 0 && width < 900
  const saving = useRef<Promise<void>>(Promise.resolve())
  const timer = useRef(0)

  // ── save ──────────────────────────────────────────────────

  const saveNow = useCallback((): Promise<void> => {
    window.clearTimeout(timer.current)
    saving.current = saving.current.then(async () => {
      const st = useEditor.getState()
      const d = st.design
      if (!d || !st.dirty || st.readOnly) return
      setStatus('saving')
      try {
        await repo.saveDesign(d, makeThumb(d))
        const now = useEditor.getState()
        if (now.design === d) now.markSaved()
        setStatus(useEditor.getState().dirty ? 'dirty' : 'saved')
      } catch {
        setStatus('error')
      }
    })
    return saving.current
  }, [])

  // ── load / unload ─────────────────────────────────────────

  useEffect(() => {
    let alive = true
    setMissing(false)
    void repo
      .getDesign(designId)
      .then((d) => {
        if (!alive) return
        if (!d) return setMissing(true)
        useEditor.getState().load(d, { canEditLocked, readOnly })
        const ui = useUi.getState()
        ui.setCrop(null)
        ui.setMenu(null)
        setStatus(readOnly ? 'readonly' : 'saved')
      })
      .catch(() => alive && setMissing(true))
    return () => {
      alive = false
    }
  }, [designId]) // eslint-disable-line react-hooks/exhaustive-deps

  // access level can change while open
  useEffect(() => {
    if (loaded) useEditor.setState({ canEditLocked, readOnly })
  }, [loaded, canEditLocked, readOnly])

  // open the Fields panel for field-driven designs on roomy screens (once per design)
  const opened = useRef<string | null>(null)
  useEffect(() => {
    if (!loaded || !width || opened.current === designId) return
    opened.current = designId
    const d = useEditor.getState().design
    useUi.getState().setLeftTab(!compact && d?.fieldDefs?.length ? 'fields' : null)
  }, [loaded, width, compact, designId])

  useEffect(() => {
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.design === prev.design || !s.design || !s.dirty || s.readOnly) return
      setStatus((cur) => (cur === 'saving' ? cur : 'dirty'))
      window.clearTimeout(timer.current)
      const arm = () => {
        timer.current = window.setTimeout(() => {
          // never save half a drag — but a focused Fields input / inline text
          // box ('edit' gesture) is saved as you type
          if (useEditor.getState().gestureKind === 'pointer') arm()
          else void saveNow()
        }, 1200)
      }
      arm()
    })
    const hide = () => {
      if (document.visibilityState === 'hidden') void saveNow()
    }
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', hide)
    const token = ++mountSeq
    return () => {
      unsub()
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('pagehide', hide)
      window.clearTimeout(timer.current)
      // leaving the editor: flush, then drop the document from memory
      void saveNow().then(() => {
        // (unless another editor instance has mounted in the meantime)
        if (mountSeq === token && useEditor.getState().design?.id === designId) useEditor.getState().close()
      })
    }
  }, [designId, saveNow])

  const exit = useCallback(() => {
    useEditor.getState().setEditingText(null)
    void saveNow().then(onExit)
  }, [saveNow, onExit])

  // ── keyboard ──────────────────────────────────────────────

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const st = useEditor.getState()
      if (!st.design) return
      const ui = useUi.getState()
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (mod && k === 'k') {
        e.preventDefault()
        ui.setPalette(!ui.paletteOpen)
        return
      }
      if (mod && k === 's') {
        e.preventDefault()
        void saveNow()
        return
      }
      if (isTyping(e.target) || anyLayerOpen() || st.editingTextId) return
      const done = () => e.preventDefault()
      if (mod) {
        if (k === 'z') return done(), e.shiftKey ? st.redo() : st.undo()
        if (k === 'y') return done(), st.redo()
        if (k === 'd') return done(), st.duplicateSelected()
        if (k === 'a') return done(), st.selectAll()
        if (k === 'g') return done(), e.shiftKey ? st.ungroup() : st.group()
        if (k === ']') return done(), st.order('front')
        if (k === '[') return done(), st.order('back')
        if (k === '0') return done(), stageApi.zoomTo(null)
        if (k === '1') return done(), stageApi.zoomTo(1)
        if (k === '=' || k === '+') return done(), stageApi.zoomStep(1)
        if (k === '-' || k === '_') return done(), stageApi.zoomStep(-1)
        return
      }
      if (e.altKey) return
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          done()
          st.deleteSelected()
          return
        case 'Escape':
          if (ui.cropId) ui.setCrop(null)
          else if (st.selection.length) st.select([])
          else if (st.tool === 'hand') st.setTool('select')
          return
        case 'Enter':
          if (st.selection.length) {
            done()
            const page = currentPage(st)
            const first = page?.elements.find((el) => st.selection.includes(el.id) && el.type !== 'shape')
            if (first) enterElement(first.id)
          }
          return
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (!st.selection.length) return
          done()
          const n = e.shiftKey ? 10 : 1
          st.nudge(e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0, e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0)
          return
        }
        case ']':
          return st.order('forward')
        case '[':
          return st.order('backward')
      }
      if (k === 't' && !st.readOnly) {
        done()
        addText('heading')
        const id = useEditor.getState().selection[0]
        if (id) useEditor.getState().setEditingText(id)
      } else if (k === 'v') st.setTool('select')
      else if (k === 'h') st.setTool('hand')
    }

    // copy / cut / paste go through the clipboard events so the system
    // clipboard stays in step (an image copied elsewhere pastes as an image)
    const userSelectingText = () => !!window.getSelection()?.toString()
    const copy = (e: ClipboardEvent) => {
      if (isTyping(e.target) || anyLayerOpen() || userSelectingText()) return
      if (!copySelection()) return
      e.clipboardData?.setData('text/plain', CLIP_MARKER)
      e.preventDefault()
    }
    const cut = (e: ClipboardEvent) => {
      if (isTyping(e.target) || anyLayerOpen() || userSelectingText()) return
      if (!cutSelection()) return
      e.clipboardData?.setData('text/plain', CLIP_MARKER)
      e.preventDefault()
    }
    const paste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || anyLayerOpen() || useEditor.getState().readOnly) return
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      const text = e.clipboardData?.getData('text/plain') ?? ''
      const clip = useUi.getState().clip
      if (clip && (text === CLIP_MARKER || (!files.length && !text.trim()))) pasteClip()
      else if (files.length) files.slice(0, 6).forEach((f) => void uploadAndAdd(f))
      else if (text.trim() && text !== CLIP_MARKER) addText('body', { text: text.trim().slice(0, 2000) })
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', key)
    document.addEventListener('copy', copy)
    document.addEventListener('cut', cut)
    document.addEventListener('paste', paste)
    return () => {
      window.removeEventListener('keydown', key)
      document.removeEventListener('copy', copy)
      document.removeEventListener('cut', cut)
      document.removeEventListener('paste', paste)
    }
  }, [saveNow])

  // ── render ────────────────────────────────────────────────

  if (missing)
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-[15px] font-bold text-ink">This design could not be found</div>
        <div className="text-[13px] text-ink-3">It may have been deleted, or it belongs to someone else.</div>
        <button type="button" className="btn btn-primary" onClick={onExit}>
          Back to Studio
        </button>
      </div>
    )

  return (
    <div ref={setRoot} className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden p-2" data-testid="studio-editor">
      {!loaded || !width ? <EditorSkeleton /> : compact ? <CompactLayout status={status} onExit={exit} /> : <WideLayout status={status} onExit={exit} />}
      <PreviewModal />
      <ContextMenu />
      <CommandPalette />
      <Toast />
    </div>
  )
}

function EditorSkeleton() {
  return (
    <>
      <Skeleton className="h-12 w-full shrink-0 rounded-2xl" />
      <div className="flex min-h-0 flex-1 gap-2">
        <Skeleton className="hidden w-[68px] rounded-2xl md:block" />
        <Skeleton className="min-w-0 flex-1 rounded-2xl" />
        <Skeleton className="hidden w-[272px] rounded-2xl md:block" />
      </div>
    </>
  )
}

function PanelBody({ tab }: { tab: LeftTab }) {
  const P = PANELS[tab]
  return <P />
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line/60 py-1.5 pl-3 pr-1.5">
      <div className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">{title}</div>
      <IconBtn title="Close panel" onClick={onClose}>
        <X size={15} />
      </IconBtn>
    </div>
  )
}

function WideLayout({ status, onExit }: { status: SaveStatus; onExit: () => void }) {
  const tab = useUi((s) => s.leftTab)
  const active = TABS.find((t) => t.id === tab)
  return (
    <>
      <TopBar compact={false} status={status} onExit={onExit} />
      <div className="flex min-h-0 min-w-0 flex-1 gap-2">
        <nav className="card flex w-[68px] shrink-0 flex-col items-stretch gap-0.5 overflow-y-auto p-1.5" aria-label="Editor panels">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.title}
              aria-pressed={tab === t.id}
              onClick={() => useUi.getState().toggleLeftTab(t.id)}
              className={clsx(
                'flex h-[52px] shrink-0 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-xl text-[10.5px] font-semibold transition-colors',
                tab === t.id ? 'bg-accent/15 text-accent' : 'text-ink-2 hover:bg-surface-3/60 hover:text-ink',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
        {active && (
          <aside className="card flex min-h-0 shrink-0 flex-col overflow-hidden" style={{ width: 'clamp(248px, 21vw, 340px)' }} aria-label={active.title}>
            <PanelHeader title={active.title} onClose={() => useUi.getState().setLeftTab(null)} />
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <PanelBody tab={active.id} />
            </div>
          </aside>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-line/80">
            <Stage compact={false} />
          </div>
          <PageStrip compact={false} />
        </div>
        <aside className="card min-h-0 shrink-0 overflow-y-auto overflow-x-hidden" style={{ width: 'clamp(240px, 19vw, 312px)' }} aria-label="Inspector">
          <Inspector />
        </aside>
      </div>
    </>
  )
}

function CompactLayout({ status, onExit }: { status: SaveStatus; onExit: () => void }) {
  const tab = useUi((s) => s.leftTab)
  const inspector = useUi((s) => s.inspectorOpen)
  const hasSel = useEditor((s) => s.selection.length > 0)
  const active = TABS.find((t) => t.id === tab)
  const sheet = active ? active.title : inspector ? (hasSel ? 'Style' : 'Page') : null
  const closeSheet = () => {
    useUi.getState().setLeftTab(null)
    useUi.getState().setInspectorOpen(false)
  }
  const btn = (on: boolean) =>
    clsx(
      'flex h-12 min-w-[46px] flex-1 shrink-0 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-xl px-0.5 text-[10px] font-semibold',
      on ? 'bg-accent/15 text-accent' : 'text-ink-2',
    )
  return (
    <>
      <TopBar compact status={status} onExit={onExit} />
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-line/80">
        <Stage compact />
        <div data-stage-ui className="card absolute bottom-1.5 right-1.5 flex items-center" style={{ background: 'rgb(var(--surface-1) / .9)' }}>
          <ZoomControl />
        </div>
      </div>
      {sheet ? (
        <section className="card flex min-h-0 shrink-0 flex-col overflow-hidden" style={{ height: 'min(46%, 420px)' }} aria-label={sheet}>
          <PanelHeader title={sheet} onClose={closeSheet} />
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">{active ? <PanelBody tab={active.id} /> : <Inspector />}</div>
        </section>
      ) : (
        <PageStrip compact />
      )}
      <nav className="card flex shrink-0 items-center overflow-x-auto p-1" style={{ scrollbarWidth: 'none' }} aria-label="Editor panels">
        <button
          type="button"
          className={btn(inspector && !tab)}
          aria-pressed={inspector && !tab}
          onClick={() => {
            const ui = useUi.getState()
            const open = !(ui.inspectorOpen && !ui.leftTab)
            ui.setLeftTab(null)
            ui.setInspectorOpen(open)
          }}
        >
          <SlidersHorizontal size={18} />
          {hasSel ? 'Style' : 'Page'}
        </button>
        {TABS.map((t) => (
          <button key={t.id} type="button" className={btn(tab === t.id)} aria-pressed={tab === t.id} title={t.title} onClick={() => useUi.getState().toggleLeftTab(t.id)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </>
  )
}

function Toast() {
  const toast = useUi((s) => s.toast)
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    setShown(toast.msg)
    const t = window.setTimeout(() => setShown(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])
  if (!shown) return null
  return (
    <Portal>
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[1100] flex justify-center px-4" role="status" aria-live="polite">
        <div className="max-w-full truncate rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white shadow-lg" style={{ background: 'rgb(12 24 77 / .95)' }}>
          {shown}
        </div>
      </div>
    </Portal>
  )
}
