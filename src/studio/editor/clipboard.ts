// Internal element clipboard (pure). Copy keeps a deep snapshot; paste makes
// fresh ids, keeps groups together and decides where the copies land.

import { uid, type El } from '../engine/model'
import { aabb, unionRect, type Pt } from '../engine/geometry'

export interface ClipData {
  els: El[]
  /** page the elements were copied from */
  pageId: string
  /** how many times this clip has been pasted onto its source page */
  pastes: number
}

/** written to the system clipboard so a later paste knows our clip is the newest thing copied */
export const CLIP_MARKER = 'gqr-studio/elements'

export const PASTE_STEP = 24

export function copyEls(els: El[], pageId: string): ClipData {
  return { els: structuredClone(els), pageId, pastes: 0 }
}

/**
 * Offset for the n-th paste. Same page: cascade down-right by PASTE_STEP so
 * copies never sit exactly on top of each other. Another page: same place.
 * With `at` (context-menu / pointer paste): centred on that point.
 * The result is clamped so at least `keep` px of the group stays on the page.
 */
export function pasteOffset(
  clip: ClipData,
  target: { pageId: string; w: number; h: number },
  at?: Pt,
  keep = 16,
): Pt {
  const box = unionRect(clip.els.map(aabb))
  if (!box) return { x: 0, y: 0 }
  let dx: number
  let dy: number
  if (at) {
    dx = at.x - (box.x + box.w / 2)
    dy = at.y - (box.y + box.h / 2)
  } else if (target.pageId === clip.pageId) {
    dx = dy = PASTE_STEP * (clip.pastes + 1)
  } else {
    dx = dy = 0
  }
  const minDx = keep - (box.x + box.w)
  const maxDx = target.w - keep - box.x
  const minDy = keep - (box.y + box.h)
  const maxDy = target.h - keep - box.y
  return {
    x: Math.round(Math.max(minDx, Math.min(maxDx, dx))),
    y: Math.round(Math.max(minDy, Math.min(maxDy, dy))),
  }
}

/** fresh copies ready to append to a page (new ids, remapped groups, unlocked) */
export function pasteEls(clip: ClipData, target: { pageId: string; w: number; h: number }, at?: Pt): El[] {
  const off = pasteOffset(clip, target, at)
  const groups = new Map<string, string>()
  return clip.els.map((e) => {
    const c = { ...structuredClone(e), id: uid() }
    c.x += off.x
    c.y += off.y
    c.locked = false
    if (e.groupId) {
      if (!groups.has(e.groupId)) groups.set(e.groupId, uid('g'))
      c.groupId = groups.get(e.groupId)
    }
    return c
  })
}
