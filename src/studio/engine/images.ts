// Image cache + pixel filters. Filters are applied with our own pixel code
// (not ctx.filter) so exports look identical in every browser, Safari
// included. Processed results are cached per (src, filters).

import type { ImageFilters } from './model'

type Src = HTMLImageElement | HTMLCanvasElement | ImageBitmap

const loaded = new Map<string, Src>()
const pending = new Map<string, Promise<Src | null>>()
const failed = new Set<string>()
const listeners = new Set<() => void>()

/** called whenever a new image finishes loading (editor re-renders) */
export function onImageLoaded(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getImage(src: string): Src | null {
  return loaded.get(src) ?? null
}

export function loadImage(src: string): Promise<Src | null> {
  if (!src) return Promise.resolve(null)
  const hit = loaded.get(src)
  if (hit) return Promise.resolve(hit)
  if (failed.has(src)) return Promise.resolve(null)
  let p = pending.get(src)
  if (!p) {
    p = new Promise<Src | null>((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.decoding = 'async'
      img.onload = () => {
        loaded.set(src, img)
        pending.delete(src)
        listeners.forEach((l) => l())
        resolve(img)
      }
      img.onerror = () => {
        failed.add(src)
        pending.delete(src)
        resolve(null)
      }
      img.src = src
    })
    pending.set(src, p)
  }
  return p
}

export function sizeOf(img: Src): { w: number; h: number } {
  if (img instanceof HTMLImageElement) return { w: img.naturalWidth, h: img.naturalHeight }
  return { w: img.width, h: img.height }
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const v = parseInt(h.slice(0, 6), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

export function needsPixelWork(f: ImageFilters): boolean {
  return !!(f.brightness || f.contrast || f.saturation || f.duotone)
}

const processed = new Map<string, HTMLCanvasElement>()
const MAX_PROCESS = 1600

/** brightness/contrast/saturation/duotone baked into a cached canvas */
export function filtered(src: string, img: Src, f: ImageFilters): Src {
  if (!needsPixelWork(f)) return img
  const key = `${src}|${f.brightness}|${f.contrast}|${f.saturation}|${f.duotone?.join(',') ?? ''}`
  const hit = processed.get(key)
  if (hit) return hit
  const { w, h } = sizeOf(img)
  const s = Math.min(1, MAX_PROCESS / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * s))
  c.height = Math.max(1, Math.round(h * s))
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const data = ctx.getImageData(0, 0, c.width, c.height)
  applyPixels(data.data, f)
  ctx.putImageData(data, 0, 0)
  if (processed.size > 40) processed.delete(processed.keys().next().value!)
  processed.set(key, c)
  return c
}

/** pure pixel pass — exported for tests */
export function applyPixels(px: Uint8ClampedArray, f: ImageFilters): void {
  const b = (f.brightness / 100) * 255 * 0.5
  const cf = f.contrast >= 0 ? 1 + (f.contrast / 100) * 1.5 : 1 + f.contrast / 100
  const sat = 1 + f.saturation / 100
  const dt = f.duotone ? [hexToRgb(f.duotone[0]), hexToRgb(f.duotone[1])] : null
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i]
    let g = px[i + 1]
    let bl = px[i + 2]
    r = (r - 128) * cf + 128 + b
    g = (g - 128) * cf + 128 + b
    bl = (bl - 128) * cf + 128 + b
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl
    if (dt) {
      const t = Math.min(1, Math.max(0, lum / 255))
      r = dt[0][0] + (dt[1][0] - dt[0][0]) * t
      g = dt[0][1] + (dt[1][1] - dt[0][1]) * t
      bl = dt[0][2] + (dt[1][2] - dt[0][2]) * t
    } else if (sat !== 1) {
      r = lum + (r - lum) * sat
      g = lum + (g - lum) * sat
      bl = lum + (bl - lum) * sat
    }
    px[i] = r
    px[i + 1] = g
    px[i + 2] = bl
  }
}
