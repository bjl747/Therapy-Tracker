import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SHAPE_LIBRARY, SHAPE_LIBRARY_COUNT } from './shapeLibrary'

const numbers = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)

describe('shape library', () => {
  const all = SHAPE_LIBRARY.flatMap((g) => g.items)

  it('every shape has its own name and a usable outline', () => {
    expect(all.length).toBe(SHAPE_LIBRARY_COUNT)
    expect(new Set(all.map((s) => s.name)).size).toBe(all.length)
    for (const s of all) {
      expect(s.path, s.name).toMatch(/^M[\d\s.,MLHVCAZ-]+$/)
      // drawn in the engine's 100 × 100 box (a curve's handle may sit just outside it)
      for (const n of numbers(s.path)) expect(n, s.name).toBeGreaterThanOrEqual(-5)
      for (const n of numbers(s.path)) expect(n, s.name).toBeLessThanOrEqual(105)
      if (s.ratio != null) expect(s.ratio, s.name).toBeGreaterThan(0)
    }
  })

  it('filled shapes are closed; line shapes carry a thickness', () => {
    for (const s of all) {
      if (s.line) expect(s.line, s.name).toBeGreaterThan(0)
      else expect(s.path.trim().endsWith('Z'), s.name).toBe(true)
    }
  })
})

// the element files the panel loads (public/studio, built by scripts/build-elements.mts)
describe('element files', () => {
  const dir = join(process.cwd(), 'public', 'studio')
  const json = <T>(f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T

  it('every sticker in the index has a file, and no file carries script or outside links', () => {
    const list = json<{ id: string; name: string; pack: string; tags: string[] }[]>('stickers/index.json')
    expect(list.length).toBeGreaterThan(150)
    expect(new Set(list.map((s) => s.id)).size).toBe(list.length)
    for (const s of list) {
      expect(s.id, s.id).toMatch(/^[a-z0-9-]+$/i)
      const file = join(dir, 'stickers', `${s.id}.svg`)
      expect(existsSync(file), s.id).toBe(true)
      const svg = readFileSync(file, 'utf8')
      expect(svg.startsWith('<svg '), s.id).toBe(true)
      expect(/<script|\son[a-z]+\s*=|href\s*=|javascript:|<foreignObject|<image|<iframe|url\((?!#)/i.test(svg), s.id).toBe(false)
      expect(/\swidth="\d+"\s+height="\d+"/.test(svg), s.id).toBe(true)
    }
  })

  it('icons are path data only', () => {
    const line = json<{ id: string; name: string; tags: string[]; d: string }[]>('icons/line.json')
    expect(line.length).toBeGreaterThan(1500)
    expect(new Set(line.map((i) => i.id)).size).toBe(line.length)
    for (const i of line) {
      const parts = i.d.split('|')
      // one part per drawing piece, each starting with its own move: a joined path would shift every later piece
      for (const part of parts) expect(part, i.id).toMatch(/^[Mm][MmLlHhVvCcSsQqTtAaZz\d\s.,e-]+$/)
    }
    const bolt = line.find((i) => i.id === 'cloud-lightning')!
    expect(bolt.d.split('|')).toHaveLength(2)
    expect(line.find((i) => i.id === 'navigation')!.d).toBe('M3 11L22 2L13 21L11 13L3 11Z')
    for (const f of ['icons/health-filled.json', 'icons/health-outline.json']) {
      const list = json<{ id: string; name: string; cat: string; tags: string[]; d: string }[]>(f)
      expect(list.length).toBeGreaterThan(700)
      expect(new Set(list.map((i) => i.id)).size).toBe(list.length)
      for (const i of list) {
        expect(i.name && i.cat, i.id).toBeTruthy()
        for (const part of i.d.split('|')) expect(part, i.id).toMatch(/^(E:)?[MmLlHhVvCcSsQqTtAaZz\d\s.,e-]+$/)
      }
    }
  })
})
