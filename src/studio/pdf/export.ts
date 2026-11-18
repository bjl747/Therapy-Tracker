/**
 * Export pipeline (pdf-lib). Order of operations per output page:
 *  1. Pages that must be rasterised (compress on, any redaction, or an
 *     encrypted / unparsable source) are painted with pdfjs + annotations
 *     onto a canvas and embedded as a single full-page image. Nothing of the
 *     original content or the redacted text survives.
 *  2. Every other page is copied with copyPages (vector content, fonts and
 *     links preserved), the user rotation is added to /Rotate and annotations
 *     are stamped on top with pdf-lib.
 *  3. Blank and image pages are created from scratch.
 * Form values are applied (and optionally flattened) on the SOURCE document
 * before its pages are copied.
 */
import type { PDFDocument, PDFFont, PDFImage, PDFPage } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import {
  type Annotation,
  type PageItem,
  type Rect,
  type Rot,
  BASELINE,
  LINE_HEIGHT,
  TEXT_PAD,
  baseToPdf,
  displaySize,
  hasRedaction,
  hexToRgb01,
  normRot,
} from './lib'
import { getSourceBytes, getSourceMime, loadPdfLib, openPdfjsDoc } from './pdfjs'
import { canvasToBlob, renderPage } from './raster'
import type { FormValue, SourceMeta } from './store'

export interface ExportOptions {
  sources: Record<string, SourceMeta>
  formValues: Record<string, Record<string, FormValue>>
  flatten: boolean
  /** JPEG quality 0..1, or null for lossless export. */
  compressQuality: number | null
  onProgress?: (done: number, total: number) => void
}

export interface ExportResult {
  bytes: Uint8Array
  warnings: string[]
}

type PdfLib = typeof import('pdf-lib')

