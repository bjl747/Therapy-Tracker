// Top bar: back, name, undo/redo, lint, zoom, preview, download.

import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  Download,
  FileArchive,
  FileImage,
  FileText,
  Film,
  Hand,
  Minus,
  MousePointer2,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Undo2,
} from 'lucide-react'
import type { Design } from '../engine/model'
import { drawPage, measure, pageImageSrcs } from '../engine/render'
import { loadImage } from '../engine/images'
import { fieldValue, markerKeys } from '../engine/fields'
import { resolveImage } from '../services'
import { copyPngToClipboard, downloadBlob, exportJpg, exportPng, safeFileName } from '../export/raster'
import { designHasAnimation, exportGif } from '../export/animate'
import { exportDesignPdf } from '../export/pdf'
import { makeZip } from '../export/zip'
import { useEditor } from './store'
import { stageApi, useUi } from './uiStore'
import { lintDesign, type LintIssue } from './lint'
import { toast } from './actions'
import { IconBtn, MenuList, Modal, MOD, PopButton } from './ui'
import { ZOOM_STEPS } from './viewport'

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'readonly'

export function TopBar({ compact, status, onExit }: { compact: boolean; status: SaveStatus; onExit: () => void }) {
  const name = useEditor((s) => s.design?.name ?? '')
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const readOnly = useEditor((s) => s.readOnly)
  const tool = useEditor((s) => s.tool)
  const [draft, setDraft] = useState<string | null>(null)
  const st = () => useEditor.getState()

  return (
    <header className="card flex min-w-0 shrink-0 items-center gap-1 px-1.5 sm:gap-1.5 sm:px-2" style={{ height: 48 }}>
      <IconBtn title="Back to Studio" onClick={onExit}>
        <ArrowLeft size={17} />
      </IconBtn>
      <input
        className="h-8 min-w-0 flex-1 truncate rounded-lg border border-transparent bg-transparent px-2 text-[14px] font-bold text-ink outline-none hover:border-line focus:border-accent focus:bg-surface-1 sm:max-w-[320px]"
        aria-label="Design name"
        value={draft ?? name}
        readOnly={readOnly}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          if (draft !== null && draft.trim() && draft.trim() !== name) st().rename(draft.trim())
          setDraft(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(null)
            e.currentTarget.blur()
          }
        }}
      />
      <SaveChip status={status} compact={compact} />
      <div className="hidden min-w-0 flex-1 sm:block" />
      {!readOnly && (
        <div className="flex shrink-0 items-center">
          <IconBtn title={`Undo (${MOD}Z)`} disabled={!canUndo} onClick={() => st().undo()}>
            <Undo2 size={16} />
          </IconBtn>
          <IconBtn title={`Redo (${MOD}Shift+Z)`} disabled={!canRedo} onClick={() => st().redo()}>
            <Redo2 size={16} />
          </IconBtn>
        </div>
      )}
      {!compact && (
        <>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-line" />
          <IconBtn title="Select (V)" active={tool === 'select'} onClick={() => st().setTool('select')}>
            <MousePointer2 size={15} />
          </IconBtn>
          <IconBtn title="Hand — drag to pan (H, or hold Space)" active={tool === 'hand'} onClick={() => st().setTool('hand')}>
            <Hand size={15} />
          </IconBtn>
          <ZoomControl />
        </>
      )}
      <LintBadge compact={compact} />
      <button type="button" className={clsx('btn shrink-0', compact && 'w-[34px] px-0')} title="Preview animation" aria-label="Preview animation" onClick={() => useUi.getState().setPreview(true)}>
        <Play size={14} /> {!compact && 'Preview'}
      </button>
      <ExportButton compact={compact} />
    </header>
  )
}

function SaveChip({ status, compact }: { status: SaveStatus; compact: boolean }) {
  const map: Record<SaveStatus, { text: string; cls: string }> = {
    saved: { text: 'Saved', cls: 'text-ink-3' },
    dirty: { text: 'Unsaved changes', cls: 'text-ink-3' },
    saving: { text: 'Saving…', cls: 'text-ink-3' },
    error: { text: 'Not saved', cls: 'text-red-500' },
    readonly: { text: 'View only', cls: 'text-ink-3' },
  }
  const m = map[status]
  return (
    <span className={clsx('flex shrink-0 items-center gap-1 whitespace-nowrap text-[11.5px] font-semibold', m.cls, compact && 'hidden min-[420px]:flex')} role="status" aria-live="polite">
      {status === 'saved' && <Check size={12} />}
      {status === 'error' && <AlertTriangle size={12} />}
      {m.text}
    </span>
  )
}

