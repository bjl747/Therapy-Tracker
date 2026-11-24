import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import clsx from 'clsx'
import { pushLayer } from './layers'

interface Props {
  title: string
  eyebrow?: string
  onClose: () => void
  /** First say on Esc; return true when handled (the modal then stays open). */
  onEscape?: () => boolean
  children: ReactNode
  footer?: ReactNode
  /** Extra wide (page editor). */
  wide?: boolean
  /** From 1024px up the dialog takes 92vh and the body does not scroll: the child lays out (and scrolls) inside it. */
  fill?: boolean
}

export function Modal({ title, eyebrow, onClose, onEscape, children, footer, wide, fill }: Props) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const escRef = useRef(onEscape)
  escRef.current = onEscape

  useEffect(
    () =>
      pushLayer(
        () => closeRef.current(),
        () => escRef.current?.() ?? false,
      ),
    [],
  )

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Portaled to <body>, so wrap in `studio-root`: Studio's boxed .btn / .chip / .input / .eyebrow are scoped to it
  // (src/index.css); without it the hub's borderless .btn applied and chips / eyebrows had no style at all.
  return createPortal(
    <div className="studio-root">
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
            fill && 'lg:h-[92vh]',
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
          <div className={clsx('min-h-0 flex-1 overflow-y-auto', fill && 'lg:overflow-hidden')}>{children}</div>
          {footer && <div className="border-t border-line px-4 py-3">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
