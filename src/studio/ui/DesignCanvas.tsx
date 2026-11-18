// A static, always-correct preview of one design page (thumbnails, kit
// previews). Re-draws when fonts / images / city photos arrive.

import { useEffect, useReducer, useRef } from 'react'
import type { Design } from '../engine/model'
import { drawPage } from '../engine/render'
import { onAssetsChanged, prepareDesign, resolveImage } from '../services'

export function useAssetTick(): number {
  const [tick, bump] = useReducer((x: number) => x + 1, 0)
  useEffect(() => onAssetsChanged(bump), [])
  return tick
}

export function DesignCanvas({
  design,
  pageIndex = 0,
  width,
  className,
  time,
  label,
}: {
  design: Design
  pageIndex?: number
  /** CSS width in px; height follows the design's aspect ratio */
  width: number
  className?: string
  time?: number
  label?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const tick = useAssetTick()
  useEffect(() => {
    void prepareDesign(design)
  }, [design])
  useEffect(() => {
    const c = ref.current
    const page = design.pages[pageIndex]
    if (!c || !page) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const scale = (width / design.w) * dpr
    c.width = Math.max(1, Math.round(design.w * scale))
    c.height = Math.max(1, Math.round(design.h * scale))
    const raf = requestAnimationFrame(() =>
      drawPage(c.getContext('2d')!, design, page, { scale, time, resolveImage }),
    )
    return () => cancelAnimationFrame(raf)
  }, [design, pageIndex, width, tick, time])
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label ?? design.name}
      className={className}
      style={{ width, height: (width * design.h) / design.w, display: 'block' }}
    />
  )
}
