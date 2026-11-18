import { describe, expect, it } from 'vitest'
import { page, shape, text } from './model'
import { ANIM_TAIL, animEnd, animState, maxAnimDelay, playLength } from './render'

const a = (delay: number, duration: number) => ({ kind: 'fade' as const, delay, duration })

describe('animation timeline', () => {
  it('animEnd = latest delay + duration over drawn, animated elements', () => {
    const p = page({
      duration: 3,
      elements: [
        shape('rect', { anim: a(0.2, 0.6) }),
        text({ anim: a(3.5, 0.6) }),
        shape('rect', { anim: { kind: 'none', delay: 9, duration: 1 } }),
        shape('rect', { anim: a(8, 1), hidden: true }),
        text({ anim: a(6, 1), showIf: 'job5' }),
      ],
    })
    expect(animEnd(p, { job5: '' })).toBeCloseTo(4.1)
    expect(animEnd(p, { job5: 'x' })).toBeCloseTo(7)
    expect(animEnd(page({ elements: [shape('rect', {})] }))).toBe(0)
  })

  it('playLength stretches past the page length so every entrance finishes', () => {
    const p = page({ duration: 3, elements: [text({ anim: a(3.5, 0.6) })] })
    expect(playLength(p)).toBeCloseTo(4.1 + ANIM_TAIL)
    const q = page({ duration: 6, elements: [text({ anim: a(0.5, 0.6) })] })
    expect(playLength(q)).toBe(6)
    expect(playLength(page({ elements: [] }))).toBe(4)
    expect(playLength(q, undefined, 2)).toBe(2)
    expect(playLength(q, undefined, 0.5)).toBeCloseTo(1.1 + ANIM_TAIL)
  })

  it('the static (time undefined) state is fully visible; mid-delay is invisible', () => {
    expect(animState(a(5, 1), undefined).alpha).toBe(1)
    expect(animState(a(5, 1), 4).alpha).toBe(0)
    expect(animState(a(5, 1), 6).alpha).toBe(1)
  })

  it('delay slider max lets the entrance finish within the page', () => {
    expect(maxAnimDelay(4, { delay: 0, duration: 0.6 })).toBeCloseTo(3.4)
    expect(maxAnimDelay(1, { delay: 0, duration: 0.8 })).toBe(0.5)
    // an existing longer delay stays reachable
    expect(maxAnimDelay(2, { delay: 3, duration: 0.6 })).toBe(3)
  })
})
