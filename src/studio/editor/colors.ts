// Colour helpers (pure): parsing, WCAG contrast, document palette.

import type { Design, Gradient } from '../engine/model'

export const BRAND_COLORS = ['#0C184D', '#2940DA', '#12C4D1', '#E74599', '#FFFFFF', '#9A9FC4']

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/** #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba(); null for anything else */
export function parseColor(c: string | undefined | null): Rgba | null {
  if (!c) return null
  const s = c.trim().toLowerCase()
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  if (s.startsWith('#')) {
    let h = s.slice(1)
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('')
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h)) return null
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    }
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/)
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    if (p.length >= 3 && p.every((n) => Number.isFinite(n))) return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }
  }
  return null
}

const h2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

/** #RRGGBB (alpha dropped) — what <input type=color> needs */
export function toHex(c: string | undefined | null, fallback = '#000000'): string {
  const p = parseColor(c)
  return p ? `#${h2(p.r)}${h2(p.g)}${h2(p.b)}`.toUpperCase() : fallback
}

export function withAlpha(c: string, alpha: number): string {
  const p = parseColor(c) ?? { r: 0, g: 0, b: 0, a: 1 }
  const a = Math.max(0, Math.min(1, alpha))
  return a >= 1 ? toHex(c) : `rgba(${p.r}, ${p.g}, ${p.b}, ${Math.round(a * 100) / 100})`
}

export function alphaOf(c: string | undefined | null): number {
  return parseColor(c)?.a ?? 1
}

/** WCAG relative luminance */
export function luminance(c: Rgba): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}

/** WCAG contrast ratio 1..21; null when either colour can't be parsed */
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseColor(a)
  const cb = parseColor(b)
  if (!ca || !cb) return null
  const la = luminance(ca)
  const lb = luminance(cb)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** one representative colour for a gradient (average of its stops) */
export function gradientColor(g: Gradient): string {
  const cs = g.stops.map((s) => parseColor(s.color)).filter((c): c is Rgba => !!c)
  if (!cs.length) return '#808080'
  const avg = (k: 'r' | 'g' | 'b') => cs.reduce((s, c) => s + c[k], 0) / cs.length
  return `#${h2(avg('r'))}${h2(avg('g'))}${h2(avg('b'))}`.toUpperCase()
}

/** colours used in the document, most used first (opaque hex, max `limit`) */
export function docColors(d: Design, limit = 12): string[] {
  const count = new Map<string, number>()
  const add = (c: string | undefined | null) => {
    const p = parseColor(c)
    if (!p || p.a === 0) return
    const hex = toHex(c)
    count.set(hex, (count.get(hex) ?? 0) + 1)
  }
  for (const p of d.pages) {
    add(p.bg.color)
    p.bg.gradient?.stops.forEach((s) => add(s.color))
    for (const el of p.elements) {
      if (el.type === 'text') {
        add(el.color)
        add(el.bg?.color)
        add(el.stroke?.color)
      } else if (el.type === 'shape') {
        add(el.fill)
        add(el.stroke?.color)
        el.gradient?.stops.forEach((s) => add(s.color))
      } else if (el.type === 'effect') {
        add(el.fx.color)
        add(el.fx.color2)
      } else {
        add(el.filters.overlay?.color)
      }
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, limit)
}
