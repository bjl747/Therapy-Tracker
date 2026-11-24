import { describe, expect, it } from 'vitest'
import {
  type PageItem,
  type Rot,
  baseToPdf,
  chunk,
  clickSelect,
  deletePages,
  displaySize,
  duplicatePages,
  emptyHist,
  estimateBytes,
  insertAfterSelection,
  makeBlankPage,
  moveToEdge,
  movePages,
  normRot,
  pageToView,
  pruneSelection,
  pushHist,
  rangeIds,
  rectToPage,
  rectToView,
  redoHist,
  rotatePages,
  rotationMatrix,
  sanitizeFileName,
  selectAll,
  splitBySource,
  splitEveryN,
  textBoxSize,
  undoHist,
  viewToPage,
  EMPTY_SEL,
} from './lib'

function pg(id: string, sourceId: string | null = 's1', index = 0): PageItem {
  return {
    id,
    src: sourceId ? { kind: 'pdf', sourceId, index } : { kind: 'blank' },
    rotation: 0,
    baseRot: 0,
    w: 600,
    h: 800,
    annotations: [],
  }
}
const ids = (p: PageItem[]) => p.map((x) => x.id)

describe('rotation helpers', () => {
  it('normalises', () => {
    expect(normRot(-90)).toBe(270)
    expect(normRot(450)).toBe(90)
    expect(normRot(0)).toBe(0)
  })
  it('rotates pages', () => {
    const r = rotatePages([pg('a'), pg('b')], ['a'], -90)
    expect(r[0].rotation).toBe(270)
    expect(r[1].rotation).toBe(0)
  })
  it('display size swaps on 90/270', () => {
    expect(displaySize(600, 800, 90)).toEqual({ w: 800, h: 600 })
    expect(displaySize(600, 800, 180)).toEqual({ w: 600, h: 800 })
  })
})

describe('reorder', () => {
  const base = ['a', 'b', 'c', 'd', 'e'].map((i) => pg(i))
  it('moves one item forward', () => {
    expect(ids(movePages(base, ['a'], 3))).toEqual(['b', 'c', 'a', 'd', 'e'])
  })
  it('moves one item backward', () => {
    expect(ids(movePages(base, ['d'], 1))).toEqual(['a', 'd', 'b', 'c', 'e'])
  })
  it('moves a multi selection keeping relative order', () => {
    expect(ids(movePages(base, ['e', 'b'], 3))).toEqual(['a', 'c', 'b', 'e', 'd'])
  })
  it('moves to the end and start', () => {
    expect(ids(moveToEdge(base, ['b', 'c'], 'end'))).toEqual(['a', 'd', 'e', 'b', 'c'])
    expect(ids(moveToEdge(base, ['d', 'e'], 'start'))).toEqual(['d', 'e', 'a', 'b', 'c'])
  })
  it('is a no-op for empty selection', () => {
    expect(movePages(base, [], 2)).toBe(base)
  })
  it('deletes, duplicates and inserts', () => {
    expect(ids(deletePages(base, ['b', 'c']))).toEqual(['a', 'd', 'e'])
    const d = duplicatePages(base, ['b'])
    expect(d.pages).toHaveLength(6)
    expect(d.pages[2].id).toBe(d.newIds[0])
    expect(d.pages[2].id).not.toBe('b')
    const ins = insertAfterSelection(base, ['c'], makeBlankPage())
    expect(ins[3].src.kind).toBe('blank')
    expect(insertAfterSelection(base, [], makeBlankPage())[5].src.kind).toBe('blank')
  })
})

