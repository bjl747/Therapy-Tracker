/**
 * Export pipeline (pdf-lib). Order of operations per output page:
 *  1. Pages that must be rasterised (any redaction, or an
 *     encrypted / unparsable source) are painted with pdfjs + annotations
 *     onto a canvas and embedded as a single full-page image. Nothing of the
 *     original content or the redacted text survives.
 *  2. Every other page is copied with copyPages (vector content, fonts and
 *     links preserved; ONE copyPages call per source so shared fonts / images
 *     are written once) and annotations are stamped on top with pdf-lib.
 *     Copied pages lose any action beyond web / email / in-document links
 *     (scripts, launch, attachments: safeActions.ts).
 *  3. Blank and image pages are created from scratch.
 * Layout:
 *  - 'original': the user rotation is added to /Rotate; every page keeps its own size.
 *  - 'letter': the page is "re-sheeted" in place: its content (and the stamps) are wrapped in
 *    `q <cm> <crop clip> ... Q` that turns, fits and centres it on a 612 x 792 sheet; /Rotate becomes 0
 *    and link / annotation rectangles move with the content. Text stays text.
 * Form values are applied (and optionally flattened) on the SOURCE document
 * before its pages are copied.
 */
import type { PDFDocument, PDFFont, PDFImage, PDFPage } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import {
  type Annotation,
  type PageItem,
  type PageLayout,
  type Rect,
  type Rot,
  BASELINE,
  LETTER,
  LINE_HEIGHT,
  TEXT_PAD,
  applyMatrix,
  baseToPdf,
  displaySize,
  fitOnSheet,
  hasRedaction,
  hexToRgb01,
  isSheetAlready,
  normRot,
  sheetMatrix,
} from './lib'
import { annRot, contentSize, contentToBase } from './annot'
import { getSourceBytes, getSourceMime, loadPdfLib, openPdfjsDoc } from './pdfjs'
import { canvasToBlob, renderPage } from './raster'
import { stripUnsafeActions } from './safeActions'
import type { FormValue, SourceMeta } from './store'
import { dropDanglingAnnots, registerForm } from './acroform'

export interface ExportOptions {
  sources: Record<string, SourceMeta>
  formValues: Record<string, Record<string, FormValue>>
  flatten: boolean
  /** 'letter' (default): every page a portrait Letter sheet. 'original': pages keep their own size. */
  layout?: PageLayout
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

/**
 * Letter layout: turn, fit and centre a page's content (crop box, intrinsic /Rotate + `userRot`) on a
 * 612 x 792 sheet, in place. Everything already drawn on the page (stamps included) moves with it.
 * Draw nothing on the page afterwards: pdf-lib keeps appending to a stream that now sits inside the wrap.
 */
export function resheet(L: PdfLib, doc: PDFDocument, page: PDFPage, userRot: Rot): void {
  const cb = page.getCropBox()
  const box: Rect = { x: cb.x, y: cb.y, w: cb.width, h: cb.height }
  const total = normRot(normRot(page.getRotation().angle) + userRot)
  if (isSheetAlready(box, total)) return
  const m = sheetMatrix(box, total)
  page.pushOperators() // makes sure a content stream exists (some blank / scanned pages have no /Contents)
  page.node.normalize()
  const ctx = doc.context
  const start = ctx.register(
    ctx.contentStream([
      L.pushGraphicsState(),
      L.concatTransformationMatrix(...m),
      L.rectangle(box.x, box.y, box.w, box.h),
      L.clip(),
      L.endPath(),
    ]),
  )
  const end = ctx.register(ctx.contentStream([L.popGraphicsState()]))
  page.node.wrapContentStreams(start, end)
  page.setMediaBox(0, 0, LETTER.w, LETTER.h)
  page.setCropBox(0, 0, LETTER.w, LETTER.h)
  for (const k of ['BleedBox', 'TrimBox', 'ArtBox']) page.node.delete(L.PDFName.of(k))
  page.setRotation(L.degrees(0))

  // links and other annotations: move their rectangles (and highlight quads) with the content
  const annots = page.node.Annots()
  if (!annots) return
  for (let i = 0; i < annots.size(); i++) {
    const a = annots.lookup(i)
    if (!(a instanceof L.PDFDict)) continue
    const nums = (key: string): number[] | null => {
      const arr = a.lookupMaybe(L.PDFName.of(key), L.PDFArray)
      if (!arr) return null
      const v = arr.asArray().map((o) => {
        const n = ctx.lookup(o)
        return n instanceof L.PDFNumber ? n.asNumber() : NaN
      })
      return v.some((n) => !isFinite(n)) ? null : v
    }
    const r = nums('Rect')
    if (r && r.length === 4) {
      const p = applyMatrix(m, { x: r[0], y: r[1] })
      const q = applyMatrix(m, { x: r[2], y: r[3] })
      a.set(L.PDFName.of('Rect'), ctx.obj([Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)]))
    }
    const qp = nums('QuadPoints')
    if (qp && qp.length % 2 === 0) {
      const o: number[] = []
      for (let k = 0; k < qp.length; k += 2) {
        const p = applyMatrix(m, { x: qp[k], y: qp[k + 1] })
        o.push(p.x, p.y)
      }
      a.set(L.PDFName.of('QuadPoints'), ctx.obj(o))
    }
  }
}

