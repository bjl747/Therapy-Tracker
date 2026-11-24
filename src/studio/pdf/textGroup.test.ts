// Page editor pure helpers (textGroup.ts). Save as src/studio/pdf/textGroup.test.ts.
import { describe, expect, it } from 'vitest'
import { type Rot, type TextAnn, BASELINE, TEXT_PAD } from './lib'
import { contentToBase, uprightRot } from './annot'
import {
  type RawText,
  groupRuns,
  overlapShare,
  placeContent,
  replacementFor,
  resizeContent,
  runAt,
  runIndexAt,
  sampleColors,
  textFrame,
  garbledShare,
} from './textGroup'

const raw = (text: string, x: number, y: number, w: number, size = 12, rot: Rot = 0, bold = false): RawText => {
  const d = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] }[rot]
  return { text, rot, start: { x, y }, end: { x: x + d[0] * w, y: y + d[1] * w }, size, ascent: size * 0.8, descent: size * 0.2, bold }
}
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6)

describe('textFrame', () => {
  it('maps base points into the text frame for every direction', () => {
    expect(textFrame({ x: 3, y: 5 }, 0)).toEqual({ u: 3, v: 5 })
    expect(textFrame({ x: 3, y: 5 }, 90)).toEqual({ u: 5, v: -3 })
    expect(textFrame({ x: 3, y: 5 }, 180)).toEqual({ u: -3, v: -5 })
    expect(textFrame({ x: 3, y: 5 }, 270)).toEqual({ u: -5, v: 3 })
  })
})

describe('groupRuns', () => {
  it('joins pieces of one line, adding a space for a word gap', () => {
    const runs = groupRuns([raw('Phone: 402 555', 50, 100, 90), raw('0199', 144, 100.5, 30)])
    expect(runs).toHaveLength(1)
    expect(runs[0].text).toBe('Phone: 402 555 0199')
    expect(runs[0].start).toEqual({ x: 50, y: 100 })
    close(runs[0].rect.x, 50)
    close(runs[0].rect.w, 124)
  })
  it('no space when pieces touch', () => {
    expect(groupRuns([raw('Nur', 50, 100, 20), raw('se', 70, 100, 12)])[0].text).toBe('Nurse')
  })
  it('splits columns and lines', () => {
    const runs = groupRuns([raw('Left', 50, 100, 30), raw('Right col', 300, 100, 50), raw('Next line', 50, 120, 50)])
    expect(runs.map((r) => r.text).sort()).toEqual(['Left', 'Next line', 'Right col'])
  })
  it('keeps directions apart and groups turned text along its own baseline', () => {
    const runs = groupRuns([raw('Down', 200, 50, 30, 12, 90), raw('wards', 200, 82, 30, 12, 90), raw('Across', 50, 60, 40)])
    const down = runs.find((r) => r.rot === 90)!
    expect(down.text).toBe('Down wards')
    expect(runs.find((r) => r.rot === 0)!.text).toBe('Across')
    // rect of text running downwards sits left of its baseline (ascent points to -x)
    close(down.rect.x, 200 - 0.2 * 12)
    close(down.rect.w, 12)
  })
  it('drops fake-bold duplicates, blanks; majority bold', () => {
    const runs = groupRuns([raw('JANE', 50, 40, 60, 20, 0, true), raw('JANE', 50.3, 40, 60, 20, 0, true), raw('  ', 120, 40, 5)])
    expect(runs).toHaveLength(1)
    expect(runs[0].text).toBe('JANE')
    expect(runs[0].bold).toBe(true)
  })
  it('flags text with unmapped glyphs', () => {
    expect(garbledShare('a')).toBeCloseTo(0.75)
    expect(groupRuns([raw('���', 50, 40, 30)])[0].garbled).toBe(true)
    expect(groupRuns([raw('Hello', 50, 40, 30)])[0].garbled).toBe(false)
  })
})

