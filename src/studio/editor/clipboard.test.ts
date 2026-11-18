import { describe, expect, it } from 'vitest'
import { shape, text } from '../engine/model'
import { copyEls, pasteEls, pasteOffset, PASTE_STEP } from './clipboard'

const page = { pageId: 'p1', w: 1080, h: 1080 }
const a = shape('rect', { id: 'a', x: 100, y: 100, w: 200, h: 100, groupId: 'g1', locked: true })
const b = text({ id: 'b', x: 150, y: 250, w: 100, h: 50, groupId: 'g1' })
const c = shape('ellipse', { id: 'c', x: 500, y: 500, w: 50, h: 50 })

describe('copyEls', () => {
  it('takes a deep snapshot', () => {
    const src = [structuredClone(a)]
    const clip = copyEls(src, 'p1')
    src[0].x = 999
    expect(clip.els[0].x).toBe(100)
    expect(clip).toMatchObject({ pageId: 'p1', pastes: 0 })
  })
})

describe('pasteOffset', () => {
  it('cascades on the same page', () => {
    const clip = copyEls([a], 'p1')
    expect(pasteOffset(clip, page)).toEqual({ x: PASTE_STEP, y: PASTE_STEP })
    expect(pasteOffset({ ...clip, pastes: 2 }, page)).toEqual({ x: PASTE_STEP * 3, y: PASTE_STEP * 3 })
  })
  it('keeps the position on another page', () => {
    expect(pasteOffset(copyEls([a], 'p1'), { ...page, pageId: 'p2' })).toEqual({ x: 0, y: 0 })
  })
  it('centres the group on a given point', () => {
    // union of a + b = (100,100)–(300,300), centre (200,200)
    expect(pasteOffset(copyEls([a, b], 'p1'), page, { x: 600, y: 700 })).toEqual({ x: 400, y: 500 })
  })
  it('never lets the copies land fully off the page', () => {
    const clip = copyEls([c], 'p1')
    const far = pasteOffset(clip, page, { x: 5000, y: -5000 })
    expect(500 + far.x).toBeLessThanOrEqual(1080 - 16)
    expect(550 + far.y).toBeGreaterThanOrEqual(16)
    // a long cascade stops at the page edge too
    const deep = pasteOffset({ ...clip, pastes: 100 }, page)
    expect(500 + deep.x).toBe(1080 - 16)
  })
  it('is zero for an empty clip', () => {
    expect(pasteOffset({ els: [], pageId: 'p1', pastes: 0 }, page)).toEqual({ x: 0, y: 0 })
  })
})

describe('pasteEls', () => {
  it('makes fresh ids, unlocks, and keeps groups together under a new id', () => {
    const out = pasteEls(copyEls([a, b, c], 'p1'), page)
    expect(out).toHaveLength(3)
    expect(new Set(out.map((e) => e.id)).size).toBe(3)
    expect(out.some((e) => ['a', 'b', 'c'].includes(e.id))).toBe(false)
    expect(out.every((e) => !e.locked)).toBe(true)
    expect(out[0].groupId).toBeTruthy()
    expect(out[0].groupId).toBe(out[1].groupId)
    expect(out[0].groupId).not.toBe('g1')
    expect(out[2].groupId).toBeUndefined()
  })
  it('moves every element by the same offset and leaves the clip untouched', () => {
    const clip = copyEls([a, b], 'p1')
    const out = pasteEls(clip, page)
    expect(out.map((e) => [e.x, e.y])).toEqual([
      [124, 124],
      [174, 274],
    ])
    expect(clip.els.map((e) => [e.x, e.y])).toEqual([
      [100, 100],
      [150, 250],
    ])
  })
  it('two pastes give different group ids', () => {
    const clip = copyEls([a, b], 'p1')
    expect(pasteEls(clip, page)[0].groupId).not.toBe(pasteEls(clip, page)[0].groupId)
  })
})
