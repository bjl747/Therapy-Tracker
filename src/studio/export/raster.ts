// PNG / JPG export, clipboard and download helpers.

import { renderPageToCanvas, type RenderOptions } from '../engine/render'
import type { Design } from '../engine/model'

export interface RasterOptions {
  /** device pixels per design pixel */
  scale: number
  transparent?: boolean
  resolveImage?: RenderOptions['resolveImage']
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
  })
  return canvasToBlob(c, 'image/png')
}

/** JPEG has no alpha, so the page is always drawn on its own background */
export async function exportJpg(
  design: Design,
  pageIndex: number,
  opts: Omit<RasterOptions, 'transparent'> & { quality?: number },
): Promise<Blob> {
  const c = await renderPageToCanvas(design, pageIndex, { scale: opts.scale, resolveImage: opts.resolveImage })
  return canvasToBlob(c, 'image/jpeg', opts.quality ?? 0.92)
}

export async function copyPngToClipboard(blob: Blob): Promise<void> {
  const Item = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem
  if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.write !== 'function' || !Item) {
    throw new Error('Copying images is not supported in this browser. Download the PNG instead.')
  }
  try {
    await navigator.clipboard.write([new Item({ 'image/png': blob })])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Could not copy the image to the clipboard (${msg}). Check browser permissions or download the PNG instead.`)
  }
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
