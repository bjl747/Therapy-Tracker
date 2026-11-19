// ─────────────────────────────────────────────────────────────
// The one renderer. Draws a page onto any Canvas 2D context — the editor,
// thumbnails, PNG/GIF/PDF exports all call this, so the screen and the
// downloaded file always match.
// ─────────────────────────────────────────────────────────────

import { isDrawn, type Anim, type Design, type El, type Gradient, type ImageEl, type Page, type ShapeEl, type TextEl } from './model'
import { resolveText } from './fields'
import { fontString, inlineUnderline, layoutText, type TextLayout } from './text'
import { drawEffect } from './effects'
import { filtered, getImage, loadImage, sizeOf } from './images'

type Ctx = CanvasRenderingContext2D

export interface BoundImage {
  src: string
  focus?: { x: number; y: number }
  credit?: ImageEl['credit']
}

export interface RenderOptions {
  /** device pixels per design pixel */
  scale: number
  /** seconds into the page's animation; undefined = final (static) state */
  time?: number
  /** editor: show ‹field› for empty markers */
  showMissing?: boolean
  /** don't draw these (e.g. the text being edited inline) */
  skip?: Set<string>
  /** bound images (location → city photo) */
  resolveImage?: (el: ImageEl, fields: Record<string, string>) => BoundImage | null
  /** transparent background (PNG with no page colour) */
  transparent?: boolean
  /** editor viewport: where the page's top-left lands on the canvas (device
   *  px). When set, drawing is clipped to the page rectangle so the canvas
   *  can be the size of the viewport instead of the page. */
  origin?: { x: number; y: number }
}

// ── text measurement (cached) ───────────────────────────────

let measureCtx: Ctx | null = null
function mctx(): Ctx {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!
  return measureCtx
}
const hasLetterSpacing = typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype

const setKerning = (c: Ctx, on: boolean) => {
  if ('fontKerning' in c) (c as Ctx & { fontKerning: string }).fontKerning = on ? 'auto' : 'none'
}

export function measure(text: string, font: string, ls: number, kerning = true): number {
  const c = mctx()
  c.font = font
  setKerning(c, kerning)
  if (hasLetterSpacing) (c as Ctx & { letterSpacing: string }).letterSpacing = `${ls}px`
  const w = c.measureText(text).width
  return hasLetterSpacing ? w : w + ls * Math.max(0, text.length - 1)
}

const layoutCache = new Map<string, TextLayout>()
export function textLayout(el: TextEl, rawText: string): TextLayout {
  const text = inlineUnderline(rawText).plain // `__run__` marks don't take up room
  const key = `${text}|${JSON.stringify(el.style)}|${el.w}|${el.h}|${el.fit}|${el.minSize ?? ''}`
  let l = layoutCache.get(key)
  if (!l) {
    l = layoutText(text, el.style, { w: el.w, h: el.h }, el.fit, measure, el.minSize)
    if (layoutCache.size > 3000) layoutCache.clear()
    layoutCache.set(key, l)
  }
  return l
}

/** forget cached layouts (after web fonts finish loading) */
export function clearTextCache(): void {
  layoutCache.clear()
}

