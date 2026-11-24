/**
 * PURE helpers for the page editor's "Edit text" tool and for text items whose content is turned (rot).
 * No React, no DOM, no pdf libraries (textRuns.ts turns pdf.js text into RawText).
 *
 * Everything is in base space (see lib.ts). A "run" is one line of the page's own text, or one column's
 * part of it: what a click on the page picks up and replaces.
 */
import { type Annotation, type Pt, type Rect, type Rot, type TextAnn, BASELINE, TEXT_PAD, clamp, clampRectToPage, textBoxSize, uid } from './lib'
import { annRot, boxSizeFor, contentToBase } from './annot'

/** Shown (and used for sizing) while a text item is empty. */
export const TEXT_PLACEHOLDER = 'Type here'

/** Content size of a text item; an empty one is sized as its placeholder. */
export function textContentSize(text: string, size: number, bold: boolean): { w: number; h: number } {
  return textBoxSize(text.length ? text : TEXT_PLACEHOLDER, size, bold)
}

/** Move `a` so that its content-space point `local` lands on base-space point `target`. */
export function placeContent<T extends Annotation>(a: T, local: Pt, target: Pt): T {
  const q = contentToBase({ ...a, x: 0, y: 0 }, local)
  return { ...a, x: target.x - q.x, y: target.y - q.y }
}

/** New content size for a turned item, keeping its content's top-left corner where it is. */
export function resizeContent<T extends Annotation>(a: T, cw: number, ch: number): T {
  const anchor = contentToBase(a, { x: 0, y: 0 })
  const b = boxSizeFor(cw, ch, annRot(a))
  return placeContent({ ...a, w: b.w, h: b.h }, { x: 0, y: 0 }, anchor)
}

/* ------------------------------------------------------------ text runs */

/** One piece of the page's own text (a pdf.js text item) in base space. */
export interface RawText {
  text: string
  /** Direction of the text, clockwise in base space. */
  rot: Rot
  /** Baseline start and end. */
  start: Pt
  end: Pt
  /** Font size (base units). */
  size: number
  /** Reach above / below the baseline (base units, positive). */
  ascent: number
  descent: number
  bold: boolean
}

export interface TextRun {
  text: string
  rot: Rot
  /** Baseline start of the first character. */
  start: Pt
  size: number
  bold: boolean
  /** Bounds of the glyphs, base space. */
  rect: Rect
  /** Most characters could not be mapped to real letters (font without a Unicode map). */
  garbled: boolean
}

const DIR: Record<Rot, Pt> = { 0: { x: 1, y: 0 }, 90: { x: 0, y: 1 }, 180: { x: -1, y: 0 }, 270: { x: 0, y: -1 } }

/** Coordinates in the text's own frame: u along the baseline, v downwards across it. */
export function textFrame(p: Pt, rot: Rot): { u: number; v: number } {
  const d = DIR[rot]
  return { u: p.x * d.x + p.y * d.y, v: -p.x * d.y + p.y * d.x }
}

export function rawRect(r: RawText): Rect {
  const d = DIR[r.rot]
  const down = { x: -d.y, y: d.x }
  const pts = [r.start, r.end].flatMap((p) => [
    { x: p.x - down.x * r.ascent, y: p.y - down.y * r.ascent },
    { x: p.x + down.x * r.descent, y: p.y + down.y * r.descent },
  ])
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

// U+FFFD, private use and C0 controls: what pdf.js gives for glyphs it cannot map to letters
// eslint-disable-next-line no-control-regex
const GARBLED = /[�-\u0000-\u0008\u000E-\u001F]/g

export function garbledShare(text: string): number {
  const t = text.replace(/\s+/g, '')
  if (!t.length) return 0
  return (t.match(GARBLED)?.length ?? 0) / t.length
}

/**
 * Group pdf.js pieces into runs: same direction, baselines within 0.35 x the smaller size, next piece no more
 * than 2 x size further along (a wider gap is another column) and not drawn over the previous one. A space is put in when the gap looks like one.
 */
export function groupRuns(items: RawText[]): TextRun[] {
  const usable = items.filter((r) => r.text.trim().length > 0 && r.size > 0)
  const out: TextRun[] = []
  for (const rot of [0, 90, 180, 270] as Rot[]) {
    const mine = usable
      .filter((r) => r.rot === rot)
      .map((r) => {
        const s = textFrame(r.start, rot)
        const e = textFrame(r.end, rot)
        return { r, u0: Math.min(s.u, e.u), u1: Math.max(s.u, e.u), v: s.v }
      })
      .sort((a, b) => a.v - b.v || a.u0 - b.u0)
    // rows by baseline
    const rows: (typeof mine)[] = []
    for (const it of mine) {
      const row = rows[rows.length - 1]
      if (row && Math.abs(it.v - row[0].v) <= 0.35 * Math.min(it.r.size, row[0].r.size)) row.push(it)
      else rows.push([it])
    }
    for (const row of rows) {
      row.sort((a, b) => a.u0 - b.u0)
      let cur: { parts: typeof row; u1: number } | null = null
      const flush = () => {
        if (!cur) return
        const parts = cur.parts
        let text = ''
        let prevU1 = parts[0].u0
        let prevText = ''
        for (const p of parts) {
          const size = p.r.size
          const gap = p.u0 - prevU1
          if (text && gap > 0.15 * size && !/\s$/.test(prevText) && !/^\s/.test(p.r.text)) text += ' '
          text += p.r.text
          prevU1 = Math.max(prevU1, p.u1)
          prevText = p.r.text
        }
        const first = parts[0].r
        const boldChars = parts.reduce((n, p) => n + (p.r.bold ? p.r.text.length : 0), 0)
        out.push({
          text: text.replace(/\s+$/, '').replace(/^\s+/, ''),
          rot,
          start: first.start,
          size: Math.max(...parts.map((p) => p.r.size)),
          bold: boldChars * 2 > text.length,
          rect: parts.map((p) => rawRect(p.r)).reduce(unionRect),
          garbled: garbledShare(text) > 0.3,
        })
        cur = null
      }
      for (const it of row) {
        const size = it.r.size
        if (cur) {
          const last = cur.parts[cur.parts.length - 1]
          // the same words drawn twice a hair apart ("fake bold"): keep one
          if (it.r.text === last.r.text && Math.abs(it.u0 - last.u0) < 0.2 * size) continue
          // a wide gap is another column; pieces drawn over each other are separate too
          if (it.u0 - cur.u1 > 2 * size || it.u0 < cur.u1 - 0.3 * size) flush()
        }
        if (!cur) cur = { parts: [it], u1: it.u1 }
        else {
          cur.parts.push(it)
          cur.u1 = Math.max(cur.u1, it.u1)
        }
      }
      flush()
    }
  }
  return out.filter((r) => r.text.length > 0)
}

export function padRect(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }
}

