import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpToLine,
  CheckSquare,
  Copy,
  FilePlus2,
  Info,
  Lock,
  MousePointerClick,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
  Upload,
  X,
  XSquare,
} from 'lucide-react'
import clsx from 'clsx'
import { ACCEPT, ingestFiles } from './ingest'
import { layerCount } from './layers'
import { PageEditor } from './PageEditor'
import { PageGrid } from './PageGrid'
import { DocumentPanel, ExportBar, FormsPanel, SplitPanel } from './Panels'
import { usePdfStudio } from './store'
import { useExporter } from './useExporter'

/** Only fields you type into own the keys; a ticked checkbox, slider or button does not. */
const NOT_TEXT = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color', 'image'])
function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  if (el.tagName === 'INPUT') return !NOT_TEXT.has((el as HTMLInputElement).type)
  return el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

/** Inside a modal dialog (PDF Studio's page editor, or a hub pop-up). */
const inDialog = (t: EventTarget | null) => t instanceof Element && !!t.closest('[aria-modal="true"]')

/* ------------------------------------------------------------ adding files */

type FsEntry = {
  isFile: boolean
  isDirectory: boolean
  name: string
  file?: (ok: (f: File) => void, fail: (e: unknown) => void) => void
  createReader?: () => { readEntries: (ok: (es: FsEntry[]) => void, fail: (e: unknown) => void) => void }
}

/** Every file in a dropped folder (and its sub-folders), sorted by name within each folder. */
async function filesOf(entry: FsEntry): Promise<File[]> {
  if (entry.isFile && entry.file) {
    const f = await new Promise<File | null>((ok) => entry.file!(ok, () => ok(null)))
    return f ? [f] : []
  }
  if (!entry.isDirectory || !entry.createReader) return []
  const reader = entry.createReader()
  const all: FsEntry[] = []
  // readEntries returns the folder in batches (about 100 at a time) until an empty batch
  for (;;) {
    const batch = await new Promise<FsEntry[]>((ok) => reader.readEntries(ok, () => ok([])))
    if (!batch.length) break
    all.push(...batch)
  }
  all.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  const out: File[] = []
  for (const e of all) if (!e.name.startsWith('.')) out.push(...(await filesOf(e)))
  return out
}

/** The dropped items, with folders opened up. Must be called while the drop event is being handled. */
function droppedFiles(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items ?? []).filter((it) => it.kind === 'file')
  const entries = items.map((it) => (it as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.() ?? null)
  if (!entries.some((e) => e?.isDirectory)) return Promise.resolve(Array.from(dt.files))
  const plain = Array.from(dt.files)
  return Promise.all(entries.map((e, i) => (e ? filesOf(e) : Promise.resolve(plain[i] ? [plain[i]] : [])))).then((lists) => lists.flat())
}

/** Drops and picks are read one batch after another, so two quick drops never mix their pages. */
let queue: Promise<void> = Promise.resolve()
function addFiles(files: File[] | Promise<File[]>): void {
  queue = queue.then(async () => {
    const list = await files
    if (list.length) await ingestFiles(list)
  }).catch(() => undefined)
}

