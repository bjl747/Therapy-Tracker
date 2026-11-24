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
import { annRot, contentSize } from './annot'
import { bumpIngestGeneration, forgetSource, getPdfDoc, getSourceBytes, getSourceMime } from './pdfjs'

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

/** decoded source images, with the object URL that backs each (revoked when the source is dropped) */
const srcImgCache = new Map<string, { url: string; img: Promise<HTMLImageElement> }>()
export function sourceImage(sourceId: string): Promise<HTMLImageElement> {
  let hit = srcImgCache.get(sourceId)
  if (!hit) {
    const bytes = getSourceBytes(sourceId)
    if (!bytes) return Promise.reject(new Error('Source image is no longer in memory'))
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: getSourceMime(sourceId) }))
    const img = loadImg(url)
    const entry = { url, img }
    // a failed decode: free the URL now and let the next call try again
    img.catch(() => {
      URL.revokeObjectURL(url)
      if (srcImgCache.get(sourceId) === entry) srcImgCache.delete(sourceId)
    })
    hit = entry
    srcImgCache.set(sourceId, hit)
  }
  return hit.img
}

function dropSourceImage(sourceId: string): void {
  const hit = srcImgCache.get(sourceId)
  if (!hit) return
  srcImgCache.delete(sourceId)
  URL.revokeObjectURL(hit.url)
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
          const c = contentSize(a)
          // the item's own upright frame, turned by `rot` about the box centre
          ctx.translate(a.x + a.w / 2, a.y + a.h / 2)
          ctx.rotate((annRot(a) * Math.PI) / 180)
          ctx.drawImage(img, -c.w / 2, -c.h / 2, c.w, c.h)
        } catch {
          /* skip undecodable image */
        }
        break
      }
      case 'text': {
        if (a.cover) {
          // "Edit text": cover the original words first (base space, not turned, stays put)
          ctx.fillStyle = a.coverColor ?? '#ffffff'
          ctx.fillRect(a.cover.x, a.cover.y, a.cover.w, a.cover.h)
        }
        const c = contentSize(a)
        ctx.translate(a.x + a.w / 2, a.y + a.h / 2)
        ctx.rotate((annRot(a) * Math.PI) / 180)
        ctx.fillStyle = a.color
        ctx.font = `${a.bold ? 'bold ' : ''}${a.size}px Helvetica, Arial, sans-serif`
        ctx.textBaseline = 'alphabetic'
        a.text.split('\n').forEach((line, i) => {
          ctx.fillText(line, -c.w / 2 + TEXT_PAD, -c.h / 2 + TEXT_PAD + a.size * BASELINE + i * a.size * LINE_HEIGHT)
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

/** LRU of thumbnail object URLs: most recently used last. Old rotations / annotation states fall off the front. */
const thumbCache = new Map<string, Promise<string>>()
const THUMB_CAP = 240
const queue: (() => void)[] = []
let running = 0
const MAX_PARALLEL = 3

function pump(): void {
  while (running < MAX_PARALLEL && queue.length) {
    running += 1
    queue.shift()!()
  }
}

function revokeLater(p: Promise<string>): void {
  // a card may still be showing it for a moment
  void p.then((u) => setTimeout(() => URL.revokeObjectURL(u), 30_000)).catch(() => undefined)
}

function touch(key: string): Promise<string> | undefined {
  const hit = thumbCache.get(key)
  if (hit) {
    thumbCache.delete(key)
    thumbCache.set(key, hit)
  }
  return hit
}

function trimThumbs(): void {
  while (thumbCache.size > THUMB_CAP) {
    const [k, v] = thumbCache.entries().next().value as [string, Promise<string>]
    thumbCache.delete(k)
    revokeLater(v)
  }
}

/** Short stable hash of a page's annotations (cached per array: the store replaces arrays on change). */
const annHashes = new WeakMap<Annotation[], string>()
function annHash(annots: Annotation[]): string {
  if (!annots.length) return '0'
  let h = annHashes.get(annots)
  if (h === undefined) {
    let x = 0x811c9dc5
    const feed = (s: string) => {
      for (let i = 0; i < s.length; i++) {
        x ^= s.charCodeAt(i)
        x = Math.imul(x, 0x01000193)
      }
    }
    for (const a of annots) {
      feed(JSON.stringify(a, (k, v) => (k === 'id' || k === 'dataUrl' ? undefined : v)))
      if (a.kind === 'image') feed(a.dataUrl)
    }
    h = `${annots.length}.${(x >>> 0).toString(36)}`
    annHashes.set(annots, h)
  }
  return h
}

/** newest thumbnail key asked for, per page id */
const latestKey = new Map<string, string>()

export function thumbKey(p: PageItem): string | null {
  const ann = annHash(p.annotations)
  if (p.src.kind === 'pdf') return `${p.src.sourceId}:${p.src.index}:${(p.baseRot + p.rotation) % 360}:${ann}`
  if (p.src.kind === 'image') return `${p.src.sourceId}:img:${p.rotation}:${ann}`
  // blank pages only need a rendered thumbnail when something is drawn on them
  return p.annotations.length ? `blank:${Math.round(p.w)}x${Math.round(p.h)}:${p.rotation}:${ann}` : null
}

export function getThumb(p: PageItem, width = 360): Promise<string> {
  const key = thumbKey(p)
  if (!key) return Promise.reject(new Error('no thumb'))
  latestKey.set(p.id, key)
  let cached = touch(key)
  if (!cached) {
    cached = new Promise<string>((resolve, reject) => {
      queue.push(() => {
        // the page changed again while this waited (e.g. an annotation being dragged): skip the stale render
        if (latestKey.get(p.id) !== key) {
          running -= 1
          pump()
          reject(new Error('superseded'))
          return
        }
        renderPage(p, { width, annotations: true })
          .then((c) => canvasToBlob(c, 'image/jpeg', 0.82))
          .then((b) => resolve(URL.createObjectURL(b)), reject)
          .finally(() => {
            running -= 1
            pump()
          })
      })
      pump()
    })
    const entry = cached
    cached.catch(() => {
      if (thumbCache.get(key) === entry) thumbCache.delete(key)
    })
    thumbCache.set(key, cached)
    trimThumbs()
  }
  return cached
}

export function peekThumb(p: PageItem): Promise<string> | undefined {
  const key = thumbKey(p)
  return key ? touch(key) : undefined
}

export function dropThumbsFor(sourceId: string): void {
  for (const [k, v] of thumbCache) {
    if (k.startsWith(`${sourceId}:`)) {
      thumbCache.delete(k)
      void v.then((u) => URL.revokeObjectURL(u)).catch(() => undefined)
    }
  }
  dropSourceImage(sourceId)
}

/** a source is gone for good: free its thumbnails, image URL and pdf.js document */
export function releaseSource(sourceId: string): void {
  dropThumbsFor(sourceId)
  forgetSource(sourceId)
}

/** everything is cleared (PDF Studio reset): free every cached URL and drop files that are still loading */
export function releaseAllSources(): void {
  bumpIngestGeneration()
  const ids = new Set<string>(srcImgCache.keys())
  for (const k of thumbCache.keys()) ids.add(k.slice(0, k.indexOf(':')))
  for (const id of ids) releaseSource(id)
  latestKey.clear()
}