export function ZoomControl({ className }: { className?: string }) {
  const zoom = useUi((s) => s.viewZoom)
  const fit = useEditor((s) => s.zoom === null)
  return (
    <div className={clsx('flex shrink-0 items-center', className)}>
      <IconBtn title={`Zoom out (${MOD}−)`} onClick={() => stageApi.zoomStep(-1)}>
        <Minus size={15} />
      </IconBtn>
      <PopButton
        title="Zoom"
        placement="bottom-end"
        className="flex h-8 min-w-[58px] items-center justify-center gap-0.5 whitespace-nowrap rounded-lg px-1.5 text-[12.5px] font-semibold tabular-nums text-ink hover:bg-surface-3/70"
        label={
          <>
            {Math.round(zoom * 100)}% <ChevronDown size={12} className="text-ink-3" />
          </>
        }
      >
        {(close) => (
          <MenuList
            close={close}
            items={[
              { label: 'Fit to screen', hint: `${MOD}0`, icon: fit ? <Check size={13} /> : undefined, onClick: () => stageApi.zoomTo(null) },
              ...ZOOM_STEPS.map((z, i) => ({ label: `${z * 100}%`, sep: i === 0, hint: z === 1 ? `${MOD}1` : undefined, onClick: () => stageApi.zoomTo(z) })),
            ]}
          />
        )}
      </PopButton>
      <IconBtn title={`Zoom in (${MOD}+)`} onClick={() => stageApi.zoomStep(1)}>
        <Plus size={15} />
      </IconBtn>
    </div>
  )
}

// ── lint ────────────────────────────────────────────────────

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return v
}

