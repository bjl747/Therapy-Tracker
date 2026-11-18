// Small UI primitives for the editor chrome: portal layers (popover, modal)
// with a shared Esc stack, numeric scrub fields, sliders, colour picker.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { X } from 'lucide-react'
import { useEditor } from './store'
import { BRAND_COLORS, docColors, parseColor, toHex } from './colors'

// ── layer stack: Esc closes only the topmost layer ──────────

const layers: { id: number; close: () => void }[] = []
let layerSeq = 0
let escInstalled = false

function installEsc() {
  if (escInstalled || typeof window === 'undefined') return
  escInstalled = true
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !layers.length) return
      e.preventDefault()
      e.stopPropagation()
      layers[layers.length - 1].close()
    },
    true,
  )
}

export const anyLayerOpen = (): boolean => layers.length > 0

/** register an open layer; returns its id (0 while closed) for data-layer */
export function useLayer(open: boolean, onClose: () => void): number {
  const [id, setId] = useState(0)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useLayoutEffect(() => {
    if (!open) return
    installEsc()
    const mine = ++layerSeq
    layers.push({ id: mine, close: () => closeRef.current() })
    setId(mine)
    return () => {
      const i = layers.findIndex((l) => l.id === mine)
      if (i >= 0) layers.splice(i, 1)
      setId(0)
    }
  }, [open])
  return id
}

/** true when the event target is inside this layer or one opened above it */
function insideLayer(target: EventTarget | null, id: number): boolean {
  const host = target instanceof Element ? target.closest('[data-layer]') : null
  return !!host && Number((host as HTMLElement).dataset.layer) >= id
}

export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}

// ── popover ─────────────────────────────────────────────────

export type Anchor = HTMLElement | { x: number; y: number } | null

interface PopoverProps {
  open: boolean
  onClose: () => void
  anchor: Anchor
  placement?: 'bottom-start' | 'bottom-end' | 'right-start' | 'top-start'
  className?: string
  children: ReactNode
  /** min width = anchor width */
  matchWidth?: boolean
}

export function Popover({ open, onClose, anchor, placement = 'bottom-start', className, children, matchWidth }: PopoverProps) {
  const id = useLayer(open, onClose)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; minWidth?: number; maxHeight: number } | null>(null)

  const place = useCallback(() => {
    const el = ref.current
    if (!el || !anchor) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const r = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : new DOMRect(anchor.x, anchor.y, 0, 0)
    const w = el.offsetWidth
    const h = el.scrollHeight
    const gap = 6
    let left = placement === 'bottom-end' ? r.right - w : placement === 'right-start' ? r.right + gap : r.left
    let top = placement === 'right-start' ? r.top : placement === 'top-start' ? r.top - gap - h : r.bottom + gap
    if (placement === 'right-start' && left + w > vw - 8) left = r.left - gap - w
    if (placement !== 'right-start' && top + h > vh - 8 && r.top - gap - h >= 8) top = r.top - gap - h
    left = Math.max(8, Math.min(vw - w - 8, left))
    top = Math.max(8, Math.min(vh - Math.min(h, vh - 16) - 8, top))
    setPos({ left, top, minWidth: matchWidth ? r.width : undefined, maxHeight: vh - 16 })
  }, [anchor, placement, matchWidth])

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    place()
    const ro = new ResizeObserver(place)
    if (ref.current) ro.observe(ref.current)
    window.addEventListener('resize', place)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  useEffect(() => {
    if (!open || !id) return
    const down = (e: PointerEvent) => {
      if (insideLayer(e.target, id)) return
      if (anchor instanceof HTMLElement && e.target instanceof Node && anchor.contains(e.target)) return
      onClose()
    }
    document.addEventListener('pointerdown', down, true)
    return () => document.removeEventListener('pointerdown', down, true)
  }, [open, id, onClose, anchor])

  if (!open) return null
  return (
    <Portal>
      <div
        ref={ref}
        data-layer={id}
        role="dialog"
        className={clsx('card fixed z-[1000] overflow-auto overscroll-contain shadow-xl', className)}
        style={{
          left: pos?.left ?? 0,
          top: pos?.top ?? 0,
          minWidth: pos?.minWidth,
          maxHeight: pos?.maxHeight,
          maxWidth: 'calc(100vw - 16px)',
          visibility: pos ? 'visible' : 'hidden',
          background: 'rgb(var(--surface-1))',
        }}
      >
        {children}
      </div>
    </Portal>
  )
}

