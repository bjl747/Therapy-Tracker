import { describe, expect, it } from 'vitest'
import { blurRGBA, boxesForGauss, FAIL_RETRY_MS, quantizeSigma, shouldRetry } from './images'

const solid = (w: number, h: number, rgba: [number, number, number, number]) => {
  const px = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < px.length; i += 4) px.set(rgba, i)
  return px
}

describe('pixel blur (Safari has no ctx.filter)', () => {
  it('3 boxes approximate the Gaussian variance', () => {
    for (const sigma of [1, 2.5, 6, 10]) {
      const boxes = boxesForGauss(sigma, 3)
      expect(boxes.every((b) => b % 2 === 1)).toBe(true)
      const variance = boxes.reduce((v, b) => v + (b * b - 1) / 12, 0)
      const tol = sigma < 2 ? 0.25 : 0.12 // integer boxes are coarse at 1 px
      expect(Math.sqrt(variance)).toBeGreaterThan(sigma * (1 - tol))
      expect(Math.sqrt(variance)).toBeLessThan(sigma * (1 + tol))
    }
  })

  it('leaves a flat image flat (edges clamped, no fringe)', () => {
    const px = solid(9, 7, [200, 40, 10, 255])
    blurRGBA(px, 9, 7, 3)
    for (let i = 0; i < px.length; i += 4) expect([...px.subarray(i, i + 4)]).toEqual([200, 40, 10, 255])
  })

  it('spreads a point symmetrically and keeps its energy', () => {
    const w = 41
    const px = solid(w, w, [0, 0, 0, 255])
    const c = (20 * w + 20) * 4
    px[c] = 255
    blurRGBA(px, w, w, 2)
    const at = (x: number, y: number) => px[(y * w + x) * 4]
    expect(at(20, 20)).toBeLessThan(255)
    expect(at(20, 20)).toBeGreaterThan(at(22, 20))
    expect(at(18, 20)).toBe(at(22, 20))
    expect(at(20, 17)).toBe(at(20, 23))
    expect(at(30, 30)).toBe(0)
    let sum = 0
    for (let i = 0; i < px.length; i += 4) sum += px[i]
    expect(sum).toBeGreaterThan(200)
    expect(sum).toBeLessThan(310)
  })

  it('premultiplies alpha: a logo on transparency gets no dark halo', () => {
    const w = 21
    const px = solid(w, 1, [0, 0, 0, 0])
    for (let x = 0; x < 10; x++) px.set([255, 0, 0, 255], x * 4)
    blurRGBA(px, w, 1, 2)
    for (let x = 0; x < w; x++) {
      const i = x * 4
      if (px[i + 3] > 8) expect(px[i]).toBeGreaterThan(240) // stays red where visible
    }
    expect(px[12 * 4 + 3]).toBeGreaterThan(0)
    expect(px[12 * 4 + 3]).toBeLessThan(255)
  })

  it('quantises the radius (cache-friendly while resizing)', () => {
    expect(quantizeSigma(0.1)).toBe(0)
    expect(quantizeSigma(1.13)).toBe(1.25)
    const steps = new Set<number>()
    for (let v = 20; v <= 21; v += 0.01) {
      steps.add(quantizeSigma(v))
      expect(Math.abs(quantizeSigma(v) - v) / v).toBeLessThan(0.04)
    }
    expect(steps.size).toBeLessThanOrEqual(2)
  })
})

describe('failed image loads are time-boxed', () => {
  it('retries after the window, or straight away when forced (export)', () => {
    expect(shouldRetry(undefined, 1000)).toBe(true)
    expect(shouldRetry(1000, 1000 + FAIL_RETRY_MS - 1)).toBe(false)
    expect(shouldRetry(1000, 1000 + FAIL_RETRY_MS)).toBe(true)
    expect(shouldRetry(1000, 1001, true)).toBe(true)
  })
})
