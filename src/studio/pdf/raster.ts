/**
 * Canvas rendering shared by thumbnails, the page editor, PNG download,
 * redaction rasterisation and compression. DOM required.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'
import {
  type Annotation,
  type PageItem,
  BASELINE,
  LINE_HEIGHT,
  TEXT_PAD,
  displaySize,
  rotationMatrix,
} from './lib'
import { getPdfDoc, getSourceBytes, getSourceMime } from './pdfjs'

const imgCache = new Map<string, Promise<HTMLImageElement>>()

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image could not be decoded'))
    img.src = url
  })
}

export function annotationImage(dataUrl: string): Promise<HTMLImageElement> {
  let p = imgCache.get(dataUrl)
  if (!p) {
    p = loadImg(dataUrl)
    imgCache.set(dataUrl, p)
  }
  return p
}

const srcImgCache = new Map<string, Promise<HTMLImageElement>>()
export function sourceImage(sourceId: string): Promise<HTMLImageElement> {
  let p = srcImgCache.get(sourceId)
  if (!p) {
    const bytes = getSourceBytes(sourceId)
    if (!bytes) return Promise.reject(new Error('Source image is no longer in memory'))
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: getSourceMime(sourceId) }))
    p = loadImg(url)
    srcImgCache.set(sourceId, p)
  }
  return p
}

/** Paint annotations in base space; the ctx must already hold the base->canvas transform. */
export async function paintAnnotations(ctx: CanvasRenderingContext2D, annots: Annotation[]): Promise<void> {
  for (const a of annots) {
    ctx.save()
    switch (a.kind) {
      case 'whiteout':
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(a.x, a.y, a.w, a.h)
        break
      case 'redact':
        ctx.fillStyle = '#000000'
        ctx.fillRect(a.x, a.y, a.w, a.h)
        break
      case 'highlight':
        ctx.globalAlpha = 0.4
        ctx.fillStyle = '#ffe600'
        ctx.fillRect(a.x, a.y, a.w, a.h)
        break
      case 'image': {
        try {
          const img = await annotationImage(a.dataUrl)
          ctx.drawImage(img, a.x, a.y, a.w, a.h)
        } catch {
          /* skip undecodable image */
        }
        break
      }
      case 'text': {
        ctx.fillStyle = a.color
        ctx.font = `${a.bold ? 'bold ' : ''}${a.size}px Helvetica, Arial, sans-serif`
        ctx.textBaseline = 'alphabetic'
        a.text.split('\n').forEach((line, i) => {
          ctx.fillText(line, a.x + TEXT_PAD, a.y + TEXT_PAD + a.size * BASELINE + i * a.size * LINE_HEIGHT)
        })
        break
      }
    }
    ctx.restore()
  }
}

export interface RenderOpts {
  /** Output width in device pixels of the rotated page. */
  width: number
  annotations?: boolean
  /** Use this pdfjs document instead of the source's cached one. */
  doc?: PDFDocumentProxy
  /** Return true to skip the (slow) annotation paint when the caller moved on. */
  isStale?: () => boolean
}

export async function renderPage(page: PageItem, opts: RenderOpts): Promise<HTMLCanvasElement> {
  const d = displaySize(page.w, page.h, page.rotation)
  const scale = opts.width / d.w
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(d.w * scale))
  canvas.height = Math.max(1, Math.round(d.h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  if (page.src.kind === 'pdf') {
    const doc = opts.doc ?? (await getPdfDoc(page.src.sourceId))
    const pg = await doc.getPage(page.src.index + 1)
    const viewport = pg.getViewport({ scale, rotation: (page.baseRot + page.rotation) % 360 })
    await pg.render({ canvas, viewport }).promise
  } else if (page.src.kind === 'image') {
    const img = await sourceImage(page.src.sourceId)
    const [a, b, c, dd, e, f] = rotationMatrix(page.w, page.h, page.rotation)
    ctx.setTransform(a * scale, b * scale, c * scale, dd * scale, e * scale, f * scale)
    ctx.drawImage(img, 0, 0, page.w, page.h)
  }
  if (opts.isStale?.()) return canvas
  if (opts.annotations && page.annotations.length) {
    const [a, b, c, dd, e, f] = rotationMatrix(page.w, page.h, page.rotation)
    ctx.setTransform(a * scale, b * scale, c * scale, dd * scale, e * scale, f * scale)
    await paintAnnotations(ctx, page.annotations)
  }
  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality)
  })
}

/* ------------------------------------------------------------- thumbnails */

const thumbCache = new Map<string, Promise<string>>()
const queue: (() => void)[] = []
let running = 0
const MAX_PARALLEL = 3

function pump(): void {
  while (running < MAX_PARALLEL && queue.length) {
    running += 1
    queue.shift()!()
  }
}

export function thumbKey(p: PageItem): string | null {
  if (p.src.kind === 'pdf') return `${p.src.sourceId}:${p.src.index}:${(p.baseRot + p.rotation) % 360}`
  if (p.src.kind === 'image') return `${p.src.sourceId}:img:${p.rotation}`
  return null
}

export function getThumb(p: PageItem, width = 360): Promise<string> {
  const key = thumbKey(p)
  if (!key) return Promise.reject(new Error('no thumb'))
  let cached = thumbCache.get(key)
  if (!cached) {
    const plain: PageItem = { ...p, annotations: [] }
    cached = new Promise<string>((resolve, reject) => {
      queue.push(() => {
        renderPage(plain, { width })
          .then((c) => canvasToBlob(c, 'image/jpeg', 0.82))
          .then((b) => resolve(URL.createObjectURL(b)), reject)
          .finally(() => {
            running -= 1
            pump()
          })
      })
      pump()
    })
    cached.catch(() => thumbCache.delete(key))
    thumbCache.set(key, cached)
  }
  return cached
}

export function peekThumb(p: PageItem): Promise<string> | undefined {
  const key = thumbKey(p)
  return key ? thumbCache.get(key) : undefined
}

export function dropThumbsFor(sourceId: string): void {
  for (const [k, v] of thumbCache) {
    if (k.startsWith(`${sourceId}:`)) {
      thumbCache.delete(k)
      void v.then((u) => URL.revokeObjectURL(u)).catch(() => undefined)
    }
  }
  srcImgCache.delete(sourceId)
}