/** a button that owns a popover */
export function PopButton({
  label,
  className,
  title,
  placement,
  panelClass,
  disabled,
  children,
}: {
  label: ReactNode
  className?: string
  title?: string
  placement?: PopoverProps['placement']
  panelClass?: string
  disabled?: boolean
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [btn, setBtn] = useState<HTMLButtonElement | null>(null)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <button ref={setBtn} type="button" className={className} title={title} aria-label={title} aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      <Popover open={open} onClose={close} anchor={btn} placement={placement} className={panelClass}>
        {children(close)}
      </Popover>
    </>
  )
}

// ── modal ───────────────────────────────────────────────────

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const id = useLayer(open, onClose)
  if (!open) return null
  return (
    <Portal>
      <div
        data-layer={id}
        className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6"
        style={{ background: 'rgb(4 8 26 / .55)' }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div
          role="dialog"
          aria-label={title}
          className={clsx('card flex max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden', wide ? 'sm:w-auto sm:min-w-[420px]' : 'sm:w-[440px]')}
          style={{ background: 'rgb(var(--surface-1))' }}
        >
          <div className="flex items-center gap-2 border-b border-line/70 px-4 py-2.5">
            <div className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">{title}</div>
            <IconBtn title="Close" onClick={onClose}>
              <X size={16} />
            </IconBtn>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        </div>
      </div>
    </Portal>
  )
}

// ── buttons / layout bits ───────────────────────────────────

export function IconBtn({
  title,
  onClick,
  active,
  disabled,
  children,
  className,
}: {
  title: string
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  active?: boolean
  disabled?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-35',
        active ? 'bg-accent/15 text-accent' : 'text-ink-2 hover:bg-surface-3/70 hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Section({ title, right, children }: { title?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-line/60 px-3 py-3 last:border-b-0">
      {(title || right) && (
        <div className="mb-2 flex min-h-[20px] items-center gap-2">
          <div className="eyebrow min-w-0 flex-1 truncate">{title}</div>
          {right}
        </div>
      )}
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

/** label on the left, control on the right */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-[32px] items-center gap-2" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
      <span className="truncate whitespace-nowrap text-[12px] font-medium text-ink-2">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  )
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T | null
  options: { value: T; label: ReactNode; title: string }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={clsx('inline-flex min-w-0 rounded-[10px] border border-line bg-surface-2 p-0.5', className)} role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-label={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'inline-flex h-7 min-w-[30px] flex-1 items-center justify-center whitespace-nowrap rounded-lg px-2 text-[12px] font-semibold transition-colors',
            value === o.value ? 'bg-surface-1 text-accent shadow-sm' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={() => onChange(!checked)}
      className={clsx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3')}
    >
      <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

// ── numeric field with label scrubbing ──────────────────────

const round = (v: number, precision: number) => {
  const k = Math.pow(10, precision)
  return Math.round(v * k) / k
}

export function NumField({
  label,
  title,
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  precision = 0,
  suffix,
  disabled,
  className,
}: {
  /** short scrub label (X, W, °…) */
  label: ReactNode
  title: string
  /** null = mixed */
  value: number | null
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  precision?: number
  suffix?: string
  disabled?: boolean
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const scrub = useRef<{ x: number; v: number; moved: boolean } | null>(null)
  const clamp = (v: number) => round(Math.max(min, Math.min(max, v)), precision)
  const shown = draft ?? (value === null ? '' : String(round(value, precision)))

  const commit = () => {
    if (draft === null) return
    const v = parseFloat(draft.replace(',', '.'))
    setDraft(null)
    if (Number.isFinite(v) && v !== value) onChange(clamp(v))
  }

  return (
    <label
      className={clsx(
        'flex h-8 min-w-0 items-center overflow-hidden rounded-[10px] border border-line bg-surface-1 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15',
        disabled && 'opacity-50',
        className,
      )}
      title={title}
    >
      <span
        className="flex h-full shrink-0 cursor-ew-resize select-none items-center whitespace-nowrap pl-2 pr-1 text-[11px] font-semibold text-ink-3"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if (disabled || value === null) return
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          scrub.current = { x: e.clientX, v: value, moved: false }
        }}
        onPointerMove={(e) => {
          const s = scrub.current
          if (!s) return
          const dx = e.clientX - s.x
          if (!s.moved && Math.abs(dx) < 3) return
          if (!s.moved) {
            s.moved = true
            useEditor.getState().beginGesture()
          }
          onChange(clamp(s.v + Math.round(dx / 2) * step * (e.shiftKey ? 10 : 1)))
        }}
        onPointerUp={() => {
          if (scrub.current?.moved) useEditor.getState().endGesture()
          scrub.current = null
        }}
        onPointerCancel={() => {
          if (scrub.current?.moved) useEditor.getState().endGesture()
          scrub.current = null
        }}
      >
        {label}
      </span>
      <input
        className="h-full w-full min-w-0 bg-transparent px-1 text-[12.5px] tabular-nums text-ink outline-none"
        inputMode="decimal"
        aria-label={title}
        disabled={disabled}
        value={shown}
        placeholder={value === null ? '—' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
            e.currentTarget.select()
          } else if (e.key === 'Escape') {
            if (draft !== null) e.stopPropagation()
            setDraft(null)
            e.currentTarget.blur()
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const base = draft !== null && Number.isFinite(parseFloat(draft)) ? parseFloat(draft) : value ?? 0
            setDraft(null)
            onChange(clamp(base + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)))
          }
        }}
      />
      {suffix && <span className="shrink-0 select-none whitespace-nowrap pr-2 text-[11px] text-ink-3">{suffix}</span>}
    </label>
  )
}

