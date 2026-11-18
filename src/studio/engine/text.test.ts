import { describe, expect, it } from 'vitest'
import { DEFAULT_TEXT_STYLE, type TextStyle } from './model'
import { fontString, layoutText, wrap, type Measure } from './text'

// fake metrics: every character is 0.5em wide (+ letter spacing between characters)
const sizeOf = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)![1])
const measure: Measure = (t, font, ls) => t.length * sizeOf(font) * 0.5 + ls * Math.max(0, t.length - 1)
const chars = (t: string) => t.length * 10 // 10px per character
const style = (o: Partial<TextStyle> = {}): TextStyle => ({ ...DEFAULT_TEXT_STYLE, size: 20, lineHeight: 1, ...o })

describe('wrap', () => {
  it('keeps short text on one line', () => {
    expect(wrap('hello world', 200, chars)).toEqual([{ text: 'hello world', width: 110 }])
  })
  it('breaks at spaces, greedily', () => {
    expect(wrap('aaa bbb ccc ddd', 70, chars).map((l) => l.text)).toEqual(['aaa bbb', 'ccc ddd'])
  })
  it('respects explicit newlines, including blank lines', () => {
    expect(wrap('one\n\ntwo', 500, chars).map((l) => l.text)).toEqual(['one', '', 'two'])
  })
  it('breaks a single over-long word by character', () => {
    const lines = wrap('abcdefghij', 40, chars)
    expect(lines.map((l) => l.text)).toEqual(['abcd', 'efgh', 'ij'])
    expect(lines.every((l) => l.width <= 40)).toBe(true)
  })
  it('does not carry trailing spaces to the measured width', () => {
    const lines = wrap('aaaa bbbb', 45, chars)
    expect(lines).toEqual([
      { text: 'aaaa', width: 40 },
      { text: 'bbbb', width: 40 },
    ])
  })
})

describe('fontString', () => {
  it('quotes families with spaces and adds fallbacks', () => {
    expect(fontString(style({ family: 'Playfair Display', weight: 700 }), 32)).toBe('700 32px "Playfair Display", "Inter", system-ui, sans-serif')
    expect(fontString(style({ family: 'Inter', italic: true, weight: 400 }), 12)).toMatch(/^italic 400 12px Inter,/)
  })
})

describe('layoutText', () => {
  it('lays out at the requested size when it fits', () => {
    const l = layoutText('hello', style(), { w: 100, h: 20 }, 'shrink', measure)
    expect(l.size).toBe(20)
    expect(l.lines).toHaveLength(1)
    expect(l.overflow).toBe(false)
    expect(l.height).toBe(20)
  })
  it('shrinks to the largest size that fits the box', () => {
    // 20 chars at 10px = 200px wide in a 100px box, one line high → must shrink to ≈10px
    const l = layoutText('abcdefghijklmnopqrst', style(), { w: 100, h: 20 }, 'shrink', measure)
    expect(l.overflow).toBe(false)
    expect(l.size).toBeLessThanOrEqual(10)
    expect(l.size).toBeGreaterThan(9.4)
    expect(l.lines).toHaveLength(1)
  })
  it('prefers wrapping over shrinking when there is height for it', () => {
    const l = layoutText('aaaa bbbb cccc', style(), { w: 50, h: 60 }, 'shrink', measure)
    expect(l.size).toBe(20)
    expect(l.lines.map((x) => x.text)).toEqual(['aaaa', 'bbbb', 'cccc'])
    expect(l.overflow).toBe(false)
  })
  it('reports overflow when it cannot fit even at the minimum size', () => {
    const l = layoutText('x'.repeat(400), style(), { w: 40, h: 10 }, 'shrink', measure, 8)
    expect(l.size).toBe(8)
    expect(l.overflow).toBe(true)
  })
  it('never shrinks below minSize (default 35% of the size, floor 6)', () => {
    const l = layoutText('x'.repeat(400), style({ size: 40 }), { w: 40, h: 10 }, 'shrink', measure)
    expect(l.size).toBe(14)
    const tiny = layoutText('x'.repeat(400), style({ size: 10 }), { w: 10, h: 5 }, 'shrink', measure)
    expect(tiny.size).toBe(6)
  })
  it("'fixed' never changes the size and flags overflow", () => {
    const l = layoutText('abcdefghijklmnopqrst', style(), { w: 100, h: 20 }, 'fixed', measure)
    expect(l.size).toBe(20)
    expect(l.overflow).toBe(true)
  })
  it('measures in upper case when the style says so', () => {
    const seen: string[] = []
    layoutText('Hello', style({ upper: true }), { w: 500, h: 50 }, 'fixed', (t, f, ls) => (seen.push(t), measure(t, f, ls)))
    expect(seen.every((t) => t === t.toUpperCase())).toBe(true)
  })
  it('scales letter spacing with the fitted size', () => {
    const spacings = new Set<number>()
    const l = layoutText('abcdefghij', style({ letterSpacing: 4 }), { w: 60, h: 20 }, 'shrink', (t, f, ls) => (spacings.add(ls), measure(t, f, ls)))
    expect(l.size).toBeLessThan(20)
    expect([...spacings].some((s) => s < 4)).toBe(true)
  })
})
