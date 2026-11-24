import { describe, expect, it } from 'vitest'
import { coverRect } from '../engine/render'
import { frameCmds, frameD } from '../engine/frames'
import { cropOf, fromFrameSpace, movePhoto, photoBox, scalePhoto, toFrameSpace, trimFrame, trimmedOnPage } from './cropMath'

const close = (a: number, b: number, e = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(e)

describe('photoBox matches the renderer', () => {
  for (const [iw, ih, w, h, fx, fy, z] of [
    [4000, 3000, 900, 260, 0.5, 0.45, 1],
    [1200, 1800, 400, 400, 0.2, 0.9, 1.7],
    [800, 800, 300, 500, 0.95, 0.05, 3],
  ]) {
    it(`${iw}x${ih} in ${w}x${h}, focus ${fx},${fy}, zoom ${z}`, () => {
      const P = photoBox(iw, ih, w, h, { x: fx, y: fy }, z)
      const r = coverRect(iw, ih, w, h, { x: fx, y: fy }, z)
      const k = w / r.sw // design px per source px
      close(P.x, -r.sx * k, 1e-6)
      close(P.y, -r.sy * k, 1e-6)
      close(P.w, iw * k, 1e-6)
      close(P.h, ih * k, 1e-6)
    })
  }
})

describe('cropOf round-trips', () => {
  it('focus + zoom → box → focus + zoom', () => {
    const P = photoBox(3000, 2000, 500, 300, { x: 0.3, y: 0.6 }, 1.8)
    const c = cropOf(P, 3000, 2000, 500, 300)
    const P2 = photoBox(3000, 2000, 500, 300, c.focus, c.zoom)
    close(P2.x, P.x, 0.05)
    close(P2.y, P.y, 0.05)
    close(P2.w, P.w, 0.05)
  })
})

describe('moving and resizing the photo', () => {
  const iw = 2000, ih = 1000, w = 400, h = 400
  const P0 = photoBox(iw, ih, w, h, { x: 0.5, y: 0.5 }, 1) // 800 x 400, x -200
  it('moves within the frame and stops at its edges', () => {
    const P = movePhoto(P0, 150, 50, w, h)
    expect(P.x).toBe(-50)
    expect(P.y).toBe(0) // can't leave a gap at the top
    expect(movePhoto(P0, 999, 0, w, h).x).toBe(0)
    expect(movePhoto(P0, -999, 0, w, h).x).toBe(w - P0.w)
  })
  it('scales from a corner around the opposite corner and never below covering', () => {
    const P = scalePhoto(P0, 'se', { x: P0.x + 1200, y: 0 }, iw, ih, w, h)
    close(P.w, 1200)
    close(P.h, 600)
    close(P.x, P0.x) // the top-left corner stayed put
    const small = scalePhoto(P0, 'se', { x: P0.x + 10, y: P0.y + 10 }, iw, ih, w, h)
    close(small.w, 800) // smallest that still covers
    expect(small.x).toBeLessThanOrEqual(0)
    expect(small.x + small.w).toBeGreaterThanOrEqual(w)
  })
})

describe('trimming the frame', () => {
  it('keeps the frame inside the photo and the photo still on the page', () => {
    const iw = 2000, ih = 1000, w = 400, h = 400
    const P = photoBox(iw, ih, w, h, { x: 0.5, y: 0.5 }, 1)
    const F = trimFrame(P, 'e', { x: 300, y: 0 }, w, h)
    expect(F).toEqual({ x: 0, y: 0, w: 300, h: 400 })
    const out = trimFrame(P, 'w', { x: -999, y: 0 }, w, h)
    expect(out.x).toBe(P.x) // stops at the photo's edge
    const tiny = trimFrame(P, 'e', { x: -50, y: 0 }, w, h, 16)
    expect(tiny.w).toBe(16)
  })
  it('places the trimmed frame on the page, turned and flipped', () => {
    for (const el of [
      { x: 100, y: 50, w: 400, h: 300, rotation: 0 },
      { x: 100, y: 50, w: 400, h: 300, rotation: 30 },
      { x: 100, y: 50, w: 400, h: 300, rotation: -75, flipX: true },
    ]) {
      const F = { x: 40, y: 20, w: 300, h: 200 }
      const box = trimmedOnPage(el, F)
      // the new frame's top-left (in its drawing space) is the same page point as (40, 20) in the old one
      const oldPt = fromFrameSpace(el, { x: F.x, y: F.y })
      const newPt = fromFrameSpace({ ...el, ...box }, { x: 0, y: 0 })
      close(newPt.x, oldPt.x, 1e-6)
      close(newPt.y, oldPt.y, 1e-6)
    }
  })
  it('page ↔ frame space round-trips', () => {
    const el = { x: 10, y: 20, w: 300, h: 150, rotation: 47, flipX: true }
    const q = toFrameSpace(el, fromFrameSpace(el, { x: 37, y: 91 }))
    close(q.x, 37)
    close(q.y, 91)
  })
})

describe('frame shapes', () => {
  it('every shape gives a closed outline inside (about) its box', () => {
    for (const s of ['rect', 'circle', 'arch', 'pill', 'hexagon', 'heart', 'blob'] as const) {
      const cmds = frameCmds(s, 200, 100, 12)
      expect(cmds[0][0]).toBe('M')
      expect(cmds[cmds.length - 1][0]).toBe('Z')
      expect(frameD(cmds)).toMatch(/^M/)
      const nums = cmds.flatMap((c) => c.slice(1) as number[])
      const xs = nums.filter((_, i) => i % 2 === 0)
      expect(Math.min(...xs)).toBeGreaterThan(-10)
      expect(Math.max(...xs)).toBeLessThan(210)
    }
  })
})
