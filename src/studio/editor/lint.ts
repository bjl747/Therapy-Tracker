// "Ready to post" checks (pure). The editor passes the renderer's real
// measure function; tests pass a fake one.

import { isDrawn, type Design, type El, type Page, type TextEl } from '../engine/model'
import { missingKeys, resolveText } from '../engine/fields'
import { aabb, hitEl, type Rect } from '../engine/geometry'
import { inlineUnderline, layoutText, type Measure } from '../engine/text'
import { contrastRatio, gradientColor, parseColor } from './colors'

export type LintKind = 'overflow' | 'missing' | 'outside' | 'contrast' | 'small'

export interface LintIssue {
  /** stable key for React lists */
  key: string
  kind: LintKind
  severity: 'error' | 'warn'
  pageIndex: number
  elId: string
  /** short label of the element ("Heading", first words of the text…) */
  label: string
  message: string
}

/** smallest comfortable text size on a 1080px-wide post */
export const MIN_TEXT_PX = 14
export const MIN_CONTRAST = 3

export function elLabel(el: El, fields: Record<string, string> = {}): string {
  if (el.name) return el.name
  if (el.type === 'text') {
    const t = resolveText(el.text, fields, true).replace(/\s+/g, ' ').trim()
    return t.length > 28 ? `${t.slice(0, 27)}…` : t || 'Text'
  }
  if (el.type === 'image') return el.bind ? `Photo (${el.bind})` : 'Image'
  if (el.type === 'effect') return { flare: 'Lens flare', glow: 'Glow', leak: 'Light leak', bokeh: 'Bokeh', sparkles: 'Sparkles' }[el.fx.kind]
  return { rect: 'Rectangle', ellipse: 'Circle', line: 'Line', triangle: 'Triangle', star: 'Star', path: 'Icon' }[el.shape]
}

const inside = (r: Rect, page: { w: number; h: number }, tol = 0.5) =>
  r.x >= -tol && r.y >= -tol && r.x + r.w <= page.w + tol && r.y + r.h <= page.h + tol
const fullyOutside = (r: Rect, page: { w: number; h: number }) =>
  r.x + r.w <= 0 || r.y + r.h <= 0 || r.x >= page.w || r.y >= page.h

/**
 * The colour directly behind a text element: its own pill, else the topmost
 * solid shape under its centre, else the page. null = unknown (a photo or a
 * translucent layer is behind it) → the contrast check is skipped.
 */
export function backdropColor(page: Page, el: TextEl, fields?: Record<string, string>): string | null {
  if (el.bg && (parseColor(el.bg.color)?.a ?? 0) > 0.9) return el.bg.color
  const c = { x: el.x + el.w / 2, y: el.y + el.h / 2 }
  const idx = page.elements.findIndex((e) => e.id === el.id)
  for (let i = idx - 1; i >= 0; i--) {
    const under = page.elements[i]
    if (!isDrawn(under, fields) || under.opacity < 0.05 || !hitEl(under, c)) continue
    if (under.type === 'image') return null
    if (under.type === 'text') continue
    if (under.type === 'effect') continue // light over the background, not a background of its own
    if (under.shape === 'line' || under.shape === 'path' || under.shape === 'star' || under.shape === 'triangle') continue
    if (under.opacity < 0.9) return null
    if (under.gradient) return gradientColor(under.gradient)
    const p = parseColor(under.fill)
    if (!p) return null
    if (p.a === 0) continue
    if (p.a < 0.9) return null
    return under.fill
  }
  return page.bg.gradient ? gradientColor(page.bg.gradient) : page.bg.color
}

export function lintPage(design: Design, pageIndex: number, measure: Measure): LintIssue[] {
  const page = design.pages[pageIndex]
  if (!page) return []
  const out: LintIssue[] = []
  const add = (el: El, kind: LintKind, severity: LintIssue['severity'], message: string) =>
    out.push({ key: `${pageIndex}:${el.id}:${kind}`, kind, severity, pageIndex, elId: el.id, label: elLabel(el, design.fields), message })

  for (const el of page.elements) {
    // hidden layers and switched-off conditional rows (roundups) aren't drawn — nothing to check
    if (!isDrawn(el, design.fields)) continue
    const box = aabb(el)
    if (fullyOutside(box, design)) {
      add(el, 'outside', 'warn', 'Is completely off the page and will not appear')
      continue
    }
    if (el.type !== 'text') continue

    const missing = [...new Set(missingKeys(el.text, design.fields))]
    if (missing.length) {
      const names = missing.map((k) => design.fieldDefs?.find((f) => f.key === k)?.label ?? k)
      add(el, 'missing', 'error', `Empty field${missing.length > 1 ? 's' : ''}: ${names.join(', ')}`)
    }
    const txt = resolveText(el.text, design.fields)
    if (!txt.trim()) continue

    if (!inside(box, design)) add(el, 'outside', 'warn', 'Text runs past the edge of the page')

    // measured the way it is drawn: `__run__` marks taken out (layoutText passes the element's kerning to `measure`)
    const l = layoutText(inlineUnderline(txt).plain, el.style, { w: el.w, h: el.h }, el.fit, measure, el.minSize)
    if (l.overflow)
      add(el, 'overflow', 'error', el.fit === 'shrink' ? 'Text does not fit its box even at the smallest size' : 'Text overflows its box')

    const px = l.size * (1080 / design.w)
    if (px < MIN_TEXT_PX) add(el, 'small', 'warn', `Text is very small (${Math.round(l.size)}px) — hard to read on a phone`)

    const bg = backdropColor(page, el, design.fields)
    const ratio = bg ? contrastRatio(el.color, bg) : null
    if (ratio !== null && ratio < MIN_CONTRAST && !el.stroke && !el.shadow)
      add(el, 'contrast', 'warn', `Low contrast against the background (${ratio.toFixed(1)}:1)`)
  }
  return out
}

export function lintDesign(design: Design, measure: Measure): LintIssue[] {
  return design.pages.flatMap((_, i) => lintPage(design, i, measure))
}