// ── animation ───────────────────────────────────────────────

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeBack = (t: number) => {
  const c = 1.70158
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

export function animState(anim: Anim | undefined, time: number | undefined) {
  const s = { alpha: 1, dx: 0, dy: 0, scale: 1 }
  if (!anim || anim.kind === 'none' || time === undefined) return s
  const raw = Math.min(1, Math.max(0, (time - anim.delay) / Math.max(0.01, anim.duration)))
  const p = easeOut(raw)
  switch (anim.kind) {
    case 'fade':
      s.alpha = p
      break
    case 'rise':
      s.alpha = p
      s.dy = (1 - p) * 48
      break
    case 'slide-left':
      s.alpha = p
      s.dx = (1 - p) * -80
      break
    case 'slide-right':
      s.alpha = p
      s.dx = (1 - p) * 80
      break
    case 'zoom':
      s.alpha = p
      s.scale = 0.85 + 0.15 * p
      break
    case 'pop':
      s.alpha = Math.min(1, raw * 3)
      s.scale = raw === 0 ? 0.5 : 0.5 + 0.5 * easeBack(raw)
      break
  }
  return s
}

/** seconds until the page's last entrance animation finishes (0 = none).
 *  Pass the design's fields so switched-off showIf rows don't count. */
export function animEnd(page: Page, fields?: Record<string, string>): number {
  let end = 0
  for (const el of page.elements) {
    if (!el.anim || el.anim.kind === 'none' || !isDrawn(el, fields)) continue
    end = Math.max(end, Math.max(0, el.anim.delay) + Math.max(0.01, el.anim.duration))
  }
  return end
}

/** small pause after the last entrance before the final frame is held */
export const ANIM_TAIL = 0.25

/**
 * How long a page plays in the GIF and the preview: its length, stretched so
 * every entrance animation can finish (delays can exceed the page length,
 * e.g. after shortening a page that was auto-animated).
 */
export function playLength(page: Page, fields?: Record<string, string>, base = page.duration ?? 4): number {
  const end = animEnd(page, fields)
  return Math.max(base, end > 0 ? end + ANIM_TAIL : 0)
}

/** Animate panel's delay slider: the latest start that still lets the
 *  entrance finish within the page (never below the current value, so an
 *  existing delay isn't silently clamped). */
export function maxAnimDelay(pageLen: number, anim: Pick<Anim, 'delay' | 'duration'>): number {
  const fit = Math.floor(Math.max(0, pageLen - anim.duration) * 20 + 1e-9) / 20
  return Math.max(0.5, fit, anim.delay)
}

// ── primitives ──────────────────────────────────────────────

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function gradientFill(ctx: Ctx, g: Gradient, x: number, y: number, w: number, h: number): CanvasGradient {
  let grad: CanvasGradient
  if (g.type === 'radial') {
    grad = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) / 2)
  } else {
    const a = ((g.angle - 90) * Math.PI) / 180
    const cx = x + w / 2
    const cy = y + h / 2
    const len = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2
    grad = ctx.createLinearGradient(cx - Math.cos(a) * len, cy - Math.sin(a) * len, cx + Math.cos(a) * len, cy + Math.sin(a) * len)
  }
  for (const s of g.stops) grad.addColorStop(Math.min(1, Math.max(0, s.at)), s.color)
  return grad
}

function applyShadow(ctx: Ctx, s: { color: string; blur: number; x: number; y: number } | null | undefined, scale: number) {
  if (!s) return
  ctx.shadowColor = s.color
  ctx.shadowBlur = s.blur * scale
  ctx.shadowOffsetX = s.x * scale
  ctx.shadowOffsetY = s.y * scale
}

