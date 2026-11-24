import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { Briefcase, Check, Plus, Search, X } from 'lucide-react'
import { hotJobSource, hotJobToFields, type HotJob, type JobSource } from './connectors'
import { newestFirst } from './many'

/** "today", "yesterday", "3 days ago" from the post's date */
function postedAgo(iso: string | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (isNaN(t)) return ''
  const day = (d: Date) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60e3) / 86400e3)
  const n = day(new Date()) - day(new Date(t))
  return n <= 0 ? 'posted today' : n === 1 ? 'posted yesterday' : `posted ${n} days ago`
}

/** Pick a Hot Job to fill the form. Listed newest to oldest, the same order as the Hot Jobs tab (BJ, 2026-11-19).
 *  With `multi` (Many jobs) the jobs are ticked instead, up to `multi` of them, and added together. */
export function HotJobPicker({
  source = hotJobSource(),
  onPick,
  onPickMany,
  multi,
  onClose,
}: {
  source?: JobSource
  onPick?: (fields: Record<string, string>) => void
  /** Many jobs: tick up to `multi` jobs, each lands in its own job */
  onPickMany?: (fields: Record<string, string>[]) => void
  multi?: number
  onClose: () => void
}) {
  const [jobs, setJobs] = useState<HotJob[] | null>(null)
  const [q, setQ] = useState('')
  const [ticked, setTicked] = useState<string[]>([])
  const many = !!onPickMany && (multi ?? 0) > 0
  const max = multi ?? 0
  useEffect(() => {
    void source.list().then((js) => setJobs(newestFirst(js)))
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [source, onClose])
  const s = q.trim().toLowerCase()
  const shown = (jobs ?? []).filter((j) => !s || `${j.title} ${j.city} ${j.state}`.toLowerCase().includes(s))
  const toggle = (id: string) =>
    setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length < max ? [...t, id] : t))
  const addTicked = () => {
    const byId = new Map((jobs ?? []).map((j) => [j.id, j]))
    // in the order they were ticked
    onPickMany?.(ticked.map((id) => byId.get(id)).filter((j): j is HotJob => !!j).map(hotJobToFields))
  }
  return createPortal(
    // studio-root: Studio's button / input sizing and status colours reach this pop-up on <body> too
    <div className="studio-root contents">
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-6" onMouseDown={onClose}>
        <div className="card bg-surface-1 w-full sm:w-[620px] max-h-[92vh] flex flex-col" role="dialog" aria-label="Pick a Hot Job" onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 p-4 border-b border-line">
            <Briefcase size={16} className="text-accent shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="eyebrow">{source.label} · newest first</div>
              <div className="text-[15px] font-extrabold">{many ? `Pick up to ${max} Hot Job${max === 1 ? '' : 's'}` : 'Start from a Hot Job'}</div>
            </div>
            <button className="btn" onClick={onClose} aria-label="Close">
              <X size={15} />
            </button>
          </div>
          <div className="p-4 pb-2 relative">
            <Search size={14} className="absolute left-7 top-[calc(50%-4px)] -translate-y-1/2 text-ink-3" />
            <input className="input pl-8" autoFocus placeholder="Search title or city…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="overflow-y-auto px-2 pb-3 min-h-0">
            {jobs === null
              ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 m-2 rounded-xl bg-surface-2 animate-pulse" />)
              : shown.map((j) => {
                  const f = hotJobToFields(j)
                  const on = ticked.includes(j.id)
                  const full = many && !on && ticked.length >= max
                  const ago = postedAgo(j.posted)
                  return (
                    <button
                      key={j.id}
                      className={clsx(
                        'w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl min-w-0',
                        on ? 'bg-accent/[0.08]' : 'hover:bg-surface-2',
                        full && 'opacity-50 cursor-not-allowed',
                      )}
                      onClick={() => (many ? toggle(j.id) : onPick?.(f))}
                      aria-pressed={many ? on : undefined}
                      title={full ? `${max} picked: untick one to swap` : undefined}
                    >
                      {many && (
                        <span
                          className={clsx(
                            'shrink-0 w-5 h-5 rounded-md border flex items-center justify-center',
                            on ? 'bg-accent border-accent text-white' : 'border-line-2 bg-surface-1',
                          )}
                        >
                          {on && <Check size={13} strokeWidth={3} />}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-bold truncate">{f.job_title}</div>
                        <div className="text-[12px] text-ink-3 truncate">
                          {[`${j.city}, ${j.state}`, j.shift, ago].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      {j.weeklyLow && <div className="text-[12.5px] font-bold tabular-nums whitespace-nowrap">{f.weekly_pay}</div>}
                    </button>
                  )
                })}
            {jobs && !shown.length && <div className="text-center text-sm text-ink-3 py-8">No jobs match.</div>}
          </div>
          {many && (
            <div className="flex flex-wrap items-center gap-2 p-3 border-t border-line">
              <span className="text-[12px] text-ink-3 flex-1 min-w-[10rem]">
                {ticked.length ? `${ticked.length} of ${max} picked` : `Tick up to ${max}: each one becomes its own job.`}
              </span>
              <button className="btn btn-primary" disabled={!ticked.length} onClick={addTicked}>
                <Plus size={15} /> Add {ticked.length || ''} job{ticked.length === 1 ? '' : 's'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
