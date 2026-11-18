// Studio's toast (the hub has its own Toast context — at migration this can
// forward to it; the call shape toast(title, description?, kind?) stays).
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { CheckCircle2, AlertTriangle, X } from 'lucide-react'

interface Toast {
  id: number
  title: string
  description?: string
  kind: 'ok' | 'error'
  action?: { label: string; run: () => void }
}

const useToasts = create<{ list: Toast[]; push: (t: Omit<Toast, 'id'>) => void; drop: (id: number) => void }>((set) => ({
  list: [],
  push: (t) => {
    const id = Date.now() + Math.random()
    set((s) => ({ list: [...s.list.slice(-3), { ...t, id }] }))
    setTimeout(() => set((s) => ({ list: s.list.filter((x) => x.id !== id) })), t.kind === 'error' ? 7000 : 4000)
  },
  drop: (id) => set((s) => ({ list: s.list.filter((x) => x.id !== id) })),
}))

export type ToastFn = (title: string, description?: string, kind?: 'ok' | 'error', action?: Toast['action']) => void

export const toast: ToastFn = (title, description, kind = 'ok', action) =>
  useToasts.getState().push({ title, description, kind, action })

export function useToast(): ToastFn {
  return toast
}

export function Toaster() {
  const { list, drop } = useToasts()
  return createPortal(
    <div className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 items-stretch sm:items-end pointer-events-none">
      {list.map((t) => (
        <div key={t.id} role="status" className="card bg-surface-1 pointer-events-auto flex items-start gap-2.5 p-3 pr-2 sm:w-[340px] shadow-lg">
          {t.kind === 'error' ? (
            <AlertTriangle size={16} className="text-[rgb(var(--status-bad))] mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 size={16} className="text-[rgb(var(--status-good))] mt-0.5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold">{t.title}</div>
            {t.description && <div className="text-[12px] text-ink-2 mt-0.5 break-words">{t.description}</div>}
          </div>
          {t.action && (
            <button
              className="text-[12px] font-bold text-accent whitespace-nowrap px-1.5"
              onClick={() => {
                t.action!.run()
                drop(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="text-ink-3 hover:text-ink p-0.5" onClick={() => drop(t.id)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