describe('runAt / overlapShare', () => {
  const runs = groupRuns([raw('Big heading', 50, 60, 200, 30), raw('small', 60, 50, 30, 8)])
  it('hits the smallest run under the point, with padding', () => {
    expect(runAt(runs, { x: 70, y: 47 })?.text).toBe('small')
    expect(runAt(runs, { x: 200, y: 50 })?.text).toBe('Big heading')
    expect(runIndexAt(runs, { x: 400, y: 400 })).toBe(-1)
    expect(runAt(runs, { x: 49, y: 50 }, 2)?.text).toBe('Big heading')
  })
  it('overlap share', () => {
    expect(overlapShare({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 0, w: 10, h: 10 })).toBeCloseTo(0.5)
    expect(overlapShare({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 })).toBe(0)
  })
})

describe('replacementFor', () => {
  for (const rot of [0, 90, 180, 270] as Rot[]) {
    it(`puts the new baseline on the original one (rot ${rot})`, () => {
      const [run] = groupRuns([raw('Phone: 402 555 0199', 200, 300, 133, 14, rot)])
      const a = replacementFor(run, '#123456', '#fafafa', 612, 792)
      expect(a.rot).toBe(rot)
      expect(a.size).toBe(14)
      expect(a.text).toBe('Phone: 402 555 0199')
      expect(a.color).toBe('#123456')
      expect(a.coverColor).toBe('#fafafa')
      const b = contentToBase(a, { x: TEXT_PAD, y: TEXT_PAD + a.size * BASELINE })
      close(b.x, 200)
      close(b.y, 300)
      // cover = glyph box + 1pt
      close(a.cover!.x, run.rect.x - 1)
      close(a.cover!.w, run.rect.w + 2)
    })
  }
  it('cover stays on the page', () => {
    const [run] = groupRuns([raw('Edge', 0.5, 10, 30)])
    expect(replacementFor(run, '#000000', '#ffffff', 612, 792).cover!.x).toBe(0)
  })
})

describe('placeContent / resizeContent', () => {
  const base: TextAnn = { id: 't', kind: 'text', text: 'Hi', size: 12, color: '#000', bold: false, x: 0, y: 0, w: 20, h: 40 }
  for (const rot of [0, 90, 180, 270] as Rot[]) {
    it(`keeps the content's top-left when the box grows (rot ${rot})`, () => {
      const a = placeContent({ ...base, rot, ...(rot % 180 ? { w: 40, h: 20 } : {}) }, { x: 0, y: 0 }, { x: 100, y: 200 })
      const p0 = contentToBase(a, { x: 0, y: 0 })
      close(p0.x, 100)
      close(p0.y, 200)
      const b = resizeContent(a, 80, 30)
      const p1 = contentToBase(b, { x: 0, y: 0 })
      close(p1.x, 100)
      close(p1.y, 200)
      expect(rot % 180 ? [b.w, b.h] : [b.h, b.w]).toEqual(rot % 180 ? [30, 80] : [30, 80])
    })
  }
  it('upright items on a turned page read upright', () => {
    for (const r of [0, 90, 180, 270] as Rot[]) expect((uprightRot(r) + r) % 360).toBe(0)
  })
})

describe('sampleColors', () => {
  const patch = (w: number, h: number, bg: number[], ink: number[], inkAt: [number, number][]) => {
    const d = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) d.set([...bg, 255], i * 4)
    for (const [x, y] of inkAt) d.set([...ink, 255], (y * w + x) * 4)
    return d
  }
  it('cover = commonest edge colour, text = the pixel furthest from it', () => {
    const d = patch(10, 6, [240, 248, 255], [12, 34, 56], [[4, 2], [5, 3]])
    expect(sampleColors(d, 10, 6)).toEqual({ text: '#0c2238', cover: '#f0f8ff' })
  })
  it('white text on a dark band', () => {
    const d = patch(8, 5, [12, 24, 77], [255, 255, 255], [[3, 2]])
    expect(sampleColors(d, 8, 5)).toEqual({ text: '#ffffff', cover: '#0c184d' })
  })
  it('blank patch: black text, cover as found', () => {
    expect(sampleColors(patch(4, 4, [255, 255, 255], [0, 0, 0], []), 4, 4)).toEqual({ text: '#000000', cover: '#ffffff' })
    expect(sampleColors([], 0, 0)).toEqual({ text: '#000000', cover: '#ffffff' })
  })
})
