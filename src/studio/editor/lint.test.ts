import { describe, expect, it } from 'vitest'
import { design, image, page, shape, text, type Design, type El } from '../engine/model'
import type { Measure } from '../engine/text'
import { alphaOf, contrastRatio, docColors, gradientColor, parseColor, toHex, withAlpha } from './colors'
import { backdropColor, elLabel, lintDesign, lintPage } from './lint'

// every character is 0.5em wide
const measure: Measure = (t, font, ls) => t.length * Number(/(\d+(?:\.\d+)?)px/.exec(font)![1]) * 0.5 + ls * Math.max(0, t.length - 1)

const mk = (els: El[], o: Partial<Design> = {}, bg = '#FFFFFF'): Design => design({ w: 1080, h: 1080, pages: [page({ bg: { color: bg }, elements: els })], ...o })
const kinds = (d: Design) => lintDesign(d, measure).map((i) => i.kind)
const ok = (o: Parameters<typeof text>[0] = {}) => text({ x: 100, y: 100, w: 800, h: 200, text: 'Hello there', color: '#0C184D', style: { size: 40 }, ...o })

describe('colours', () => {
  it('parses hex and rgb()', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseColor('#0C184D')).toEqual({ r: 12, g: 24, b: 77, a: 1 })
    expect(parseColor('#00000080')?.a).toBeCloseTo(0.5, 2)
    expect(parseColor('rgba(10, 20, 30, 0.4)')).toEqual({ r: 10, g: 20, b: 30, a: 0.4 })
    expect(parseColor('transparent')?.a).toBe(0)
    expect(parseColor('papayawhip')).toBeNull()
    expect(parseColor(undefined)).toBeNull()
  })
  it('converts to hex and alpha', () => {
    expect(toHex('rgb(41, 64, 218)')).toBe('#2940DA')
    expect(toHex('nope', '#123456')).toBe('#123456')
    expect(withAlpha('#0C184D', 0.5)).toBe('rgba(12, 24, 77, 0.5)')
    expect(withAlpha('#0c184d', 1)).toBe('#0C184D')
    expect(alphaOf('rgba(0,0,0,0.25)')).toBe(0.25)
  })
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
    expect(contrastRatio('#777777', '#FFFFFF')!).toBeGreaterThan(4.4)
    expect(contrastRatio('#777777', '#FFFFFF')!).toBeLessThan(4.6)
    expect(contrastRatio('wat', '#FFFFFF')).toBeNull()
  })
  it('averages gradients and collects document colours by use', () => {
    expect(gradientColor({ type: 'linear', angle: 0, stops: [{ at: 0, color: '#000000' }, { at: 1, color: '#FFFFFF' }] })).toBe('#808080')
    const d = mk([ok(), ok(), shape('rect', { fill: '#e74599' }), shape('rect', { fill: 'transparent' })], {}, '#0C184D')
    const cs = docColors(d)
    expect(cs[0]).toBe('#0C184D') // page + two texts
    expect(cs).toContain('#E74599')
    expect(cs).toHaveLength(2)
  })
})

