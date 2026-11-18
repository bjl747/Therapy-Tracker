// ─────────────────────────────────────────────────────────────
// GIF89a encoder. Pure TypeScript, no DOM, so it runs in a Web Worker, on the
// main thread, and under vitest (node).
//
//  • One GLOBAL palette: exact when the frames hold ≤ maxColors unique
//    colours (flat brand graphics stay pixel-perfect), otherwise median-cut
//    over a 5-bit-per-channel histogram sampled across every frame.
//  • Identical consecutive frames are merged (delays add up).
//  • Later frames are cropped to the changed rectangle and unchanged pixels
//    become the transparent index (disposal 1), which keeps files small and
//    the quantiser away from untouched pixels.
//  • Optional Floyd–Steinberg dithering (default off).
// ─────────────────────────────────────────────────────────────

export interface GifFrame {
  /** RGBA, width*height*4 */
  data: Uint8ClampedArray
  delayMs: number
}

export interface GifOptions {
  /** 0 = loop forever (default); n = play n extra times */
  loop?: number
  /** palette size, 2..256 (default 256) */
  maxColors?: number
  /** Floyd–Steinberg error diffusion (default false) */
  dither?: boolean
  /** 0..1, called while encoding (sync + worker) */
  onProgress?: (p: number) => void
}

export interface Palette {
  /** RGB triplets, length = colors*3 */
  rgb: Uint8Array
  /** true when every sampled colour is present verbatim */
  exact: boolean
}

// ── helpers ─────────────────────────────────────────────────

function toU32(d: Uint8ClampedArray): Uint32Array {
  if (d.byteOffset % 4 === 0) return new Uint32Array(d.buffer, d.byteOffset, d.length >> 2)
  return new Uint32Array(d.slice().buffer)
}

function sameFrame(a: Uint32Array, b: Uint32Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

class Bytes {
  buf = new Uint8Array(1 << 16)
  len = 0
  private grow(n: number) {
    if (this.len + n <= this.buf.length) return
    let cap = this.buf.length
    while (cap < this.len + n) cap *= 2
    const nb = new Uint8Array(cap)
    nb.set(this.buf.subarray(0, this.len))
    this.buf = nb
  }
  byte(b: number) {
    this.grow(1)
    this.buf[this.len++] = b
  }
  u16(v: number) {
    this.byte(v & 255)
    this.byte((v >> 8) & 255)
  }
  str(s: string) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i))
  }
  bytes(a: Uint8Array, from = 0, to = a.length) {
    this.grow(to - from)
    this.buf.set(a.subarray(from, to), this.len)
    this.len += to - from
  }
  result() {
    return this.buf.slice(0, this.len)
  }
}

// ── quantiser ───────────────────────────────────────────────

const EXACT_CAP = 256

/**
 * Build a palette of at most `maxColors` colours from RGBA frames.
 * Pixels with alpha < 128 are ignored (they become the transparent index).
 */