/** range slider; a whole drag is one undo step */
export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  title,
  className,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  title: string
  className?: string
  disabled?: boolean
}) {
  const end = () => useEditor.getState().endGesture()
  return (
    <input
      type="range"
      aria-label={title}
      title={title}
      className={clsx('h-8 w-full min-w-0 cursor-pointer accent-[rgb(var(--accent))]', className)}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onPointerDown={() => useEditor.getState().beginGesture()}
      onPointerUp={end}
      onPointerCancel={end}
      onBlur={end}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

/** slider + number in one row */
export function SliderNum(p: { title: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; precision?: number; suffix?: string }) {
  return (
    <>
      <Slider title={p.title} value={p.value} onChange={p.onChange} min={p.min} max={p.max} step={p.step} />
      <NumField label="" title={p.title} value={p.value} onChange={p.onChange} min={p.min} max={p.max} step={p.step} precision={p.precision} suffix={p.suffix} className="w-[68px] shrink-0" />
    </>
  )
}

// ── colour ──────────────────────────────────────────────────

const CHECKER: CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg,#c8cce0 25%,transparent 25%),linear-gradient(-45deg,#c8cce0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#c8cce0 75%),linear-gradient(-45deg,transparent 75%,#c8cce0 75%)',
  backgroundSize: '8px 8px',
  backgroundPosition: '0 0,0 4px,4px -4px,-4px 0',
  backgroundColor: '#fff',
}

export function Swatch({ color, size = 22, selected, onClick, title }: { color: string | null; size?: number; selected?: boolean; onClick?: () => void; title?: string }) {
  const none = !color || parseColor(color)?.a === 0
  return (
    <button
      type="button"
      title={title ?? (none ? 'None' : color ?? '')}
      aria-label={title ?? (none ? 'None' : color ?? '')}
      onClick={onClick}
      className={clsx('relative shrink-0 overflow-hidden rounded-md border', selected ? 'border-accent ring-2 ring-accent/40' : 'border-line')}
      style={{ width: size, height: size, ...(none ? CHECKER : { background: color! }) }}
    >
      {none && <span className="absolute left-1/2 top-1/2 h-[140%] w-[2px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-red-500" />}
    </button>
  )
}

function ColorPanel({ value, onChange, allowNone }: { value: string | null; onChange: (c: string | null) => void; allowNone?: boolean }) {
  const design = useEditor((s) => s.design)
  const doc = useMemo(() => (design ? docColors(design) : []), [design])
  const hex = toHex(value, '#FFFFFF')
  const [draft, setDraft] = useState<string | null>(null)
  const live = useRef(false)
  const endLive = () => {
    if (live.current) useEditor.getState().endGesture()
    live.current = false
  }
  useEffect(() => endLive, [])
  const same = (c: string) => !!value && toHex(c) === hex && parseColor(value)?.a !== 0
  return (
    <div className="flex w-[232px] flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Pick a colour"
          className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-0.5"
          value={hex}
          onChange={(e) => {
            if (!live.current) {
              live.current = true
              useEditor.getState().beginGesture()
            }
            onChange(e.target.value.toUpperCase())
          }}
          onBlur={endLive}
        />
        <input
          className="input tabular-nums"
          aria-label="Hex colour"
          spellCheck={false}
          value={draft ?? (value && parseColor(value)?.a !== 0 ? hex : '')}
          placeholder="None"
          onChange={(e) => {
            const v = e.target.value
            setDraft(v)
            const h = v.startsWith('#') ? v : `#${v}`
            if (/^#[0-9a-f]{6}$/i.test(h)) onChange(h.toUpperCase())
          }}
          onBlur={() => setDraft(null)}
        />
      </div>
      {doc.length > 0 && (
        <div>
          <div className="eyebrow mb-1.5">In this design</div>
          <div className="flex flex-wrap gap-1.5">
            {doc.map((c) => (
              <Swatch key={c} color={c} selected={same(c)} onClick={() => onChange(c)} />
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="eyebrow mb-1.5">Brand</div>
        <div className="flex flex-wrap gap-1.5">
          {BRAND_COLORS.map((c) => (
            <Swatch key={c} color={c} selected={same(c)} onClick={() => onChange(c)} />
          ))}
          <Swatch color="#000000" selected={same('#000000')} onClick={() => onChange('#000000')} />
          {allowNone && <Swatch color={null} selected={!value || parseColor(value)?.a === 0} onClick={() => onChange(null)} />}
        </div>
      </div>
    </div>
  )
}

/** swatch button that opens the colour panel */
export function ColorField({
  value,
  onChange,
  allowNone,
  title,
  compact,
}: {
  value: string | null
  onChange: (c: string | null) => void
  allowNone?: boolean
  title: string
  compact?: boolean
}) {
  const none = !value || parseColor(value)?.a === 0
  return (
    <PopButton
      title={title}
      placement="bottom-end"
      className={clsx(
        'flex h-8 min-w-0 items-center gap-2 rounded-[10px] border border-line bg-surface-1 px-1.5 text-left hover:border-accent/50',
        compact ? 'w-auto shrink-0' : 'w-full',
      )}
      label={
        <>
          <span className="pointer-events-none flex">
            <SwatchDot color={none ? null : value} />
          </span>
          {!compact && <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[12.5px] tabular-nums text-ink">{none ? 'None' : toHex(value)}</span>}
        </>
      }
    >
      {() => <ColorPanel value={value} onChange={onChange} allowNone={allowNone} />}
    </PopButton>
  )
}

function SwatchDot({ color }: { color: string | null }) {
  return (
    <span className="relative block h-5 w-5 shrink-0 overflow-hidden rounded-md border border-line" style={color ? { background: color } : CHECKER}>
      {!color && <span className="absolute left-1/2 top-1/2 h-[140%] w-[2px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-red-500" />}
    </span>
  )
}

// ── menus ───────────────────────────────────────────────────

export interface MenuItem {
  label: string
  icon?: ReactNode
  hint?: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  /** draws a divider before this item */
  sep?: boolean
}

export function MenuList({ items, close }: { items: MenuItem[]; close: () => void }) {
  return (
    <div className="flex min-w-[200px] flex-col p-1" role="menu">
      {items.map((it, i) => (
        <div key={i}>
          {it.sep && <div className="my-1 h-px bg-line/70" />}
          <button
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              close()
              it.onClick?.()
            }}
            className={clsx(
              'flex h-8 w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 text-left text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40',
              it.danger ? 'text-red-500 hover:bg-red-500/10' : 'text-ink hover:bg-surface-2',
            )}
          >
            <span className="flex w-4 shrink-0 justify-center text-ink-3">{it.icon}</span>
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            {it.hint && <span className="shrink-0 pl-4 text-[11px] tabular-nums text-ink-3">{it.hint}</span>}
          </button>
        </div>
      ))}
    </div>
  )
}

/** block placeholder while something loads (no spinners) */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={clsx('animate-pulse rounded-lg bg-surface-3/70', className)} style={style} />
}

export const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)
export const MOD = isMac ? '⌘' : 'Ctrl+'
