import { describe, expect, it } from 'vitest'
import { drawEffect } from './effects'
import { effect, type EffectSpec } from './model'

/** a canvas stand-in that writes down what was drawn */
function recorder() {
  const log: string[] = []
  let depth = 0
  const grad = () => ({ addColorStop: (at: number, c: string) => log.push(`stop ${at} ${c}`) })
  const ctx = {
    globalCompositeOperation: 'source-over',
    fillStyle: '' as unknown,
    save: () => void depth++,
    restore: () => void depth--,
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    translate: (x: number, y: number) => log.push(`translate ${x.toFixed(2)} ${y.toFixed(2)}`),
    rotate: () => {},
    scale: () => {},
    arc: (x: number, y: number, r: number) => log.push(`arc ${x.toFixed(2)} ${y.toFixed(2)} ${r.toFixed(2)}`),
    fill: () => void log.push('fill'),
    fillRect: (x: number, y: number, w: number, h: number) => void log.push(`rect ${x} ${y} ${w} ${h}`),
    createRadialGradient: grad,
    createLinearGradient: grad,
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log, depth: () => depth, raw: ctx }
}
const fills = (log: string[]) => log.filter((l) => l === 'fill' || l.startsWith('rect')).length

const ALL: EffectSpec[] = [
  { kind: 'glow', color: '#3B6BFF', intensity: 0.8 },
  { kind: 'flare', color: '#4F8CFF', color2: '#12C4D1', intensity: 0.85, streak: true, rays: 12, ghosts: true, angle: 135 },
  { kind: 'leak', color: '#E74598', color2: '#263FD9', intensity: 0.8, angle: 20 },
  { kind: 'bokeh', color: '#12C4D1', intensity: 0.9, count: 14, seed: 4 },
  { kind: 'sparkles', color: '#9CC3FF', intensity: 1, count: 9, seed: 9 },
]

describe('light effects', () => {
  it('every kind draws, as added light, and leaves the canvas as it found it', () => {
    for (const fx of ALL) {
      const r = recorder()
      let mode = ''
      const fill = r.raw.fill
      r.raw.fill = () => {
        mode = r.raw.globalCompositeOperation
        fill()
      }
      const rect = r.raw.fillRect
      r.raw.fillRect = (...a: [number, number, number, number]) => {
        mode = r.raw.globalCompositeOperation
        rect(...a)
      }
      drawEffect(r.ctx, fx, 0, 0, 400, 300)
      expect(fills(r.log), fx.kind).toBeGreaterThan(0)
      expect(mode, fx.kind).toBe('screen')
      expect(r.depth(), fx.kind).toBe(0)
    }
  })

  it('draws nothing at zero strength or in an empty box', () => {
    for (const fx of ALL) {
      const off = recorder()
      drawEffect(off.ctx, { ...fx, intensity: 0 }, 0, 0, 400, 300)
      expect(off.log).toEqual([])
      const empty = recorder()
      drawEffect(empty.ctx, fx, 0, 0, 0, 300)
      expect(empty.log).toEqual([])
    }
  })

  it('scattered effects come out the same every time, and a new seed moves them', () => {
    const fx = ALL[3]
    const a = recorder()
    const b = recorder()
    const c = recorder()
    drawEffect(a.ctx, fx, 0, 0, 400, 300)
    drawEffect(b.ctx, fx, 0, 0, 400, 300)
    drawEffect(c.ctx, { ...fx, seed: 5 }, 0, 0, 400, 300)
    expect(a.log).toEqual(b.log)
    expect(a.log).not.toEqual(c.log)
  })

  it('count sets how many are drawn; flare parts switch on and off', () => {
    const arcs = (fx: EffectSpec) => {
      const r = recorder()
      drawEffect(r.ctx, fx, 0, 0, 400, 400)
      return r.log.filter((l) => l.startsWith('arc')).length
    }
    expect(arcs({ kind: 'bokeh', color: '#fff', intensity: 1, count: 6 })).toBe(6)
    expect(arcs({ kind: 'bokeh', color: '#fff', intensity: 1, count: 20 })).toBe(20)
    const bare = arcs({ kind: 'flare', color: '#fff', intensity: 1 })
    expect(arcs({ kind: 'flare', color: '#fff', intensity: 1, ghosts: true })).toBe(bare + 5)
    expect(arcs({ kind: 'flare', color: '#fff', intensity: 1, streak: true })).toBe(bare + 1)
    expect(arcs({ kind: 'flare', color: '#fff', intensity: 1, rays: 8 })).toBe(bare + 8)
  })

  it('a bad colour falls back to white instead of breaking the page', () => {
    const r = recorder()
    drawEffect(r.ctx, { kind: 'glow', color: 'not-a-colour', intensity: 1 }, 0, 0, 100, 100)
    expect(r.log.some((l) => l.includes('rgba(255,255,255'))).toBe(true)
  })

  it('effect() makes a normal element: id, box, opacity, its light', () => {
    const e = effect({ x: 10, y: 20, w: 300, h: 200, fx: ALL[0], name: 'Glow' })
    expect(e.type).toBe('effect')
    expect(e.id).toBeTruthy()
    expect([e.x, e.y, e.w, e.h]).toEqual([10, 20, 300, 200])
    expect(e.fx.kind).toBe('glow')
  })
})
