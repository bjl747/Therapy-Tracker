// Image cache + pixel filters. Filters (blur included) are applied with our
// own pixel code (not ctx.filter) so exports look identical in every browser,
// Safari included. Processed results are cached per (src, filters, blur).
// Failed loads are remembered for FAIL_RETRY_MS only.

import type { ImageFilters } from './model'

type Src = HTMLImageElement | HTMLCanvasElement | ImageBitmap

const loaded = new Map<string, Src>()
const pending = new Map<string, Promise<Src | null>>()
/** src → when it failed. Failures are time-boxed: retried after FAIL_RETRY_MS,
 *  or straight away by an explicit export (loadImage(src, { retry: true })). */
const failed = new Map<string, number>()
const listeners = new Set<() => void>()

export const FAIL_RETRY_MS = 30_000

/** called whenever a new image finishes loading (editor re-renders) */
export function onImageLoaded(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getImage(src: string): Src | null {
  return loaded.get(src) ?? null
}

/** did the last attempt to load this src fail (and it hasn't loaded since)? */
export function imageFailed(src: string): boolean {
  return failed.has(src) && !loaded.has(src)
}

/** pure: should a failed load be attempted again? */
export function shouldRetry(failedAt: number | undefined, now: number, force = false): boolean {
  return failedAt === undefined || force || now - failedAt >= FAIL_RETRY_MS
}

export function loadImage(src: string, opts?: { retry?: boolean }): Promise<Src | null> {
  if (!src) return Promise.resolve(null)
  const hit = loaded.get(src)
  if (hit) return Promise.resolve(hit)
  let p = pending.get(src)
  if (p) return p
  if (!shouldRetry(failed.get(src), Date.now(), opts?.retry)) return Promise.resolve(null)
  p = new Promise<Src | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      loaded.set(src, img)
      failed.delete(src)
      pending.delete(src)
      listeners.forEach((l) => l())
      resolve(img)
    }
    img.onerror = () => {
      failed.set(src, Date.now())
      pending.delete(src)
      resolve(null)
    }
    img.src = src
  })
  pending.set(src, p)
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
/** total pixels kept in `processed` (~4 bytes each): dragging a filter slider made a new canvas per step,
 *  and 40 × 1600² canvases (~400 MB) went past iOS Safari's canvas limit, which blanks canvases */
let processedPixels = 0
const MAX_PROCESSED_PIXELS = 12_000_000
const MAX_PROCESS = 1600
/** blur is done at a reduced size when it's strong (a blurred image has no
 *  detail to lose) — keeps the pixel pass fast at any radius */
const MAX_WORK_SIGMA = 10

/** quantise a blur radius so resizing a blurred photo doesn't re-blur every frame */
export function quantizeSigma(s: number): number {
  if (s <= 0.25) return 0
  if (s < 4) return Math.round(s * 4) / 4
  return Math.round(Math.pow(1.06, Math.round(Math.log(s) / Math.log(1.06))) * 100) / 100
}

/**
 * Colour filters (brightness/contrast/saturation/duotone) and blur baked into
 * a cached canvas — our own pixel code, so the result is identical in every
 * browser (ctx.filter doesn't exist in Safari).
 *
 * `blurSrcPx` is the Gaussian blur radius (std-dev) measured in pixels of the
 * SOURCE image: the caller converts the design-px blur by how large the image
 * is drawn, so it looks the same at any element size and export scale.
 */
export function filtered(src: string, img: Src, f: ImageFilters, blurSrcPx = 0): Src {
  const colour = needsPixelWork(f)
  const { w, h } = sizeOf(img)
  let s = Math.min(1, MAX_PROCESS / Math.max(w, h, 1))
  let sigma = quantizeSigma(blurSrcPx * s)
  if (!colour && !sigma) return img
  if (sigma > MAX_WORK_SIGMA) {
    // work smaller: the same blur relative to the image, at ≤ MAX_WORK_SIGMA px
    const k = Math.max(MAX_WORK_SIGMA / sigma, 24 / Math.max(1, Math.min(w, h) * s))
    s *= Math.min(1, k)
    sigma = Math.round(sigma * Math.min(1, k) * 100) / 100
  }
  const key = `${src}|${f.brightness}|${f.contrast}|${f.saturation}|${f.duotone?.join(',') ?? ''}|b${sigma}@${s.toFixed(4)}`
  const hit = processed.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * s))
  c.height = Math.max(1, Math.round(h * s))
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const data = ctx.getImageData(0, 0, c.width, c.height)
  if (colour) applyPixels(data.data, f)
  if (sigma) blurRGBA(data.data, c.width, c.height, sigma)
  ctx.putImageData(data, 0, 0)
  processedPixels += c.width * c.height
  while (processed.size && (processed.size >= 40 || processedPixels > MAX_PROCESSED_PIXELS)) {
    const [oldKey, old] = processed.entries().next().value!
    processed.delete(oldKey)
    processedPixels -= old.width * old.height
  }
  processed.set(key, c)
  return c
}

/** box widths (odd) whose n successive box blurs approximate a Gaussian of std-dev sigma */
export function boxesForGauss(sigma: number, n = 3): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1)
  let wl = Math.floor(ideal)
  if (wl % 2 === 0) wl--
  wl = Math.max(1, wl)
  const wu = wl + 2
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4))
  return Array.from({ length: n }, (_, i) => (i < m ? wl : wu))
}

function boxPass(src: Float32Array, dst: Float32Array, len: number, lines: number, step: number, lineStep: number, r: number) {
  const inv = 1 / (2 * r + 1)
  const last = len - 1
  for (let l = 0; l < lines; l++) {
    const base = l * lineStep
    for (let c = 0; c < 4; c++) {
      // window [x−r, x+r], edges clamped (no dark/transparent fringe)
      const first = src[base + c]
      const lastV = src[base + last * step + c]
      let acc = r * first
      for (let j = 0; j < r; j++) acc += j <= last ? src[base + j * step + c] : lastV
      for (let x = 0; x < len; x++) {
        const ai = x + r
        acc += ai <= last ? src[base + ai * step + c] : lastV
        dst[base + x * step + c] = acc * inv
        const si = x - r
        acc -= si >= 0 ? src[base + si * step + c] : first
      }
    }
  }
}

/** pure: in-place Gaussian-ish blur (3 separable box passes, premultiplied alpha) — exported for tests */
export function blurRGBA(px: Uint8ClampedArray, w: number, h: number, sigma: number): void {
  if (!(sigma > 0) || w < 1 || h < 1) return
  const n = w * h * 4
  const a = new Float32Array(n)
  const b = new Float32Array(n)
  for (let i = 0; i < n; i += 4) {
    const al = px[i + 3] / 255
    a[i] = px[i] * al
    a[i + 1] = px[i + 1] * al
    a[i + 2] = px[i + 2] * al
    a[i + 3] = px[i + 3]
  }
  for (const box of boxesForGauss(sigma, 3)) {
    const r = (box - 1) / 2
    if (r < 1) continue
    boxPass(a, b, w, h, 4, w * 4, r) // rows
    boxPass(b, a, h, w, w * 4, 4, r) // columns
  }
  for (let i = 0; i < n; i += 4) {
    const al = a[i + 3]
    const k = al > 0 ? 255 / al : 0
    px[i] = a[i] * k
    px[i + 1] = a[i + 1] * k
    px[i + 2] = a[i + 2] * k
    px[i + 3] = al
  }
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