function starPath(ctx: Ctx, w: number, h: number, points: number) {
  const cx = w / 2
  const cy = h / 2
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 1 : 0.45
    const a = (Math.PI * i) / points - Math.PI / 2
    const px = cx + Math.cos(a) * (w / 2) * r
    const py = cy + Math.sin(a) * (h / 2) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

const pathCache = new Map<string, Path2D>()

function drawShape(ctx: Ctx, el: ShapeEl, scale: number) {
  const { w, h } = el
  ctx.fillStyle = el.gradient ? gradientFill(ctx, el.gradient, 0, 0, w, h) : el.fill
  if (el.shape === 'line') {
    const st = el.stroke ?? { color: el.fill, width: Math.max(1, h) }
    ctx.strokeStyle = st.color
    ctx.lineWidth = st.width
    ctx.lineCap = 'round'
    if (st.dash) ctx.setLineDash(st.dash)
    ctx.beginPath()
    ctx.moveTo(0, h / 2)
    ctx.lineTo(w, h / 2)
    ctx.stroke()
    return
  }
  applyShadow(ctx, el.shadow, scale)
  if (el.shape === 'path' && el.path) {
    const box = el.box && el.box > 0 ? el.box : 100
    // "|" joins parts; "E:" marks a part filled with the even-odd rule
    for (const part of el.path.split('|')) {
      const even = part.startsWith('E:')
      const d = even ? part.slice(2) : part
      let p = pathCache.get(d)
      if (!p) {
        p = new Path2D(d)
        if (pathCache.size > 4000) pathCache.clear()
        pathCache.set(d, p)
      }
      if (el.fill !== 'transparent') {
        ctx.save()
        ctx.scale(w / box, h / box)
        ctx.fill(p, even ? 'evenodd' : 'nonzero')
        ctx.restore()
      }
      if (el.stroke && el.stroke.width > 0) {
        // stroke the stretched outline, not a stretched stroke: the line keeps one thickness whatever the box's shape
        ctx.shadowColor = 'transparent'
        ctx.strokeStyle = el.stroke.color
        ctx.lineWidth = el.stroke.width
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        if (el.stroke.dash) ctx.setLineDash(el.stroke.dash)
        if (typeof DOMMatrix !== 'undefined') {
          const tp = new Path2D()
          tp.addPath(p, new DOMMatrix([w / box, 0, 0, h / box, 0, 0]))
          ctx.stroke(tp)
        } else {
          ctx.save()
          ctx.scale(w / box, h / box)
          ctx.lineWidth = el.stroke.width / (w / box)
          ctx.stroke(p)
          ctx.restore()
        }
      }
    }
    return
  }
  if (el.shape === 'rect') roundRect(ctx, 0, 0, w, h, el.radius)
  else if (el.shape === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
  } else if (el.shape === 'triangle') {
    ctx.beginPath()
    ctx.moveTo(w / 2, 0)
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
  } else if (el.shape === 'star') starPath(ctx, w, h, el.points ?? 5)
  if (el.fill !== 'transparent') ctx.fill()
  ctx.shadowColor = 'transparent'
  if (el.stroke && el.stroke.width > 0) {
    ctx.strokeStyle = el.stroke.color
    ctx.lineWidth = el.stroke.width
    if (el.stroke.dash) ctx.setLineDash(el.stroke.dash)
    ctx.stroke()
  }
}

/** A logo drawn at under half its file size in one step goes soft (the thin "Healthcare" under the GQR mark). Halve it
 *  in steps first and scale the last bit; the halves are kept per picture. `ratio` = drawn pixels ÷ file pixels. */
const halves = new WeakMap<object, HTMLCanvasElement[]>()
function halved(img: CanvasImageSource, iw: number, ih: number, ratio: number): CanvasImageSource {
  if (!(ratio > 0) || ratio > 0.5 || typeof document === 'undefined') return img
  const n = Math.min(3, Math.floor(Math.log2(1 / ratio))) // how many clean halvings fit above the drawn size
  let list = halves.get(img as object)
  if (!list) halves.set(img as object, (list = []))
  for (let i = list.length; i < n; i++) {
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(iw / 2 ** (i + 1)))
    c.height = Math.max(1, Math.round(ih / 2 ** (i + 1)))
    const x = c.getContext('2d')
    if (!x) return img
    x.imageSmoothingEnabled = true
    x.imageSmoothingQuality = 'high'
    x.drawImage(i ? list[i - 1] : img, 0, 0, c.width, c.height)
    list.push(c)
  }
  return list[n - 1] ?? img
}

/** source rectangle for a cover/contain crop around a focal point */
export function coverRect(
  iw: number,
  ih: number,
  bw: number,
  bh: number,
  focus: { x: number; y: number },
  zoom = 1,
): { sx: number; sy: number; sw: number; sh: number } {
  const boxR = bw / bh
  let sw = iw
  let sh = iw / boxR
  if (sh > ih) {
    sh = ih
    sw = ih * boxR
  }
  sw /= Math.max(1, zoom)
  sh /= Math.max(1, zoom)
  const sx = Math.min(iw - sw, Math.max(0, focus.x * iw - sw / 2))
  const sy = Math.min(ih - sh, Math.max(0, focus.y * ih - sh / 2))
  return { sx, sy, sw, sh }
}

function drawImage(ctx: Ctx, el: ImageEl, design: Design, opts: RenderOptions, kenT: number | null) {
  const bound = el.bind && opts.resolveImage ? opts.resolveImage(el, design.fields) : null
  const src = bound?.src || el.src
  const focus = bound?.focus ?? el.focus
  const raw = src ? getImage(src) : null
  const { w, h } = el
  ctx.save()
  roundRect(ctx, 0, 0, w, h, el.radius)
  ctx.clip()
  // best-quality scaling: logos are drawn at about a third of their file size, where the default goes soft
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (!raw) {
    if (src) void loadImage(src)
    // placeholder while loading / when empty. A bound photo with no match
    // gets a quiet brand-toned backdrop instead of a grey box.
    if (el.bind) {
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, '#1B2A6B')
      g.addColorStop(1, '#2940DA')
      ctx.fillStyle = g
    } else ctx.fillStyle = '#CBD2E6'
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
    return
  }
  // blur is in design px; convert to source-image px by how big the image is
  // drawn (cover: the cropped source spans the box width; contain: fitted)
  let blurSrcPx = 0
  if (el.filters.blur > 0) {
    const r = sizeOf(raw)
    const srcPerDesign = el.fit === 'contain' ? 1 / Math.min(w / r.w, h / r.h) : Math.min(r.w, (r.h * w) / h) / w / Math.max(1, el.zoom)
    blurSrcPx = el.filters.blur * srcPerDesign
  }
  const img = filtered(src, raw, el.filters, blurSrcPx)
  const { w: iw, h: ih } = sizeOf(img)
  if (el.flipX) {
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
  }
  if (el.fit === 'contain') {
    const s = Math.min(w / iw, h / ih)
    ctx.drawImage(halved(img, iw, ih, s * opts.scale), (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s)
  } else {
    // Ken Burns: slow zoom toward the focal point over the page
    const zoom = el.zoom * (kenT !== null ? 1 + 0.12 * kenT : 1)
    const r = coverRect(iw, ih, w, h, focus, zoom)
    ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h)
  }
  if (el.filters.overlay && el.filters.overlay.opacity > 0) {
    ctx.globalAlpha *= el.filters.overlay.opacity
    ctx.fillStyle = el.filters.overlay.color
    ctx.fillRect(0, 0, w, h)
  }
  ctx.restore()
}