export function buildPalette(frames: { data: Uint8ClampedArray }[], maxColors: number): Palette {
  maxColors = Math.max(2, Math.min(256, Math.floor(maxColors)))
  const views = frames.map((f) => toU32(f.data))

  // pass 1 — exact colour set (bails as soon as it exceeds maxColors)
  const keys = new Int32Array(1024).fill(-1)
  const uniq: number[] = []
  let exact = true
  outer: for (const px of views) {
    let last = -2
    for (let i = 0; i < px.length; i++) {
      const p = px[i]
      if (p >>> 24 < 128) continue
      const k = p & 0xffffff
      if (k === last) continue
      last = k
      let h = (Math.imul(k, 0x9e3779b1) >>> 22) & 1023
      for (;;) {
        const e = keys[h]
        if (e === k) break
        if (e === -1) {
          keys[h] = k
          uniq.push(k)
          break
        }
        h = (h + 1) & 1023
      }
      if (uniq.length > maxColors || uniq.length > EXACT_CAP) {
        exact = false
        break outer
      }
    }
  }
  if (exact) {
    const rgb = new Uint8Array(Math.max(1, uniq.length) * 3)
    uniq.forEach((k, i) => {
      rgb[i * 3] = k & 255
      rgb[i * 3 + 1] = (k >> 8) & 255
      rgb[i * 3 + 2] = (k >> 16) & 255
    })
    return { rgb, exact: true }
  }

  // pass 2 — sampled 5-bit histogram with exact per-bin means
  const count = new Float64Array(32768)
  const sr = new Float64Array(32768)
  const sg = new Float64Array(32768)
  const sb = new Float64Array(32768)
  let total = 0
  for (const px of views) total += px.length
  const step = Math.max(1, Math.floor(total / 1_500_000)) | 1
  for (const px of views) {
    for (let i = 0; i < px.length; i += step) {
      const p = px[i]
      if (p >>> 24 < 128) continue
      const r = p & 255
      const g = (p >> 8) & 255
      const b = (p >> 16) & 255
      const bin = (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10)
      count[bin]++
      sr[bin] += r
      sg[bin] += g
      sb[bin] += b
    }
  }
  const all: number[] = []
  for (let i = 0; i < 32768; i++) if (count[i] > 0) all.push(i)

  interface Box {
    bins: number[]
    n: number
    score: number
    ch: number
  }
  const analyse = (bins: number[]): Box => {
    let n = 0
    let r0 = 31, r1 = 0, g0 = 31, g1 = 0, b0 = 31, b1 = 0
    for (const b of bins) {
      n += count[b]
      const r = b & 31, g = (b >> 5) & 31, bl = b >> 10
      if (r < r0) r0 = r
      if (r > r1) r1 = r
      if (g < g0) g0 = g
      if (g > g1) g1 = g
      if (bl < b0) b0 = bl
      if (bl > b1) b1 = bl
    }
    const dr = (r1 - r0) * 2, dg = (g1 - g0) * 3, db = (b1 - b0) * 1.5 // rough perceptual weights
    const m = Math.max(dr, dg, db)
    return { bins, n, score: bins.length > 1 ? n * (m + 1) : -1, ch: m === dg ? 1 : m === dr ? 0 : 2 }
  }
  const boxes: Box[] = [analyse(all)]
  while (boxes.length < maxColors) {
    let bi = -1
    let best = 0
    for (let i = 0; i < boxes.length; i++) if (boxes[i].score > best) { best = boxes[i].score; bi = i }
    if (bi < 0) break
    const box = boxes[bi]
    const sh = box.ch === 0 ? 0 : box.ch === 1 ? 5 : 10
    const bins = box.bins.slice().sort((a, b) => ((a >> sh) & 31) - ((b >> sh) & 31))
    let acc = 0
    let cut = 1
    for (let i = 0; i < bins.length - 1; i++) {
      acc += count[bins[i]]
      cut = i + 1
      if (acc >= box.n / 2) break
    }
    boxes.splice(bi, 1, analyse(bins.slice(0, cut)), analyse(bins.slice(cut)))
  }
  const rgb = new Uint8Array(boxes.length * 3)
  boxes.forEach((bx, i) => {
    let n = 0, r = 0, g = 0, b = 0
    for (const bin of bx.bins) {
      n += count[bin]
      r += sr[bin]
      g += sg[bin]
      b += sb[bin]
    }
    rgb[i * 3] = Math.round(r / n)
    rgb[i * 3 + 1] = Math.round(g / n)
    rgb[i * 3 + 2] = Math.round(b / n)
  })
  return { rgb, exact: false }
}

interface Mapper {
  /** palette index for 0xAABBGGRR pixel (alpha ignored) */
  map(p: number): number
  /** nearest palette index for arbitrary clamped RGB */
  nearest(r: number, g: number, b: number): number
}

