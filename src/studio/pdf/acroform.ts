/**
 * Keep fillable forms fillable.
 *
 * Pages are copied one file at a time into a brand-new document. copyPages brings each page's form widgets with it,
 * but the new document has no form of its own, so viewers draw the boxes without treating them as fields. After
 * every page is in place this registers the copied fields in a new /AcroForm, and tidies two things on the way:
 *  - annotation entries that point at objects that no longer exist (flattening leaves these behind), and
 *  - fields from different files that share a name (they would fill in together), which get a "_2", "_3" suffix.
 * Returns how many fields the packet carries.
 */
import type { PDFDict, PDFDocument, PDFRef } from 'pdf-lib'

type PdfLib = typeof import('pdf-lib')

/** Drop /Annots entries whose object is gone. Returns how many were dropped. */
export function dropDanglingAnnots(L: PdfLib, doc: PDFDocument): number {
  let dropped = 0
  for (const page of doc.getPages()) {
    const annots = page.node.Annots()
    if (!annots) continue
    for (let i = annots.size() - 1; i >= 0; i--) {
      const entry = annots.get(i)
      if (entry instanceof L.PDFRef && doc.context.lookup(entry) === undefined) {
        annots.remove(i)
        dropped++
      }
    }
  }
  return dropped
}

function fieldRoot(L: PdfLib, doc: PDFDocument, ref: PDFRef): PDFRef {
  let cur = ref
  for (let guard = 0; guard < 32; guard++) {
    const d = doc.context.lookup(cur, L.PDFDict)
    const parent = d?.get(L.PDFName.of('Parent'))
    if (!(parent instanceof L.PDFRef) || !doc.context.lookup(parent, L.PDFDict)) break
    cur = parent
  }
  return cur
}

export function registerForm(L: PdfLib, doc: PDFDocument, makeFont: () => PDFRef): number {
  const ctx = doc.context
  const roots = new Map<string, PDFRef>()
  for (const page of doc.getPages()) {
    const annots = page.node.Annots()
    if (!annots) continue
    for (let i = 0; i < annots.size(); i++) {
      const entry = annots.get(i)
      if (!(entry instanceof L.PDFRef)) continue
      const d = ctx.lookup(entry, L.PDFDict) as PDFDict | undefined
      if (!d || d.get(L.PDFName.of('Subtype')) !== L.PDFName.of('Widget')) continue
      const root = fieldRoot(L, doc, entry)
      roots.set(root.tag, root)
    }
  }
  if (!roots.size) return 0

  // a clash is two different top-level fields with the same name
  const seen = new Map<string, number>()
  for (const ref of roots.values()) {
    const d = ctx.lookup(ref, L.PDFDict)
    const t = d?.get(L.PDFName.of('T'))
    if (!d || !(t instanceof L.PDFString || t instanceof L.PDFHexString)) continue
    const name = t.decodeText()
    const n = (seen.get(name) ?? 0) + 1
    seen.set(name, n)
    if (n > 1) d.set(L.PDFName.of('T'), L.PDFHexString.fromText(`${name}_${n}`))
  }

  const acro = ctx.obj({
    Fields: Array.from(roots.values()),
    DA: L.PDFString.of('/Helv 0 Tf 0 g'),
    DR: ctx.obj({ Font: ctx.obj({ Helv: makeFont() }) }),
  })
  doc.catalog.set(L.PDFName.of('AcroForm'), ctx.register(acro))
  return roots.size
}
