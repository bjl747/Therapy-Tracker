/**
 * PURE helpers for annotations whose content is turned inside its box (TextAnn / ImageAnn `rot`).
 *
 * The box (x, y, w, h) is in base space like every annotation. `rot` is how far the content is turned
 * clockwise relative to base space, so an item added upright on a page the user rotated by R gets
 * rot = normRot(-R) and reads upright on screen and in the export.
 * "Content space": the item's own upright frame, origin top-left, size contentSize(a).
 */
import { type Annotation, type Pt, type Rot, normRot } from './lib'

export function annRot(a: Annotation): Rot {
  return a.kind === 'text' || a.kind === 'image' ? (a.rot ?? 0) : 0
}

/** Size of the content in its own upright frame (w/h swapped for 90 / 270). */
export function contentSize(a: Annotation): { w: number; h: number } {
  const r = annRot(a)
  return r === 90 || r === 270 ? { w: a.h, h: a.w } : { w: a.w, h: a.h }
}

/** Box size (base space) for content of size cw x ch turned by rot. */
export function boxSizeFor(cw: number, ch: number, rot: Rot): { w: number; h: number } {
  return rot === 90 || rot === 270 ? { w: ch, h: cw } : { w: cw, h: ch }
}

/** Content-space point -> base-space point (rotates about the box centre). */
export function contentToBase(a: Annotation, p: Pt): Pt {
  const r = annRot(a)
  const c = contentSize(a)
  // centre-relative in content space
  const dx = p.x - c.w / 2
  const dy = p.y - c.h / 2
  // clockwise turn by r in a y-down frame: (x, y) -> (-y, x) for 90
  let rx = dx
  let ry = dy
  if (r === 90) {
    rx = -dy
    ry = dx
  } else if (r === 180) {
    rx = -dx
    ry = -dy
  } else if (r === 270) {
    rx = dy
    ry = -dx
  }
  return { x: a.x + a.w / 2 + rx, y: a.y + a.h / 2 + ry }
}

/** Rotation that makes new content upright on a page shown at user rotation `pageRot`. */
export function uprightRot(pageRot: Rot): Rot {
  return normRot(-pageRot)
}
