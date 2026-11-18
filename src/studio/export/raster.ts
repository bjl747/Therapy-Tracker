// PNG / JPG export, clipboard and download helpers.

import { renderPageToCanvas, type ExportReport, type RenderOptions } from '../engine/render'
import type { Design } from '../engine/model'

export interface RasterOptions {
  /** device pixels per design pixel */
  scale: number
  transparent?: boolean
  resolveImage?: RenderOptions['resolveImage']
  /** collects photos that couldn't load (drawn as placeholders) so the caller can warn */
  report?: ExportReport
}

function canvasToBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('The browser could not encode the image (the canvas may be too large).'))),
      type,
      quality,
    )
  })
}

export async function exportPng(design: Design, pageIndex: number, opts: RasterOptions): Promise<Blob> {
  const c = await renderPageToCanvas(design, pageIndex, {
    scale: opts.scale,
    transparent: opts.transparent,
    resolveImage: opts.resolveImage,
  }, opts.report)
  return canvasToBlob(c, 'image/png')
}

/** JPEG has no alpha, so the page is always drawn on its own background */
export async function exportJpg(
  design: Design,
  pageIndex: number,
  opts: Omit<RasterOptions, 'transparent'> & { quality?: number },
): Promise<Blob> {
  const c = await renderPageToCanvas(design, pageIndex, { scale: opts.scale, resolveImage: opts.resolveImage }, opts.report)
  return canvasToBlob(c, 'image/jpeg', opts.quality ?? 0.92)
}

const clipboardError = (e: unknown) =>
  new Error(
    `Could not copy the image to the clipboard (${e instanceof Error ? e.message : String(e)}). Check browser permissions or download the PNG instead.`,
  )

/**
 * Copy a PNG that is still being made. Call this SYNCHRONOUSLY inside the
 * click handler (before any await): Safari only allows clipboard writes that
 * start in the user gesture, and both Safari and Chrome accept a
 * Promise<Blob> as the ClipboardItem value — so the write starts now and the
 * image arrives when it's ready.
 *
 *   onClick={() => void copyPngPromiseToClipboard(makePng()).then(ok, fail)}
 */
export function copyPngPromiseToClipboard(png: Promise<Blob>): Promise<void> {
  const Item = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem
  if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.write !== 'function' || !Item) {
    png.catch(() => undefined) // nobody will consume it
    return Promise.reject(new Error('Copying images is not supported in this browser. Download the PNG instead.'))
  }
  let write: Promise<void>
  try {
    write = navigator.clipboard.write([new Item({ 'image/png': png })])
  } catch {
    // an older ClipboardItem without promise values: write once the PNG exists
    write = png.then((b) => navigator.clipboard.write([new Item({ 'image/png': b })]))
  }
  return write.catch(async (e) => {
    // if making the PNG failed, that's the useful error — not the clipboard's
    await png
    throw clipboardError(e)
  })
}

/** copy a finished PNG (prefer copyPngPromiseToClipboard from a click: Safari) */
export function copyPngToClipboard(blob: Blob): Promise<void> {
  return copyPngPromiseToClipboard(Promise.resolve(blob))
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** a filesystem-safe file stem (no extension); never empty */
export function safeFileName(s: string, fallback = 'design'): string {
  const cleaned = s
    // Chrome throws away a download name containing some non-ASCII (e.g. an
    // em dash) and saves as "download" — so dashes become "-" and accents go.
    .replace(/[\u2012-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, 80)
    .trim()
  if (!cleaned || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned)) return fallback
  return cleaned
}
