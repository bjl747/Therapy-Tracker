import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import clsx from 'clsx'
import { pushLayer } from './layers'

interface Props {
  title: string
  eyebrow?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Extra wide (page editor). */
  wide?: boolean
}

export function Modal({ title, eyebrow, onClose, children, footer, wide }: Props) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => pushLayer(() => closeRef.current()), [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-2 sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'flex max-h-[92vh] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface-1 text-ink shadow-2xl',
          wide ? 'max-w-[min(1600px,100%)]' : 'max-w-xl',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2 className="truncate text-[15px] font-bold">{title}</h2>
          </div>
          <button type="button" className="btn !px-2" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