describe('lint', () => {
  it('a clean design has no issues', () => {
    expect(kinds(mk([ok()]))).toEqual([])
  })

  it('flags text that overflows even at the minimum size', () => {
    const d = mk([ok({ id: 't', w: 200, h: 40, text: 'word '.repeat(200) })])
    const issues = lintDesign(d, measure)
    expect(issues.map((i) => i.kind)).toContain('overflow')
    expect(issues.find((i) => i.kind === 'overflow')).toMatchObject({ severity: 'error', elId: 't', pageIndex: 0 })
  })
  it('flags fixed-size text that overflows', () => {
    expect(kinds(mk([ok({ w: 100, h: 40, fit: 'fixed', text: 'this will never fit in there' })]))).toContain('overflow')
  })
  it('does not flag text that shrinks to fit', () => {
    expect(kinds(mk([ok({ w: 600, h: 60, style: { size: 60 }, text: 'Shrinks a little bit' })]))).toEqual([])
  })

  it('flags empty {{fields}} with their labels', () => {
    const d = mk([ok({ text: '{{job_title}} in {{location}}' })], {
      fields: { job_title: 'ICU Nurse', location: '  ' },
      fieldDefs: [{ key: 'location', label: 'Location', example: 'Phoenix, AZ' }],
    })
    const issues = lintDesign(d, measure)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ kind: 'missing', severity: 'error' })
    expect(issues[0].message).toBe('Empty field: Location')
  })
  it('a text that is only an empty field reports the field, nothing else', () => {
    expect(kinds(mk([ok({ text: '{{pay}}', color: '#FFFFFF' })]))).toEqual(['missing'])
  })

  it('flags elements off the page', () => {
    expect(kinds(mk([shape('rect', { x: -500, y: 0, w: 100, h: 100 })]))).toEqual(['outside'])
    // bleeding off the edge is normal for shapes and photos…
    expect(kinds(mk([shape('rect', { x: -50, y: -50, w: 400, h: 400 }), image({ x: 900, y: 0, w: 400, h: 400 })]))).toEqual([])
    // …but not for text
    expect(kinds(mk([ok({ x: 900, w: 400 })]))).toEqual(['outside'])
  })
  it('uses rotated bounds', () => {
    // a 600×40 bar rotated 90° around its centre pokes 250px above the page
    expect(kinds(mk([ok({ x: 100, y: 30, w: 600, h: 40, rotation: 90, style: { size: 20 } })]))).toContain('outside')
  })
  it('ignores hidden elements', () => {
    expect(kinds(mk([{ ...shape('rect', { x: -500, y: 0 }), hidden: true }]))).toEqual([])
  })

  it('flags low contrast against the page background', () => {
    expect(kinds(mk([ok({ color: '#FFFFFF' })], {}, '#F4F4F4'))).toEqual(['contrast'])
    expect(kinds(mk([ok({ color: '#FFFFFF' })], {}, '#0C184D'))).toEqual([])
  })
  it('uses the pill, or the shape behind the text, as the backdrop', () => {
    const pill = ok({ color: '#FFFFFF', bg: { color: '#E74599', radius: 20, padX: 10, padY: 10 } })
    expect(kinds(mk([pill]))).toEqual([])
    const card = shape('rect', { x: 50, y: 50, w: 900, h: 300, fill: '#0C184D' })
    expect(kinds(mk([card, ok({ color: '#FFFFFF' })]))).toEqual([])
    expect(kinds(mk([card, ok({ color: '#101a50' })]))).toEqual(['contrast'])
  })
  it('skips the contrast check over photos and for outlined text', () => {
    const photo = image({ x: 0, y: 0, w: 1080, h: 1080 })
    const d = mk([photo, ok({ id: 't', color: '#FFFFFF' })])
    expect(backdropColor(d.pages[0], d.pages[0].elements[1] as never)).toBeNull()
    expect(kinds(d)).toEqual([])
    expect(kinds(mk([ok({ color: '#FFFFFF', stroke: { color: '#000000', width: 3 } })]))).toEqual([])
  })
  it('averages a gradient page background', () => {
    const d = mk([ok({ color: '#FFFFFF' })])
    d.pages[0].bg.gradient = { type: 'linear', angle: 0, stops: [{ at: 0, color: '#0C184D' }, { at: 1, color: '#2940DA' }] }
    expect(kinds(d)).toEqual([])
  })

  it('flags text under 14px on a 1080-wide design, scaled for other sizes', () => {
    expect(kinds(mk([ok({ style: { size: 12 } })]))).toEqual(['small'])
    expect(kinds(mk([ok({ style: { size: 14 } })]))).toEqual([])
    // 12px on a 540-wide design reads like 24px on 1080
    expect(kinds(design({ w: 540, h: 540, pages: [page({ elements: [ok({ x: 20, y: 20, w: 400, h: 100, style: { size: 12 } })] })] }))).toEqual([])
    // the size AFTER shrinking is what counts
    const shrunk = ok({ w: 100, h: 13, style: { size: 30 }, minSize: 6, text: 'abcdefghijklmnop' })
    expect(kinds(mk([shrunk]))).toContain('small')
  })

  it('reports per page with stable keys', () => {
    const d = mk([ok()])
    d.pages.push(page({ elements: [ok({ id: 'x', style: { size: 10 } })] }))
    const issues = lintDesign(d, measure)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ pageIndex: 1, elId: 'x', key: '1:x:small' })
    expect(lintPage(d, 0, measure)).toEqual([])
    expect(lintPage(d, 7, measure)).toEqual([])
  })
})

describe('elLabel', () => {
  it('prefers the name, then resolved text, then the type', () => {
    expect(elLabel(text({ name: 'Headline', text: 'x' }))).toBe('Headline')
    expect(elLabel(text({ text: '{{job_title}} now' }), { job_title: 'RN' })).toBe('RN now')
    expect(elLabel(text({ text: '{{job_title}}' }), {})).toBe('‹job_title›')
    expect(elLabel(text({ text: 'a'.repeat(60) })).length).toBe(28)
    expect(elLabel(image({ bind: 'location' }))).toBe('Photo (location)')
    expect(elLabel(shape('ellipse', {}))).toBe('Circle')
  })
})
