// Letter-layout helpers + annotation content frame. Merge into src/studio/pdf/lib.test.ts.
// Needs: applyMatrix, baseToPdf, displaySize, fitOnSheet, isSheetAlready, sheetMatrix, widePageIds,
//        LETTER, type PageItem, type Rot, type Rect from './lib'; boxSizeFor, contentSize, contentToBase from './annot'.
import { describe, expect, it } from 'vitest'
import {
  type Annotation,
  type PageItem,
  type Rect,
  type Rot,
  LETTER,
  applyMatrix,
  baseToPdf,
  displaySize,
  fitOnSheet,
  isSheetAlready,
  sheetMatrix,
  widePageIds,
} from './lib'
import { boxSizeFor, contentSize, contentToBase } from './annot'

const ROTS: Rot[] = [0, 90, 180, 270]
const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6)
  expect(a.y).toBeCloseTo(b.y, 6)
}

describe('fitOnSheet', () => {
  it('fits a landscape Letter page across the width and centres it vertically', () => {
    const f = fitOnSheet(792, 612)
    expect(f.s).toBeCloseTo(612 / 792)
    expect(f.w).toBeCloseTo(612)
    expect(f.h).toBeCloseTo(472.909, 2)
    expect(f.ox).toBeCloseTo(0)
    expect(f.oy).toBeCloseTo((792 - 472.909) / 2, 2)
  })
  it('leaves a Letter portrait page as it is', () => {
    expect(fitOnSheet(612, 792)).toEqual({ s: 1, ox: 0, oy: 0, w: 612, h: 792 })
  })
  it('scales A4 and Legal down to fit the height', () => {
    const a4 = fitOnSheet(595.28, 841.89)
    expect(a4.h).toBeCloseTo(792)
    expect(a4.ox).toBeCloseTo((612 - 595.28 * (792 / 841.89)) / 2)
    const legal = fitOnSheet(612, 1008)
    expect(legal.s).toBeCloseTo(792 / 1008)
    expect(legal.oy).toBeCloseTo(0)
  })
  it('enlarges small content (no cap)', () => {
    expect(fitOnSheet(306, 396).s).toBeCloseTo(2)
  })
})

describe('sheetMatrix', () => {
  // A base-space point (page shown at total rotation T) must land on the sheet at the fitted spot.
  const boxes: Rect[] = [
    { x: 0, y: 0, w: 612, h: 792 },
    { x: 40, y: 25, w: 500, h: 700 },
    { x: -20, y: 10, w: 792, h: 612 },
  ]
  for (const box of boxes) {
    for (const T of ROTS) {
      it(`box ${box.x},${box.y} ${box.w}x${box.h} turned ${T}`, () => {
        const m = sheetMatrix(box, T)
        const d = displaySize(box.w, box.h, T)
        const f = fitOnSheet(d.w, d.h)
        for (const b of [{ x: 0, y: 0 }, { x: d.w, y: 0 }, { x: 0, y: d.h }, { x: d.w * 0.3, y: d.h * 0.7 }]) {
          const pdf = baseToPdf(b, box, T) // unrotated user space
          const sheet = applyMatrix(m, pdf) // y-up sheet
          close(sheet, { x: f.ox + b.x * f.s, y: LETTER.h - (f.oy + b.y * f.s) })
        }
      })
    }
  }
  it('is identity for an untouched Letter page', () => {
    expect(sheetMatrix({ x: 0, y: 0, w: 612, h: 792 }, 0)).toEqual([1, 0, 0, 1, 0, 0])
  })
})

describe('isSheetAlready', () => {
  it('only for an unturned 612x792 box at the origin', () => {
    expect(isSheetAlready({ x: 0, y: 0, w: 612, h: 792 }, 0)).toBe(true)
    expect(isSheetAlready({ x: 0, y: 0, w: 612.2, h: 791.8 }, 0)).toBe(true)
    expect(isSheetAlready({ x: 0, y: 0, w: 612, h: 792 }, 180)).toBe(false)
    expect(isSheetAlready({ x: 10, y: 0, w: 612, h: 792 }, 0)).toBe(false)
    expect(isSheetAlready({ x: 0, y: 0, w: 792, h: 612 }, 90)).toBe(false)
  })
})

describe('widePageIds', () => {
  const page = (id: string, w: number, h: number, rotation: Rot): PageItem => ({ id, src: { kind: 'blank' }, rotation, baseRot: 0, w, h, annotations: [] })
  it('lists pages whose displayed content is wider than tall', () => {
    const pages = [page('a', 612, 792, 0), page('b', 792, 612, 0), page('c', 792, 612, 90), page('d', 612, 792, 270), page('e', 600, 600, 0)]
    expect(widePageIds(pages)).toEqual(['b', 'd'])
  })
})

describe('contentToBase', () => {
  const img = (rot: Rot): Annotation => ({ id: 'i', kind: 'image', dataUrl: '', mime: 'image/png', x: 100, y: 50, ...boxSizeFor(60, 20, rot), rot })
  it('rot 0 is the box itself', () => {
    const a = img(0)
    close(contentToBase(a, { x: 0, y: 0 }), { x: 100, y: 50 })
    close(contentToBase(a, { x: 60, y: 20 }), { x: 160, y: 70 })
  })
  it('content top-left goes to the turned corner of the box', () => {
    // box for 60x20 content turned 90/270 is 20x60
    close(contentToBase(img(90), { x: 0, y: 0 }), { x: 120, y: 50 }) // top-right
    close(contentToBase(img(180), { x: 0, y: 0 }), { x: 160, y: 70 }) // bottom-right
    close(contentToBase(img(270), { x: 0, y: 0 }), { x: 100, y: 110 }) // bottom-left
  })
  it('content size swaps for 90 / 270 and stays inside the box', () => {
    for (const r of ROTS) {
      const a = img(r)
      const c = contentSize(a)
      expect(c).toEqual({ w: 60, h: 20 })
      for (const p of [{ x: 0, y: 0 }, { x: c.w, y: 0 }, { x: 0, y: c.h }, { x: c.w, y: c.h }]) {
        const b = contentToBase(a, p)
        expect(b.x).toBeGreaterThanOrEqual(a.x - 1e-9)
        expect(b.x).toBeLessThanOrEqual(a.x + a.w + 1e-9)
        expect(b.y).toBeGreaterThanOrEqual(a.y - 1e-9)
        expect(b.y).toBeLessThanOrEqual(a.y + a.h + 1e-9)
      }
    }
  })
  it('missing rot behaves like 0', () => {
    const a: Annotation = { id: 't', kind: 'text', text: 'x', size: 10, color: '#000000', bold: false, x: 5, y: 6, w: 30, h: 16 }
    close(contentToBase(a, { x: 2, y: 3 }), { x: 7, y: 9 })
  })
})
