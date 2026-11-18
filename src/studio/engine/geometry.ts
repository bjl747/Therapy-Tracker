// Geometry: rotated bounds, hit testing, marquee, snapping, align/distribute.
// Pure — unit tested.

import type { El } from './model'

export interface Pt {
  x: number
  y: number
}
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function rotatePt(p: Pt, c: Pt, deg: number): Pt {
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dx = p.x - c.x
  const dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}

export function corners(el: Pick<El, 'x' | 'y' | 'w' | 'h' | 'rotation'>): Pt[] {
  const c = { x: el.x + el.w / 2, y: el.y + el.h / 2 }
  const pts = [
    { x: el.x, y: el.y },
    { x: el.x + el.w, y: el.y },
    { x: el.x + el.w, y: el.y + el.h },
    { x: el.x, y: el.y + el.h },
  ]
  return el.rotation ? pts.map((p) => rotatePt(p, c, el.rotation)) : pts
}

/** axis-aligned bounds of a (possibly rotated) element */
export function aabb(el: Pick<El, 'x' | 'y' | 'w' | 'h' | 'rotation'>): Rect {
  const pts = corners(el)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

export function unionRect(rs: Rect[]): Rect | null {
  if (!rs.length) return null
  const x = Math.min(...rs.map((r) => r.x))
  const y = Math.min(...rs.map((r) => r.y))
  const x2 = Math.max(...rs.map((r) => r.x + r.w))
  const y2 = Math.max(...rs.map((r) => r.y + r.h))
  return { x, y, w: x2 - x, h: y2 - y }
}

/** point inside a rotated element (with tolerance for thin lines) */
export function hitEl(el: El, p: Pt, tol = 0): boolean {
  const c = { x: el.x + el.w / 2, y: el.y + el.h / 2 }
  const q = el.rotation ? rotatePt(p, c, -el.rotation) : p
  const t = Math.max(tol, el.type === 'shape' && el.shape === 'line' ? 8 : 0)
  return q.x >= el.x - t && q.x <= el.x + el.w + t && q.y >= el.y - t && q.y <= el.y + el.h + t
}

/** topmost visible element under the point */
export function hitTest(els: El[], p: Pt, tol = 0): El | null {
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i]
    if (!el.hidden && hitEl(el, p, tol)) return el
  }
  return null
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function normRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

// ── snapping ────────────────────────────────────────────────

export interface Guide {
  axis: 'x' | 'y'
  /** position on that axis (design px) */
  at: number
  from: number
  to: number
}

export interface SnapResult {
  dx: number
  dy: number
  guides: Guide[]
}

/**
 * Snap a moving box to the page (edges, centre) and to other elements'
 * edges/centres. Returns the correction to apply and the guides to draw.
 */
export function snapMove(moving: Rect, others: Rect[], page: { w: number; h: number }, threshold: number): SnapResult {
  const targetsX: { at: number; span: [number, number] }[] = [
    { at: 0, span: [0, page.h] },
    { at: page.w / 2, span: [0, page.h] },
    { at: page.w, span: [0, page.h] },
  ]
  const targetsY: { at: number; span: [number, number] }[] = [
    { at: 0, span: [0, page.w] },
    { at: page.h / 2, span: [0, page.w] },
    { at: page.h, span: [0, page.w] },
  ]
  for (const o of others) {
    for (const at of [o.x, o.x + o.w / 2, o.x + o.w]) targetsX.push({ at, span: [o.y, o.y + o.h] })
    for (const at of [o.y, o.y + o.h / 2, o.y + o.h]) targetsY.push({ at, span: [o.x, o.x + o.w] })
  }
  const mx = [moving.x, moving.x + moving.w / 2, moving.x + moving.w]
  const my = [moving.y, moving.y + moving.h / 2, moving.y + moving.h]
  let bestX: { d: number; at: number; span: [number, number] } | null = null
  for (const t of targetsX)
    for (const m of mx) {
      const d = t.at - m
      if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at: t.at, span: t.span }
    }
  let bestY: { d: number; at: number; span: [number, number] } | null = null
  for (const t of targetsY)
    for (const m of my) {
      const d = t.at - m
      if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at: t.at, span: t.span }
    }
  const guides: Guide[] = []
  const dx = bestX?.d ?? 0
  const dy = bestY?.d ?? 0
  if (bestX)
    guides.push({
      axis: 'x',
      at: bestX.at,
      from: Math.min(bestX.span[0], moving.y + dy),
      to: Math.max(bestX.span[1], moving.y + dy + moving.h),
    })
  if (bestY)
    guides.push({
      axis: 'y',
      at: bestY.at,
      from: Math.min(bestY.span[0], moving.x + dx),
      to: Math.max(bestY.span[1], moving.x + dx + moving.w),
    })
  return { dx, dy, guides }
}