function LintBadge({ compact }: { compact: boolean }) {
  const live = useEditor((s) => s.design)
  const design = useDebounced(live, 400)
  const issues = useMemo(() => (design ? lintDesign(design, measure) : []), [design])
  const errors = issues.filter((i) => i.severity === 'error').length
  const ok = issues.length === 0
  const go = (i: LintIssue) => {
    const st = useEditor.getState()
    st.setPage(i.pageIndex)
    useEditor.setState({ selection: [i.elId] })
    if (i.kind === 'missing') {
      const el = st.design?.pages[i.pageIndex]?.elements.find((e) => e.id === i.elId)
      const key = el?.type === 'text' ? markerKeys(el.text).find((k) => !fieldValue(st.design?.fields ?? {}, k)?.trim()) : undefined
      if (key) useUi.getState().focusFieldKey(key)
    }
  }
  return (
    <PopButton
      title={ok ? 'Ready to post' : `${issues.length} thing${issues.length > 1 ? 's' : ''} to check before posting`}
      placement="bottom-end"
      panelClass="w-[320px]"
      className={clsx(
        'flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-2 text-[12.5px] font-semibold',
        ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : errors ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400' : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
      )}
      label={
        <>
          {ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {ok ? !compact && 'Ready to post' : compact ? issues.length : `${issues.length} to check`}
        </>
      }
    >
      {(close) => (
        <div className="flex flex-col">
          <div className="border-b border-line/70 px-3 py-2.5">
            <div className="eyebrow">Ready to post?</div>
            <div className="text-[13px] font-bold text-ink">{ok ? 'Everything looks good' : `${issues.length} thing${issues.length > 1 ? 's' : ''} to check`}</div>
          </div>
          {ok ? (
            <div className="flex items-center gap-2 px-3 py-4 text-[13px] text-ink-2">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-500" /> No overflowing text, empty fields or hard-to-read colours.
            </div>
          ) : (
            <div className="flex flex-col p-1">
              {issues.map((i) => (
                <button
                  key={i.key}
                  type="button"
                  className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2"
                  onClick={() => {
                    go(i)
                    close()
                  }}
                >
                  <AlertTriangle size={14} className={clsx('mt-0.5 shrink-0', i.severity === 'error' ? 'text-red-500' : 'text-amber-500')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-ink">
                      {i.label}
                      {design && design.pages.length > 1 && <span className="font-normal text-ink-3"> · page {i.pageIndex + 1}</span>}
                    </span>
                    <span className="block text-[12px] leading-snug text-ink-2">{i.message}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </PopButton>
  )
}

// ── export ──────────────────────────────────────────────────

type Job = { label: string; progress: number | null } | null

function ExportButton({ compact }: { compact: boolean }) {
  return (
    <PopButton
      title="Download"
      placement="bottom-end"
      panelClass="w-[300px]"
      className={clsx('btn btn-primary shrink-0', compact && 'w-[34px] px-0')}
      label={
        <>
          <Download size={14} /> {!compact && 'Download'}
        </>
      }
    >
      {(close) => <ExportPanel close={close} />}
    </PopButton>
  )
}

function ExportPanel({ close }: { close: () => void }) {
  const design = useEditor((s) => s.design)!
  const pageIndex = useEditor((s) => s.pageIndex)
  const [job, setJob] = useState<Job>(null)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const page = design.pages[pageIndex]
  const many = design.pages.length > 1
  const canGif = !!page && (designHasAnimation(page) || many)
  const stem = safeFileName(design.name)
  const pageStem = many ? `${stem}-page-${pageIndex + 1}` : stem

  const run = async (label: string, fn: (d: Design, setP: (p: number) => void) => Promise<string | void>, keepOpen = false) => {
    if (job) return
    setError(null)
    setJob({ label, progress: null })
    try {
      const msg = await fn(useEditor.getState().design!, (p) => alive.current && setJob({ label, progress: p }))
      if (msg) toast(msg)
      if (alive.current && !keepOpen) close()
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Something went wrong while exporting')
    } finally {
      if (alive.current) setJob(null)
    }
  }
  const png = (scale: number) =>
    run(`PNG ${scale}×`, async (d) => downloadBlob(await exportPng(d, pageIndex, { scale, resolveImage }), `${pageStem}${scale > 1 ? `@${scale}x` : ''}.png`))
  const jpg = () => run('JPG', async (d) => downloadBlob(await exportJpg(d, pageIndex, { scale: 1, resolveImage, quality: 0.92 }), `${pageStem}.jpg`))
  const gif = () =>
    run('GIF', async (d, setP) => {
      const scale = Math.min(1, 720 / Math.max(d.w, d.h))
      const blob = await exportGif(d, pageIndex, { scale, fps: 15, resolveImage }, (p, stage) => setP(stage === 'render' ? p * 0.5 : 0.5 + p * 0.5))
      downloadBlob(blob, `${pageStem}.gif`)
    })
  const pdf = () => run('PDF', async (d) => downloadBlob(await exportDesignPdf(d, { scale: 2, resolveImage }), `${stem}.pdf`))
  const copy = () =>
    run('Copy', async (d) => {
      await copyPngToClipboard(await exportPng(d, pageIndex, { scale: 1, resolveImage }))
      return 'Image copied — paste it straight into LinkedIn'
    })
  const zip = () =>
    run('ZIP', async (d, setP) => {
      const files: { name: string; data: Blob }[] = []
      for (let i = 0; i < d.pages.length; i++) {
        files.push({ name: `${stem}-page-${String(i + 1).padStart(2, '0')}.png`, data: await exportPng(d, i, { scale: 1, resolveImage }) })
        setP((i + 1) / (d.pages.length + 1))
      }
      downloadBlob(await makeZip(files), `${stem}.zip`)
    })

  const item = (icon: React.ReactNode, title: string, sub: string, onClick: () => void, disabled = false, extra?: React.ReactNode) => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled || !!job}
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate whitespace-nowrap text-[13px] font-semibold text-ink">{title}</span>
          <span className="block truncate text-[11.5px] text-ink-3">{sub}</span>
        </span>
      </button>
      {extra}
    </div>
  )

  return (
    <div className="flex flex-col">
      <div className="border-b border-line/70 px-3 py-2.5">
        <div className="eyebrow">Download</div>
        <div className="truncate text-[13px] font-bold text-ink">
          {many ? `Page ${pageIndex + 1} of ${design.pages.length}` : design.name} · {design.w} × {design.h}
        </div>
      </div>
      <div className="flex flex-col p-1">
        {item(<ClipboardCopy size={16} />, 'Copy image', 'Paste straight into LinkedIn or an email', copy)}
        {item(
          <FileImage size={16} />,
          'PNG',
          'Best quality for social posts',
          () => png(1),
          false,
          <button type="button" className="chip shrink-0 hover:border-accent/50" disabled={!!job} title="Double resolution PNG" onClick={() => png(2)}>
            2×
          </button>,
        )}
        {item(<FileImage size={16} />, 'JPG', 'Smaller file, no transparency', jpg)}
        {item(<Film size={16} />, 'GIF', canGif ? `Animated · ${page?.duration ?? 4}s` : 'Add animation in the Animate panel first', gif, !canGif)}
        {item(<FileText size={16} />, 'PDF', many ? `All ${design.pages.length} pages` : 'Print-ready document', pdf)}
        {item(<FileArchive size={16} />, 'All pages as ZIP', many ? `${design.pages.length} PNG files` : 'One PNG per page', zip, !many)}
      </div>
      {job && (
        <div className="border-t border-line/70 px-3 py-2.5" role="status" aria-live="polite">
          <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-ink-2">
            <span>Making your {job.label}…</span>
            {job.progress !== null && <span className="tabular-nums">{Math.round(job.progress * 100)}%</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className={clsx('h-full rounded-full bg-accent transition-[width] duration-150', job.progress === null && 'animate-pulse')}
              style={{ width: `${Math.round((job.progress ?? 0.35) * 100)}%` }}
            />
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 border-t border-line/70 px-3 py-2.5 text-[12px] text-red-500" role="alert">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> <span className="min-w-0">{error}</span>
        </div>
      )}
    </div>
  )
}

// ── preview ─────────────────────────────────────────────────

export function PreviewModal() {
  const open = useUi((s) => s.previewOpen)
  const close = () => useUi.getState().setPreview(false)
  return (
    <Modal open={open} onClose={close} title="Preview" wide>
      {open && <PreviewPlayer />}
    </Modal>
  )
}

function PreviewPlayer() {
  const design = useEditor((s) => s.design)!
  const start = useEditor((s) => s.pageIndex)
  const [index, setIndex] = useState(start)
  const [run, setRun] = useState(0)
  const canvas = useRef<HTMLCanvasElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const page = design.pages[Math.min(index, design.pages.length - 1)]
  const dur = page.duration ?? 4
  const animated = designHasAnimation(page)
  // fit the viewport: leave room for the modal chrome
  const [box, setBox] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const on = () => setBox({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const k = Math.min((box.w - 72) / design.w, (box.h - 210) / design.h, 1)
  const w = Math.max(80, Math.round(design.w * k))
  const h = Math.max(80, Math.round(design.h * k))

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    const ctx = c.getContext('2d')!
    const scale = (w / design.w) * dpr
    let raf = 0
    let t0 = 0
    let alive = true
    const hold = 1.2
    const frame = (now: number) => {
      if (!alive) return
      if (!t0) t0 = now
      const t = ((now - t0) / 1000) % (dur + hold)
      drawPage(ctx, design, page, { scale, time: animated ? Math.min(t, dur) : undefined, resolveImage })
      if (bar.current) bar.current.style.width = `${Math.min(100, (t / dur) * 100)}%`
      raf = requestAnimationFrame(frame)
    }
    // start the clock once the photos are in, so the first loop isn't blank
    void Promise.all(pageImageSrcs(design, page, { resolveImage }).map(loadImage)).then(() => {
      if (alive) raf = requestAnimationFrame(frame)
    })
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [design, page, w, h, dur, animated, run])

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <div className="overflow-hidden rounded-lg shadow-lg" style={{ width: w, height: h, background: page.bg.color }}>
        <canvas ref={canvas} style={{ width: w, height: h, display: 'block' }} />
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-3" style={{ maxWidth: w }}>
        <div ref={bar} className="h-full bg-accent" style={{ width: 0 }} />
      </div>
      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        <button type="button" className="btn" onClick={() => setRun((n) => n + 1)}>
          <RotateCcw size={14} /> Replay
        </button>
        {design.pages.length > 1 &&
          design.pages.map((p, i) => (
            <button key={p.id} type="button" className={clsx('chip', i === index && 'chip-on')} onClick={() => setIndex(i)}>
              Page {i + 1}
            </button>
          ))}
        <span className="whitespace-nowrap text-[12px] text-ink-3">{animated ? `${dur}s · loops` : 'No animation on this page yet — try Animate → Auto-animate'}</span>
      </div>
    </div>
  )
}