function makeMapper(pal: Palette): Mapper {
  const n = pal.rgb.length / 3
  const rgb = pal.rgb
  const search = (r: number, g: number, b: number) => {
    let best = 0
    let bd = Infinity
    for (let i = 0; i < n; i++) {
      const dr = r - rgb[i * 3], dg = g - rgb[i * 3 + 1], db = b - rgb[i * 3 + 2]
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 3
      if (d < bd) { bd = d; best = i; if (d === 0) break }
    }
    return best
  }
  if (pal.exact) {
    const hk = new Int32Array(1024).fill(-1)
    const hv = new Uint8Array(1024)
    for (let i = 0; i < n; i++) {
      const k = rgb[i * 3] | (rgb[i * 3 + 1] << 8) | (rgb[i * 3 + 2] << 16)
      let h = (Math.imul(k, 0x9e3779b1) >>> 22) & 1023
      while (hk[h] !== -1 && hk[h] !== k) h = (h + 1) & 1023
      hk[h] = k
      hv[h] = i
    }
    return {
      map(p) {
        const k = p & 0xffffff
        let h = (Math.imul(k, 0x9e3779b1) >>> 22) & 1023
        for (;;) {
          const e = hk[h]
          if (e === k) return hv[h]
          if (e === -1) return search(k & 255, (k >> 8) & 255, k >> 16)
          h = (h + 1) & 1023
        }
      },
      nearest: search,
    }
  }
  const cache = new Int16Array(1 << 18).fill(-1)
  const near = (r: number, g: number, b: number) => {
    const key = (r >> 2) | ((g >> 2) << 6) | ((b >> 2) << 12)
    let v = cache[key]
    if (v < 0) {
      v = search(r, g, b)
      cache[key] = v
    }
    return v
  }
  return { map: (p) => near(p & 255, (p >> 8) & 255, (p >> 16) & 255), nearest: near }
}

// ── LZW ─────────────────────────────────────────────────────

const HSIZE = 8192

/** GIF variable-width LZW; writes data sub-blocks (without the min-code-size byte) */
export function lzwEncode(pix: Uint8Array, minCode: number, out: Bytes): void {
  const clear = 1 << minCode
  const eoi = clear + 1
  const hk = new Int32Array(HSIZE)
  const hv = new Int16Array(HSIZE)
  let next = eoi + 1
  let size = minCode + 1
  let cur = 0
  let nbits = 0
  const block = new Uint8Array(255)
  let bl = 0
  const emit = (code: number) => {
    cur |= code << nbits
    nbits += size
    while (nbits >= 8) {
      block[bl++] = cur & 255
      cur >>>= 8
      nbits -= 8
      if (bl === 255) {
        out.byte(255)
        out.bytes(block, 0, 255)
        bl = 0
      }
    }
  }
  hk.fill(-1)
  emit(clear)
  let prefix = pix[0]
  for (let i = 1; i < pix.length; i++) {
    const c = pix[i]
    const key = (prefix << 8) | c
    let h = Math.imul(key, 0x9e3779b1) >>> 19
    let found = -1
    for (;;) {
      const e = hk[h]
      if (e === key) { found = hv[h]; break }
      if (e === -1) break
      h = (h + 1) & (HSIZE - 1)
    }
    if (found >= 0) {
      prefix = found
      continue
    }
    emit(prefix)
    if (next === 4096) {
      emit(clear)
      hk.fill(-1)
      next = eoi + 1
      size = minCode + 1
    } else {
      if (next >= 1 << size) size++
      hk[h] = key
      hv[h] = next++
    }
    prefix = c
  }
  emit(prefix)
  emit(eoi)
  if (nbits > 0) block[bl++] = cur & 255
  if (bl > 0) {
    out.byte(bl)
    out.bytes(block, 0, bl)
  }
  out.byte(0)
}

// ── frame → indices ─────────────────────────────────────────

interface Region {
  x: number
  y: number
  w: number
  h: number
  idx: Uint8Array
}