describe('selection', () => {
  const order = ['a', 'b', 'c', 'd', 'e']
  it('plain click selects one', () => {
    expect(clickSelect(EMPTY_SEL, order, 'c', {})).toEqual({ ids: ['c'], anchor: 'c' })
  })
  it('toggle adds / removes', () => {
    let s = clickSelect(EMPTY_SEL, order, 'b', {})
    s = clickSelect(s, order, 'd', { toggle: true })
    expect(s.ids).toEqual(['b', 'd'])
    s = clickSelect(s, order, 'b', { toggle: true })
    expect(s.ids).toEqual(['d'])
  })
  it('shift selects a range from the anchor (both directions)', () => {
    let s = clickSelect(EMPTY_SEL, order, 'b', {})
    s = clickSelect(s, order, 'd', { shift: true })
    expect(s.ids).toEqual(['b', 'c', 'd'])
    s = clickSelect(s, order, 'a', { shift: true })
    expect(s.ids).toEqual(['a', 'b'])
    expect(s.anchor).toBe('b')
  })
  it('shift+toggle unions', () => {
    let s = clickSelect(EMPTY_SEL, order, 'a', {})
    s = clickSelect(s, order, 'e', { toggle: true })
    s = clickSelect(s, order, 'c', { shift: true, toggle: true })
    expect(s.ids).toEqual(['a', 'c', 'd', 'e']) // anchor was 'e'
  })
  it('range helper and select all', () => {
    expect(rangeIds(order, 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(selectAll(order).ids).toEqual(order)
  })
  it('prunes removed ids', () => {
    const s = pruneSelection({ ids: ['a', 'x'], anchor: 'x' }, order)
    expect(s).toEqual({ ids: ['a'], anchor: 'a' })
  })
})

describe('history', () => {
  it('undo / redo roundtrip', () => {
    let h = emptyHist<number>()
    let present = 1
    h = pushHist(h, present)
    present = 2
    h = pushHist(h, present)
    present = 3
    const u1 = undoHist(h, present)!
    expect(u1.present).toBe(2)
    const u2 = undoHist(u1.hist, u1.present)!
    expect(u2.present).toBe(1)
    expect(undoHist(u2.hist, u2.present)).toBeNull()
    const r1 = redoHist(u2.hist, u2.present)!
    expect(r1.present).toBe(2)
    const r2 = redoHist(r1.hist, r1.present)!
    expect(r2.present).toBe(3)
    expect(redoHist(r2.hist, r2.present)).toBeNull()
  })
  it('a new push clears redo', () => {
    let h = pushHist(emptyHist<number>(), 1)
    const u = undoHist(h, 2)!
    h = pushHist(u.hist, 5)
    expect(h.future).toEqual([])
  })
})

describe('split plans', () => {
  it('chunks', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([1, 2], 0)).toEqual([[1], [2]])
  })
  it('splitEveryN', () => {
    const parts = splitEveryN(['a', 'b', 'c'].map((i) => pg(i)), 2)
    expect(parts.map((p) => p.ids)).toEqual([['a', 'b'], ['c']])
    expect(parts[0].label).toBe('part-01')
  })
  it('splitBySource groups by source and attaches blanks', () => {
    const pages = [pg('a', 's1'), pg('b', 's2'), pg('blank', null), pg('c', 's1'), pg('d', 's2')]
    const g = splitBySource(pages)
    expect(g).toEqual([
      { sourceId: 's1', ids: ['a', 'c'] },
      { sourceId: 's2', ids: ['b', 'blank', 'd'] },
    ])
  })
  it('leading blanks join the first source; only blanks gives one null group', () => {
    expect(splitBySource([pg('x', null), pg('a', 's1')])).toEqual([{ sourceId: 's1', ids: ['x', 'a'] }])
    expect(splitBySource([pg('x', null)])).toEqual([{ sourceId: null, ids: ['x'] }])
  })
})

describe('coordinates', () => {
  const w = 600
  const h = 800
  const rots: Rot[] = [0, 90, 180, 270]
  it('round trips for every rotation', () => {
    for (const r of rots) {
      const v = pageToView({ x: 120, y: 340 }, w, h, r)
      const p = viewToPage(v, w, h, r)
      expect(p.x).toBeCloseTo(120)
      expect(p.y).toBeCloseTo(340)
    }
  })
  it('maps the corners as expected', () => {
    expect(pageToView({ x: 0, y: 0 }, w, h, 90)).toEqual({ x: h, y: 0 }) // top-left goes to top-right
    expect(pageToView({ x: 0, y: 0 }, w, h, 180)).toEqual({ x: w, y: h })
    expect(pageToView({ x: 0, y: 0 }, w, h, 270)).toEqual({ x: 0, y: w }) // top-left goes to bottom-left
  })
  it('matrix agrees with pageToView', () => {
    for (const r of rots) {
      const [a, b, c, d, e, f] = rotationMatrix(w, h, r)
      const p = { x: 50, y: 70 }
      const v = pageToView(p, w, h, r)
      expect(a * p.x + c * p.y + e).toBeCloseTo(v.x)
      expect(b * p.x + d * p.y + f).toBeCloseTo(v.y)
    }
  })
  it('rect conversion round trips and normalises', () => {
    const rect = { x: 10, y: 20, w: 100, h: 50 }
    for (const r of rots) {
      const v = rectToView(rect, w, h, r)
      expect(v.w).toBeGreaterThan(0)
      const back = rectToPage(v, w, h, r)
      expect(back).toEqual(rect)
    }
    expect(rectToView(rect, w, h, 90)).toEqual({ x: h - 70, y: 10, w: 50, h: 100 })
  })
  it('baseToPdf flips y and honours the crop box offset', () => {
    expect(baseToPdf({ x: 10, y: 20 }, { x: 0, y: 0, w: 600, h: 800 }, 0)).toEqual({ x: 10, y: 780 })
    expect(baseToPdf({ x: 10, y: 20 }, { x: 5, y: 7, w: 600, h: 800 }, 0)).toEqual({ x: 15, y: 787 })
    // page with /Rotate 90: displayed top-left is the unrotated bottom-left
    const p = baseToPdf({ x: 0, y: 0 }, { x: 0, y: 0, w: 600, h: 800 }, 90)
    expect(p).toEqual({ x: 0, y: 0 })
  })
})

describe('misc', () => {
  it('text box size grows with content', () => {
    const a = textBoxSize('Hi', 12, false)
    const b = textBoxSize('Hello world\nline two', 12, true)
    expect(b.w).toBeGreaterThan(a.w)
    expect(b.h).toBeGreaterThan(a.h)
  })
  it('sanitises file names', () => {
    expect(sanitizeFileName('a/b:c?.pdf')).toBe('abc')
    expect(sanitizeFileName('   ')).toBe('document')
  })
  it('estimates grow with pages', () => {
    const pages = [pg('a'), pg('b')]
    const src = { s1: { bytes: 2_000_000, pageCount: 2, kind: 'pdf' as const } }
    const plain = estimateBytes(pages, src)
    expect(plain).toBeGreaterThan(1_900_000)
    expect(estimateBytes([pg('a')], src)).toBeLessThan(plain)
  })
})
