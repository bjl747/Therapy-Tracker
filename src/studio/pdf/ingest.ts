/** Reads dropped / picked files into the store. Everything stays in the browser. */
import type { PDFDocument } from 'pdf-lib'
import { type PageItem, type Rot, LETTER, normRot, uid } from './lib'
import { friendlyPdfError, loadPdfLib, openPdfjsDoc, putSourceBytes } from './pdfjs'
import { type FormField, type SourceMeta, usePdfStudio } from './store'

export const ACCEPT = 'application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp'

type Kind = 'pdf' | 'image' | null
function kindOf(f: File): Kind {
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) return 'pdf'
  if (/^image\/(png|jpeg|webp)$/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name)) return 'image'
  return null
}

export async function ingestFiles(files: File[]): Promise<void> {
  const store = usePdfStudio.getState()
  for (const file of files) {
    const kind = kindOf(file)
    if (!kind) {
      store.notify('error', `"${file.name}" is not a PDF or a PNG / JPG / WebP image, so it was skipped.`)
      continue
    }
    store.setLoading(1)
    try {
      if (kind === 'pdf') await ingestPdf(file)
      else await ingestImage(file)
    } catch (err) {
      store.notify('error', `Could not open "${file.name}". ${kind === 'pdf' ? friendlyPdfError(err) : 'The image could not be decoded.'}`)
    } finally {
      store.setLoading(-1)
    }
  }
}

function readFields(doc: PDFDocument, pdfLib: typeof import('pdf-lib')): FormField[] {
  const out: FormField[] = []
  try {
    const form = doc.getForm()
    for (const f of form.getFields()) {
      const name = f.getName()
      const readOnly = f.isReadOnly()
      if (f instanceof pdfLib.PDFTextField) {
        out.push({ name, type: 'text', value: f.getText() ?? '', multiline: f.isMultiline(), readOnly })
      } else if (f instanceof pdfLib.PDFCheckBox) {
        out.push({ name, type: 'checkbox', value: f.isChecked(), readOnly })
      } else if (f instanceof pdfLib.PDFDropdown) {
        out.push({ name, type: 'dropdown', value: f.getSelected()[0] ?? '', options: f.getOptions(), readOnly })
      } else if (f instanceof pdfLib.PDFRadioGroup) {
        out.push({ name, type: 'radio', value: f.getSelected() ?? '', options: f.getOptions(), readOnly })
      }
    }
  } catch {
    /* no usable form */
  }
  return out
}

async function ingestPdf(file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const id = uid('src')
  const pdfLib = await loadPdfLib()

  let lib: PDFDocument | null = null
  try {
    lib = await pdfLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false })
  } catch {
    lib = null
  }

  const sizes: { w: number; h: number; rot: Rot }[] = []
  let renderable = true
  try {
    const doc = await openPdfjsDoc(bytes)
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i)
      const vp = pg.getViewport({ scale: 1 })
      sizes.push({ w: vp.width, h: vp.height, rot: normRot(pg.rotate) })
      pg.cleanup()
    }
    await doc.loadingTask.destroy()
  } catch (err) {
    if ((err as { name?: string })?.name === 'PasswordException' || !lib) throw err
    renderable = false
    sizes.length = 0
    for (const p of lib.getPages()) {
      const box = p.getCropBox()
      const rot = normRot(p.getRotation().angle)
      const swap = rot === 90 || rot === 270
      sizes.push({ w: swap ? box.height : box.width, h: swap ? box.width : box.height, rot })
    }
  }
  if (!sizes.length) throw new Error('No pages')

  const meta: SourceMeta = {
    id,
    name: file.name,
    kind: 'pdf',
    bytes: bytes.byteLength,
    pageCount: sizes.length,
    renderable,
    rasterOnly: !lib || lib.isEncrypted,
    fields: lib && !lib.isEncrypted ? readFields(lib, pdfLib) : [],
  }
  putSourceBytes(id, bytes, 'application/pdf')
  const pages: PageItem[] = sizes.map((s, index) => ({
    id: uid('pg'),
    src: { kind: 'pdf', sourceId: id, index },
    rotation: 0,
    baseRot: s.rot,
    w: s.w,
    h: s.h,
    annotations: [],
  }))
  usePdfStudio.getState().addSource(meta, pages)
  if (meta.rasterOnly) {
    usePdfStudio
      .getState()
      .notify('info', `"${file.name}" is encrypted or non-standard. Its pages will be exported as images so they stay readable.`)
  }
}

function decode(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode'))
    img.src = url
  })
}

async function ingestImage(file: File): Promise<void> {
  const raw = new Uint8Array(await file.arrayBuffer())
  const url = URL.createObjectURL(new Blob([raw.slice()], { type: file.type || 'image/png' }))
  try {
    const img = await decode(url)
    let bytes = raw
    let mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      // WebP etc.: pdf-lib only embeds PNG / JPEG, so convert once here.
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      c.getContext('2d')?.drawImage(img, 0, 0)
      const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/png'))
      if (!blob) throw new Error('convert')
      bytes = new Uint8Array(await blob.arrayBuffer())
      mime = 'image/png'
    }
    const s = Math.min(LETTER.w / img.naturalWidth, LETTER.h / img.naturalHeight)
    const id = uid('src')
    putSourceBytes(id, bytes, mime)
    const meta: SourceMeta = {
      id,
      name: file.name,
      kind: 'image',
      bytes: bytes.byteLength,
      pageCount: 1,
      renderable: true,
      rasterOnly: false,
      fields: [],
    }
    usePdfStudio.getState().addSource(meta, [
      {
        id: uid('pg'),
        src: { kind: 'image', sourceId: id },
        rotation: 0,
        baseRot: 0,
        w: img.naturalWidth * s,
        h: img.naturalHeight * s,
        annotations: [],
      },
    ])
  } finally {
    URL.revokeObjectURL(url)
  }
}
