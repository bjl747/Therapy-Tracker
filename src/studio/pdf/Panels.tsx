import { type ReactNode, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Download,
  EyeOff,
  RefreshCcw,
  RotateCcwSquare,
  FileImage,
  FileText,
  Scissors,
  Trash2,
  FileOutput,
  Files,
} from 'lucide-react'
import clsx from 'clsx'
import { estimateBytes, formatBytes, hasRedaction, widePageIds } from './lib'
import { type FormField, type SourceMeta, usePdfStudio, usedSourceIds } from './store'
import type { useExporter } from './useExporter'

type Exporter = ReturnType<typeof useExporter>

function Section({ title, icon, action, children }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card min-w-0 p-4">
      <div className="mb-3 flex min-w-0 items-center gap-2">
        {icon}
        <h3 className="eyebrow min-w-0 flex-1">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

const iconBtn = 'flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-30'

export function DocumentPanel() {
  const pages = usePdfStudio((s) => s.pages)
  const sources = usePdfStudio((s) => s.sources)
  const sel = usePdfStudio((s) => s.sel)
  const layout = usePdfStudio((s) => s.layout)
  const setLayout = usePdfStudio((s) => s.setLayout)
  const [confirmReset, setConfirmReset] = useState(false)

  const estimate = useMemo(
    () =>
      estimateBytes(
        pages,
        Object.fromEntries(Object.values(sources).map((s) => [s.id, { bytes: s.bytes, pageCount: s.pageCount, kind: s.kind }])),
      ),
    [pages, sources],
  )
  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of pages) if (p.src.kind !== 'blank') m.set(p.src.sourceId, (m.get(p.src.sourceId) ?? 0) + 1)
    return m
  }, [pages])
  // only files that still have a page here, in document order (a removed file comes back with Undo)
  const list = useMemo(() => usedSourceIds(pages).map((id) => sources[id]).filter((s): s is SourceMeta => !!s), [pages, sources])
  const wide = useMemo(() => widePageIds(pages).length, [pages])
  const redacted = pages.filter(hasRedaction).length
  const selSet = new Set(sel.ids)
  const st = usePdfStudio.getState
  const anything = pages.length > 0 || Object.keys(sources).length > 0

  return (
    <Section
      title="Document"
      icon={<Files size={14} className="text-ink-3" />}
      action={
        anything && !confirmReset ? (
          <button type="button" className="btn !h-7 !px-2 !text-xs" title="Remove every page and file and start a new document" onClick={() => setConfirmReset(true)}>
            <RefreshCcw size={13} /> Start over
          </button>
        ) : undefined
      }
    >
      {confirmReset && (
        <div className="mb-3 rounded-lg border border-[rgb(var(--status-bad)/.4)] bg-[rgb(var(--status-bad)/.08)] p-3 text-sm" role="alertdialog" aria-label="Start over">
          <p className="font-semibold text-ink">Remove every page and file?</p>
          <p className="mt-0.5 text-xs text-ink-2">This clears the document, your edits and the form values. It can&apos;t be undone.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn border-transparent bg-[rgb(var(--status-bad))] text-white hover:border-transparent hover:bg-[rgb(var(--status-bad)/.88)]"
              onClick={() => {
                st().reset()
                setConfirmReset(false)
              }}
            >
              <Trash2 size={14} /> Start over
            </button>
            <button type="button" className="btn" autoFocus onClick={() => setConfirmReset(false)}>
              Keep working
            </button>
          </div>
        </div>
      )}

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-surface-2 p-2">
          <dt className="eyebrow">Pages</dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums">{pages.length}</dd>
        </div>
        <div className="rounded-lg bg-surface-2 p-2">
          <dt className="eyebrow">Files</dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums">{list.length}</dd>
        </div>
        <div className="rounded-lg bg-surface-2 p-2">
          <dt className="eyebrow">Size</dt>
          <dd className="mt-0.5 whitespace-nowrap text-lg font-bold tabular-nums" title="Estimate">
            ≈{formatBytes(estimate)}
          </dd>
        </div>
      </dl>

      {list.length > 0 && (
        <ul className="mt-3 space-y-1" aria-label="Files in this document">
          {list.map((s, i) => {
            const n = usage.get(s.id) ?? 0
            const ids = pages.filter((p) => p.src.kind !== 'blank' && p.src.sourceId === s.id)
            const allSel = ids.length > 0 && ids.every((p) => selSet.has(p.id))
            return (
              <li key={s.id} className={clsx('flex min-w-0 items-center gap-1 rounded-md pl-1 text-xs', allSel && 'bg-[rgb(var(--accent-soft))]')}>
                {s.kind === 'pdf' ? <FileText size={14} className="shrink-0 text-ink-3" /> : <FileImage size={14} className="shrink-0 text-ink-3" />}
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate py-1 pl-1 text-left font-medium text-ink hover:underline"
                  title={`${s.name}: select its ${n === 1 ? 'page' : `${n} pages`}`}
                  onClick={() => st().selectSource(s.id)}
                >
                  {s.name}
                </button>
                <span className="shrink-0 pr-1 tabular-nums text-ink-3" title={`${n} of its ${s.pageCount} ${s.pageCount === 1 ? 'page' : 'pages'} in the document`}>
                  {n}/{s.pageCount}
                </span>
                <button type="button" className={iconBtn} aria-label={`Move ${s.name} up`} title="Move this file's pages up" disabled={i === 0} onClick={() => st().moveSource(s.id, -1)}>
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  className={iconBtn}
                  aria-label={`Move ${s.name} down`}
                  title="Move this file's pages down"
                  disabled={i === list.length - 1}
                  onClick={() => st().moveSource(s.id, 1)}
                >
                  <ChevronDown size={14} />
                </button>
                <button type="button" className={iconBtn} aria-label={`Remove ${s.name}`} title="Remove this file's pages (Undo brings them back)" onClick={() => st().removeSource(s.id)}>
                  <Trash2 size={13} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]"
            checked={layout === 'letter'}
            onChange={(e) => setLayout(e.target.checked ? 'letter' : 'original')}
          />
          <span className="min-w-0">
            <span className="font-semibold text-ink">Letter portrait pages</span>
            <span className="block text-xs text-ink-3">Every page fits an 8.5 × 11 portrait page. Rotate turns what&apos;s on the page.</span>
          </span>
        </label>
        {layout === 'letter' && (
          <button
            type="button"
            className="btn mt-2 w-full border-accent/50 bg-accent/[0.07] text-accent hover:border-accent/50 hover:bg-accent/15"
            title="Turns landscape pages so they fill the portrait page"
            disabled={!pages.length}
            onClick={() => st().turnWidePages()}
          >
            <RotateCcwSquare size={14} /> Turn wide pages sideways{wide ? ` (${wide})` : ''}
          </button>
        )}
      </div>

      {redacted > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-surface-2 p-2 text-xs text-ink-2">
          <EyeOff size={14} className="mt-0.5 shrink-0" />
          {redacted} {redacted === 1 ? 'page has' : 'pages have'} redactions. On export {redacted === 1 ? 'it becomes' : 'they become'} a picture: the covered text is removed for good, and ATS software cannot read {redacted === 1 ? 'that page' : 'those pages'}.
        </p>
      )}
    </Section>
  )
}

export function SplitPanel({ ex }: { ex: Exporter }) {
  const pages = usePdfStudio((s) => s.pages)
  const sel = usePdfStudio((s) => s.sel)
  const [n, setN] = useState(2)
  const empty = pages.length === 0
  const busy = !!ex.busy
  const multiSource = useMemo(() => usedSourceIds(pages).length > 1, [pages])

  return (
    <Section title="Split & extract" icon={<Scissors size={14} className="text-ink-3" />}>
      <div className="space-y-2">
        <button type="button" className="btn w-full" disabled={!sel.ids.length || busy} onClick={() => void ex.exportSelection()}>
          <FileOutput size={14} /> Extract {sel.ids.length || ''} selected {sel.ids.length === 1 ? 'page' : 'pages'}
        </button>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-xs text-ink-2">Every</span>
          <input
            type="number"
            min={1}
            max={999}
            className="input !w-16 tabular-nums"
            value={n}
            aria-label="Pages per file"
            onChange={(e) => setN(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          />
          <span className="whitespace-nowrap text-xs text-ink-2">pages</span>
          <button type="button" className="btn ml-auto" disabled={empty || busy} onClick={() => void ex.splitN(n)}>
            <Scissors size={14} /> Split
          </button>
        </div>
        <button type="button" className="btn w-full" disabled={!multiSource || busy} onClick={() => void ex.splitSources()}>
          <Files size={14} /> Split by source file
        </button>
        <button
          type="button"
          className="btn w-full"
          disabled={!sel.ids.length || busy}
          title={sel.ids.length ? undefined : 'Select the pages to save as images first'}
          onClick={() => void ex.exportPngs()}
        >
          <FileImage size={14} /> Download {sel.ids.length > 1 ? `${sel.ids.length} selected pages` : 'selected page'} as PNG
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-3">Splitting downloads several files; allow multiple downloads if your browser asks.</p>
    </Section>
  )
}

function FieldRow({ sourceId, f }: { sourceId: string; f: FormField }) {
  const val = usePdfStudio((s) => s.formValues[sourceId]?.[f.name])
  const setFormValue = usePdfStudio((s) => s.setFormValue)
  const cur = val ?? f.value
  const id = `ff-${sourceId}-${f.name}`
  const set = (v: string | boolean) => setFormValue(sourceId, f.name, v === f.value ? null : v)
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block truncate text-xs font-medium text-ink-2" title={f.name}>
        {f.name}
      </label>
      {f.type === 'checkbox' ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            id={id}
            type="checkbox"
            className="h-4 w-4 accent-[rgb(var(--accent))]"
            checked={cur === true}
            disabled={f.readOnly}
            onChange={(e) => set(e.target.checked)}
          />
          {cur === true ? 'Ticked' : 'Not ticked'}
        </label>
      ) : f.type === 'text' ? (
        f.multiline ? (
          <textarea id={id} className="input !h-16 !py-2" value={String(cur)} disabled={f.readOnly} onChange={(e) => set(e.target.value)} />
        ) : (
          <input id={id} className="input" value={String(cur)} disabled={f.readOnly} onChange={(e) => set(e.target.value)} />
        )
      ) : (
        <select id={id} className="input" value={String(cur)} disabled={f.readOnly} onChange={(e) => set(e.target.value)}>
          <option value="">(none)</option>
          {f.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

export function FormsPanel() {
  const sources = usePdfStudio((s) => s.sources)
  const pages = usePdfStudio((s) => s.pages)
  const flatten = usePdfStudio((s) => s.flatten)
  const setFlatten = usePdfStudio((s) => s.setFlatten)
  const used = new Set(pages.map((p) => (p.src.kind === 'blank' ? '' : p.src.sourceId)))
  const withFields = Object.values(sources).filter((s) => s.fields.length > 0 && used.has(s.id))
  if (!withFields.length) return null
  return (
    <Section title="Fill forms" icon={<FileText size={14} className="text-ink-3" />}>
      <div className="space-y-4">
        {withFields.map((s) => (
          <div key={s.id} className="min-w-0">
            <div className="mb-2 truncate text-xs font-bold text-ink" title={s.name}>
              {s.name} <span className="font-normal tabular-nums text-ink-3">· {s.fields.length} fields</span>
            </div>
            <div className="grid max-h-[320px] grid-cols-1 gap-2.5 overflow-y-auto pr-1">
              {s.fields.map((f) => (
                <FieldRow key={f.name} sourceId={s.id} f={f} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
        <span>
          <span className="font-semibold text-ink">Flatten form</span>
          <span className="block text-xs text-ink-3">Off (default): the form stays fillable, and values you type here are kept in it. On: bakes the values into the page as plain text and removes the fields.</span>
        </span>
      </label>
    </Section>
  )
}

export function ExportBar({ ex }: { ex: Exporter }) {
  const pages = usePdfStudio((s) => s.pages)
  const busy = ex.busy
  return (
    <div className="min-w-0">
      <button type="button" className="btn btn-primary" disabled={!pages.length || !!busy} onClick={() => void ex.exportAll()}>
        <Download size={14} /> Download PDF
      </button>
      {busy && (
        <div className="mt-2" role="status" aria-live="polite">
          <div className="mb-1 flex justify-between text-xs text-ink-2">
            <span>{busy.label}</span>
            <span className="tabular-nums">
              {busy.done}/{busy.total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${busy.total ? (busy.done / busy.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}
