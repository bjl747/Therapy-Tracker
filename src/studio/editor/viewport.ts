// Viewport + handle math for the editor stage. Pure — unit tested.
//
// Two coordinate systems:
//   page   — design pixels, origin at the page's top-left (what the model stores)
//   screen — CSS pixels relative to the stage container's top-left
// screen = page * view.zoom + (view.x, view.y)

import { rotatePt, type Guide, type Pt, type Rect } from '../engine/geometry'

export interface View {
  /** screen px per design px */
  zoom: number
  /** where the page's top-left sits inside the stage (screen px) */
  x: number
  y: number
}

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 5
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]

export const clampZoom = (z: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))

export const toPage = (v: View, p: Pt): Pt => ({ x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom })
export const toScreen = (v: View, p: Pt): Pt => ({ x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y })

/** centre the page in the box, as large as fits inside the padding */
export function fitView(page: { w: number; h: number }, box: { w: number; h: number }, pad = 40): View {
  const aw = Math.max(40, box.w - pad * 2)
  const ah = Math.max(40, box.h - pad * 2)
  const zoom = clampZoom(Math.min(aw / page.w, ah / page.h))
  return { zoom, x: (box.w - page.w * zoom) / 2, y: (box.h - page.h * zoom) / 2 }
}

/** zoom to `zoom` keeping the page point under `cursor` (screen px) fixed */
export function zoomAround(v: View, zoom: number, cursor: Pt): View {
  const z = clampZoom(zoom)
  const k = z / v.zoom
  return { zoom: z, x: cursor.x - (cursor.x - v.x) * k, y: cursor.y - (cursor.y - v.y) * k }
}

/** next step up/down the zoom ladder */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const eps = 0.001
  if (dir > 0) return ZOOM_STEPS.find((s) => s > zoom + eps) ?? clampZoom(zoom * 1.25)
  return [...ZOOM_STEPS].reverse().find((s) => s < zoom - eps) ?? clampZoom(zoom / 1.25)
}

/** never let the page be dragged completely out of sight */
export function clampView(v: View, page: { w: number; h: number }, box: { w: number; h: number }, keep = 64): View {
  const pw = page.w * v.zoom
  const ph = page.h * v.zoom
  const kx = Math.min(keep, pw)
  const ky = Math.min(keep, ph)
  return {
    zoom: v.zoom,
    x: Math.min(box.w - kx, Math.max(kx - pw, v.x)),
    y: Math.min(box.h - ky, Math.max(ky - ph, v.y)),
  }
}

// ── selection frame + handles ───────────────────────────────

/** a (possibly rotated) box in page space */
export interface Frame {
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

export type HandleId = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'rot'

export interface HandlePos {
  id: HandleId
  /** screen px */
  x: number
  y: number
}

/** distance of the rotation handle below the frame (screen px) */
export const ROT_OFFSET = 26

const LOCAL: Record<Exclude<HandleId, 'rot'>, [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
}

export function handlePositions(f: Frame, v: View, ids: HandleId[]): HandlePos[] {
  const c = { x: f.x + f.w / 2, y: f.y + f.h / 2 }
  return ids.map((id) => {
    const local =
      id === 'rot'
        ? { x: f.x + f.w / 2, y: f.y + f.h + ROT_OFFSET / v.zoom }
        : { x: f.x + f.w * LOCAL[id][0], y: f.y + f.h * LOCAL[id][1] }
    const p = toScreen(v, f.rotation ? rotatePt(local, c, f.rotation) : local)
    return { id, x: p.x, y: p.y }
  })
}

/** a side needs this many screen px before it gets a mid-edge handle */
export const EDGE_MIN = 22

/** which handles a frame shows, given its on-screen size */
export function handlesFor(f: Frame, v: View, kind: 'box' | 'line' | 'multi'): HandleId[] {
  if (kind === 'line') return ['w', 'e', 'rot']
  const sw = f.w * v.zoom
  const sh = f.h * v.zoom
  const ids: HandleId[] = ['nw', 'ne', 'se', 'sw']
  if (kind === 'box') {
    if (sw >= EDGE_MIN) ids.push('n', 's')
    if (sh >= EDGE_MIN) ids.push('e', 'w')
  }
  ids.push('rot')
  return ids
}

/** closest handle within `tol` screen px (corners win ties over edges) */
export function hitHandle(handles: HandlePos[], p: Pt, tol: number): HandleId | null {
  let best: HandleId | null = null
  let bestD = Infinity
  for (const h of handles) {
    const d = Math.hypot(h.x - p.x, h.y - p.y) - (h.id.length === 2 ? 0.5 : 0)
    if (d <= tol && d < bestD) {
      bestD = d
      best = h.id
    }
  }
  return best
}

const BASE_ANGLE: Record<Exclude<HandleId, 'rot'>, number> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 }
const CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize']