interface TBProps {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  /** Always show the text label (otherwise icon-only below xl). */
  showLabel?: boolean
  title?: string
  /** Added to the tooltip while the button is disabled (why it is). */
  whyOff?: string
}
function TB({ icon, label, onClick, disabled, primary, showLabel, title, whyOff }: TBProps) {
  return (
    <button
      type="button"
      className={clsx('btn', primary && 'btn-primary', !showLabel && '!px-2.5 xl:!px-3')}
      aria-label={label}
      title={`${title ?? label}${disabled && whyOff ? ` · ${whyOff}` : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span className={showLabel ? '' : 'hidden xl:inline'}>{label}</span>
    </button>
  )
}

export function PdfStudio({ onBack, owner }: { onBack?: () => void; owner?: string } = {}) {
  // the hub's signed-in user: another person's (or a signed-out session's) documents are cleared before the
  // screen paints (layout effect, not during render: changing the store mid-render upsets React)
  useLayoutEffect(() => {
    if (owner !== undefined) usePdfStudio.getState().claim(owner)
  }, [owner])

  const pages = usePdfStudio((s) => s.pages)
  const sel = usePdfStudio((s) => s.sel)
  const loading = usePdfStudio((s) => s.loading)
  const fileName = usePdfStudio((s) => s.fileName)
  const notices = usePdfStudio((s) => s.notices)
  const canUndo = usePdfStudio((s) => s.hist.past.length > 0)
  const canRedo = usePdfStudio((s) => s.hist.future.length > 0)
  const layout = usePdfStudio((s) => s.layout)
  const st = usePdfStudio.getState

  const ex = useExporter()
  const [editId, setEditId] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const dragDepth = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const add = useCallback((files: FileList | File[] | null) => {
    if (!files || !files.length) return
    addFiles(Array.from(files))
  }, [])

  // A file dropped anywhere else on the hub (header, left menu) would make the browser open it in this tab and lose
  // the document: take it here instead. Leaving the page with pages open asks first.
  useEffect(() => {
    const isFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const over = (e: DragEvent) => {
      if (!isFiles(e) || e.defaultPrevented) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = inDialog(e.target) ? 'none' : 'copy'
    }
    const drop = (e: DragEvent) => {
      if (!isFiles(e) || e.defaultPrevented) return
      e.preventDefault()
      if (e.dataTransfer && !inDialog(e.target)) addFiles(droppedFiles(e.dataTransfer))
    }
    const unload = (e: BeforeUnloadEvent) => {
      if (!usePdfStudio.getState().pages.length) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    window.addEventListener('beforeunload', unload)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
      window.removeEventListener('beforeunload', unload)
    }
  }, [])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target)) return
      const t = e.target as Element | null
      const modalOpen = layerCount() > 0
      // only keys pressed on PDF Studio itself (or with nothing focused); never while focus is in the hub's header,
      // menu or pop-ups. With the page editor open, its dialog counts as PDF Studio.
      const onPage = !t || t === document.body || t === document.documentElement || !!rootRef.current?.contains(t)
      const inEditor = modalOpen && !!t?.closest?.('[aria-modal="true"]') && !t.closest('header, nav')
      if (!onPage && !inEditor) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      const s = st()
      if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && k === 'y') {
        e.preventDefault()
        s.redo()
        return
      }
      if (modalOpen) return
      if (mod && k === 'a') {
        e.preventDefault()
        s.selectAllPages()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.sel.ids.length) {
          e.preventDefault()
          s.deleteSel()
        }
      } else if (!mod && !e.altKey && k === 'r') {
        if (s.sel.ids.length) {
          e.preventDefault()
          s.rotateSel(e.shiftKey ? -90 : 90)
        }
      } else if (e.key === 'Escape') {
        s.clearSel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [st])

  // drags over the page editor (a portal, so its events reach here) are not drops into the document
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files') && !inDialog(e.target)
  const dropProps = {
    onDragEnter: (e: React.DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current += 1
      setOver(true)
    },
    onDragOver: (e: React.DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!hasFiles(e)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (!dragDepth.current) setOver(false)
    },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setOver(false)
      addFiles(droppedFiles(e.dataTransfer))
    },
  }

  const none = sel.ids.length === 0
  const letter = layout === 'letter'
  const PICK = 'select a page first'
  const showGrid = pages.length > 0 || loading > 0

  return (
    <div ref={rootRef} className="relative flex h-full min-h-0 w-full min-w-0 flex-col gap-3 px-4 py-3 md:px-6" {...dropProps}>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        aria-label="Add PDF or image files"
        onChange={(e) => {
          add(e.target.files)
          e.target.value = ''
        }}
      />

      <header className="flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex items-start gap-2">
          {onBack && (
            <button className="btn mt-1 shrink-0" onClick={onBack} aria-label="Back to Studio">
              <ArrowLeft size={15} />
            </button>
          )}
          <div className="min-w-0">
          <div className="eyebrow">PDF Studio</div>
          <h1 className="text-xl font-bold text-ink">Combine, edit and export PDFs</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
            <Lock size={12} className="shrink-0" /> Files are processed in your browser. Nothing is uploaded.
          </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:w-64 sm:flex-none">
            <input
              className="input"
              aria-label="Output file name"
              value={fileName}
              onChange={(e) => usePdfStudio.getState().setFileName(e.target.value)}
              placeholder="document"
            />
            <span className="text-xs text-ink-3">.pdf</span>
          </div>
          <ExportBar ex={ex} />
        </div>
      </header>

      {notices.length > 0 && (
        <div className="space-y-1.5" role="status" aria-live="polite">
          {notices.map((n) => (
            <div
              key={n.id}
              className={clsx(
                'flex items-start gap-2 rounded-xl border px-3 py-2 text-sm',
                n.kind === 'error' ? 'border-[rgb(var(--status-bad)/.4)] bg-[rgb(var(--status-bad)/.08)]' : 'border-line bg-surface-2',
              )}
            >
              {n.kind === 'error' ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[rgb(var(--status-bad))]" /> : <Info size={15} className="mt-0.5 shrink-0 text-accent" />}
              <span className="min-w-0 flex-1 break-words text-ink">{n.text}</span>
              <button type="button" className="shrink-0 text-ink-3 hover:text-ink" aria-label="Dismiss message" onClick={() => usePdfStudio.getState().dismiss(n.id)}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-4 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <main className="flex min-w-0 flex-col gap-3 lg:min-h-0">
          <div className="card flex min-w-0 flex-wrap items-center gap-1.5 p-2" role="toolbar" aria-label="Page actions">
            <TB icon={<Plus size={14} />} label="Add files" showLabel primary onClick={() => fileRef.current?.click()} />
            <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
            <TB icon={<Undo2 size={14} />} label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => st().undo()} />
            <TB icon={<Redo2 size={14} />} label="Redo" title="Redo (Shift+Ctrl+Z)" disabled={!canRedo} onClick={() => st().redo()} />
            <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
            <TB icon={<CheckSquare size={14} />} label="Select all" title="Select all (Ctrl+A)" disabled={!pages.length} onClick={() => st().selectAllPages()} />
            <TB icon={<XSquare size={14} />} label="Deselect" title="Deselect (Esc)" disabled={none} whyOff="nothing is selected" onClick={() => st().clearSel()} />
            <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
            <TB icon={<RotateCcw size={14} />} label="Rotate left" title={letter ? 'Rotate left (Shift+R): turns the content on the page' : 'Rotate left (Shift+R)'} disabled={none} whyOff={PICK} onClick={() => st().rotateSel(-90)} />
            <TB icon={<RotateCw size={14} />} label="Rotate right" title={letter ? 'Rotate right (R): turns the content on the page' : 'Rotate right (R)'} disabled={none} whyOff={PICK} onClick={() => st().rotateSel(90)} />
            <TB icon={<Copy size={14} />} label="Duplicate" disabled={none} whyOff={PICK} onClick={() => st().duplicateSel()} />
            <TB icon={<Trash2 size={14} />} label="Delete" title="Delete (Del)" disabled={none} whyOff={PICK} onClick={() => st().deleteSel()} />
            <TB icon={<FilePlus2 size={14} />} label="Blank page" title={none ? 'Insert a blank page at the end' : 'Insert a blank page after the selection'} disabled={!pages.length} whyOff="add a file first" onClick={() => st().insertBlank()} />
            <TB icon={<ArrowUpToLine size={14} />} label="To start" title="Move to the start" disabled={none} whyOff={PICK} onClick={() => st().moveSel('start')} />
            <TB icon={<ArrowDownToLine size={14} />} label="To end" title="Move to the end" disabled={none} whyOff={PICK} onClick={() => st().moveSel('end')} />
            <TB icon={<Pencil size={14} />} label="Edit page" title="Edit page (or double-click a page)" disabled={none} whyOff={PICK} onClick={() => setEditId(sel.ids[0])} />
            <span className="ml-auto whitespace-nowrap pl-2 text-xs tabular-nums text-ink-3">
              {sel.ids.length ? `${sel.ids.length} of ${pages.length} selected` : `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`}
            </span>
            {none && pages.length > 0 && (
              <p className="flex w-full min-w-0 items-center gap-1.5 px-1 pt-0.5 text-xs text-ink-2">
                <MousePointerClick size={13} className="shrink-0 text-accent" />
                <span className="min-w-0">Click a page to select it (Shift/Ctrl for more), then rotate, move or delete.</span>
              </p>
            )}
          </div>

          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
            {showGrid ? (
              <PageGrid onOpen={setEditId} />
            ) : (
              <div
                className={clsx(
                  'flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
                  over ? 'border-accent bg-[rgb(var(--accent-soft))]' : 'border-line bg-surface-1/50',
                )}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--accent-soft))] text-accent">
                  <Upload size={22} />
                </div>
                <div>
                  <p className="text-base font-bold text-ink">Drop PDFs, images or a folder here</p>
                  <p className="mt-1 text-sm text-ink-2">PNG, JPG and WebP images become one page each. Add as many files as you like.</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                  <Plus size={14} /> Choose files
                </button>
              </div>
            )}
          </div>
        </main>

        <aside className="min-w-0 space-y-4 lg:overflow-y-auto lg:pr-1" aria-label="Document tools">
          <DocumentPanel />
          <SplitPanel ex={ex} />
          <FormsPanel />
        </aside>
      </div>

      {over && showGrid && (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-[rgb(var(--accent-soft)/.85)]">
          <span className="flex items-center gap-2 text-sm font-bold text-accent">
            <Upload size={16} /> Drop to add to this document
          </span>
        </div>
      )}

      {editId && pages.some((p) => p.id === editId) && <PageEditor pageId={editId} onClose={() => setEditId(null)} onNavigate={setEditId} />}
    </div>
  )
}