function indexFrame(
  px: Uint32Array,
  prev: Uint32Array | null,
  width: number,
  height: number,
  transp: number,
  mapper: Mapper,
  dither: boolean,
): Region {
  let x0 = 0, y0 = 0, x1 = width - 1, y1 = height - 1
  if (prev) {
    x0 = width; y0 = height; x1 = -1; y1 = -1
    for (let y = 0; y < height; y++) {
      const row = y * width
      let first = -1
      for (let x = 0; x < width; x++) if (px[row + x] !== prev[row + x]) { first = x; break }
      if (first < 0) continue
      let last = width - 1
      while (px[row + last] === prev[row + last]) last--
      if (y < y0) y0 = y
      y1 = y
      if (first < x0) x0 = first
      if (last > x1) x1 = last
    }
    if (x1 < 0) return { x: 0, y: 0, w: 1, h: 1, idx: new Uint8Array([transp]) }
  }
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const idx = new Uint8Array(w * h)
  const pal = mapper
  if (!dither) {
    let o = 0
    for (let y = y0; y <= y1; y++) {
      const row = y * width
      for (let x = x0; x <= x1; x++, o++) {
        const p = px[row + x]
        idx[o] = (prev && prev[row + x] === p) || p >>> 24 < 128 ? transp : pal.map(p)
      }
    }
    return { x: x0, y: y0, w, h, idx }
  }
  // Floyd–Steinberg (serpentine off for simplicity); palette colours come from mapper via nearest()
  let e0 = new Float32Array((w + 2) * 3)
  let e1 = new Float32Array((w + 2) * 3)
  const rgb = (mapper as Mapper & { rgb?: Uint8Array }).rgb
  let o = 0
  for (let y = y0; y <= y1; y++) {
    const row = y * width
    e1.fill(0)
    for (let x = x0; x <= x1; x++, o++) {
      const p = px[row + x]
      const ex = (x - x0 + 1) * 3
      if ((prev && prev[row + x] === p) || p >>> 24 < 128) {
        idx[o] = transp
        continue
      }
      const r = Math.min(255, Math.max(0, (p & 255) + e0[ex]))
      const g = Math.min(255, Math.max(0, ((p >> 8) & 255) + e0[ex + 1]))
      const b = Math.min(255, Math.max(0, ((p >> 16) & 255) + e0[ex + 2]))
      const k = mapper.nearest(r | 0, g | 0, b | 0)
      idx[o] = k
      const dr = r - rgb![k * 3], dg = g - rgb![k * 3 + 1], db = b - rgb![k * 3 + 2]
      for (let c = 0; c < 3; c++) {
        const d = c === 0 ? dr : c === 1 ? dg : db
        e0[ex + 3 + c] += (d * 7) / 16
        e1[ex - 3 + c] += (d * 3) / 16
        e1[ex + c] += (d * 5) / 16
        e1[ex + 3 + c] += d / 16
      }
    }
    const t = e0; e0 = e1; e1 = t
  }
  return { x: x0, y: y0, w, h, idx }
}

// ── public ──────────────────────────────────────────────────

export function encodeGif(frames: GifFrame[], width: number, height: number, opts: GifOptions = {}): Uint8Array {
  if (!frames.length) throw new Error('encodeGif: no frames')
  const need = width * height * 4
  for (const f of frames) if (f.data.length !== need) throw new Error('encodeGif: frame size does not match width×height')

  // de-duplicate consecutive identical frames
  const views = frames.map((f) => toU32(f.data))
  const uniq: { f: GifFrame; px: Uint32Array; delay: number }[] = []
  frames.forEach((f, i) => {
    const last = uniq[uniq.length - 1]
    if (last && sameFrame(last.px, views[i])) last.delay += f.delayMs
    else uniq.push({ f, px: views[i], delay: f.delayMs })
  })

  const maxColors = Math.max(2, Math.min(256, Math.floor(opts.maxColors ?? 256)))
  let hasAlpha = false
  for (const u of uniq) {
    for (let i = 0; i < u.px.length; i++) if (u.px[i] >>> 24 < 128) { hasAlpha = true; break }
    if (hasAlpha) break
  }
  const useDiff = !hasAlpha && uniq.length > 1
  const reserve = hasAlpha || useDiff ? 1 : 0
  const pal = buildPalette(uniq.map((u) => u.f), maxColors - reserve)
  const ncol = pal.rgb.length / 3
  const transp = reserve ? ncol : -1
  const tableBits = Math.max(1, Math.ceil(Math.log2(ncol + reserve)))
  const tableSize = 1 << tableBits
  const mapper = makeMapper(pal) as Mapper & { rgb?: Uint8Array }
  mapper.rgb = pal.rgb

  const out = new Bytes()
  out.str('GIF89a')
  out.u16(width)
  out.u16(height)
  out.byte(0x80 | (7 << 4) | (tableBits - 1))
  out.byte(0)
  out.byte(0)
  const table = new Uint8Array(tableSize * 3)
  table.set(pal.rgb)
  out.bytes(table)
  if (uniq.length > 1 && opts.loop !== -1) {
    out.byte(0x21); out.byte(0xff); out.byte(11); out.str('NETSCAPE2.0')
    out.byte(3); out.byte(1); out.u16(opts.loop ?? 0); out.byte(0)
  }

  const minCode = Math.max(2, tableBits)
  let carry = 0 // ms rounding carry so total duration stays accurate
  uniq.forEach((u, i) => {
    const ms = u.delay + carry
    const cs = Math.max(2, Math.min(65535, Math.round(ms / 10)))
    carry = ms - cs * 10
    const region = indexFrame(u.px, useDiff && i > 0 ? uniq[i - 1].px : null, width, height, transp, mapper, !!opts.dither)
    out.byte(0x21); out.byte(0xf9); out.byte(4)
    out.byte(((hasAlpha ? 2 : 1) << 2) | (reserve ? 1 : 0))
    out.u16(cs)
    out.byte(reserve ? transp : 0)
    out.byte(0)
    out.byte(0x2c)
    out.u16(region.x); out.u16(region.y); out.u16(region.w); out.u16(region.h)
    out.byte(0)
    out.byte(minCode)
    lzwEncode(region.idx, minCode, out)
    opts.onProgress?.((i + 1) / uniq.length)
  })
  out.byte(0x3b)
  return out.result()
}

