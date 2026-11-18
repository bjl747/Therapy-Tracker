import { describe, expect, it } from 'vitest'
import { buildPalette, encodeGif } from './gif'

// ── tiny GIF decoder (global palette, frames composited with transparency) ──
function lzwDecode(minCode: number, data: Uint8Array, count: number): Uint8Array {
  const clear = 1 << minCode
  const eoi = clear + 1
  const out = new Uint8Array(count)
  let o = 0
  let size = minCode + 1
  let dict: number[][] = []
  const reset = () => {
    dict = []
    for (let i = 0; i < clear; i++) dict.push([i])
    dict.push([], [])
    size = minCode + 1
  }
  reset()
  let bits = 0, cur = 0, pos = 0
  let prev: number[] | null = null
  for (;;) {
    while (bits < size && pos < data.length) { cur |= data[pos++] << bits; bits += 8 }
    if (bits < size) break
    const code = cur & ((1 << size) - 1)
    cur >>>= size
    bits -= size
    if (code === clear) { reset(); prev = null; continue }
    if (code === eoi) break
    let entry: number[]
    if (code < dict.length) entry = dict[code]
    else if (prev) entry = [...prev, prev[0]]
    else throw new Error('bad code')
    for (const b of entry) if (o < count) out[o++] = b
    if (prev) dict.push([...prev, entry[0]])
    prev = entry
    if (dict.length === 1 << size && size < 12) size++
  }
  return out
}

interface Decoded {
  w: number
  h: number
  loop: number | null
  frames: { rgba: Uint8Array; delayCs: number }[]
  trailer: number
}

function decodeGif(b: Uint8Array): Decoded {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  expect(String.fromCharCode(...b.subarray(0, 6))).toBe('GIF89a')
  const w = dv.getUint16(6, true)
  const h = dv.getUint16(8, true)
  const flags = b[10]
  let p = 13
  const tsize = 1 << ((flags & 7) + 1)
  const pal = b.subarray(p, p + tsize * 3)
  p += tsize * 3
  const canvas = new Uint8Array(w * h * 4)
  const frames: Decoded['frames'] = []
  let loop: number | null = null
  let delay = 0, transp = -1, disposal = 0
  for (;;) {
    const t = b[p++]
    if (t === 0x3b) break
    if (t === 0x21) {
      const label = b[p++]
      if (label === 0xf9) {
        const f = b[p + 1]
        disposal = (f >> 2) & 7
        delay = dv.getUint16(p + 2, true)
        transp = f & 1 ? b[p + 4] : -1
      } else if (label === 0xff && String.fromCharCode(...b.subarray(p + 1, p + 12)) === 'NETSCAPE2.0') {
        loop = dv.getUint16(p + 15, true)
      }
      while (b[p] !== 0) p += b[p] + 1
      p++
      continue
    }
    expect(t).toBe(0x2c)
    const x = dv.getUint16(p, true), y = dv.getUint16(p + 2, true)
    const fw = dv.getUint16(p + 4, true), fh = dv.getUint16(p + 6, true)
    expect(b[p + 8]).toBe(0) // no local table
    p += 9
    const minCode = b[p++]
    const chunks: number[] = []
    while (b[p] !== 0) { for (let i = 0; i < b[p]; i++) chunks.push(b[p + 1 + i]); p += b[p] + 1 }
    p++
    const idx = lzwDecode(minCode, Uint8Array.from(chunks), fw * fh)
    const before = canvas.slice()
    for (let j = 0; j < fh; j++)
      for (let i = 0; i < fw; i++) {
        const k = idx[j * fw + i]
        if (k === transp) continue
        const o = ((y + j) * w + x + i) * 4
        canvas[o] = pal[k * 3]; canvas[o + 1] = pal[k * 3 + 1]; canvas[o + 2] = pal[k * 3 + 2]; canvas[o + 3] = 255
      }
    frames.push({ rgba: canvas.slice(), delayCs: delay })
    if (disposal === 2) canvas.fill(0)
    else if (disposal === 3) canvas.set(before)
  }
  return { w, h, loop, frames, trailer: b[b.length - 1] }
}

function solid(w: number, h: number, f: (x: number, y: number) => [number, number, number, number?]) {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = f(x, y)
      d.set([r, g, b, a], (y * w + x) * 4)
    }
  return d
}