/** CSS resize cursor for a handle on a rotated frame */
export function handleCursor(id: HandleId, rotation: number): string {
  if (id === 'rot') return 'grab'
  const a = (((BASE_ANGLE[id] + rotation) % 180) + 180) % 180
  return CURSORS[Math.round(a / 45) % 4]
}

// ── small numeric helpers ───────────────────────────────────

/** degrees normalised to (-180, 180] */
export function normDeg(d: number): number {
  let r = ((d % 360) + 360) % 360
  if (r > 180) r -= 360
  return Object.is(r, -0) ? 0 : r
}

/** snap an angle to multiples of `step`; with `soft`, only when within `soft` degrees */
export function snapAngle(deg: number, step: number, soft?: number): number {
  const s = Math.round(deg / step) * step
  if (soft === undefined) return s
  return Math.abs(s - deg) <= soft ? s : deg
}

export function angleOf(c: Pt, p: Pt): number {
  return (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI
}

/** nearest target within the threshold, or null */
export function snapCoord(value: number, targets: number[], threshold: number): number | null {
  let best: number | null = null
  let bestD = threshold
  for (const t of targets) {
    const d = Math.abs(t - value)
    if (d <= bestD) {
      bestD = d
      best = t
    }
  }
  return best
}

/** snap targets (page edges/centre + other boxes' edges/centres) on each axis */
export function snapTargets(others: Rect[], page: { w: number; h: number }): { xs: number[]; ys: number[] } {
  const xs = [0, page.w / 2, page.w]
  const ys = [0, page.h / 2, page.h]
  for (const o of others) {
    xs.push(o.x, o.x + o.w / 2, o.x + o.w)
    ys.push(o.y, o.y + o.h / 2, o.y + o.h)
  }
  return { xs, ys }
}

/** full-page guide lines for a snapped coordinate */
export function pageGuide(axis: 'x' | 'y', at: number, page: { w: number; h: number }): Guide {
  return { axis, at, from: 0, to: axis === 'x' ? page.h : page.w }
}

/** keep a floating box (toolbar, tooltip) inside the container */
export function clampBox(x: number, y: number, w: number, h: number, box: { w: number; h: number }, pad = 6): Pt {
  return {
    x: Math.max(pad, Math.min(box.w - w - pad, x)),
    y: Math.max(pad, Math.min(box.h - h - pad, y)),
  }
}

/** uniform scale of several boxes when their union `from` becomes `to` */
export function scaleInto<T extends { x: number; y: number; w: number; h: number }>(el: T, from: Rect, to: Rect): { x: number; y: number; w: number; h: number; s: number } {
  const s = to.w / from.w
  const cx = to.x + (el.x + el.w / 2 - from.x) * s
  const cy = to.y + (el.y + el.h / 2 - from.y) * s
  const w = el.w * s
  const h = el.h * s
  return { x: cx - w / 2, y: cy - h / 2, w, h, s }
}
