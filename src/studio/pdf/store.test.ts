// Organizer tests (PDF Studio). Drop into src/studio/pdf/ as e.g. store.test.ts; imports are relative to that folder.
import { beforeEach, describe, expect, it } from 'vitest'
import type { PageItem } from './lib'
import { autoFileName, moveSourceBlock, uniqueName, usedSourceIds, usePdfStudio, type SourceMeta } from './store'

const pg = (sid: string, i: number, w = 612, h = 792): PageItem => ({
  id: `${sid}${i}`, src: { kind: 'pdf', sourceId: sid, index: i }, rotation: 0, baseRot: 0, w, h, annotations: [],
})
const blank = (id: string): PageItem => ({ id, src: { kind: 'blank' }, rotation: 0, baseRot: 0, w: 612, h: 792, annotations: [] })
const meta = (id: string, name: string, kind: 'pdf' | 'image' = 'pdf', n = 1): SourceMeta => ({
  id, name, kind, bytes: 1000, pageCount: n, renderable: true, rasterOnly: false, fields: [],
})
const ids = (ps: PageItem[]) => ps.map((p) => p.id).join(',')
const st = () => usePdfStudio.getState()

describe('organizer pure helpers', () => {
  it('lists files in use in first-appearance order, ignoring blanks', () => {
    expect(usedSourceIds([blank('b'), pg('r', 0), pg('l', 0), pg('r', 1)])).toEqual(['r', 'l'])
  })
  it('moves a file block up and down; blanks stay put; edges are no-ops', () => {
    const p = [pg('a', 0), pg('a', 1), blank('k'), pg('b', 0), pg('c', 0)]
    expect(ids(moveSourceBlock(p, 'b', -1))).toBe('b0,a0,a1,k,c0')
    expect(ids(moveSourceBlock(p, 'a', 1))).toBe('k,b0,a0,a1,c0')
    expect(moveSourceBlock(p, 'a', -1)).toBe(p)
    expect(moveSourceBlock(p, 'c', 1)).toBe(p)
  })
  it('gathers a scattered file into one block', () => {
    const p = [pg('a', 0), pg('b', 0), pg('a', 1), pg('c', 0)]
    expect(ids(moveSourceBlock(p, 'c', -1))).toBe('a0,c0,b0,a1')
  })
  it('suggests the first PDF still in use + " - Packet", else the first file', () => {
    const sources = { l: meta('l', 'license.jpg', 'image'), r: meta('r', 'Jane Doe Resume.pdf') }
    expect(autoFileName([pg('l', 0), pg('r', 0)], sources)).toBe('Jane Doe Resume - Packet')
    expect(autoFileName([pg('l', 0)], sources)).toBe('license - Packet')
    expect(autoFileName([], sources)).toBe('document')
  })
  it('makes names unique without case clashes', () => {
    const used = new Set<string>()
    expect(['cert', 'Cert', 'cert'].map((n) => uniqueName(n, used))).toEqual(['cert', 'Cert (2)', 'cert (3)'])
  })
})

describe('organizer store', () => {
  beforeEach(() => st().reset())
  const load = () => {
    st().addSource(meta('l', 'license.jpg', 'image'), [pg('l', 0, 612, 386)])
    st().addSource(meta('r', 'Jane Doe Resume.pdf', 'pdf', 3), [pg('r', 0), pg('r', 1), pg('r', 2)])
  }

  it('names the packet after the resume and follows it until the user types a name', () => {
    load()
    expect(st().fileName).toBe('Jane Doe Resume - Packet')
    st().removeSource('r')
    expect(st().fileName).toBe('license - Packet')
    st().undo()
    expect(st().fileName).toBe('Jane Doe Resume - Packet')
    st().setFileName('Smith packet')
    st().removeSource('r')
    expect(st().fileName).toBe('Smith packet')
  })
  it('does not record moves that change nothing', () => {
    load()
    const n = st().hist.past.length
    st().setSel({ ids: ['l0'], anchor: 'l0' })
    st().moveSel('start')
    st().reorder(['r1'], 2)
    st().reorder(['r1'], 3)
    expect(st().hist.past.length).toBe(n)
  })
  it('removing a file keeps the rest of the selection and is undoable', () => {
    load()
    st().setSel({ ids: ['l0', 'r1'], anchor: 'l0' })
    st().removeSource('r')
    expect(ids(st().pages)).toBe('l0')
    expect(st().sel.ids).toEqual(['l0'])
    st().undo()
    expect(ids(st().pages)).toBe('l0,r0,r1,r2')
  })
  it('selects and moves a whole file', () => {
    load()
    st().selectSource('r')
    expect(st().sel.ids).toEqual(['r0', 'r1', 'r2'])
    st().moveSource('r', -1)
    expect(ids(st().pages)).toBe('r0,r1,r2,l0')
    st().undo()
    expect(ids(st().pages)).toBe('l0,r0,r1,r2')
  })
  it('form values are undoable, one step per field', () => {
    load()
    st().setFormValue('r', 'name', 'J')
    st().setFormValue('r', 'name', 'Ja')
    st().setFormValue('r', 'name', 'Jan')
    st().setFormValue('r', 'date', '11/19')
    st().undo()
    expect(st().formValues.r).toEqual({ name: 'Jan' })
    st().undo()
    expect(st().formValues.r ?? {}).toEqual({})
    expect(ids(st().pages)).toBe('l0,r0,r1,r2')
    st().redo()
    expect(st().formValues.r).toEqual({ name: 'Jan' })
  })
  it('turns only wide pages, in one undo step', () => {
    load()
    const n = st().hist.past.length
    st().turnWidePages()
    expect(st().pages.find((p) => p.id === 'l0')!.rotation).toBe(270)
    expect(st().pages.filter((p) => p.rotation !== 0).length).toBe(1)
    expect(st().hist.past.length).toBe(n + 1)
    st().turnWidePages() // nothing left to turn
    expect(st().hist.past.length).toBe(n + 1)
    expect(st().notices.at(-1)!.text).toMatch(/No wide pages/)
  })
  it('layout defaults to letter, is not undone, and start over resets it', () => {
    load()
    st().setLayout('original')
    st().undo()
    expect(st().layout).toBe('original')
    st().reset()
    expect(st().layout).toBe('letter')
    expect(st().pages).toEqual([])
  })
  it('clears another user’s document when someone else opens PDF Studio', () => {
    st().claim('u1')
    load()
    st().claim('u1')
    expect(st().pages.length).toBe(4)
    st().claim('')
    expect(st().pages.length).toBe(0)
    expect(st().owner).toBe('')
  })
})
