// ─────────────────────────────────────────────────────────────
// Light effects drawn in code: lens flare, glow, light leak, bokeh,
// sparkles. No image files: they are gradients blended over the page
// ("screen"), so they stay sharp at any size, take any brand colour and
// export exactly like everything else (PNG, GIF, PDF).
//
// Each effect fills a box (x, y, w, h); the light sits at the box's
// centre unless noted. `seed` keeps scattered effects (bokeh, sparkles)
// the same every time a design is drawn.
// ─────────────────────────────────────────────────────────────

import type { EffectSpec } from './model'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function rgba(hex: string, a: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  if (!Number.isFinite(n)) return `rgba(255,255,255,${a})`
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`
}
/** small repeatable random numbers (mulberry32) */
function rng(seed: number) {
  let t = (seed | 0) + 0x6d2b79f5
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function disc(ctx: Ctx, cx: number, cy: number, r: number, stops: [number, string][]) {
  if (r <= 0) return
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  for (const [at, c] of stops) g.addColorStop(at, c)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
}

/** Draw one effect into the box. The caller has already applied the element's position, rotation and opacity. */
export function drawEffect(ctx: Ctx, fx: EffectSpec, x: number, y: number, w: number, h: number) {
  const i = Math.max(0, Math.min(1, fx.intensity))
  if (!i || w <= 0 || h <= 0) return
  const cx = x + w / 2
  const cy = y + h / 2
  const r = Math.min(w, h) / 2
  const c1 = fx.color
  const c2 = fx.color2 ?? fx.color
  ctx.save()
  ctx.globalCompositeOperation = 'screen'

  if (fx.kind === 'glow') {
    disc(ctx, cx, cy, r, [[0, rgba(c1, 0.6 * i)], [0.35, rgba(c1, 0.3 * i)], [0.7, rgba(c1, 0.08 * i)], [1, rgba(c1, 0)]])
  } else if (fx.kind === 'flare') {
    // wide halo, hot core
    disc(ctx, cx, cy, r, [[0, rgba(c1, 0.55 * i)], [0.2, rgba(c1, 0.32 * i)], [0.55, rgba(c1, 0.1 * i)], [1, rgba(c1, 0)]])
    disc(ctx, cx, cy, r * 0.34, [[0, rgba('#ffffff', 0.95 * i)], [0.18, rgba('#ffffff', 0.7 * i)], [0.5, rgba(c1, 0.35 * i)], [1, rgba(c1, 0)]])
    // rays: thin spokes of light
    const rays = Math.max(0, Math.round(fx.rays ?? 0))
    if (rays) {
      const rnd = rng(fx.seed ?? 7)
      for (let k = 0; k < rays; k++) {
        const a = (k / rays) * Math.PI * 2 + rnd() * 0.5
        const len = r * (0.55 + rnd() * 0.45)
        const half = 0.012 + rnd() * 0.02
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, len)
        g.addColorStop(0, rgba('#ffffff', 0.28 * i))
        g.addColorStop(1, rgba(c1, 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, len, a - half, a + half)
        ctx.closePath()
        ctx.fill()
      }
    }
    // the horizontal streak a camera lens leaves
    if (fx.streak) {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(1, 0.03)
      disc(ctx, 0, 0, r * 1.9, [[0, rgba('#ffffff', 0.8 * i)], [0.25, rgba(c1, 0.45 * i)], [1, rgba(c1, 0)]])
      ctx.restore()
    }
    // ghosts: faint circles strung out along a line through the light
    if (fx.ghosts) {
      const a = ((fx.angle ?? 135) * Math.PI) / 180
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      const spots: [number, number, string, number][] = [
        [0.55, 0.1, c2, 0.16], [0.95, 0.055, '#ffffff', 0.14], [1.35, 0.17, c1, 0.1], [1.8, 0.075, c2, 0.14], [2.3, 0.24, c1, 0.07],
      ]
      for (const [t, size, col, al] of spots) {
        const gx = cx + dx * r * t
        const gy = cy + dy * r * t
        disc(ctx, gx, gy, r * size, [[0, rgba(col, al * 0.5 * i)], [0.75, rgba(col, al * i)], [0.92, rgba(col, al * 1.5 * i)], [1, rgba(col, 0)]])
      }
    }
  } else if (fx.kind === 'leak') {
    // a soft band of colour washing in from one side
    const a = ((fx.angle ?? 0) * Math.PI) / 180
    const len = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))
    const g = ctx.createLinearGradient(cx - (Math.cos(a) * len) / 2, cy - (Math.sin(a) * len) / 2, cx + (Math.cos(a) * len) / 2, cy + (Math.sin(a) * len) / 2)
    g.addColorStop(0, rgba(c1, 0.6 * i))
    g.addColorStop(0.35, rgba(c2, 0.28 * i))
    g.addColorStop(0.75, rgba(c2, 0.06 * i))
    g.addColorStop(1, rgba(c2, 0))
    ctx.fillStyle = g
    ctx.fillRect(x, y, w, h)
  } else if (fx.kind === 'bokeh') {
    const rnd = rng(fx.seed ?? 11)
    const n = Math.max(1, Math.round(fx.count ?? 14))
    for (let k = 0; k < n; k++) {
      const bx = x + rnd() * w
      const by = y + rnd() * h
      const br = r * (0.06 + rnd() * 0.16)
      const col = rnd() < 0.5 ? c1 : c2
      const al = (0.1 + rnd() * 0.22) * i
      disc(ctx, bx, by, br, [[0, rgba(col, al * 0.7)], [0.8, rgba(col, al)], [0.95, rgba(col, al * 1.4)], [1, rgba(col, 0)]])
    }
  } else if (fx.kind === 'sparkles') {
    const rnd = rng(fx.seed ?? 3)
    const n = Math.max(1, Math.round(fx.count ?? 10))
    for (let k = 0; k < n; k++) {
      const sx = x + rnd() * w
      const sy = y + rnd() * h
      const sr = r * (0.05 + rnd() * 0.14)
      const al = (0.55 + rnd() * 0.45) * i
      disc(ctx, sx, sy, sr * 0.5, [[0, rgba('#ffffff', al)], [0.4, rgba(c1, al * 0.5)], [1, rgba(c1, 0)]])
      for (const rot of [0, Math.PI / 2]) {
        ctx.save()
        ctx.translate(sx, sy)
        ctx.rotate(rot)
        ctx.scale(1, 0.07)
        disc(ctx, 0, 0, sr, [[0, rgba('#ffffff', al)], [0.5, rgba(c1, al * 0.4)], [1, rgba(c1, 0)]])
        ctx.restore()
      }
    }
  }
  ctx.restore()
}
