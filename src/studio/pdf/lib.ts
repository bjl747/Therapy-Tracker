/**
 * PURE logic for the PDF studio: no React, no DOM, no pdf libraries.
 * Everything here is unit tested in lib.test.ts.
 *
 * Coordinate conventions
 * - "Base space": the page as displayed at user-rotation 0, origin top-left,
 *   units = PDF points. `PageItem.w/h` is the size of base space. Annotations
 *   live in base space, so they rotate together with the page.
 * - "View space": base space after the user rotation (0/90/180/270 clockwise).
 */

export type Rot = 0 | 90 | 180 | 270

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface Pt {
  x: number
  y: number
}

interface AnnBase extends Rect {
  id: string
}
export interface TextAnn extends AnnBase {
  kind: 'text'
  text: string
  size: number
  color: string
  bold: boolean
}
export interface ImageAnn extends AnnBase {
  kind: 'image'
  dataUrl: string
  mime: 'image/png' | 'image/jpeg'
}
export interface BoxAnn extends AnnBase {
  kind: 'whiteout' | 'highlight' | 'redact'
}
export type Annotation = TextAnn | ImageAnn | BoxAnn

export type PageSrc =
  | { kind: 'pdf'; sourceId: string; index: number }
  | { kind: 'image'; sourceId: string }
  | { kind: 'blank' }

export interface PageItem {
  id: string
  src: PageSrc
  /** User rotation, added on top of the page's intrinsic rotation. */
  rotation: Rot
  /** Intrinsic /Rotate of the source page (0 for blank / image). */
  baseRot: Rot
  /** Size of base space in points (viewport at scale 1, rotation = baseRot). */
  w: number
  h: number
  annotations: Annotation[]
}

export const LETTER = { w: 612, h: 792 }

