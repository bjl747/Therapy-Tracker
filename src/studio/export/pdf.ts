// Multi-page PDF: every page is rendered with the shared renderer and
// embedded as an image. 1 design px = 0.75 pt (72 dpi ↔ 96 css px).

import { renderPageToCanvas, type RenderOptions } from '../engine/render'
import type { Design } from '../engine/model'

export interface PdfOptions {
  /** raster scale (default 2) */
  scale?: number
  resolveImage?: RenderOptions['resolveImage']
  /** embed JPEG (smaller, default) or PNG (lossless) */
  format?: 'jpeg' | 'png'
  /** JPEG quality, default 0.92 */
  quality?: number
  onProgress?: (p: number) => void
}

const PX_TO_PT = 0.75

function canvasBytes(c: HTMLCanvasElement, type: string, q?: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error('Could not render a page for the PDF.'))),
      type,
      q,
    )
  })
}

export async function exportDesignPdf(design: Design, opts: PdfOptions = {}): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle(design.name)
  doc.setCreator('Studio')
  doc.setProducer('Studio')
  const scale = opts.scale ?? 2
  const png = opts.format === 'png'
  const n = design.pages.length
  for (let i = 0; i < n; i++) {
    // JPEG can't hold alpha; the renderer paints the page background, so it's opaque
    const canvas = await renderPageToCanvas(design, i, { scale, resolveImage: opts.resolveImage })
    const bytes = await canvasBytes(canvas, png ? 'image/png' : 'image/jpeg', opts.quality ?? 0.92)
    const img = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
    const w = design.w * PX_TO_PT
    const h = design.h * PX_TO_PT
    const page = doc.addPage([w, h])
    page.drawImage(img, { x: 0, y: 0, width: w, height: h })
    canvas.width = canvas.height = 0 // free the backing store early
    opts.onProgress?.((i + 1) / n)
  }
  const out = await doc.save()
  return new Blob([out as BlobPart], { type: 'application/pdf' })
}
