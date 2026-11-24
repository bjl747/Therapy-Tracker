/**
 * Strip what a copied page could make the READER's PDF viewer do (security review 2026-11-19, F1).
 * Pages copied with copyPages keep their annotations, and with them any actions. Candidate files are outside
 * files, so before a page goes into a packet sent to a client this keeps only:
 *  - links to web pages and email (`http:`, `https:`, `mailto:`), links within the document (GoTo) and
 *    viewer commands such as "next page" (Named);
 * and removes:
 *  - every other action (JavaScript, Launch, GoToR / GoToE, SubmitForm, ImportData, Rendition, ...), action
 *    chains (/Next), and "additional actions" (/AA) on the page, its annotations and their form fields;
 *  - annotations that carry or play content: file attachments, sound, movie, screen, rich media, 3D.
 * Returns how many things were removed. Safe to run twice on the same page (duplicates share annotations).
 */
import type { PDFDict, PDFObject, PDFPage } from 'pdf-lib'

type PdfLib = typeof import('pdf-lib')

const SAFE_SCHEMES = /^(https?:|mailto:)/i
const DROP_SUBTYPES = ['FileAttachment', 'Sound', 'Movie', 'Screen', 'RichMedia', '3D']

function text(L: PdfLib, o: unknown): string | null {
  if (o instanceof L.PDFString || o instanceof L.PDFHexString) return o.decodeText()
  return null
}

/** True for an action PDF Studio lets through. */
export function isSafeAction(L: PdfLib, action: PDFDict): boolean {
  const s = action.lookup(L.PDFName.of('S'))
  if (s === L.PDFName.of('GoTo') || s === L.PDFName.of('Named')) return true
  if (s === L.PDFName.of('URI')) {
    const uri = text(L, action.lookup(L.PDFName.of('URI')))
    return uri !== null && SAFE_SCHEMES.test(uri.trim())
  }
  return false
}

/** Remove /AA, and /A unless it is safe (a safe one loses its /Next chain). */
function cleanDict(L: PdfLib, d: PDFDict): number {
  let n = 0
  const AA = L.PDFName.of('AA')
  const A = L.PDFName.of('A')
  if (d.has(AA)) {
    d.delete(AA)
    n++
  }
  if (d.has(A)) {
    const a = d.lookup(A)
    if (a instanceof L.PDFDict && isSafeAction(L, a)) {
      const next = L.PDFName.of('Next')
      if (a.has(next)) {
        a.delete(next)
        n++
      }
    } else {
      d.delete(A)
      n++
    }
  }
  return n
}

export function stripUnsafeActions(L: PdfLib, page: PDFPage): number {
  let n = cleanDict(L, page.node)
  const annots = page.node.Annots()
  if (!annots) return n
  const keep: PDFObject[] = []
  const seen = new Set<PDFDict>()
  for (let i = 0; i < annots.size(); i++) {
    const ref = annots.get(i)
    const a = annots.lookup(i)
    if (!(a instanceof L.PDFDict)) {
      keep.push(ref)
      continue
    }
    const sub = a.lookup(L.PDFName.of('Subtype'))
    if (DROP_SUBTYPES.some((s) => sub === L.PDFName.of(s))) {
      n++
      continue
    }
    keep.push(ref)
    n += cleanDict(L, a)
    // form-field widgets: the field itself (and its parents) can hold actions too
    let parent = a.lookup(L.PDFName.of('Parent'))
    for (let depth = 0; parent instanceof L.PDFDict && !seen.has(parent) && depth < 32; depth++) {
      seen.add(parent)
      n += cleanDict(L, parent)
      parent = parent.lookup(L.PDFName.of('Parent'))
    }
  }
  if (keep.length !== annots.size()) {
    page.node.set(L.PDFName.of('Annots'), page.doc.context.obj(keep))
  }
  return n
}