function dataUrlBytes(url: string): Uint8Array {
  const bin = atob(url.slice(url.indexOf(',') + 1))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function applyForm(doc: PDFDocument, lib: PdfLib, values: Record<string, FormValue>, flatten: boolean, warnings: string[]): void {
  const form = doc.getForm()
  for (const [name, v] of Object.entries(values)) {
    try {
      const f = form.getField(name)
      if (f instanceof lib.PDFTextField) f.setText(String(v))
      else if (f instanceof lib.PDFCheckBox) (v ? f.check() : f.uncheck())
      else if (f instanceof lib.PDFDropdown || f instanceof lib.PDFRadioGroup) {
        if (v !== '') f.select(String(v))
      }
    } catch {
      warnings.push(`Form field "${name}" could not be filled (unsupported characters or value).`)
    }
  }
  if (flatten) {
    try {
      form.flatten()
    } catch {
      warnings.push('The form could not be flattened; fields stay editable in some viewers.')
    }
  } else {
    // pages are copied into a new document, so the source is never saved and pdf-lib never redraws the
    // fields: draw the filled-in values now or they look blank in every viewer
    try {
      const font = doc.embedStandardFont(lib.StandardFonts.Helvetica)
      form.updateFieldAppearances(font)
    } catch {
      warnings.push('Some filled-in form values could not be drawn (unsupported characters); turn on Flatten to keep them.')
    }
  }
}

export async function buildPdf(pages: PageItem[], opts: ExportOptions): Promise<ExportResult> {
  const lib = await loadPdfLib()
  const { PDFDocument, StandardFonts, rgb, degrees } = lib
  const warnings: string[] = []
  const out = await PDFDocument.create()
  out.setProducer('PDF Studio')
  out.setCreator('PDF Studio')

  const srcDocs = new Map<string, Promise<{ doc: PDFDocument; filled: boolean }>>()
  const getSrc = (sourceId: string) => {
    let p = srcDocs.get(sourceId)
    if (!p) {
      p = (async () => {
        const bytes = getSourceBytes(sourceId)
        if (!bytes) throw new Error('A source file is no longer in memory. Please add it again.')
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
        const meta = opts.sources[sourceId]
        const vals = opts.formValues[sourceId] ?? {}
        const hasVals = Object.keys(vals).length > 0
        let filled = false
        if (meta && !meta.rasterOnly && meta.fields.length && (hasVals || opts.flatten)) {
          applyForm(doc, lib, vals, opts.flatten, warnings)
          filled = true
        }
        return { doc, filled }
      })()
      srcDocs.set(sourceId, p)
    }
    return p
  }

  // pdfjs docs built from the FILLED bytes, used only when a filled source page must be rasterised.
  const filledJs = new Map<string, Promise<PDFDocumentProxy>>()
  const getFilledJs = (sourceId: string) => {
    let p = filledJs.get(sourceId)
    if (!p) {
      p = getSrc(sourceId).then(async ({ doc }) => openPdfjsDoc(await doc.save()))
      filledJs.set(sourceId, p)
    }
    return p
  }

  const fonts = new Map<boolean, Promise<PDFFont>>()
  const getFont = (bold: boolean) => {
    let f = fonts.get(bold)
    if (!f) {
      f = out.embedFont(bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica)
      fonts.set(bold, f)
    }
    return f
  }
  const annImages = new Map<string, Promise<PDFImage>>()
  const getAnnImage = (a: Extract<Annotation, { kind: 'image' }>) => {
    let p = annImages.get(a.dataUrl)
    if (!p) {
      const bytes = dataUrlBytes(a.dataUrl)
      p = a.mime === 'image/jpeg' ? out.embedJpg(bytes) : out.embedPng(bytes)
      annImages.set(a.dataUrl, p)
    }
    return p
  }
  const srcImages = new Map<string, Promise<PDFImage>>()
  const getSrcImage = (sourceId: string) => {
    let p = srcImages.get(sourceId)
    if (!p) {
      const bytes = getSourceBytes(sourceId)
      if (!bytes) throw new Error('A source image is no longer in memory. Please add it again.')
      p = getSourceMime(sourceId) === 'image/jpeg' ? out.embedJpg(bytes) : out.embedPng(bytes)
      srcImages.set(sourceId, p)
    }
    return p
  }

  async function stamp(page: PDFPage, annots: Annotation[], box: Rect, baseRot: Rot): Promise<void> {
    for (const a of annots) {
      const p1 = baseToPdf({ x: a.x, y: a.y }, box, baseRot)
      const p2 = baseToPdf({ x: a.x + a.w, y: a.y + a.h }, box, baseRot)
      const r = { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), width: Math.abs(p2.x - p1.x), height: Math.abs(p2.y - p1.y) }
      if (a.kind === 'whiteout') page.drawRectangle({ ...r, color: rgb(1, 1, 1), borderWidth: 0 })
      else if (a.kind === 'redact') page.drawRectangle({ ...r, color: rgb(0, 0, 0), borderWidth: 0 })
      else if (a.kind === 'highlight') page.drawRectangle({ ...r, color: rgb(1, 0.9, 0), opacity: 0.4, borderWidth: 0 })
      else if (a.kind === 'image') {
        const img = await getAnnImage(a)
        const at = baseToPdf({ x: a.x, y: a.y + a.h }, box, baseRot)
        page.drawImage(img, { x: at.x, y: at.y, width: a.w, height: a.h, rotate: degrees(baseRot) })
      } else if (a.kind === 'text') {
        const font = await getFont(a.bold)
        const set = new Set(font.getCharacterSet())
        const [cr, cg, cb] = hexToRgb01(a.color)
        a.text.split('\n').forEach((raw, i) => {
          const line = Array.from(raw.replace(/\r/g, ''))
            .map((ch) => (set.has(ch.codePointAt(0) ?? 0) ? ch : '?'))
            .join('')
          if (!line.trim()) return
          const at = baseToPdf(
            { x: a.x + TEXT_PAD, y: a.y + TEXT_PAD + a.size * BASELINE + i * a.size * LINE_HEIGHT },
            box,
            baseRot,
          )
          page.drawText(line, { x: at.x, y: at.y, size: a.size, font, color: rgb(cr, cg, cb), rotate: degrees(baseRot) })
        })
      }
    }
  }

  const total = pages.length
  for (let i = 0; i < total; i++) {
    const p = pages[i]
    opts.onProgress?.(i, total)
    const srcMeta = p.src.kind === 'pdf' ? opts.sources[p.src.sourceId] : undefined
    const rasterOnly = !!srcMeta?.rasterOnly
    const redacted = hasRedaction(p)
    const compress = opts.compressQuality !== null

    if (compress || redacted || rasterOnly) {
      const d = displaySize(p.w, p.h, p.rotation)
      const scale = compress ? 1.5 : 2
      let doc: PDFDocumentProxy | undefined
      if (p.src.kind === 'pdf') {
        const s = await getSrc(p.src.sourceId)
        if (s.filled) doc = await getFilledJs(p.src.sourceId)
      }
      const canvas = await renderPage(p, { width: d.w * scale, annotations: true, doc })
      const lossy = compress || rasterOnly
      const q = compress ? (opts.compressQuality as number) : 0.92
      const blob = await canvasToBlob(canvas, lossy ? 'image/jpeg' : 'image/png', q)
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const img = lossy ? await out.embedJpg(bytes) : await out.embedPng(bytes)
      const page = out.addPage([d.w, d.h])
      page.drawImage(img, { x: 0, y: 0, width: d.w, height: d.h })
      continue
    }

    if (p.src.kind === 'pdf') {
      const { doc } = await getSrc(p.src.sourceId)
      const [copy] = await out.copyPages(doc, [p.src.index])
      const box = copy.getCropBox()
      const baseRot = normRot(copy.getRotation().angle)
      const page = out.addPage(copy)
      await stamp(page, p.annotations, { x: box.x, y: box.y, w: box.width, h: box.height }, baseRot)
      if (p.rotation) page.setRotation(degrees((baseRot + p.rotation) % 360))
    } else if (p.src.kind === 'image') {
      const img = await getSrcImage(p.src.sourceId)
      const page = out.addPage([p.w, p.h])
      page.drawImage(img, { x: 0, y: 0, width: p.w, height: p.h })
      await stamp(page, p.annotations, { x: 0, y: 0, w: p.w, h: p.h }, 0)
      if (p.rotation) page.setRotation(degrees(p.rotation))
    } else {
      const page = out.addPage([p.w, p.h])
      await stamp(page, p.annotations, { x: 0, y: 0, w: p.w, h: p.h }, 0)
      if (p.rotation) page.setRotation(degrees(p.rotation))
    }
  }
  opts.onProgress?.(total, total)

  for (const pr of filledJs.values()) void pr.then((d) => d.loadingTask.destroy()).catch(() => undefined)
  const bytes = await out.save()
  return { bytes, warnings: Array.from(new Set(warnings)) }
}

/** Render one page (annotations included, redactions painted black) to a PNG. */
export async function pageToPng(p: PageItem, scale = 2): Promise<Blob> {
  const d = displaySize(p.w, p.h, p.rotation)
  const canvas = await renderPage(p, { width: d.w * scale, annotations: true })
  return canvasToBlob(canvas, 'image/png')
}

export function downloadBlob(data: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