let counter = 0
export function uid(prefix = 'id'): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${counter.toString(36)}`
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function normRot(deg: number): Rot {
  const r = (((Math.round(deg / 90) * 90) % 360) + 360) % 360
  return r as Rot
}

export function rotateBy(rot: Rot, delta: number): Rot {
  return normRot(rot + delta)
}

/* ------------------------------------------------------------------ pages */

export function makeBlankPage(): PageItem {
  return { id: uid('pg'), src: { kind: 'blank' }, rotation: 0, baseRot: 0, w: LETTER.w, h: LETTER.h, annotations: [] }
}

/** Size as displayed after user rotation. */
export function displaySize(w: number, h: number, rot: Rot): { w: number; h: number } {
  return rot === 90 || rot === 270 ? { w: h, h: w } : { w, h }
}

export function rotatePages(pages: PageItem[], ids: Iterable<string>, delta: number): PageItem[] {
  const set = new Set(ids)
  return pages.map((p) => (set.has(p.id) ? { ...p, rotation: rotateBy(p.rotation, delta) } : p))
}

export function deletePages(pages: PageItem[], ids: Iterable<string>): PageItem[] {
  const set = new Set(ids)
  return pages.filter((p) => !set.has(p.id))
}

export function clonePage(p: PageItem): PageItem {
  return { ...p, id: uid('pg'), annotations: p.annotations.map((a) => ({ ...a, id: uid('an') })) }
}

/** Duplicate each selected page right after itself. Returns the new pages' ids. */
export function duplicatePages(pages: PageItem[], ids: Iterable<string>): { pages: PageItem[]; newIds: string[] } {
  const set = new Set(ids)
  const out: PageItem[] = []
  const newIds: string[] = []
  for (const p of pages) {
    out.push(p)
    if (set.has(p.id)) {
      const c = clonePage(p)
      out.push(c)
      newIds.push(c.id)
    }
  }
  return { pages: out, newIds }
}

/** Insert a page after the last selected page (or at the end). */
export function insertAfterSelection(pages: PageItem[], ids: Iterable<string>, page: PageItem): PageItem[] {
  const set = new Set(ids)
  let at = -1
  pages.forEach((p, i) => {
    if (set.has(p.id)) at = i
  })
  const out = pages.slice()
  out.splice(at < 0 ? out.length : at + 1, 0, page)
  return out
}

/**
 * Move the pages `ids` so they sit before original index `toIndex`
 * (0..pages.length). Moved pages keep their relative order.
 */
export function movePages(pages: PageItem[], ids: Iterable<string>, toIndex: number): PageItem[] {
  const set = new Set(ids)
  const moving: PageItem[] = []
  const rest: PageItem[] = []
  let before = 0
  pages.forEach((p, i) => {
    if (set.has(p.id)) {
      moving.push(p)
      if (i < toIndex) before += 1
    } else rest.push(p)
  })
  if (!moving.length) return pages
  const at = clamp(toIndex - before, 0, rest.length)
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)]
}

export function moveToEdge(pages: PageItem[], ids: Iterable<string>, edge: 'start' | 'end'): PageItem[] {
  return movePages(pages, ids, edge === 'start' ? 0 : pages.length)
}

export function sameOrder(a: PageItem[], b: PageItem[]): boolean {
  return a.length === b.length && a.every((p, i) => p === b[i])
}

/* -------------------------------------------------------------- selection */

export interface Sel {
  ids: string[]
  anchor: string | null
}
export const EMPTY_SEL: Sel = { ids: [], anchor: null }

export function rangeIds(order: string[], a: string, b: string): string[] {
  const i = order.indexOf(a)
  const j = order.indexOf(b)
  if (i < 0 || j < 0) return j >= 0 ? [order[j]] : []
  const [lo, hi] = i < j ? [i, j] : [j, i]
  return order.slice(lo, hi + 1)
}

export function clickSelect(sel: Sel, order: string[], id: string, mods: { shift?: boolean; toggle?: boolean }): Sel {
  if (mods.shift && sel.anchor && order.includes(sel.anchor)) {
    const range = rangeIds(order, sel.anchor, id)
    const ids = mods.toggle ? Array.from(new Set([...sel.ids, ...range])) : range
    return { ids: orderIds(order, ids), anchor: sel.anchor }
  }
  if (mods.toggle) {
    const has = sel.ids.includes(id)
    const ids = has ? sel.ids.filter((x) => x !== id) : [...sel.ids, id]
    return { ids: orderIds(order, ids), anchor: id }
  }
  return { ids: [id], anchor: id }
}

export function orderIds(order: string[], ids: string[]): string[] {
  const set = new Set(ids)
  return order.filter((id) => set.has(id))
}

export function selectAll(order: string[]): Sel {
  return { ids: order.slice(), anchor: order[0] ?? null }
}

export function pruneSelection(sel: Sel, order: string[]): Sel {
  const set = new Set(order)
  const ids = sel.ids.filter((id) => set.has(id))
  if (ids.length === sel.ids.length && (sel.anchor === null || set.has(sel.anchor))) return sel
  return { ids, anchor: sel.anchor && set.has(sel.anchor) ? sel.anchor : (ids[0] ?? null) }
}

/* ---------------------------------------------------------------- history */

export interface Hist<T> {
  past: T[]
  future: T[]
}
export const HISTORY_LIMIT = 100

export function emptyHist<T>(): Hist<T> {
  return { past: [], future: [] }
}
export function pushHist<T>(h: Hist<T>, present: T): Hist<T> {
  const past = [...h.past, present]
  if (past.length > HISTORY_LIMIT) past.shift()
  return { past, future: [] }
}
export function undoHist<T>(h: Hist<T>, present: T): { hist: Hist<T>; present: T } | null {
  if (!h.past.length) return null
  const prev = h.past[h.past.length - 1]
  return { hist: { past: h.past.slice(0, -1), future: [present, ...h.future] }, present: prev }
}
export function redoHist<T>(h: Hist<T>, present: T): { hist: Hist<T>; present: T } | null {
  if (!h.future.length) return null
  const [next, ...future] = h.future
  return { hist: { past: [...h.past, present], future }, present: next }
}

/* ------------------------------------------------------------------ split */

export function chunk<T>(items: T[], n: number): T[][] {
  const size = Math.max(1, Math.floor(n))
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export interface SplitPart {
  label: string
  ids: string[]
}

export function splitEveryN(pages: PageItem[], n: number): SplitPart[] {
  return chunk(pages, n).map((part, i) => ({ label: `part-${String(i + 1).padStart(2, '0')}`, ids: part.map((p) => p.id) }))
}

/** Group by source file (first-appearance order). Blank pages join the previous page's group. */
export function splitBySource(pages: PageItem[]): { sourceId: string | null; ids: string[] }[] {
  const groups: { sourceId: string | null; ids: string[] }[] = []
  const bySource = new Map<string, { sourceId: string | null; ids: string[] }>()
  let current: { sourceId: string | null; ids: string[] } | null = null
  const pending: string[] = []
  for (const p of pages) {
    const sid = p.src.kind === 'blank' ? null : p.src.sourceId
    if (sid === null) {
      if (current) current.ids.push(p.id)
      else pending.push(p.id)
      continue
    }
    let g = bySource.get(sid)
    if (!g) {
      g = { sourceId: sid, ids: [] }
      bySource.set(sid, g)
      groups.push(g)
    }
    if (pending.length) {
      g.ids.push(...pending)
      pending.length = 0
    }
    g.ids.push(p.id)
    current = g
  }
  if (!groups.length && pending.length) groups.push({ sourceId: null, ids: pending.slice() })
  return groups
}

/* -------------------------------------------------------------- coordinates */

/** Unrotated (w x h) page point -> rotated view point (clockwise `rot`). */
export function pageToView(p: Pt, w: number, h: number, rot: Rot): Pt {
  switch (rot) {
    case 90:
      return { x: h - p.y, y: p.x }
    case 180:
      return { x: w - p.x, y: h - p.y }
    case 270:
      return { x: p.y, y: w - p.x }
    default:
      return { x: p.x, y: p.y }
  }
}

/** Inverse of pageToView. */
export function viewToPage(p: Pt, w: number, h: number, rot: Rot): Pt {
  switch (rot) {
    case 90:
      return { x: p.y, y: h - p.x }
    case 180:
      return { x: w - p.x, y: h - p.y }
    case 270:
      return { x: w - p.y, y: p.x }
    default:
      return { x: p.x, y: p.y }
  }
}

/** Canvas 2D transform [a,b,c,d,e,f] drawing base space into the rotated view. */
export function rotationMatrix(w: number, h: number, rot: Rot): [number, number, number, number, number, number] {
  switch (rot) {
    case 90:
      return [0, 1, -1, 0, h, 0]
    case 180:
      return [-1, 0, 0, -1, w, h]
    case 270:
      return [0, -1, 1, 0, 0, w]
    default:
      return [1, 0, 0, 1, 0, 0]
  }
}

function boundsOf(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

export function rectToView(r: Rect, w: number, h: number, rot: Rot): Rect {
  return boundsOf(
    pageToView({ x: r.x, y: r.y }, w, h, rot),
    pageToView({ x: r.x + r.w, y: r.y + r.h }, w, h, rot),
  )
}
export function rectToPage(r: Rect, w: number, h: number, rot: Rot): Rect {
  return boundsOf(
    viewToPage({ x: r.x, y: r.y }, w, h, rot),
    viewToPage({ x: r.x + r.w, y: r.y + r.h }, w, h, rot),
  )
}

/**
 * Base-space point (page displayed at its intrinsic rotation `baseRot`) ->
 * PDF user space of a page whose crop box is (box.x, box.y, box.w, box.h).
 * `dw/dh` are the size of base space; the unrotated size is box.w/box.h.
 */
export function baseToPdf(p: Pt, box: Rect, baseRot: Rot): Pt {
  const u = viewToPage(p, box.w, box.h, baseRot)
  return { x: box.x + u.x, y: box.y + box.h - u.y }
}

export function clampRectToPage(r: Rect, w: number, h: number): Rect {
  const rw = Math.min(r.w, w)
  const rh = Math.min(r.h, h)
  return { x: clamp(r.x, 0, w - rw), y: clamp(r.y, 0, h - rh), w: rw, h: rh }
}

/* ------------------------------------------------------------- annotations */

export const TEXT_PAD = 2
export const LINE_HEIGHT = 1.2
/** First-baseline offset from the top of the box, in font-size units. */
export const BASELINE = 0.86

/** Approximate Helvetica box size for a text annotation (points). */
export function textBoxSize(text: string, size: number, bold: boolean): { w: number; h: number } {
  const lines = text.split('\n')
  const k = bold ? 0.58 : 0.54
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 1)
  return { w: Math.ceil(longest * size * k + TEXT_PAD * 2), h: Math.ceil(lines.length * size * LINE_HEIGHT + TEXT_PAD * 2) }
}

export function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [0, 0, 0]
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function hasRedaction(p: PageItem): boolean {
  return p.annotations.some((a) => a.kind === 'redact')
}

export function updateAnnotation(p: PageItem, id: string, patch: Partial<Annotation>): PageItem {
  return { ...p, annotations: p.annotations.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)) }
}

/* ------------------------------------------------------------------ misc */

export function baseName(name: string): string {
  return name.replace(/\.[a-z0-9]{1,5}$/i, '')
}

export function sanitizeFileName(name: string, fallback = 'document'): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').replace(/\s+/g, ' ').trim().replace(/\.pdf$/i, '')
  return (cleaned || fallback).slice(0, 120)
}

export function formatBytes(n: number): string {
  if (!isFinite(n) || n <= 0) return '0 KB'
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 2 : 1)} MB`
}

export interface SourceInfo {
  bytes: number
  pageCount: number
  kind: 'pdf' | 'image'
}

/** Rough output size estimate (bytes). Labelled as an estimate in the UI. */
export function estimateBytes(
  pages: PageItem[],
  sources: Record<string, SourceInfo | undefined>,
  compress: { quality: number } | null,
): number {
  let total = 1200
  for (const p of pages) {
    const area = p.w * p.h
    const annBytes = p.annotations.reduce((s, a) => s + (a.kind === 'image' ? a.dataUrl.length * 0.75 : 200), 0)
    if (compress) {
      const q = clamp(compress.quality, 0.1, 1)
      total += area * 2.25 * (0.06 + 0.45 * q * q)
      continue
    }
    if (hasRedaction(p)) {
      total += area * 4 * 0.12 + 20000
      continue
    }
    total += annBytes
    if (p.src.kind === 'blank') total += 700
    else {
      const s = sources[p.src.sourceId]
      if (s) total += s.kind === 'image' ? s.bytes : s.bytes / Math.max(1, s.pageCount)
    }
  }
  return Math.round(total)
}
