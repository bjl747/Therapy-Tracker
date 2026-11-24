// Crop inside a photo frame (BJ, 2026-11-19: "move and resize the photo inside it ... and also trims the frame").
// Pure math, tested in cropMath.test.ts (Studio repo).
//
// Everything is in the frame's own drawing space: (0,0)–(w,h) is the frame, before it is turned on the page and
// mirrored when the photo is flipped (the renderer draws the photo in that same space). The photo is a rectangle P in
// that space that always covers the frame. The design stores it as `focus` (the point of the photo at the frame's
// centre, 0..1) and `zoom` (1 = the photo just covers the frame), the same numbers every export already uses.

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** the smallest photo width that still covers a w × h frame */
const coverWidth = (iw: number, ih: number, w: number, h: number) => Math.max(w, (h * iw) / ih)

/** focus + zoom → the photo's rectangle (matches engine/render.ts coverRect, clamping included) */
export function photoBox(iw: number, ih: number, w: number, h: number, focus: { x: number; y: number }, zoom: number): Box {
  const pw = coverWidth(iw, ih, w, h) * Math.max(1, zoom)
  const ph = (pw * ih) / iw
  const x = Math.min(0, Math.max(w - pw, w / 2 - focus.x * pw))
  const y = Math.min(0, Math.max(h - ph, h / 2 - focus.y * ph))
  return { x, y, w: pw, h: ph }
}

/** the photo's rectangle → focus + zoom for the design */
export function cropOf(P: Box, iw: number, ih: number, w: number, h: number): { focus: { x: number; y: number }; zoom: number } {
  const r = (n: number) => Math.round(n * 10000) / 10000
  return {
    focus: { x: r((w / 2 - P.x) / P.w), y: r((h / 2 - P.y) / P.h) },
    zoom: r(Math.max(1, P.w / coverWidth(iw, ih, w, h))),
  }
}

/** keep the photo covering the frame (moves it, never resizes it) */
export function keepCovering(P: Box, w: number, h: number): Box {
  return { ...P, x: Math.min(0, Math.max(w - P.w, P.x)), y: Math.min(0, Math.max(h - P.h, P.y)) }
}

/** drag the photo by (dx, dy) */
export function movePhoto(P0: Box, dx: number, dy: number, w: number, h: number): Box {
  return keepCovering({ ...P0, x: P0.x + dx, y: P0.y + dy }, w, h)
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se'

/** drag a corner of the photo to `pt`: it grows or shrinks around the opposite corner, keeping its shape, never
 *  smaller than the frame and never more than `maxZoom` times the covering size */
export function scalePhoto(P0: Box, corner: Corner, pt: { x: number; y: number }, iw: number, ih: number, w: number, h: number, maxZoom = 10): Box {
  const ar = iw / ih
  const right = corner === 'ne' || corner === 'se'
  const down = corner === 'sw' || corner === 'se'
  const ax = right ? P0.x : P0.x + P0.w
  const ay = down ? P0.y : P0.y + P0.h
  const min = coverWidth(iw, ih, w, h)
  let pw = Math.max(Math.abs(pt.x - ax), Math.abs(pt.y - ay) * ar)
  pw = Math.min(min * maxZoom, Math.max(min, pw))
  const ph = pw / ar
  return keepCovering({ x: right ? ax : ax - pw, y: down ? ay : ay - ph, w: pw, h: ph }, w, h)
}

export type Edge = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

/** trim the frame by dragging an edge or corner to `pt`: the photo stays where it is on the page, the frame can't
 *  go past the photo's edges or get smaller than `minSize`. Returns the new frame, in the old frame's space. */
export function trimFrame(P: Box, edge: Edge, pt: { x: number; y: number }, w: number, h: number, minSize = 16): Box {
  let x0 = 0
  let y0 = 0
  let x1 = w
  let y1 = h
  if (edge.includes('w')) x0 = Math.min(x1 - minSize, Math.max(P.x, pt.x))
  if (edge.includes('e')) x1 = Math.max(x0 + minSize, Math.min(P.x + P.w, pt.x))
  if (edge.includes('n')) y0 = Math.min(y1 - minSize, Math.max(P.y, pt.y))
  if (edge.includes('s')) y1 = Math.max(y0 + minSize, Math.min(P.y + P.h, pt.y))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** where a trimmed frame lands on the page. `el` is the frame before the trim (page x / y / w / h, rotation in
 *  degrees, flipped or not); `F` is the new frame in its drawing space (from trimFrame). */
export function trimmedOnPage(el: { x: number; y: number; w: number; h: number; rotation: number; flipX?: boolean }, F: Box): Box {
  const lx = el.flipX ? el.w - (F.x + F.w) : F.x
  const dx = lx + F.w / 2 - el.w / 2
  const dy = F.y + F.h / 2 - el.h / 2
  const a = (el.rotation * Math.PI) / 180
  const cx = el.x + el.w / 2 + dx * Math.cos(a) - dy * Math.sin(a)
  const cy = el.y + el.h / 2 + dx * Math.sin(a) + dy * Math.cos(a)
  return { x: cx - F.w / 2, y: cy - F.h / 2, w: F.w, h: F.h }
}

/** page point → the frame's drawing space */
export function toFrameSpace(el: { x: number; y: number; w: number; h: number; rotation: number; flipX?: boolean }, p: { x: number; y: number }): { x: number; y: number } {
  const a = (-el.rotation * Math.PI) / 180
  const dx = p.x - (el.x + el.w / 2)
  const dy = p.y - (el.y + el.h / 2)
  const lx = dx * Math.cos(a) - dy * Math.sin(a) + el.w / 2
  const ly = dx * Math.sin(a) + dy * Math.cos(a) + el.h / 2
  return { x: el.flipX ? el.w - lx : lx, y: ly }
}

/** the frame's drawing space → page point */
export function fromFrameSpace(el: { x: number; y: number; w: number; h: number; rotation: number; flipX?: boolean }, q: { x: number; y: number }): { x: number; y: number } {
  const lx = (el.flipX ? el.w - q.x : q.x) - el.w / 2
  const ly = q.y - el.h / 2
  const a = (el.rotation * Math.PI) / 180
  return { x: el.x + el.w / 2 + lx * Math.cos(a) - ly * Math.sin(a), y: el.y + el.h / 2 + lx * Math.sin(a) + ly * Math.cos(a) }
}