describe('encodeGif', () => {
  it('writes a valid single frame and round-trips pixels', () => {
    const w = 13, h = 9
    const colors: [number, number, number][] = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [10, 20, 30], [255, 255, 255]]
    const data = solid(w, h, (x, y) => colors[(x * 3 + y) % colors.length])
    const gif = encodeGif([{ data, delayMs: 100 }], w, h)
    const d = decodeGif(gif)
    expect(d.w).toBe(w)
    expect(d.h).toBe(h)
    expect(d.trailer).toBe(0x3b)
    expect(d.frames).toHaveLength(1)
    expect(d.frames[0].delayCs).toBe(10)
    expect(Array.from(d.frames[0].rgba)).toEqual(Array.from(data))
  })

  it('round-trips a 256-colour image (table resets, width growth)', () => {
    const w = 128, h = 128
    // pseudo-random so LZW fills and resets its dictionary
    let s = 12345
    const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) >>> 16) & 255
    const pal = Array.from({ length: 256 }, (_, i) => [i, (i * 7) & 255, (i * 13) & 255] as [number, number, number])
    const data = solid(w, h, () => pal[rnd()])
    const d = decodeGif(encodeGif([{ data, delayMs: 50 }], w, h))
    expect(Array.from(d.frames[0].rgba)).toEqual(Array.from(data))
  })

  it('merges identical consecutive frames and sums their delays', () => {
    const a = solid(8, 8, () => [255, 0, 0])
    const b = solid(8, 8, (x) => (x < 4 ? [255, 0, 0] : [0, 0, 255]))
    const gif = encodeGif(
      [
        { data: a, delayMs: 100 },
        { data: a.slice(), delayMs: 200 },
        { data: b, delayMs: 100 },
      ],
      8,
      8,
      { loop: 0 },
    )
    const d = decodeGif(gif)
    expect(d.frames).toHaveLength(2)
    expect(d.frames[0].delayCs).toBe(30)
    expect(d.loop).toBe(0)
    expect(Array.from(d.frames[0].rgba)).toEqual(Array.from(a.map((v, i) => (i % 4 === 3 ? 255 : v))))
    expect(Array.from(d.frames[1].rgba)).toEqual(Array.from(b))
  })

  it('reconstructs delta-coded frames exactly', () => {
    const frames = Array.from({ length: 5 }, (_, f) => ({
      data: solid(20, 20, (x, y) => (x === f * 3 && y > 2 ? [200, 100, 0] : [x < 10 ? 0 : 90, 40, 80])),
      delayMs: 70,
    }))
    const d = decodeGif(encodeGif(frames, 20, 20))
    expect(d.frames).toHaveLength(5)
    d.frames.forEach((fr, i) => expect(Array.from(fr.rgba)).toEqual(Array.from(frames[i].data)))
  })

  it('handles transparent pixels', () => {
    const data = solid(6, 6, (x) => (x < 3 ? [1, 2, 3, 0] : [200, 0, 0, 255]))
    const d = decodeGif(encodeGif([{ data, delayMs: 100 }], 6, 6))
    expect(d.frames[0].rgba[3]).toBe(0)
    expect(Array.from(d.frames[0].rgba.subarray(12, 16))).toEqual([200, 0, 0, 255])
  })

  it('quantises a photo-like gradient to ≤ maxColors and stays close', () => {
    const w = 64, h = 64
    const data = solid(w, h, (x, y) => [x * 4, y * 4, (x + y) * 2])
    const d = decodeGif(encodeGif([{ data, delayMs: 100 }], w, h, { maxColors: 64 }))
    const used = new Set<number>()
    let err = 0
    for (let i = 0; i < w * h; i++) {
      const o = i * 4
      used.add(d.frames[0].rgba[o] | (d.frames[0].rgba[o + 1] << 8) | (d.frames[0].rgba[o + 2] << 16))
      err += Math.abs(d.frames[0].rgba[o] - data[o]) + Math.abs(d.frames[0].rgba[o + 1] - data[o + 1]) + Math.abs(d.frames[0].rgba[o + 2] - data[o + 2])
    }
    expect(used.size).toBeLessThanOrEqual(64)
    expect(err / (w * h * 3)).toBeLessThan(12)
  })

  it('dithering option still decodes to the palette', () => {
    const data = solid(32, 32, (x, y) => [x * 8, y * 8, 128])
    const d = decodeGif(encodeGif([{ data, delayMs: 100 }], 32, 32, { maxColors: 16, dither: true }))
    expect(new Set(Array.from({ length: 1024 }, (_, i) => d.frames[0].rgba.subarray(i * 4, i * 4 + 3).join())).size).toBeLessThanOrEqual(16)
  })

  it('rejects mismatched frame sizes', () => {
    expect(() => encodeGif([{ data: new Uint8ClampedArray(4), delayMs: 10 }], 2, 2)).toThrow()
    expect(() => encodeGif([], 2, 2)).toThrow()
  })
})

describe('buildPalette', () => {
  it('keeps exact colours when ≤ 256 unique', () => {
    const cols: [number, number, number][] = Array.from({ length: 200 }, (_, i) => [i, 255 - i, (i * 5) & 255])
    const data = solid(40, 40, (x, y) => cols[(x + y * 40) % 200])
    const p = buildPalette([{ data }], 256)
    expect(p.exact).toBe(true)
    expect(p.rgb.length / 3).toBe(200)
    const got = new Set<string>()
    for (let i = 0; i < 200; i++) got.add(p.rgb.subarray(i * 3, i * 3 + 3).join())
    expect(got).toEqual(new Set(cols.map((c) => c.join())))
  })

  it('median-cuts to at most maxColors when there are more', () => {
    const data = solid(64, 64, (x, y) => [x * 4, y * 4, 0])
    const p = buildPalette([{ data }], 32)
    expect(p.exact).toBe(false)
    expect(p.rgb.length / 3).toBeLessThanOrEqual(32)
    expect(p.rgb.length / 3).toBeGreaterThan(16)
  })
})