// ── worker wrapper ──────────────────────────────────────────

/** the parts of a Worker the wrapper uses (a fake in tests) */
export interface GifWorkerLike {
  onmessage: ((e: { data: any }) => void) | null
  onerror: ((e: { message?: string; preventDefault?: () => void }) => void) | null
  postMessage(msg: unknown, transfer: Transferable[]): void
  terminate(): void
}

const defaultWorker = (): GifWorkerLike | null =>
  typeof Worker === 'undefined' ? null : (new Worker(new URL('./gif.worker.ts', import.meta.url), { type: 'module' }) as unknown as GifWorkerLike)

/** how long to wait for the worker script to load before encoding on the main thread */
const READY_TIMEOUT_MS = 8000

/**
 * Encode in a module Web Worker when available, else on the main thread.
 *
 * Frame buffers are TRANSFERRED to the worker (no copy — they can be tens of
 * MB), which detaches the caller's frames. So the worker first says "ready";
 * only then are the frames sent. If it fails to start (construction throws,
 * the script doesn't load, no "ready" in time) the frames are still intact
 * and we encode on the main thread. If it fails AFTER the transfer, the
 * worker's real error is surfaced — a fallback would only see empty buffers.
 */
export async function encodeGifAsync(
  frames: GifFrame[],
  width: number,
  height: number,
  opts: Omit<GifOptions, 'onProgress'> = {},
  onProgress?: (p: number) => void,
  createWorker: () => GifWorkerLike | null = defaultWorker,
): Promise<Uint8Array> {
  let worker: GifWorkerLike | null = null
  try {
    worker = createWorker()
  } catch {
    worker = null
  }
  if (worker) {
    const w = worker
    try {
      // null = the worker never got the frames → encode here instead
      const bytes = await new Promise<Uint8Array | null>((resolve, reject) => {
        let sent = false
        const timer = setTimeout(() => {
          if (!sent) resolve(null)
        }, READY_TIMEOUT_MS)
        w.onmessage = (e) => {
          const m = e.data
          if (m?.type === 'ready') {
            if (sent) return
            sent = true
            clearTimeout(timer)
            const transfer: ArrayBuffer[] = []
            const payload = frames.map((f) => {
              const whole = f.data.byteOffset === 0 && f.data.byteLength === f.data.buffer.byteLength
              const data = whole ? f.data : new Uint8ClampedArray(f.data)
              transfer.push(data.buffer as ArrayBuffer)
              return { data, delayMs: f.delayMs }
            })
            try {
              w.postMessage({ frames: payload, width, height, opts }, transfer)
            } catch {
              // postMessage throws before transferring anything → frames intact
              resolve(null)
            }
          } else if (m?.type === 'progress') onProgress?.(m.p)
          else if (m?.type === 'done') resolve(m.bytes)
          else if (m?.type === 'error') reject(new Error(m.message || 'The GIF encoder failed'))
        }
        w.onerror = (e) => {
          e.preventDefault?.()
          clearTimeout(timer)
          if (!sent) resolve(null)
          else reject(new Error(e.message ? `The GIF encoder stopped: ${e.message}` : 'The GIF encoder stopped (the GIF may be too big — try a shorter or smaller page)'))
        }
      })
      if (bytes) return bytes
    } finally {
      w.terminate()
    }
  }
  return encodeGif(frames, width, height, { ...opts, onProgress })
}
