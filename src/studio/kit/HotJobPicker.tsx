import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Briefcase, Search, X } from 'lucide-react'
import { demoHotJobs, hotJobToFields, type HotJob, type JobSource } from './connectors'

export function HotJobPicker({
  source = demoHotJobs,
  onPick,
  onClose,
}: {
  source?: JobSource
  onPick: (fields: Record<string, string>) => void
  onClose: () => void
}) {
  const [jobs, setJobs] = useState<HotJob[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    void source.list().then(setJobs)
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [source, onClose])
  const s = q.trim().toLowerCase()
  const shown = (jobs ?? []).filter((j) => !s || `${j.title} ${j.city} ${j.state}`.toLowerCase().includes(s))
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-6" onMouseDown={onClose}>
      <div className="card bg-surface-1 w-full sm:w-[620px] max-h-[92vh] flex flex-col" role="dialog" aria-label="Pick a Hot Job" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-4 border-b border-line">
          <Briefcase size={16} className="text-accent" />
          <div className="min-w-0 flex-1">
            <div className="eyebrow">{source.label}</div>
            <div className="text-[15px] font-extrabold">Start from a Hot Job</div>
          </div>
          <button className="btn" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="p-4 pb-2 relative">
          <Search size={14} className="absolute left-7 top-[calc(50%-4px)] -translate-y-1/2 text-ink-3" />
          <input className="input pl-8" autoFocus placeholder="Search title or city…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="overflow-y-auto px-2 pb-3">
          {jobs === null
            ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 m-2 rounded-xl bg-surface-2 animate-pulse" />)
            : shown.map((j) => (
                <button
                  key={j.id}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 min-w-0"
                  onClick={() => onPick(hotJobToFields(j))}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold truncate">{hotJobToFields(j).job_title}</div>
                    <div className="text-[12px] text-ink-3 truncate">
                      {j.city}, {j.state} {j.shift ? `· ${j.shift}` : ''}
                    </div>
                  </div>
                  {j.weeklyLow && (
                    <div className="text-[12.5px] font-bold tabular-nums whitespace-nowrap">{hotJobToFields(j).weekly_pay}</div>
                  )}
                </button>
              ))}
          {jobs && !shown.length && <div className="text-center text-sm text-ink-3 py-8">No jobs match.</div>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