export function rectContains(r: Rect, p: Pt): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

/** Index of the run under `p` (smallest one when several overlap), or -1. */
export function runIndexAt(runs: TextRun[], p: Pt, pad = 2): number {
  let best = -1
  let bestArea = Infinity
  runs.forEach((r, i) => {
    if (!rectContains(padRect(r.rect, pad), p)) return
    const area = r.rect.w * r.rect.h
    if (area < bestArea) {
      best = i
      bestArea = area
    }
  })
  return best
}

export function runAt(runs: TextRun[], p: Pt, pad = 2): TextRun | null {
  const i = runIndexAt(runs, p, pad)
  return i < 0 ? null : runs[i]
}

/** Share of `a`'s area that lies inside `b` (0..1). */
export function overlapShare(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0 || a.w <= 0 || a.h <= 0) return 0
  return (w * h) / (a.w * a.h)
}

/**
 * The text item that replaces a run: same words, size, weight and direction, its baseline on the original
 * baseline, and a cover (padded 1pt) over the original words in `coverColor`.
 */
export function replacementFor(run: TextRun, color: string, coverColor: string, pageW: number, pageH: number): TextAnn {
  const size = clamp(Math.round(run.size * 2) / 2, 4, 200)
  const cs = textContentSize(run.text, size, run.bold)
  const b = boxSizeFor(cs.w, cs.h, run.rot)
  const a: TextAnn = {
    id: uid('an'),
    kind: 'text',
    text: run.text,
    size,
    color,
    bold: run.bold,
    rot: run.rot,
    x: 0,
    y: 0,
    w: b.w,
    h: b.h,
    cover: clampRectToPage(padRect(run.rect, 1), pageW, pageH),
    coverColor,
  }
  return placeContent(a, { x: TEXT_PAD, y: TEXT_PAD + size * BASELINE }, run.start)
}

/* ------------------------------------------------------------- colours */

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Colours of a patch of page pixels (RGBA, w x h) that holds some text with a margin around it:
 * the cover is the commonest colour on the patch's edge, the text is the pixel furthest from it.
 */
export function sampleColors(data: ArrayLike<number>, w: number, h: number): { text: string; cover: string } {
  const fallback = { text: '#000000', cover: '#ffffff' }
  if (w < 1 || h < 1 || data.length < w * h * 4) return fallback
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  const add = (i: number) => {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    e.n += 1
    e.r += r
    e.g += g
    e.b += b
    buckets.set(key, e)
  }
  for (let x = 0; x < w; x++) {
    add(x * 4)
    add(((h - 1) * w + x) * 4)
  }
  for (let y = 1; y < h - 1; y++) {
    add(y * w * 4)
    add((y * w + w - 1) * 4)
  }
  let top = { n: 0, r: 255, g: 255, b: 255 }
  for (const e of buckets.values()) if (e.n > top.n) top = e
  const cr = top.n ? top.r / top.n : 255
  const cg = top.n ? top.g / top.n : 255
  const cb = top.n ? top.b / top.n : 255
  let far = -1
  let tr = 0
  let tg = 0
  let tb = 0
  for (let i = 0; i < w * h * 4; i += 4) {
    const d = (data[i] - cr) ** 2 + (data[i + 1] - cg) ** 2 + (data[i + 2] - cb) ** 2
    if (d > far) {
      far = d
      tr = data[i]
      tg = data[i + 1]
      tb = data[i + 2]
    }
  }
  // nothing stands out (text not drawn yet): plain black on the cover
  const text = far < 40 * 40 ? '#000000' : hex(tr, tg, tb)
  return { text, cover: hex(cr, cg, cb) }
}
