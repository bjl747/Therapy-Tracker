// Text layout: word wrap + auto-shrink. Pure (takes a measure function) so
// it runs in tests without a canvas; the renderer passes a real one.

import type { TextStyle } from './model'

/** `kerning` false = plain letter widths (TextStyle.kerning); a measure function may ignore it */
export type Measure = (text: string, font: string, letterSpacing: number, kerning?: boolean) => number

export interface TextLayout {
  lines: { text: string; width: number }[]
  size: number
  lineHeight: number
  /** total block height */
  height: number
  /** doesn't fit even at the minimum size */
  overflow: boolean
}

/** `__text__` inside a text underlines just that run (the wage blanks on the job post: "$__ 39 __"). A row of plain
 *  underscores ("______") is left alone. Returns the text without the marks and the underlined ranges in it. */
export function inlineUnderline(raw: string): { plain: string; ranges: [number, number][] } {
  if (!raw.includes('__')) return { plain: raw, ranges: [] }
  const ranges: [number, number][] = []
  let plain = ''
  let last = 0
  // a run may hold single underscores (the editor's ‹wage_low› placeholder), never a double one
  for (const m of raw.matchAll(/__((?:[^_]|_(?!_))+?)__/g)) {
    plain += raw.slice(last, m.index)
    ranges.push([plain.length, plain.length + m[1].length])
    plain += m[1]
    last = m.index + m[0].length
  }
  return { plain: plain + raw.slice(last), ranges }
}

export function fontString(style: TextStyle, size: number): string {
  const fam = /[\s,]/.test(style.family) ? `"${style.family}"` : style.family
  return `${style.italic ? 'italic ' : ''}${style.weight} ${size}px ${fam}, "Inter", system-ui, sans-serif`
}

/** greedy word wrap; any word longer than the line is broken by character */
export function wrap(text: string, maxW: number, measureLine: (t: string) => number): { text: string; width: number }[] {
  const out: { text: string; width: number }[] = []
  const push = (t: string) => out.push({ text: t, width: measureLine(t) })
  /** break an over-long word into full lines; returns the leftover tail */
  const breakWord = (word: string): string => {
    let chunk = ''
    for (const ch of word) {
      if (chunk && measureLine(chunk + ch) > maxW) {
        push(chunk)
        chunk = ch
      } else chunk += ch
    }
    return chunk
  }
  for (const para of text.split('\n')) {
    // break at ordinary spaces only: a non-breaking space (\u00A0) keeps its neighbours on one line
    const words = para.split(/([ \t]+)/).filter((w) => w.length > 0)
    let line = ''
    for (const word of words) {
      const isSpace = /^[ \t]+$/.test(word)
      const candidate = line + word
      if (!line || measureLine(candidate.trimEnd()) <= maxW) {
        if (!isSpace && measureLine(line ? candidate.trimEnd() : word) > maxW) {
          // the word itself doesn't fit on any line: finish this line, then break it
          if (line.trim()) push(line.trimEnd())
          line = breakWord(word)
        } else line = isSpace && !line ? '' : candidate
      } else {
        push(line.trimEnd())
        if (isSpace) line = ''
        else line = measureLine(word) > maxW ? breakWord(word) : word
      }
    }
    push(line.trimEnd())
  }
  return out
}

function layoutAt(text: string, style: TextStyle, size: number, w: number, measure: Measure) {
  const font = fontString(style, size)
  const ls = style.letterSpacing * (size / style.size || 1)
  const m = (t: string) => measure(t, font, ls, style.kerning !== false)
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
