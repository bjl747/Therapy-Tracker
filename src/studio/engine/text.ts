// Text layout: word wrap + auto-shrink. Pure (takes a measure function) so
// it runs in tests without a canvas; the renderer passes a real one.

import type { TextStyle } from './model'

export type Measure = (text: string, font: string, letterSpacing: number) => number

export interface TextLayout {
  lines: { text: string; width: number }[]
  size: number
  lineHeight: number
  /** total block height */
  height: number
  /** doesn't fit even at the minimum size */
  overflow: boolean
}

export function fontString(style: TextStyle, size: number): string {
  const fam = /[\s,]/.test(style.family) ? `"${style.family}"` : style.family
  return `${style.italic ? 'italic ' : ''}${style.weight} ${size}px ${fam}, "Inter", system-ui, sans-serif`
}

/** greedy word wrap; words longer than the line are broken by character */
export function wrap(text: string, maxW: number, measureLine: (t: string) => number): { text: string; width: number }[] {
  const out: { text: string; width: number }[] = []
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/).filter((w) => w.length > 0)
    let line = ''
    const push = (t: string) => out.push({ text: t, width: measureLine(t) })
    for (const word of words) {
      const candidate = line + word
      if (!line || measureLine(candidate.trimEnd()) <= maxW) {
        // a single word wider than the box: break it
        if (!line && measureLine(word) > maxW && word.trim()) {
          let chunk = ''
          for (const ch of word) {
            if (chunk && measureLine(chunk + ch) > maxW) {
              push(chunk)
              chunk = ch
            } else chunk += ch
          }
          line = chunk
        } else {
          line = candidate
        }
      } else {
        push(line.trimEnd())
        line = /^\s+$/.test(word) ? '' : word
      }
    }
    push(line.trimEnd())
  }
  return out
}

function layoutAt(text: string, style: TextStyle, size: number, w: number, measure: Measure) {
  const font = fontString(style, size)
  const ls = style.letterSpacing * (size / style.size || 1)
  const m = (t: string) => measure(t, font, ls)
  const lines = wrap(text, w, m)
  const lineHeight = size * style.lineHeight
  // a word that had to be broken mid-word counts as "not fitting"
  const brokeWord = text
    .split(/\s+/)
    .some((word) => word && m(word) > w + 0.5)
  return { lines, lineHeight, height: lines.length * lineHeight, brokeWord }
}

export function layoutText(
  raw: string,
  style: TextStyle,
  box: { w: number; h: number },
  fit: 'shrink' | 'fixed',
  measure: Measure,
  minSize?: number,
): TextLayout {
  const text = style.upper ? raw.toUpperCase() : raw
  const fits = (l: ReturnType<typeof layoutAt>) => l.height <= box.h + 0.5 && !l.brokeWord
  let size = style.size
  let l = layoutAt(text, style, size, box.w, measure)
  if (fit === 'shrink' && !fits(l)) {
    const floor = Math.max(6, minSize ?? Math.round(style.size * 0.35))
    let lo = floor
    let hi = style.size
    let best = layoutAt(text, style, lo, box.w, measure)
    let bestSize = lo
    if (fits(best)) {
      // binary search the largest size that fits (0.5px precision)
      while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2
        const t = layoutAt(text, style, mid, box.w, measure)
        if (fits(t)) {
          lo = mid
          best = t
          bestSize = mid
        } else hi = mid
      }
    }
    size = bestSize
    l = best
  }
  return {
    lines: l.lines,
    size,
    lineHeight: l.lineHeight,
    height: l.height,
    overflow: !fits(l),
  }
}
