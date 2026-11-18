// Animated GIF export: steps `time` through the page's entrance animations /
// Ken Burns with the shared renderer, then encodes.

import { drawPage, playLength, preloadPageImages, type ExportReport, type RenderOptions } from '../engine/render'
import type { Design, Page } from '../engine/model'
import { encodeGifAsync, type GifFrame } from './gif'

export interface GifExportOptions {
  scale: number
  /** default 15 */
  fps?: number
  /** seconds of animation; default page.duration ?? 4. Always stretched so
   *  every entrance animation finishes (see playLength). */
  duration?: number
  /** seconds the final frame is held; default 1.5 */
  hold?: number
  resolveImage?: RenderOptions['resolveImage']
  maxColors?: number
  dither?: boolean
  /** 0 = forever (default) */
  loop?: number
  /** collects photos that couldn't load (drawn as placeholders) */
  report?: ExportReport
}

export type GifProgress = (p: number, stage: 'render' | 'encode') => void

export function designHasAnimation(page: Page): boolean {
  return page.elements.some((el) => (el.anim && el.anim.kind !== 'none') || (el.type === 'image' && !!el.kenBurns))
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

export async function exportGif(
  design: Design,
  pageIndex: number,
  opts: GifExportOptions,
  onProgress?: GifProgress,
): Promise<Blob> {
  const page = design.pages[pageIndex]
  if (!page) throw new Error('No such page')
  const fps = Math.max(1, Math.min(50, opts.fps ?? 15))
  const duration = playLength(page, design.fields, Math.max(0, opts.duration ?? page.duration ?? 4))
  const hold = Math.max(0, opts.hold ?? 1.5)
  const w = Math.max(1, Math.round(design.w * opts.scale))
  const h = Math.max(1, Math.round(design.h * opts.scale))

  await preloadPageImages(design, page, opts, opts.report)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const grab = (time: number | undefined): Uint8ClampedArray => {
    drawPage(ctx, design, page, { scale: opts.scale, time, resolveImage: opts.resolveImage })
    return ctx.getImageData(0, 0, w, h).data
  }

  const frames: GifFrame[] = []
  if (!designHasAnimation(page)) {
    // static page: a single frame (still shows the right length in viewers)
    frames.push({ data: grab(undefined), delayMs: Math.max(1000, (duration + hold) * 1000) })
    onProgress?.(1, 'render')
  } else {
    const n = Math.max(1, Math.round(duration * fps))
    // cumulative rounding so frame delays add up to the true duration
    for (let i = 0; i < n; i++) {
      const start = Math.round((i * 1000) / fps)
      const end = Math.round(((i + 1) * 1000) / fps)
      frames.push({ data: grab(i / fps), delayMs: end - start })
      onProgress?.((i + 1) / (n + 1), 'render')
      if (i % 2 === 1) await tick()
    }
    // final frame = the finished (static) design, held — never a mid-animation
    // state, even if an element's delay + duration runs past the page length
    frames.push({ data: grab(undefined), delayMs: Math.max(20, hold * 1000) })
    onProgress?.(1, 'render')
  }

  await tick()
  const bytes = await encodeGifAsync(
    frames,
    w,
    h,
    { loop: opts.loop ?? 0, maxColors: opts.maxColors ?? 256, dither: opts.dither ?? false },
    (p) => onProgress?.(p, 'encode'),
  )
  return new Blob([bytes as BlobPart], { type: 'image/gif' })
}
