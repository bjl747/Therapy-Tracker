import { describe, expect, it } from 'vitest'
import { shape } from './model'
import { aabb, alignMoves, corners, distributeMoves, hitEl, hitTest, intersects, normRect, resizeEl, rotatePt, snapMove, unionRect } from './geometry'

const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps)

describe('rotation + bounds', () => {
  it('rotates a point clockwise in screen space', () => {
    const p = rotatePt({ x: 10, y: 0 }, { x: 0, y: 0 }, 90)
    near(p.x, 0)
    near(p.y, 10)
  })
  it('aabb of a 90° rotated box swaps width and height around the centre', () => {
    const b = aabb({ x: 0, y: 0, w: 200, h: 100, rotation: 90 })
    near(b.w, 100)
    near(b.h, 200)
    near(b.x, 50)
    near(b.y, -50)
  })
  it('corners of an unrotated box are its corners', () => {
    expect(corners({ x: 1, y: 2, w: 3, h: 4, rotation: 0 })).toEqual([
      { x: 1, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 6 },
      { x: 1, y: 6 },
    ])
  })
  it('unionRect / intersects / normRect', () => {
    expect(unionRect([])).toBeNull()
    expect(unionRect([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 10, h: 10 }])).toEqual({ x: 0, y: 0, w: 30, h: 15 })
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 5, h: 5 })).toBe(true)
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBe(false)
    expect(normRect({ x: 10, y: 10 }, { x: 4, y: 20 })).toEqual({ x: 4, y: 10, w: 6, h: 10 })
  })
})

describe('hit testing', () => {
  const a = shape('rect', { id: 'a', x: 0, y: 0, w: 100, h: 100 })
  const b = shape('rect', { id: 'b', x: 50, y: 50, w: 100, h: 100 })
  it('returns the topmost element, skipping hidden ones', () => {
    expect(hitTest([a, b], { x: 75, y: 75 })?.id).toBe('b')
    expect(hitTest([a, { ...b, hidden: true }], { x: 75, y: 75 })?.id).toBe('a')
    expect(hitTest([a, b], { x: 500, y: 500 })).toBeNull()
  })
  it('respects rotation', () => {
    const r = shape('rect', { x: 0, y: 40, w: 100, h: 20, rotation: 90 })
    expect(hitEl(r, { x: 50, y: 5 })).toBe(true) // inside the rotated bar
    expect(hitEl(r, { x: 5, y: 50 })).toBe(false) // inside only the unrotated one
  })
  it('gives thin lines a grab tolerance', () => {
    const line = shape('line', { x: 0, y: 100, w: 200, h: 2 })
    expect(hitEl(line, { x: 100, y: 106 })).toBe(true)
    expect(hitEl(line, { x: 100, y: 120 })).toBe(false)
  })
})

describe('snapMove', () => {
  const page = { w: 1000, h: 1000 }
  it('snaps the centre to the page centre and reports a guide', () => {
    const r = snapMove({ x: 397, y: 300, w: 200, h: 100 }, [], page, 6)
    expect(r.dx).toBe(3)
    expect(r.dy).toBe(0)
    expect(r.guides).toHaveLength(1)
    expect(r.guides[0]).toMatchObject({ axis: 'x', at: 500 })
  })
  it('snaps edges to other elements and picks the nearest target', () => {
    const r = snapMove({ x: 304, y: 95, w: 100, h: 50 }, [{ x: 100, y: 100, w: 200, h: 80 }], page, 6)
    expect(r.dx).toBe(-4) // left edge → other's right edge (300)
    expect(r.dy).toBe(5) // top → other's top (100)
    expect(r.guides.map((g) => g.axis).sort()).toEqual(['x', 'y'])
  })
  it('does nothing outside the threshold', () => {
    expect(snapMove({ x: 123, y: 217, w: 50, h: 50 }, [], page, 6)).toEqual({ dx: 0, dy: 0, guides: [] })
  })
})