type Plan =
  | { mode: 'skip' }
  | { mode: 'raster' }
  | { mode: 'vector'; sourceId: string; index: number }
  | { mode: 'image' }
  | { mode: 'blank' }

export async function buildPdf(pages: PageItem[], opts: ExportOptions): Promise<ExportResult> {
  const lib = await loadPdfLib()
  const { PDFDocument, StandardFonts, rgb, degrees } = lib
  const layout: PageLayout = opts.layout ?? 'letter'
  const letter = layout === 'letter'
  const warnings: string[] = []
  const out = await PDFDocument.create()
  out.setProducer('PDF Studio')
  out.setCreator('PDF Studio')

  // ---- plan every page first: what is rasterised, skipped or copied
  const plans: Plan[] = pages.map((p, i) => {
    if (p.src.kind === 'blank') return hasRedaction(p) ? { mode: 'raster' } : { mode: 'blank' }
    if (p.src.kind === 'image') return hasRedaction(p) ? { mode: 'raster' } : { mode: 'image' }
    const meta = opts.sources[p.src.sourceId]
    const rasterOnly = !!meta?.rasterOnly
    const redacted = hasRedaction(p)
    const canRender = meta?.renderable !== false
    if (redacted || rasterOnly) {
      if (canRender) return { mode: 'raster' }
      const name = meta?.name ?? 'a file'
      if (redacted || rasterOnly) {
        // nothing safe to write: pdf.js cannot draw it and pdf-lib cannot copy it faithfully (or a redaction must not leak)
        warnings.push(`Page ${i + 1} (from "${name}") could not be read, so it was left out.`)
        return { mode: 'skip' }
      }
    }
    return { mode: 'vector', sourceId: p.src.sourceId, index: p.src.index }
  })

  // Letter layout + Flatten off: a turned page would draw live form fields sideways, so flatten those sources.
  const forceFlatten = new Set<string>()
  if (letter && !opts.flatten) {
    pages.forEach((p, i) => {
      const pl = plans[i]
      if (pl.mode !== 'vector') return
      const meta = opts.sources[pl.sourceId]
      if (!meta?.fields.length || forceFlatten.has(pl.sourceId)) return
      if (normRot(p.baseRot + p.rotation) !== 0) {
        forceFlatten.add(pl.sourceId)
        warnings.push(`Form fields in "${meta.name}" were flattened so they stay lined up on its turned Letter pages.`)
      }
    })
  }

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
        const flatten = opts.flatten || forceFlatten.has(sourceId)
        let filled = false
        if (meta && !meta.rasterOnly && meta.fields.length && (hasVals || flatten)) {
          applyForm(doc, lib, vals, flatten, warnings)
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

  // ONE copyPages call per source (in first-appearance order): resources shared by its pages are written once.
  // Each requested index yields its own page object, so duplicated pages stay independent.
  const copies = new Map<string, PDFPage[]>()
  {
    const wanted = new Map<string, number[]>()
    for (const pl of plans) {
      if (pl.mode !== 'vector') continue
      const list = wanted.get(pl.sourceId) ?? []
      list.push(pl.index)
      wanted.set(pl.sourceId, list)
    }
    for (const [sourceId, indices] of wanted) {
      const { doc } = await getSrc(sourceId)
      const copied = await out.copyPages(doc, indices)
      copies.set(sourceId, copied)
      // candidate files are outside files: keep plain links, drop scripts / launch / attachments (safeActions.ts)
      let removed = 0
      for (const pg of copied) removed += stripUnsafeActions(lib, pg)
      if (removed) {
        const name = opts.sources[sourceId]?.name ?? 'a file'
        warnings.push(`"${name}" had ${removed === 1 ? 'a link or action' : `${removed} links or actions`} that could run code, open files or carry attachments in the reader's PDF viewer. ${removed === 1 ? 'It was' : 'They were'} removed; ordinary web and email links are kept.`)
      }
    }
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
    const pdfRect = (r: Rect) => {
      const p1 = baseToPdf({ x: r.x, y: r.y }, box, baseRot)
      const p2 = baseToPdf({ x: r.x + r.w, y: r.y + r.h }, box, baseRot)
      return { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), width: Math.abs(p2.x - p1.x), height: Math.abs(p2.y - p1.y) }
    }
    for (const a of annots) {
      if (a.kind === 'whiteout') page.drawRectangle({ ...pdfRect(a), color: rgb(1, 1, 1), borderWidth: 0 })
      else if (a.kind === 'redact') page.drawRectangle({ ...pdfRect(a), color: rgb(0, 0, 0), borderWidth: 0 })
      else if (a.kind === 'highlight') page.drawRectangle({ ...pdfRect(a), color: rgb(1, 0.9, 0), opacity: 0.4, borderWidth: 0 })
      else if (a.kind === 'image') {
        // content drawn in the item's own upright frame, turned by its `rot` inside the box
        const img = await getAnnImage(a)
        const c = contentSize(a)
        const at = baseToPdf(contentToBase(a, { x: 0, y: c.h }), box, baseRot)
        page.drawImage(img, { x: at.x, y: at.y, width: c.w, height: c.h, rotate: degrees(normRot(baseRot - annRot(a))) })
      } else if (a.kind === 'text') {
        if (a.cover) {
          // "Edit text": paint over the original words first (base space, not turned, does not move with the text)
          const [r, g, b] = hexToRgb01(a.coverColor ?? '#ffffff')
          page.drawRectangle({ ...pdfRect(a.cover), color: rgb(r, g, b), borderWidth: 0 })
        }
        const font = await getFont(a.bold)
        const set = new Set(font.getCharacterSet())
        const [cr, cg, cb] = hexToRgb01(a.color)
        const turn = degrees(normRot(baseRot - annRot(a)))
        a.text.split('\n').forEach((raw, i) => {
          const line = Array.from(raw.replace(/\r/g, ''))
            .map((ch) => (set.has(ch.codePointAt(0) ?? 0) ? ch : '?'))
            .join('')
          if (!line.trim()) return
          const at = baseToPdf(
            contentToBase(a, { x: TEXT_PAD, y: TEXT_PAD + a.size * BASELINE + i * a.size * LINE_HEIGHT }),
            box,
            baseRot,
          )
          page.drawText(line, { x: at.x, y: at.y, size: a.size, font, color: rgb(cr, cg, cb), rotate: turn })
        })
      }
    }
  }

  /** Letter layout re-sheets the page; original layout adds the user rotation to /Rotate. */
  const finish = (page: PDFPage, baseRot: Rot, userRot: Rot) => {
    if (letter) resheet(lib, out, page, userRot)
    else if (userRot) page.setRotation(degrees((baseRot + userRot) % 360))
  }

  const total = pages.length
  for (let i = 0; i < total; i++) {
    const p = pages[i]
    const plan = plans[i]
    opts.onProgress?.(i, total)
    if (plan.mode === 'skip') continue

    if (plan.mode === 'raster') {
      const srcMeta = p.src.kind === 'pdf' ? opts.sources[p.src.sourceId] : undefined
      const d = displaySize(p.w, p.h, p.rotation)
      const scale = 2
      const fit = letter ? fitOnSheet(d.w, d.h) : null
      let doc: PDFDocumentProxy | undefined
      if (p.src.kind === 'pdf') {
        const s = await getSrc(p.src.sourceId)
        if (s.filled) doc = await getFilledJs(p.src.sourceId)
      }
      // letter: render at the size the content has on the sheet, so pixels per point stay the same
      const canvas = await renderPage(p, { width: Math.max(1, (fit ? fit.w : d.w) * scale), annotations: true, doc })
      const lossy = !!srcMeta?.rasterOnly
      const q = 0.92
      const blob = await canvasToBlob(canvas, lossy ? 'image/jpeg' : 'image/png', q)
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const img = lossy ? await out.embedJpg(bytes) : await out.embedPng(bytes)
      if (fit) {
        const page = out.addPage([LETTER.w, LETTER.h])
        page.drawImage(img, { x: fit.ox, y: fit.oy, width: fit.w, height: fit.h })
      } else {
        const page = out.addPage([d.w, d.h])
        page.drawImage(img, { x: 0, y: 0, width: d.w, height: d.h })
      }
      continue
    }

    if (plan.mode === 'vector') {
      const copy = copies.get(plan.sourceId)?.shift()
      if (!copy) throw new Error('A page could not be copied. Please try again.')
      const box = copy.getCropBox()
      const baseRot = normRot(copy.getRotation().angle)
      const page = out.addPage(copy)
      await stamp(page, p.annotations, { x: box.x, y: box.y, w: box.width, h: box.height }, baseRot)
      finish(page, baseRot, p.rotation)
    } else if (plan.mode === 'image' && p.src.kind === 'image') {
      const img = await getSrcImage(p.src.sourceId)
      const page = out.addPage([p.w, p.h])
      page.drawImage(img, { x: 0, y: 0, width: p.w, height: p.h })
      await stamp(page, p.annotations, { x: 0, y: 0, w: p.w, h: p.h }, 0)
      finish(page, 0, p.rotation)
    } else {
      const page = out.addPage([p.w, p.h])
      await stamp(page, p.annotations, { x: 0, y: 0, w: p.w, h: p.h }, 0)
      finish(page, 0, p.rotation)
    }
  }
  opts.onProgress?.(total, total)

  for (const pr of filledJs.values()) void pr.then((d) => d.loadingTask.destroy()).catch(() => undefined)
  if (out.getPageCount() === 0) throw new Error('None of the pages could be read.')
  // keep fillable forms fillable, and tidy references left behind by flattening (acroform.ts)
  dropDanglingAnnots(lib, out)
  if (!opts.flatten) registerForm(lib, out, () => out.embedStandardFont(lib.StandardFonts.Helvetica).ref)
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
