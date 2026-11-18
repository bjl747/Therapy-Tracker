import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpToLine,
  CheckSquare,
  Copy,
  FilePlus2,
  Info,
  Lock,
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

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
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
}
function TB({ icon, label, onClick, disabled, primary, showLabel, title }: TBProps) {
  return (
    <button
      type="button"
      className={clsx('btn', primary && 'btn-primary', !showLabel && '!px-2.5 xl:!px-3')}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span className={showLabel ? '' : 'hidden xl:inline'}>{label}</span>
    </button>
  )
}

export function PdfStudio() {
  const pages = usePdfStudio((s) => s.pages)
  const sel = usePdfStudio((s) => s.sel)
  const loading = usePdfStudio((s) => s.loading)
  const fileName = usePdfStudio((s) => s.fileName)
  const notices = usePdfStudio((s) => s.notices)
  const canUndo = usePdfStudio((s) => s.hist.past.length > 0)
  const canRedo = usePdfStudio((s) => s.hist.future.length > 0)
  const st = usePdfStudio.getState

  const ex = useExporter()
  const [editId, setEditId] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const dragDepth = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const add = useCallback((files: FileList | File[] | null) => {
    if (!files || !files.length) return
    void ingestFiles(Array.from(files))
  }, [])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      const s = st()
      const modalOpen = layerCount() > 0
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

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
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
      add(e.dataTransfer.files)
    },
  }

  const none = sel.ids.length === 0
  const showGrid = pages.length > 0 || loading > 0

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col gap-3 px-4 py-3 md:px-6" {...dropProps}>
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
        <div className="min-w-0">
          <div className="eyebrow">PDF Studio</div>
          <h1 className="text-xl font-bold text-ink">Combine, edit and export PDFs</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
            <Lock size={12} className="shrink-0" /> Files are processed in your browser. Nothing is uploaded.
          </p>
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
            <TB icon={<XSquare size={14} />} label="Clear" title="Clear selection (Esc)" disabled={none} onClick={() => st().clearSel()} />
            <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
            <TB icon={<RotateCcw size={14} />} label="Rotate left" title="Rotate left (Shift+R)" disabled={none} onClick={() => st().rotateSel(-90)} />
            <TB icon={<RotateCw size={14} />} label="Rotate right" title="Rotate right (R)" disabled={none} onClick={() => st().rotateSel(90)} />
            <TB icon={<Copy size={14} />} label="Duplicate" disabled={none} onClick={() => st().duplicateSel()} />
            <TB icon={<Trash2 size={14} />} label="Delete" title="Delete (Del)" disabled={none} onClick={() => st().deleteSel()} />
            <TB icon={<FilePlus2 size={14} />} label="Blank page" title="Insert blank page (Letter)" disabled={!pages.length} onClick={() => st().insertBlank()} />
            <TB icon={<ArrowUpToLine size={14} />} label="To start" disabled={none} onClick={() => st().moveSel('start')} />
            <TB icon={<ArrowDownToLine size={14} />} label="To end" disabled={none} onClick={() => st().moveSel('end')} />
            <TB icon={<Pencil size={14} />} label="Edit page" disabled={none} onClick={() => setEditId(sel.ids[0])} />
            <span className="ml-auto whitespace-nowrap pl-2 text-xs tabular-nums text-ink-3">
              {sel.ids.length ? `${sel.ids.length} of ${pages.length} selected` : `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`}
            </span>
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
                  <p className="text-base font-bold text-ink">Drop PDFs and images here</p>
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