describe('align / distribute', () => {
  const page = { w: 1000, h: 800 }
  it('aligns a single element to the page', () => {
    const el = shape('rect', { id: 'a', x: 10, y: 10, w: 100, h: 50 })
    expect(alignMoves([el], 'hcenter', page).a).toEqual({ x: 440, y: 0 })
    expect(alignMoves([el], 'bottom', page).a).toEqual({ x: 0, y: 740 })
  })
  it('aligns several elements to their union', () => {
    const a = shape('rect', { id: 'a', x: 10, y: 0, w: 100, h: 50 })
    const b = shape('rect', { id: 'b', x: 300, y: 0, w: 50, h: 50 })
    const m = alignMoves([a, b], 'right', page)
    expect(m.a.x).toBe(240)
    expect(m.b.x).toBe(0)
  })
  it('distributes with equal gaps', () => {
    const els = [0, 110, 400].map((x, i) => shape('rect', { id: `e${i}`, x, y: 0, w: 100, h: 10 }))
    const m = distributeMoves(els, 'x')
    expect(m.e0.x).toBe(0)
    expect(m.e1.x).toBe(90) // 110 → 200: gaps of 100 on both sides
    expect(m.e2.x).toBe(0)
    expect(distributeMoves(els.slice(0, 2), 'x')).toEqual({})
  })
})

describe('resizeEl', () => {
  const el = { x: 100, y: 100, w: 200, h: 100, rotation: 0 }
  it('drags the south-east corner freely', () => {
    expect(resizeEl(el, 'se', { x: 400, y: 300 }, false)).toEqual({ x: 100, y: 100, w: 300, h: 200 })
  })
  it('drags the north-west corner, keeping the opposite corner put', () => {
    const r = resizeEl(el, 'nw', { x: 50, y: 80 }, false)
    expect(r).toEqual({ x: 50, y: 80, w: 250, h: 120 })
    expect(r.x + r.w).toBe(300)
    expect(r.y + r.h).toBe(200)
  })
  it('keeps the aspect ratio on corner drags when asked', () => {
    const r = resizeEl(el, 'se', { x: 500, y: 210 }, true)
    near(r.w / r.h, 2)
    expect(r.w).toBe(400)
  })
  it('edge handles change one dimension only', () => {
    expect(resizeEl(el, 'e', { x: 350, y: 999 }, true)).toEqual({ x: 100, y: 100, w: 250, h: 100 })
    expect(resizeEl(el, 'n', { x: -50, y: 50 }, false)).toEqual({ x: 100, y: 50, w: 200, h: 150 })
  })
  it('never collapses below the minimum size', () => {
    const r = resizeEl(el, 'e', { x: -500, y: 0 }, false, 8)
    expect(r.w).toBe(8)
    expect(r.x).toBe(100)
  })

  // the property that makes rotated resizing feel right: the corner/edge
  // opposite the handle does not move on the page
  const anchorOf = (b: { x: number; y: number; w: number; h: number; rotation: number }, handle: string) => {
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
    const local = {
      x: handle.includes('w') ? b.x + b.w : handle.includes('e') ? b.x : b.x + b.w / 2,
      y: handle.includes('n') ? b.y + b.h : handle.includes('s') ? b.y : b.y + b.h / 2,
    }
    return rotatePt(local, c, b.rotation)
  }
  for (const rotation of [30, 90, -45, 200])
    for (const handle of ['se', 'nw', 'ne', 'sw', 'e', 'w', 'n', 's'])
      for (const keep of [false, true])
        it(`keeps the anchor fixed — ${rotation}° ${handle}${keep ? ' (ratio)' : ''}`, () => {
          const rot = { ...el, rotation }
          const before = anchorOf(rot, handle)
          const r = resizeEl(rot, handle, { x: 333, y: 271 }, keep)
          const after = anchorOf({ ...r, rotation }, handle)
          near(after.x, before.x, 1e-6)
          near(after.y, before.y, 1e-6)
          expect(r.w).toBeGreaterThan(0)
          expect(r.h).toBeGreaterThan(0)
          if (keep && handle.length === 2) near(r.w / r.h, 2, 1e-9)
        })

  it('the dragged corner follows the pointer under rotation', () => {
    const rot = { ...el, rotation: 30 }
    const pointer = { x: 380, y: 320 }
    const r = resizeEl(rot, 'se', pointer, false)
    const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 }
    const se = rotatePt({ x: r.x + r.w, y: r.y + r.h }, c, 30)
    near(se.x, pointer.x, 1e-6)
    near(se.y, pointer.y, 1e-6)
  })
})