function drawText(ctx: Ctx, el: TextEl, design: Design, opts: RenderOptions) {
  const raw = resolveText(el.text, design.fields, opts.showMissing)
  const l = textLayout(el, raw)
  // underlined runs (`__run__`), as positions in the text the lines were cut from
  const inline = inlineUnderline(raw)
  const flat = el.style.upper ? inline.plain.toUpperCase() : inline.plain
  // upper-casing can change a text's length (ß → SS); the ranges no longer line up then, so skip them
  const runs = flat.length === inline.plain.length ? inline.ranges : []
  let cursor = 0
  const { w, h } = el
  if (el.bg) {
    ctx.fillStyle = el.bg.color
    roundRect(ctx, -el.bg.padX, -el.bg.padY, w + el.bg.padX * 2, h + el.bg.padY * 2, el.bg.radius)
    ctx.fill()
  }
  ctx.font = fontString(el.style, l.size)
  setKerning(ctx, el.style.kerning !== false)
  const ls = el.style.letterSpacing * (l.size / el.style.size || 1)
  if (hasLetterSpacing) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${ls}px`
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = el.color
  const top = el.style.valign === 'middle' ? (h - l.height) / 2 : el.style.valign === 'bottom' ? h - l.height : 0
  // baseline inside each line box: centre the em box in the line height
  const ascent = l.size * 0.8
  const lead = (l.lineHeight - l.size) / 2
  applyShadow(ctx, el.shadow, opts.scale)
  l.lines.forEach((line, i) => {
    const x = el.style.align === 'center' ? (w - line.width) / 2 : el.style.align === 'right' ? w - line.width : 0
    const y = top + i * l.lineHeight + lead + ascent
    if (el.stroke && el.stroke.width > 0) {
      ctx.save()
      ctx.shadowColor = 'transparent'
      ctx.strokeStyle = el.stroke.color
      ctx.lineWidth = el.stroke.width * 2
      ctx.lineJoin = 'round'
      ctx.strokeText(line.text, x, y)
      ctx.restore()
    }
    if (hasLetterSpacing || ls === 0) ctx.fillText(line.text, x, y)
    else {
      // manual letter spacing fallback
      let cx = x
      for (const ch of line.text) {
        ctx.fillText(ch, cx, y)
        cx += ctx.measureText(ch).width + ls
      }
    }
    if (el.style.underline) {
      ctx.fillRect(x, y + l.size * 0.12, line.width, Math.max(1, l.size * 0.06))
    } else if (runs.length) {
      const at = flat.indexOf(line.text, cursor)
      if (at >= 0) {
        cursor = at + line.text.length
        // width of the line's first n characters, letter spacing included (also where the browser can't space canvas text)
        const wTo = (n: number) => {
          const part = line.text.slice(0, Math.max(0, Math.min(line.text.length, n)))
          return ctx.measureText(part).width + (hasLetterSpacing ? 0 : ls * Math.max(0, part.length - 1))
        }
        // slanted text: the line sits under where the letters' feet are, a touch to the left (measured on the official post)
        const lean = el.style.italic ? l.size * 0.05 : 0
        for (const [a, b] of runs) {
          if (b <= at || a >= at + line.text.length) continue
          const x0 = wTo(a - at)
          ctx.fillRect(x + x0 - lean, y + l.size * 0.12, wTo(b - at) - x0, Math.max(1, l.size * 0.06))
        }
      }
    }
  })
  if (hasLetterSpacing) (ctx as Ctx & { letterSpacing: string }).letterSpacing = '0px'
}

export function drawElement(ctx: Ctx, el: El, design: Design, opts: RenderOptions, pageDuration: number) {
  if (!isDrawn(el, design.fields) || opts.skip?.has(el.id)) return
  const a = animState(el.anim, opts.time)
  if (a.alpha <= 0) return
  ctx.save()
  ctx.globalAlpha *= el.opacity * a.alpha
  ctx.translate(el.x + el.w / 2 + a.dx, el.y + el.h / 2 + a.dy)
  if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180)
  if (a.scale !== 1) ctx.scale(a.scale, a.scale)
  ctx.translate(-el.w / 2, -el.h / 2)
  if (el.type === 'shape') drawShape(ctx, el, opts.scale)
  else if (el.type === 'effect') drawEffect(ctx, el.fx, 0, 0, el.w, el.h)
  else if (el.type === 'image') {
    const kenT = el.kenBurns && opts.time !== undefined ? Math.min(1, opts.time / Math.max(0.1, pageDuration)) : null
    drawImage(ctx, el, design, opts, kenT)
  } else drawText(ctx, el, design, opts)
  ctx.restore()
}

export function drawPage(ctx: Ctx, design: Design, page: Page, opts: RenderOptions) {
  ctx.save()
  ctx.setTransform(opts.scale, 0, 0, opts.scale, opts.origin?.x ?? 0, opts.origin?.y ?? 0)
  if (opts.origin) {
    ctx.beginPath()
    ctx.rect(0, 0, design.w, design.h)
    ctx.clip()
  }
  ctx.clearRect(0, 0, design.w, design.h)
  if (!opts.transparent) {
    ctx.fillStyle = page.bg.gradient ? gradientFill(ctx, page.bg.gradient, 0, 0, design.w, design.h) : page.bg.color
    ctx.fillRect(0, 0, design.w, design.h)
  }
  const dur = page.duration ?? 4
  for (const el of page.elements) drawElement(ctx, el, design, opts, dur)
  ctx.restore()
}

/** every image src a page needs (for preloading before export) */
export function pageImageSrcs(design: Design, page: Page, opts: Pick<RenderOptions, 'resolveImage'>): string[] {
  const out: string[] = []
  for (const el of page.elements) {
    if (el.type !== 'image') continue
    const b = el.bind && opts.resolveImage ? opts.resolveImage(el, design.fields) : null
    const s = b?.src || el.src
    if (s) out.push(s)
  }
  return out
}

/** what an export couldn't do perfectly — pass one in, read it afterwards */
export interface ExportReport {
  /** image srcs that failed to load and were drawn as a placeholder */
  missingImages: string[]
}

export const newExportReport = (): ExportReport => ({ missingImages: [] })

/** a short user-facing warning for a report, or null when all went well */
export function exportWarning(r: ExportReport | undefined): string | null {
  const n = r?.missingImages.length ?? 0
  if (!n) return null
  return n === 1 ? '1 photo couldn’t load — exported with a placeholder' : `${n} photos couldn’t load — exported with placeholders`
}

/**
 * Load every image a page needs before an export. An explicit export retries
 * images that failed earlier (failures are otherwise remembered for a while);
 * anything still missing is added to `report`.
 */
export async function preloadPageImages(design: Design, page: Page, opts: Pick<RenderOptions, 'resolveImage'>, report?: ExportReport): Promise<void> {
  const srcs = [...new Set(pageImageSrcs(design, page, opts))]
  const got = await Promise.all(srcs.map((s) => loadImage(s, { retry: true })))
  if (!report) return
  srcs.forEach((s, i) => {
    if (!got[i] && !report.missingImages.includes(s)) report.missingImages.push(s)
  })
}

/** wait for every image on a page, then draw it into a fresh canvas.
 *  Images that couldn't load are drawn as placeholders and listed in `report`. */
export async function renderPageToCanvas(
  design: Design,
  pageIndex: number,
  opts: RenderOptions,
  report?: ExportReport,
): Promise<HTMLCanvasElement> {
  const page = design.pages[pageIndex]
  await preloadPageImages(design, page, opts, report)
  const c = document.createElement('canvas')
  c.width = Math.round(design.w * opts.scale)
  c.height = Math.round(design.h * opts.scale)
  drawPage(c.getContext('2d')!, design, page, opts)
  return c
}
