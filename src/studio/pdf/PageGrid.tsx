import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EyeOff, FileWarning, GripVertical, Pencil, PencilLine, Check } from 'lucide-react'
import clsx from 'clsx'
import { type PageItem, type PageLayout, LETTER, displaySize, hasRedaction } from './lib'
import { getThumb, peekThumb, thumbKey } from './raster'
import { type SourceMeta, usePdfStudio } from './store'

function useInView<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { rootMargin: '500px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return [ref as React.RefObject<T>, seen]
}

interface CardProps {
  page: PageItem
  number: number
  source: SourceMeta | undefined
  selected: boolean
  dragging: boolean
  drop: 'before' | 'after' | null
  layout: PageLayout
  onPointerDown: (e: React.PointerEvent, id: string) => void
  onClickCard: (e: React.MouseEvent | React.KeyboardEvent, id: string) => void
  onToggle: (id: string) => void
  onOpen: (id: string) => void
}

const Card = memo(function Card({ page, number, source, selected, dragging, drop, layout, onPointerDown, onClickCard, onToggle, onOpen }: CardProps) {
  const [ref, seen] = useInView<HTMLDivElement>()
  const key = thumbKey(page)
  const [thumb, setThumb] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!seen || !key) return
    let alive = true
    setFailed(false)
    const cached = peekThumb(page)
    ;(cached ?? getThumb(page)).then(
      (u) => alive && setThumb(u),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, key])

  const d = displaySize(page.w, page.h, page.rotation)
  const redacted = hasRedaction(page)
  const label = page.src.kind === 'blank' ? 'Blank page' : (source?.name ?? 'File')

  return (
    <div
      ref={ref}
      data-page-id={page.id}
      role="option"
      aria-selected={selected}
      tabIndex={0}
      className={clsx(
        'group relative min-w-0 select-none rounded-xl border bg-surface-1 p-2 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent',
        selected ? 'border-accent ring-2 ring-accent' : 'border-line hover:border-ink-3/50',
        dragging && 'opacity-40',
      )}
      onPointerDown={(e) => onPointerDown(e, page.id)}
      onClick={(e) => onClickCard(e, page.id)}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        onOpen(page.id)
      }}
      onKeyDown={(e) => {
        // keys on the checkbox / edit button belong to those buttons
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter') {
          e.preventDefault()
          onOpen(page.id)
        } else if (e.key === ' ') {
          e.preventDefault()
          onClickCard(e, page.id)
        }
      }}
    >
      {drop && (
        <div
          aria-hidden
          className={clsx('pointer-events-none absolute -top-1 -bottom-1 z-10 w-1 rounded bg-accent', drop === 'before' ? '-left-[8px]' : '-right-[8px]')}
        />
      )}
      <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg bg-surface-2">
        {layout === 'letter' ? (
          // the packet's sheet: a white portrait Letter page with the content fitted on it, as it will be exported
          <div
            className="flex h-[92%] items-center justify-center overflow-hidden bg-white shadow ring-1 ring-black/10"
            style={{ aspectRatio: `${LETTER.w}/${LETTER.h}` }}
            title="Letter portrait page"
          >
            {page.src.kind === 'blank' && !(key && thumb) ? null : thumb ? (
              <img src={thumb} alt={`Page ${number} preview`} draggable={false} className="max-h-full max-w-full object-contain" />
            ) : failed || (source && !source.renderable) ? (
              <div className="flex flex-col items-center gap-1 px-2 text-center text-[11px] text-neutral-500">
                <FileWarning size={20} />
                No preview
              </div>
            ) : (
              <div className="h-full w-full animate-pulse bg-neutral-200/70" aria-hidden />
            )}
          </div>
        ) : page.src.kind === 'blank' && !(key && thumb) ? (
          <div className="max-h-[92%] max-w-[92%] bg-white shadow ring-1 ring-black/10" style={{ aspectRatio: `${d.w}/${d.h}`, height: d.h >= d.w ? '92%' : undefined, width: d.w > d.h ? '92%' : undefined }} />
        ) : thumb ? (
          <img src={thumb} alt={`Page ${number} preview`} draggable={false} className="max-h-full max-w-full bg-white object-contain shadow ring-1 ring-black/10" />
        ) : failed || (source && !source.renderable) ? (
          <div className="flex flex-col items-center gap-1 px-2 text-center text-[11px] text-ink-3">
            <FileWarning size={20} />
            No preview
          </div>
        ) : (
          <div className="h-full w-full animate-pulse bg-surface-3/70" aria-hidden />
        )}

        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select page ${number}`}
          className={clsx(
            'absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md border transition-opacity',
            selected ? 'border-accent bg-accent text-white opacity-100' : 'border-line bg-surface-1/90 text-transparent opacity-80 group-hover:opacity-100',
          )}
          onClick={(e) => {
            e.stopPropagation()
            onToggle(page.id)
          }}
        >
          <Check size={14} />
        </button>
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
          <button
            type="button"
            aria-label={`Edit page ${number}`}
            title="Edit page"
            className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-surface-1/90 text-ink-2 hover:text-ink"
            onClick={(e) => {
              e.stopPropagation()
              onOpen(page.id)
            }}
          >
            <Pencil size={13} />
          </button>
          <span
            data-grip
            aria-label="Drag to reorder"
            title="Drag to reorder"
            className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md border border-line bg-surface-1/90 text-ink-3"
            style={{ touchAction: 'none' }}
          >
            <GripVertical size={14} />
          </span>
        </div>
        <div className="absolute bottom-1.5 left-1.5 flex flex-wrap gap-1">
          {redacted && (
            <span className="chip !h-5 !px-1.5 !text-[10px]" title="Will be exported as an image">
              <EyeOff size={10} /> Redacted
            </span>
          )}
          {page.annotations.length > 0 && (
            <span className="chip chip-on !h-5 !px-1.5 !text-[10px] tabular-nums" title="Annotations">
              <PencilLine size={10} /> {page.annotations.length}
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
        <span className="text-xs font-bold tabular-nums text-ink">{number}</span>
        <span className="chip min-w-0 max-w-[75%] !h-5 !px-2 !text-[10.5px]" title={label}>
          <span className="truncate">{label}</span>
        </span>
      </div>
    </div>
  )
})

interface Props {
  onOpen: (id: string) => void
}

export function PageGrid({ onOpen }: Props) {
  const pages = usePdfStudio((s) => s.pages)
  const sources = usePdfStudio((s) => s.sources)
  const sel = usePdfStudio((s) => s.sel)
  const loading = usePdfStudio((s) => s.loading)
  const click = usePdfStudio((s) => s.click)
  const reorder = usePdfStudio((s) => s.reorder)
  const setSel = usePdfStudio((s) => s.setSel)
  const layout = usePdfStudio((s) => s.layout)

  const gridRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ ids: string[]; x: number; y: number; target: number | null } | null>(null)
  const suppressClick = useRef(false)
  const live = useRef({ pages, sel })
  live.current = { pages, sel }

  const targetAt = useCallback((cx: number, cy: number): number | null => {
    const root = gridRef.current
    if (!root) return null
    // released away from the pages (side panel, header): no move
    const box = root.getBoundingClientRect()
    const M = 48
    if (cx < box.left - M || cx > box.right + M || cy < box.top - M || cy > box.bottom + M) return null
    const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-page-id]'))
    if (!cards.length) return null
    let best = -1
    let bestD = Infinity
    let before = true
    cards.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      const mx = r.left + r.width / 2
      const my = r.top + r.height / 2
      const inside = cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom
      const dist = inside ? -1 : Math.hypot(cx - mx, (cy - my) * 1.5)
      if (dist < bestD) {
        bestD = dist
        best = i
        before = cx < mx
      }
    })
    return before ? best : best + 1
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      if (e.button !== 0) return
      const t = e.target as HTMLElement
      if (t.closest('button,input')) return
      if (e.pointerType !== 'mouse' && !t.closest('[data-grip]')) return
      const startX = e.clientX
      const startY = e.clientY
      let active = false
      let ids: string[] = []
      let raf = 0
      let lastY = startY
      const scroller = (() => {
        let el: HTMLElement | null = gridRef.current
        while (el) {
          const o = getComputedStyle(el).overflowY
          if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight) return el
          el = el.parentElement
        }
        return null
      })()

      const tick = () => {
        if (!active) return
        if (scroller) {
          const r = scroller.getBoundingClientRect()
          if (lastY < r.top + 50) scroller.scrollTop -= 14
          else if (lastY > r.bottom - 50) scroller.scrollTop += 14
        }
        raf = requestAnimationFrame(tick)
      }

      const stop = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        window.removeEventListener('keydown', key, true)
        cancelAnimationFrame(raf)
        document.body.style.userSelect = ''
      }
      // Esc cancels a drag (and doesn't also clear the selection)
      const key = (ev: KeyboardEvent) => {
        if (ev.key !== 'Escape' || !active) return
        ev.preventDefault()
        ev.stopImmediatePropagation()
        stop()
        suppressClick.current = true
        setTimeout(() => (suppressClick.current = false), 0)
        setDrag(null)
      }

      const move = (ev: PointerEvent) => {
        lastY = ev.clientY
        if (!active) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return
          active = true
          const cur = live.current.sel
          ids = cur.ids.includes(id) ? cur.ids : [id]
          if (!cur.ids.includes(id)) setSel({ ids: [id], anchor: id })
          document.body.style.userSelect = 'none'
          raf = requestAnimationFrame(tick)
        }
        setDrag({ ids, x: ev.clientX, y: ev.clientY, target: targetAt(ev.clientX, ev.clientY) })
      }
      const up = (ev: PointerEvent) => {
        stop()
        if (active) {
          suppressClick.current = true
          setTimeout(() => (suppressClick.current = false), 0)
          if (ev.type === 'pointerup') {
            const to = targetAt(ev.clientX, ev.clientY)
            if (to !== null) reorder(ids, to)
          }
        }
        setDrag(null)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
      window.addEventListener('keydown', key, true)
    },
    [reorder, setSel, targetAt],
  )

  const onClickCard = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent, id: string) => {
      if (suppressClick.current) return
      click(id, { shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey })
    },
    [click],
  )
  const onToggle = useCallback((id: string) => click(id, { toggle: true }), [click])

  const selSet = new Set(sel.ids)
  const dragSet = new Set(drag?.ids ?? [])
  const n = pages.length

  return (
    <>
      <div
        ref={gridRef}
        role="listbox"
        aria-multiselectable="true"
        aria-label="Pages"
        className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,148px),1fr))] gap-3 sm:gap-4 2xl:grid-cols-[repeat(auto-fill,minmax(176px,1fr))]"
      >
        {pages.map((p, i) => (
          <Card
            key={p.id}
            page={p}
            number={i + 1}
            source={p.src.kind === 'blank' ? undefined : sources[p.src.sourceId]}
            selected={selSet.has(p.id)}
            dragging={dragSet.has(p.id)}
            drop={drag && drag.target !== null ? (drag.target === i ? 'before' : drag.target === n && i === n - 1 ? 'after' : null) : null}
            layout={layout}
            onPointerDown={onPointerDown}
            onClickCard={onClickCard}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        ))}
        {Array.from({ length: loading }).map((_, i) => (
          <div key={`sk${i}`} className="rounded-xl border border-line bg-surface-1 p-2" aria-hidden>
            <div className="aspect-[3/4] animate-pulse rounded-lg bg-surface-3/70" />
            <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-surface-3/70" />
          </div>
        ))}
      </div>
      {drag &&
        createPortal(
          <div
            className={clsx(
              'pointer-events-none fixed z-[120] flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border bg-surface-1 px-3 text-xs font-bold shadow-lg',
              drag.target === null ? 'border-line text-ink-3' : 'border-accent text-accent',
            )}
            style={{ left: drag.x + 12, top: drag.y + 12 }}
          >
            <GripVertical size={14} />
            {drag.ids.length} {drag.ids.length === 1 ? 'page' : 'pages'}
            {drag.target === null && <span className="font-medium">· release to cancel</span>}
          </div>,
          document.body,
        )}
    </>
  )
}
