/**
 * pdfjs-dist setup + source byte registry.
 * pdfjs and pdf-lib are loaded lazily (dynamic import) so the hub's main
 * bundle never pays for them.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'

type PdfjsModule = typeof import('pdfjs-dist')

let pdfjsPromise: Promise<PdfjsModule> | null = null

export function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [mod, worker] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ])
      mod.GlobalWorkerOptions.workerSrc = worker.default
      return mod
    })()
    pdfjsPromise.catch(() => {
      pdfjsPromise = null
    })
  }
  return pdfjsPromise
}

export function loadPdfLib(): Promise<typeof import('pdf-lib')> {
  return import('pdf-lib')
}

/** Source bytes are held exactly once, here. The store only keeps metadata. */
const sourceBytes = new Map<string, Uint8Array>()
const sourceMime = new Map<string, string>()
export function putSourceBytes(id: string, bytes: Uint8Array, mime = 'application/pdf'): void {
  sourceBytes.set(id, bytes)
  sourceMime.set(id, mime)
}
export function getSourceMime(id: string): string {
  return sourceMime.get(id) ?? 'application/pdf'
}
export function getSourceBytes(id: string): Uint8Array | undefined {
  return sourceBytes.get(id)
}

const docCache = new Map<string, Promise<PDFDocumentProxy>>()

/** Open a pdfjs document from bytes. pdfjs transfers its buffer, so it gets a copy. */
export async function openPdfjsDoc(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({ data: bytes.slice() })
  return task.promise
}

export function getPdfDoc(sourceId: string): Promise<PDFDocumentProxy> {
  let p = docCache.get(sourceId)
  if (!p) {
    const bytes = sourceBytes.get(sourceId)
    if (!bytes) return Promise.reject(new Error('Source is no longer in memory'))
    p = openPdfjsDoc(bytes)
    p.catch(() => docCache.delete(sourceId))
    docCache.set(sourceId, p)
  }
  return p
}

export function forgetSource(sourceId: string): void {
  sourceBytes.delete(sourceId)
  sourceMime.delete(sourceId)
  const p = docCache.get(sourceId)
  docCache.delete(sourceId)
  void p?.then((d) => d.loadingTask.destroy()).catch(() => undefined)
}

export function friendlyPdfError(err: unknown): string {
  const name = (err as { name?: string } | null)?.name ?? ''
  const msg = String((err as { message?: string } | null)?.message ?? err)
  if (name === 'PasswordException') return 'It is password protected and needs a password to open.'
  if (name === 'InvalidPDFException' || /invalid pdf|not a pdf|no pdf header/i.test(msg)) return 'It does not look like a valid PDF.'
  if (/encrypt/i.test(msg)) return 'It is encrypted in a way this tool cannot read.'
  return 'It could not be read (the file may be damaged).'
}
