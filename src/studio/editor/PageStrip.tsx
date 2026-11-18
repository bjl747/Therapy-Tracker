// Bottom page strip: live thumbnails (same renderer, small scale), add /
// duplicate / delete, drag to reorder.

import { memo, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Copy, Plus, Trash2 } from 'lucide-react'
import type { Design, Page } from '../engine/model'
import { drawPage } from '../engine/render'
import { resolveImage } from '../services'
import { useEditor } from './store'
import { useUi } from './uiStore'
import { useAssetTick } from './hooks'
import { IconBtn } from './ui'

/** redraws only when its page (or the fields / assets it depends on) changes, never mid-gesture */
const PageThumb = memo(function PageThumb({ design, page, h, tick }: { design: Design; page: Page; h: number; tick: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const gesturing = useUi((s) => s.gesturing)
  const w = Math.max(8, Math.round((h * design.w) / design.h))
  const fields = design.fields
  useEffect(() => {
    if (gesturing) return
    const t = window.setTimeout(() => {
      const c = ref.current
      if (!c) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
      drawPage(c.getContext('2d')!, design, page, { scale: (h / design.h) * dpr, resolveImage })
    }, 80)
    return () => window.clearTimeout(t)
    // `design` identity changes on every edit; only its size + fields matter here
  }, [page, fields, design.w, design.h, w, h, tick, gesturing]) // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="block rounded-[5px]" style={{ width: w, height: h, background: page.bg.color }} />
})

export function PageStrip({ compact }: { compact: boolean }) {
  const design = useEditor((s) => s.design)!
  const pageIndex = useEditor((s) => s.pageIndex)
  const readOnly = useEditor((s) => s.readOnly)
  const tick = useAssetTick()
  const row = useRef<HTMLDivElement>(null)
  const drag = useRef<{ from: number; x: number; moved: boolean } | null>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const h = compact ? 40 : 56
  const st = () => useEditor.getState()

  const slotAt = (clientX: number): number => {
    const kids = [...(row.current?.querySelectorAll<HTMLElement>('[data-page]') ?? [])]
    for (let i = 0; i < kids.length; i++) {
      const r = kids[i].getBoundingClientRect()
      if (clientX < r.left + r.width / 2) return i
    }
    return kids.length
  }
  const slotX = (s: number): number => {
    const kids = [...(row.current?.querySelectorAll<HTMLElement>('[data-page]') ?? [])]
    if (!kids.length || !row.current) return 0
    const base = row.current.getBoundingClientRect().left - row.current.scrollLeft
    if (s >= kids.length) return kids[kids.length - 1].getBoundingClientRect().right - base + 3
    return kids[s].getBoundingClientRect().left - base - 5
  }

  return (
    <div className="card flex min-w-0 shrink-0 items-center gap-1 px-2" style={{ height: h + 22 }}>
      <div ref={row} className="relative flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden py-1" style={{ scrollbarWidth: 'none' }}>
        {design.pages.map((p, i) => (
          <button
            key={p.id}
            type="button"
            data-page={i}
            aria-label={`Page ${i + 1}`}
            aria-current={i === pageIndex}
            title={`Page ${i + 1}`}
            className={clsx('relative shrink-0 rounded-[7px] border-2 p-px transition-colors', i === pageIndex ? 'border-accent' : 'border-transparent hover:border-line')}
            style={{ touchAction: 'pan-x' }}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              drag.current = { from: i, x: e.clientX, moved: false }
              if (e.pointerType !== 'touch') e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              const d = drag.current
              if (!d || readOnly || e.pointerType === 'touch') return
              if (!d.moved && Math.abs(e.clientX - d.x) < 6) return
              d.moved = true
              setSlot(slotAt(e.clientX))
            }}
            onPointerUp={(e) => {
              const d = drag.current
              drag.current = null
              setSlot(null)
              if (!d) return
              if (!d.moved) return st().setPage(i)
              const s = slotAt(e.clientX)
              const to = s > d.from ? s - 1 : s
              if (to !== d.from) st().movePage(d.from, to)
            }}
            onPointerCancel={() => {
              drag.current = null
              setSlot(null)
            }}
          >
            <PageThumb design={design} page={p} h={h} tick={tick} />
            <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 text-[9.5px] font-bold leading-[14px] text-white">{i + 1}</span>
          </button>
        ))}
        {slot !== null && <div className="pointer-events-none absolute top-1 w-0.5 rounded bg-accent" style={{ left: slotX(slot), height: h + 6 }} />}
      </div>
      {!readOnly && (
        <div className="flex shrink-0 items-center">
          <IconBtn title="Add page" onClick={() => st().addPage()}>
            <Plus size={16} />
          </IconBtn>
          <IconBtn title="Duplicate page" onClick={() => st().duplicatePage()}>
            <Copy size={15} />
          </IconBtn>
          <IconBtn title="Delete page" disabled={design.pages.length <= 1} onClick={() => st().deletePage()}>
            <Trash2 size={15} />
          </IconBtn>
        </div>
      )}
    </div>
  )
}