// ── align / distribute (operate on axis-aligned bounds) ─────

export type AlignKind = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

/** returns {id: {dx, dy}} moves. One element aligns to the page. */
export function alignMoves(els: El[], kind: AlignKind, page: { w: number; h: number }): Record<string, Pt> {
  const boxes = els.map((e) => ({ id: e.id, r: aabb(e) }))
  const ref = boxes.length === 1 ? { x: 0, y: 0, w: page.w, h: page.h } : unionRect(boxes.map((b) => b.r))!
  const out: Record<string, Pt> = {}
  for (const { id, r } of boxes) {
    let dx = 0
    let dy = 0
    if (kind === 'left') dx = ref.x - r.x
    if (kind === 'hcenter') dx = ref.x + ref.w / 2 - (r.x + r.w / 2)
    if (kind === 'right') dx = ref.x + ref.w - (r.x + r.w)
    if (kind === 'top') dy = ref.y - r.y
    if (kind === 'vcenter') dy = ref.y + ref.h / 2 - (r.y + r.h / 2)
    if (kind === 'bottom') dy = ref.y + ref.h - (r.y + r.h)
    out[id] = { x: dx, y: dy }
  }
  return out
}

/** equal gaps between 3+ elements along an axis */
export function distributeMoves(els: El[], axis: 'x' | 'y'): Record<string, Pt> {
  const boxes = els.map((e) => ({ id: e.id, r: aabb(e) }))
  const out: Record<string, Pt> = {}
  if (boxes.length < 3) return out
  const key = axis === 'x' ? 'x' : 'y'
  const size = axis === 'x' ? 'w' : 'h'
  boxes.sort((a, b) => a.r[key] - b.r[key])
  const first = boxes[0].r
  const last = boxes[boxes.length - 1].r
  const total = boxes.reduce((s, b) => s + b.r[size], 0)
  const gap = (last[key] + last[size] - first[key] - total) / (boxes.length - 1)
  let cursor = first[key]
  for (const b of boxes) {
    const d = cursor - b.r[key]
    out[b.id] = axis === 'x' ? { x: d, y: 0 } : { x: 0, y: d }
    cursor += b.r[size] + gap
  }
  return out
}

/**
 * Resize from a handle in the element's local (unrotated) frame.
 * handle: n, s, e, w, ne, nw, se, sw. Keeps the opposite edge/corner fixed
 * in page space even when rotated. `keepRatio` for corner drags.
 */
export function resizeEl(
  el: Pick<El, 'x' | 'y' | 'w' | 'h' | 'rotation'>,
  handle: string,
  pointer: Pt,
  keepRatio: boolean,
  minSize = 4,
): { x: number; y: number; w: number; h: number } {
  const c = { x: el.x + el.w / 2, y: el.y + el.h / 2 }
  const local = rotatePt(pointer, c, -el.rotation)
  let x1 = el.x
  let y1 = el.y
  let x2 = el.x + el.w
  let y2 = el.y + el.h
  if (handle.includes('w')) x1 = Math.min(local.x, x2 - minSize)
  if (handle.includes('e')) x2 = Math.max(local.x, x1 + minSize)
  if (handle.includes('n')) y1 = Math.min(local.y, y2 - minSize)
  if (handle.includes('s')) y2 = Math.max(local.y, y1 + minSize)
  if (keepRatio && handle.length === 2) {
    const ratio = el.w / el.h
    const w = x2 - x1
    const h = y2 - y1
    if (w / h > ratio) {
      const nh = w / ratio
      if (handle.includes('n')) y1 = y2 - nh
      else y2 = y1 + nh
    } else {
      const nw = h * ratio
      if (handle.includes('w')) x1 = x2 - nw
      else x2 = x1 + nw
    }
  }
  // the fixed anchor (opposite of the handle) must stay put in page space
  const anchorLocal = {
    x: handle.includes('w') ? el.x + el.w : handle.includes('e') ? el.x : el.x + el.w / 2,
    y: handle.includes('n') ? el.y + el.h : handle.includes('s') ? el.y : el.y + el.h / 2,
  }
  const anchorPage = rotatePt(anchorLocal, c, el.rotation)
  const nw = x2 - x1
  const nh = y2 - y1
  const newAnchorLocal = {
    x: handle.includes('w') ? x2 : handle.includes('e') ? x1 : x1 + nw / 2,
    y: handle.includes('n') ? y2 : handle.includes('s') ? y1 : y1 + nh / 2,
  }
  const nc = { x: x1 + nw / 2, y: y1 + nh / 2 }
  const newAnchorPage = rotatePt(newAnchorLocal, nc, el.rotation)
  const sx = anchorPage.x - newAnchorPage.x
  const sy = anchorPage.y - newAnchorPage.y
  return { x: x1 + sx, y: y1 + sy, w: nw, h: nh }
}
