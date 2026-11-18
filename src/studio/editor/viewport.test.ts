import { describe, expect, it } from 'vitest'
import {
  clampBox,
  clampView,
  clampZoom,
  fitView,
  handleCursor,
  handlePositions,
  handlesFor,
  hitHandle,
  MAX_ZOOM,
  MIN_ZOOM,
  normDeg,
  scaleInto,
  snapAngle,
  snapCoord,
  snapTargets,
  stepZoom,
  toPage,
  toScreen,
  zoomAround,
  type View,
} from './viewport'

const near = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps)

describe('view transforms', () => {
  const v: View = { zoom: 0.5, x: 100, y: 40 }
  it('toPage and toScreen are inverses', () => {
    const p = { x: 317, y: 912 }
    const back = toPage(v, toScreen(v, p))
    near(back.x, p.x)
    near(back.y, p.y)
    expect(toScreen(v, { x: 0, y: 0 })).toEqual({ x: 100, y: 40 })
  })
  it('fitView centres the page inside the padding', () => {
    const f = fitView({ w: 1080, h: 1080 }, { w: 1000, h: 700 }, 50)
    near(f.zoom, 600 / 1080)
    near(f.x, (1000 - 600) / 2)
    near(f.y, 50)
  })
  it('fitView copes with a tiny or zero box', () => {
    const f = fitView({ w: 1080, h: 1920 }, { w: 0, h: 0 })
    expect(f.zoom).toBeGreaterThanOrEqual(MIN_ZOOM)
    expect(Number.isFinite(f.x) && Number.isFinite(f.y)).toBe(true)
  })
  it('zoomAround keeps the page point under the cursor fixed', () => {
    const cursor = { x: 420, y: 333 }
    const before = toPage(v, cursor)
    for (const z of [0.25, 1, 2.75, 4]) {
      const after = toPage(zoomAround(v, z, cursor), cursor)
      near(after.x, before.x, 1e-6)
      near(after.y, before.y, 1e-6)
    }
  })
  it('zoom is clamped', () => {
    expect(zoomAround(v, 99, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM)
    expect(clampZoom(0)).toBe(MIN_ZOOM)
  })
  it('stepZoom walks the ladder both ways', () => {
    expect(stepZoom(0.6, 1)).toBe(0.75)
    expect(stepZoom(0.75, 1)).toBe(1)
    expect(stepZoom(1, -1)).toBe(0.75)
    expect(stepZoom(0.3, -1)).toBe(0.25)
    expect(stepZoom(4, 1)).toBe(5)
    expect(stepZoom(0.25, -1)).toBe(0.2)
  })
  it('clampView keeps part of the page on screen', () => {
    const page = { w: 1000, h: 1000 }
    const box = { w: 800, h: 600 }
    const far = clampView({ zoom: 1, x: 5000, y: -5000 }, page, box, 64)
    expect(far.x).toBe(800 - 64)
    expect(far.y).toBe(64 - 1000)
    expect(clampView({ zoom: 1, x: 10, y: 10 }, page, box)).toEqual({ zoom: 1, x: 10, y: 10 })
  })
})

describe('handles', () => {
  const v: View = { zoom: 1, x: 0, y: 0 }
  const f = { x: 100, y: 100, w: 200, h: 100, rotation: 0 }
  it('places the 8 handles and the rotation knob', () => {
    const hs = handlePositions(f, v, ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rot'])
    const at = (id: string) => hs.find((h) => h.id === id)!
    expect(at('nw')).toMatchObject({ x: 100, y: 100 })
    expect(at('se')).toMatchObject({ x: 300, y: 200 })
    expect(at('e')).toMatchObject({ x: 300, y: 150 })
    expect(at('rot').x).toBe(200)
    expect(at('rot').y).toBeGreaterThan(200)
  })
  it('rotates handle positions with the frame', () => {
    const hs = handlePositions({ ...f, rotation: 90 }, v, ['n'])
    near(hs[0].x, 250, 1e-6) // top-centre swings to the right of the centre
    near(hs[0].y, 150, 1e-6)
  })
  it('scales with zoom and pan', () => {
    const hs = handlePositions(f, { zoom: 2, x: 10, y: 20 }, ['nw'])
    expect(hs[0]).toMatchObject({ x: 210, y: 220 })
  })
  it('hit-tests within a tolerance and prefers the nearest', () => {
    const hs = handlePositions(f, v, ['nw', 'n', 'ne'])
    expect(hitHandle(hs, { x: 104, y: 97 }, 9)).toBe('nw')
    expect(hitHandle(hs, { x: 198, y: 103 }, 9)).toBe('n')
    expect(hitHandle(hs, { x: 150, y: 150 }, 9)).toBeNull()
  })
  it('hides edge handles on small frames, lines only get ends', () => {
    expect(handlesFor({ ...f, w: 20, h: 20 }, v, 'box')).toEqual(['nw', 'ne', 'se', 'sw', 'rot'])
    expect(handlesFor({ ...f, w: 200, h: 20 }, v, 'box')).toEqual(['nw', 'ne', 'se', 'sw', 'n', 's', 'rot'])
    expect(handlesFor(f, v, 'box')).toContain('n')
    expect(handlesFor(f, v, 'multi')).toEqual(['nw', 'ne', 'se', 'sw', 'rot'])
    expect(handlesFor(f, v, 'line')).toEqual(['w', 'e', 'rot'])
  })
  it('picks resize cursors that follow the rotation', () => {
    expect(handleCursor('n', 0)).toBe('ns-resize')
    expect(handleCursor('e', 0)).toBe('ew-resize')
    expect(handleCursor('se', 0)).toBe('nwse-resize')
    expect(handleCursor('ne', 0)).toBe('nesw-resize')
    expect(handleCursor('n', 90)).toBe('ew-resize')
    expect(handleCursor('se', 45)).toBe('ns-resize')
    expect(handleCursor('rot', 12)).toBe('grab')
  })
})

describe('numeric helpers', () => {
  it('normDeg maps into (-180, 180]', () => {
    expect(normDeg(0)).toBe(0)
    expect(normDeg(190)).toBe(-170)
    expect(normDeg(-190)).toBe(170)
    expect(normDeg(540)).toBe(180)
    expect(normDeg(-360)).toBe(0)
  })
  it('snapAngle: hard steps and soft magnets', () => {
    expect(snapAngle(22, 15)).toBe(15)
    expect(snapAngle(23, 15)).toBe(30)
    expect(snapAngle(88, 45, 3)).toBe(90)
    expect(snapAngle(80, 45, 3)).toBe(80)
  })
  it('snapCoord returns the nearest target inside the threshold', () => {
    expect(snapCoord(498, [0, 500, 1000], 6)).toBe(500)
    expect(snapCoord(490, [0, 500, 1000], 6)).toBeNull()
    expect(snapCoord(503, [500, 505], 6)).toBe(505)
  })
  it('snapTargets lists page and element lines', () => {
    const t = snapTargets([{ x: 10, y: 20, w: 100, h: 50 }], { w: 1000, h: 800 })
    expect(t.xs).toEqual([0, 500, 1000, 10, 60, 110])
    expect(t.ys).toEqual([0, 400, 800, 20, 45, 70])
  })
  it('clampBox keeps floating UI inside the stage', () => {
    expect(clampBox(-50, 10, 100, 40, { w: 400, h: 300 })).toEqual({ x: 6, y: 10 })
    expect(clampBox(380, 290, 100, 40, { w: 400, h: 300 })).toEqual({ x: 294, y: 254 })
  })
  it('scaleInto scales a member of a group about the group box', () => {
    const from = { x: 100, y: 100, w: 200, h: 100 }
    const to = { x: 100, y: 100, w: 400, h: 200 }
    const r = scaleInto({ x: 200, y: 150, w: 100, h: 50 }, from, to)
    expect(r).toEqual({ x: 300, y: 200, w: 200, h: 100, s: 2 })
  })
})
