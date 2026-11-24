/**
 * "Edit text": reads a PDF page's own text with pdf.js and turns it into runs (lines) in base space.
 * Grouping and hit-testing are pure (textGroup.ts); this file only talks to pdf.js.
 */
import type { PDFPageProxy } from 'pdfjs-dist'
import { type PageItem, normRot } from './lib'
import { getPdfDoc } from './pdfjs'
import { type RawText, type TextRun, groupRuns } from './textGroup'

export type RunsReason = 'image-page' | 'blank-page' | 'no-text' | 'unreadable' | 'error'
export type RunsResult = { ok: true; runs: TextRun[] } | { ok: false; reason: RunsReason }

/** What to tell the user when a page has nothing "Edit text" can pick up. */
export function runsMessage(reason: RunsReason): string {
  switch (reason) {
    case 'image-page':
      return "This page is a picture (a scan or photo), so its words can't be picked up. Use White-out, then Add text, to retype something."
    case 'blank-page':
      return 'This page is blank. Use Add text to type on it.'
    case 'no-text':
      return "This page has no text to pick up (it is probably a scan). Use White-out, then Add text, to retype something."
    case 'unreadable':
      return "This page's font can't be read back reliably. Use White-out, then Add text, to retype it."
    default:
      return "This page's text could not be read. Use White-out, then Add text, to retype something."
  }
}

type M = [number, number, number, number, number, number]
function mul(a: M, b: M): M {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

const BOLD = /bold|black|heavy|semibold|demi/i

function isBold(pg: PDFPageProxy, fontName: string, family: string | undefined): boolean {
  if (family && BOLD.test(family)) return true
  try {
    const objs = (pg as unknown as { commonObjs?: { has(id: string): boolean; get(id: string): unknown } }).commonObjs
    if (objs?.has(fontName)) {
      const f = objs.get(fontName) as { name?: string; bold?: boolean; black?: boolean } | null
      if (f && (f.bold || f.black || (f.name && BOLD.test(f.name)))) return true
    }
  } catch {
    /* font not loaded: regular */
  }
  return false
}

/** The page's text as runs in base space (pdf.js viewport at scale 1 and the page's own rotation). */
export async function runsFromPdfPage(pg: PDFPageProxy): Promise<RunsResult> {
  const vp = pg.getViewport({ scale: 1 })
  const tc = await pg.getTextContent()
  // loads the page's fonts, so their real names (and so bold) are known; the editor renders the page anyway
  try {
    await pg.getOperatorList()
  } catch {
    /* names stay unknown */
  }
  const raw: RawText[] = []
  for (const it of tc.items) {
    if (!('str' in it) || !it.str.trim()) continue
    const style = tc.styles[it.fontName] as { fontFamily?: string; ascent?: number; descent?: number; vertical?: boolean } | undefined
    if (style?.vertical) continue
    const m = mul(vp.transform as M, it.transform as M)
    const len = Math.hypot(m[0], m[1])
    const size = Math.hypot(m[2], m[3])
    if (!len || !size) continue
    const ang = (Math.atan2(m[1], m[0]) * 180) / Math.PI
    const snapped = Math.round(ang / 90) * 90
    if (Math.abs(ang - snapped) > 2) continue // slanted text: not editable
    const ux = m[0] / len
    const uy = m[1] / len
    const start = { x: m[4], y: m[5] }
    const width = it.width * vp.scale
    const asc = style?.ascent && style.ascent > 0.4 && style.ascent < 1.2 ? style.ascent : 0.8
    const desc = style?.descent && Math.abs(style.descent) > 0.05 && Math.abs(style.descent) < 0.5 ? Math.abs(style.descent) : 0.2
    raw.push({
      text: it.str,
      rot: normRot(snapped),
      start,
      end: { x: start.x + ux * width, y: start.y + uy * width },
      size,
      ascent: asc * size,
      descent: desc * size,
      bold: isBold(pg, it.fontName, style?.fontFamily),
    })
  }
  if (!raw.length) return { ok: false, reason: 'no-text' }
  const runs = groupRuns(raw)
  if (!runs.length) return { ok: false, reason: 'no-text' }
  if (runs.every((r) => r.garbled)) return { ok: false, reason: 'unreadable' }
  return { ok: true, runs }
}

const cache = new Map<string, Promise<RunsResult>>()

export function getTextRuns(page: PageItem): Promise<RunsResult> {
  if (page.src.kind === 'image') return Promise.resolve({ ok: false, reason: 'image-page' })
  if (page.src.kind === 'blank') return Promise.resolve({ ok: false, reason: 'blank-page' })
  const { sourceId, index } = page.src
  const key = `${sourceId}:${index}`
  let p = cache.get(key)
  if (!p) {
    p = getPdfDoc(sourceId)
      .then((doc) => doc.getPage(index + 1))
      .then((pg) => runsFromPdfPage(pg))
      .catch((): RunsResult => {
        cache.delete(key)
        return { ok: false, reason: 'error' }
      })
    cache.set(key, p)
  }
  return p
}
