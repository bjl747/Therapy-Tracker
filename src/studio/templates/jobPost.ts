// ─────────────────────────────────────────────────────────────
// "Travel Job Post" — the team's current hiring post, rebuilt as a template
// FAMILY: one set of job fields → square, portrait, story and landscape
// layouts. Text uses {{markers}}; the photo is bound to the job's location.
// Square is matched to the official post element by element (BJ, 2026-11-18: "pixel by pixel ... design and spacing and
// size wise"; the reference is `Job Post Logo Pack/Danny - Job Post Official (1).png`): a navy card with 38.5px corners on
// an 8px white frame, Arial-style type (Liberation Sans), the official transparent logos, a soft shadow round the photo
// frame, the light in the top-right corner (lifted from the reference, public/brand/job-post-corner-light.png), the
// underlined wage numbers, and colour bars that follow the card's bottom corners. Every number in square() was measured
// on the reference; the other sizes reuse the same pieces.
// ─────────────────────────────────────────────────────────────

import { image, page, shape, text, type Anim, type El, type FieldDef } from '../engine/model'
import type { TemplateDef, TemplateLayout } from './types'

// colours sampled from the official post
export const BRAND = {
  navy: '#0C184D',
  panel: '#17255E',
  rule: '#414B74',
  pink: '#E74598',
  teal: '#10C4D3',
  cyan: '#11C4D3',
  blue: '#263FD9',
  muted: '#9BA0B5',
  soft: '#9BA0B6',
  white: '#FFFFFF',
}
/** the post's typeface (Arial's widths; see engine/fonts.ts) */
export const POST_FONT = 'Liberation Sans'

// The official logos, transparent backgrounds (BJ's files with the empty margins trimmed to 2px, so a logo's box is its
// artwork wherever it is placed). w / h are the files' pixels; `ink` is the artwork inside, used to place a logo by its
// visible edges.
export const LOGOS = {
  gqr: { src: '/brand/gqr-healthcare-white.png', w: 886, h: 290, ink: { x: 2, y: 2, w: 882, h: 286 } },
  unitimed: { src: '/brand/unitimed-white.png', w: 1013, h: 153, ink: { x: 2, y: 2, w: 1009, h: 149 } },
  badge: { src: '/brand/bluepipes-2026-badge-clear.png', w: 222, h: 176, ink: { x: 8, y: 8, w: 205, h: 159 } },
}
/** the light in the card's top-right corner, as on the official post (white at the reference's own strength) */
export const CORNER_LIGHT = { src: '/brand/job-post-corner-light.png', w: 241, h: 265 }
/** the card: inset from the page edge and corner radius */
export const CARD = { inset: 7.25, radius: 38.5 } // fitted to the reference: edges a quarter pixel outside 8px, 38.5px corners

export const JOB_FIELDS: FieldDef[] = [
  { key: 'job_title', label: 'Job title', example: 'Pharmacist', group: 'Job' },
  { key: 'location', label: 'Location', example: 'Fishersville, VA', kind: 'location', group: 'Job' },
  { key: 'job_type', label: 'Job type', example: 'ALLIED TRAVEL', group: 'Job', locked: true },
  { key: 'weekly_pay', label: 'Weekly gross pay', example: '$3,227 – $3,547', kind: 'money', group: 'Pay' },
  { key: 'wage_low', label: 'Hourly wage (low)', example: '39', kind: 'money', group: 'Pay' },
  { key: 'wage_high', label: 'Hourly wage (high)', example: '57', kind: 'money', group: 'Pay' },
  { key: 'shift', label: 'Shift', example: '5x8s, Days', group: 'Details' },
  { key: 'duration', label: 'Duration', example: '13 Weeks', group: 'Details' },
  { key: 'start_date', label: 'Start date', example: 'ASAP', group: 'Details' },
  {
    key: 'benefits',
    label: 'Benefits line',
    example: 'MEDICAL  ·  DENTAL  ·  VISION  ·  HSA / FSA  ·  REFERRAL BONUS',
    group: 'Details',
    locked: true,
  },
  { key: 'cta', label: 'Call to action', example: 'APPLY TODAY', group: 'Footer', locked: true },
  { key: 'website', label: 'Website', example: 'unitimed.com', group: 'Footer', locked: true },
]

// a solid teardrop, as on the official post (26 × 36 px there: a 13px-radius head and a point)
const PIN = 'M50 100 C36 80 0 62 0 36.1 A50 36.1 0 0 1 100 36.1 C100 62 64 80 50 100 Z'

const anim = (kind: Anim['kind'], delay: number, duration = 0.6): Anim => ({ kind, delay, duration })
// no pair kerning: the official post is set with plain letter widths (measured: its lines are 2 to 7% wider than kerned text)
const T = (o: Parameters<typeof text>[0]) => text({ color: BRAND.white, ...o, style: { family: POST_FONT, weight: 700, kerning: false, ...o.style } })
const rect = (x: number, y: number, w: number, h: number, fill: string, radius = 0, extra: Partial<El> = {}) =>
  shape('rect', { x, y, w, h, fill, radius, ...(extra as object) })
type Logo = { src: string; w: number; h: number; ink: { x: number; y: number; w: number; h: number } }
/** A logo placed by its artwork: (x, y) is the top-left of what you see, `inkW` how wide it is. */
const logo = (l: Logo, x: number, y: number, inkW: number, name: string, a?: Anim) => {
  const k = inkW / l.ink.w
  return image({ src: l.src, x: x - l.ink.x * k, y: y - l.ink.y * k, w: l.w * k, h: l.h * k, fit: 'contain', name, locked: true, anim: a })
}
/** white page, navy card with rounded corners */
const card = (W: number, H: number) => rect(CARD.inset, CARD.inset, W - 2 * CARD.inset, H - 2 * CARD.inset, BRAND.navy, CARD.radius, { locked: true, name: 'Card' })
/** the corner light, pinned to the card's top-right corner at its own pixel size */
const cornerLight = (W: number) =>
  image({ src: CORNER_LIGHT.src, x: W - 248, y: 7, w: CORNER_LIGHT.w, h: CORNER_LIGHT.h, // whole pixels, so it is drawn 1:1
    fit: 'cover', focus: { x: 0.5, y: 0.5 }, locked: true, name: 'Corner light' })
/** The three colour bars along the card's bottom edge (blue 42% · cyan 34% · pink 24%, as on the official post). The outer
 *  ends follow the card's rounded corners, so they are paths: the bar is shorter than the corner radius. */
function brandBars(W: number, H: number, h = 13.9): El[] {
  const x0 = CARD.inset, x1 = W - CARD.inset, y1 = H - CARD.inset, y0 = y1 - h, r = CARD.radius, full = x1 - x0
  const a = x0 + full * 0.4195, b = x0 + full * 0.7592 // where blue ends and pink starts
  const dx = r - Math.sqrt(r * r - (r - h) * (r - h)) // how far the corner has pulled in at the bar's top edge
  const bar = (bx0: number, bx1: number, fill: string, corner: 'left' | 'right' | null) => {
    const w = bx1 - bx0
    const X = (px: number) => (((px - bx0) / w) * 100).toFixed(3)
    const rx = ((r / w) * 100).toFixed(3), ry = ((r / h) * 100).toFixed(3)
    const d = corner === 'left' ? `M${X(x0 + dx)} 0 L100 0 L100 100 L${X(x0 + r)} 100 A${rx} ${ry} 0 0 1 ${X(x0 + dx)} 0 Z`
      : corner === 'right' ? `M0 0 L${X(x1 - dx)} 0 A${rx} ${ry} 0 0 1 ${X(x1 - r)} 100 L0 100 Z`
      : 'M0 0 L100 0 L100 100 L0 100 Z'
    return shape('path', { x: bx0, y: y0, w, h, path: d, fill, locked: true, name: 'Brand bar' })
  }
  return [bar(x0, a, BRAND.blue, 'left'), bar(a, b, BRAND.cyan, null), bar(b, x1, BRAND.pink, 'right')]
}
/** the frame the city photo sits in, with the soft shadow the official post has round it */
const photoFrame = (x: number, y: number, w: number, h: number, radius: number, blur = 80) =>
  rect(x, y, w, h, BRAND.panel, radius, { name: 'Photo frame', shadow: { color: 'rgba(0,0,0,0.30)', blur, x: 0, y: 0 } } as Partial<El>)
const cityPhoto = (x: number, y: number, w: number, h: number, radius: number) =>
  image({ x, y, w, h, radius, bind: 'location', name: 'City photo', kenBurns: true, anim: anim('fade', 0, 0.8) })
/** the wage line: the two numbers are underlined, as on the official post */
// (non-breaking spaces inside the underlined runs, so a line never breaks between the $ and its number)
const WAGE_LINE = 'Includes estimated wage of $__\u00A0{{wage_low}}\u00A0__ – $__\u00A0{{wage_high}}\u00A0__/hr and non-taxable travel benefits if eligible'
const pill = (x: number, y: number, w: number, h: number, size: number, delay: number) => [
  rect(x, y, w, h, BRAND.pink, h / 2, { name: 'Now hiring pill', anim: anim('pop', delay, 0.5) }),
  T({
    x, y: y + h * 0.054, w, h, text: 'NOW HIRING', name: 'Now hiring', fit: 'fixed',
    style: { size, weight: 700, align: 'center', valign: 'middle' },
    anim: anim('pop', delay, 0.5),
  }),
]
const pin = (x: number, y: number, s: number, a?: Anim) =>
  shape('path', { x, y, w: s * 0.722, h: s, path: PIN, fill: BRAND.teal, name: 'Pin', anim: a })

/** The three-column details panel, reused across sizes. Measured on the official post at 936 × 122; `k` scales the type
 *  and the inner spacing for the other sizes. */
function details(x: number, y: number, w: number, h: number, delay: number): El[] {
  const k = h / 122
  const col = w / 3
  const cols = [
    ['SHIFT', '{{shift}}'],
    ['DURATION', '{{duration}}'],
    ['START DATE', '{{start_date}}'],
  ]
  const a = anim('rise', delay)
  const line = '#414C7B', sep = '#4A5581' // the inner rule, and the slightly lighter column separators
  return [
    rect(x, y, w, h, BRAND.panel, 22 * k, { name: 'Details panel', anim: a }),
    ...cols.flatMap(([label, val], i) => [
      T({ x: x + col * i + 8, y: y + D.labelY * k, w: col - 16, h: 22 * k, text: label, color: BRAND.teal, fit: 'fixed', style: { size: D.label * k, align: 'center' }, anim: a }),
      T({ x: x + col * i + 8, y: y + D.valueY * k, w: col - 16, h: 30 * k, text: val, minSize: 12, style: { size: D.value * k, align: 'center' }, anim: a }),
    ]),
    rect(x + col, y + 22 * k, 2, 36 * k, sep, 0, { anim: a }),
    rect(x + col * 2, y + 22 * k, 2, 36 * k, sep, 0, { anim: a }),
    rect(x + 26 * k, y + 80 * k, w - 52 * k, 2, line, 0, { anim: a }),
    T({ x: x + 12, y: y + D.benefitsY * k, w: w - 24, h: 22 * k, text: '{{benefits}}', locked: true, color: '#BCC0D0', minSize: 9, style: { size: D.benefits * k, align: 'center' }, anim: a }),
  ]
}
/** details panel type: sizes and the tops of the text boxes inside a 122px-tall panel (calibrated on the official post) */
const D = { label: 17, value: 25, benefits: 17.1, labelY: 18.2, valueY: 38.5, benefitsY: 92.9 }

// ── Square 1080×1080: the official post ─────────────────────

function square(): TemplateLayout {
  const W = 1080, H = 1080
  return {
    w: W,
    h: H,
    pages: [
      page({
        bg: { color: BRAND.white },
        duration: 5,
        elements: [
          card(W, H),
          logo(LOGOS.gqr, 68.5, 50, 311, 'GQR logo', anim('fade', 0.1)),
          T({ x: 599, y: 99.6, w: 408, h: 28, text: '{{job_type}}', name: 'Job type', locked: true, color: BRAND.muted, fit: 'fixed', style: { size: 21.5, align: 'right' }, anim: anim('fade', 0.2) }),
          cornerLight(W), // over the job type, as on the official post (the light brightens the text a little)
          photoFrame(72, 172, 936, 290, 36),
          cityPhoto(84, 184, 912, 266, 24),
          ...pill(106, 206, 250, 56, 24, 0.5),
          T({ x: 73, y: 468, w: 750, h: 84.2, text: '{{job_title}}', name: 'Job title', minSize: 34, style: { size: 57, lineHeight: 1.05, valign: 'bottom' }, anim: anim('rise', 0.7) }),
          pin(72, 552, 36, anim('rise', 0.85)),
          T({ x: 114, y: 556, w: 700, h: 40, text: '{{location}}', name: 'Location', color: BRAND.teal, style: { size: 32 }, anim: anim('rise', 0.85) }),
          logo(LOGOS.badge, 844, 510, 205, 'Award badge', anim('pop', 1.1)),
          rect(72, 603, 807, 2, BRAND.rule, 0, { name: 'Rule' }),
          T({ x: 72.5, y: 624, w: 700, h: 26, text: 'ESTIMATED WEEKLY GROSS PAY', name: 'Pay label', color: BRAND.pink, fit: 'fixed', style: { size: 19.9 }, anim: anim('fade', 1.0) }),
          T({ x: 73, y: 651, w: 760, h: 116, text: '{{weekly_pay}}', name: 'Weekly pay', minSize: 40, style: { size: 99.8 }, anim: anim('rise', 1.1) }),
          T({ x: 72, y: 757, w: 936, h: 26, text: WAGE_LINE, name: 'Wage line', color: BRAND.soft, minSize: 12, style: { size: 20, weight: 400, italic: true }, anim: anim('fade', 1.3) }),
          ...details(72, 802, 936, 122, 1.4),
          rect(72, 946, 936, 2, '#38426D', 0, { name: 'Rule' }),
          logo(LOGOS.unitimed, 79, 973.5, 387, 'UnitiMed logo', anim('fade', 1.6)),
          T({ x: 600, y: 976.5, w: 408, h: 32, text: '{{cta}}', name: 'Call to action', locked: true, color: BRAND.teal, fit: 'fixed', style: { size: 25, align: 'right' }, anim: anim('fade', 1.7) }),
          T({ x: 600, y: 1013.6, w: 408, h: 28, text: '{{website}}', name: 'Website', locked: true, color: '#AAAEC1', fit: 'fixed', style: { size: 21, weight: 400, align: 'right' }, anim: anim('fade', 1.7) }),
          ...brandBars(W, H),
        ],
      }),
    ],
  }
}

// ── Portrait 1080×1350 (Instagram 4:5): the square's design with a taller photo ──

function portrait(): TemplateLayout {
  const W = 1080, H = 1350
  return {
    w: W,
    h: H,
    pages: [
      page({
        bg: { color: BRAND.white },
        duration: 5,
        elements: [
          card(W, H),
          logo(LOGOS.gqr, 68, 54, 311, 'GQR logo', anim('fade', 0.1)),
          T({ x: 599, y: 103.6, w: 408, h: 28, text: '{{job_type}}', name: 'Job type', locked: true, color: BRAND.muted, fit: 'fixed', style: { size: 21.5, align: 'right' }, anim: anim('fade', 0.2) }),
          cornerLight(W),
          photoFrame(72, 186, 936, 420, 36),
          cityPhoto(84, 198, 912, 396, 24),
          ...pill(106, 220, 250, 56, 24, 0.5),
          T({ x: 73, y: 612, w: 750, h: 96, text: '{{job_title}}', name: 'Job title', minSize: 38, style: { size: 66, lineHeight: 1.05, valign: 'bottom' }, anim: anim('rise', 0.7) }),
          pin(72, 708, 42, anim('rise', 0.85)),
          T({ x: 120, y: 712, w: 690, h: 46, text: '{{location}}', name: 'Location', color: BRAND.teal, style: { size: 37 }, anim: anim('rise', 0.85) }),
          logo(LOGOS.badge, 838, 640, 214, 'Award badge', anim('pop', 1.1)),
          rect(72, 778, 800, 2, BRAND.rule, 0, { name: 'Rule' }),
          T({ x: 72.5, y: 804, w: 700, h: 30, text: 'ESTIMATED WEEKLY GROSS PAY', name: 'Pay label', color: BRAND.pink, fit: 'fixed', style: { size: 22.5 }, anim: anim('fade', 1.0) }),
          T({ x: 73, y: 836, w: 936, h: 130, text: '{{weekly_pay}}', name: 'Weekly pay', minSize: 44, style: { size: 112 }, anim: anim('rise', 1.1) }),
          T({ x: 72, y: 968, w: 936, h: 28, text: WAGE_LINE, name: 'Wage line', color: BRAND.soft, minSize: 12, style: { size: 21, weight: 400, italic: true }, anim: anim('fade', 1.3) }),
          ...details(72, 1018, 936, 140, 1.4),
          rect(72, 1186, 936, 2, '#38426D', 0, { name: 'Rule' }),
          logo(LOGOS.unitimed, 80, 1216, 400, 'UnitiMed logo', anim('fade', 1.6)),
          T({ x: 600, y: 1216, w: 408, h: 36, text: '{{cta}}', name: 'Call to action', locked: true, color: BRAND.teal, fit: 'fixed', style: { size: 28, align: 'right' }, anim: anim('fade', 1.7) }),
          T({ x: 598, y: 1258, w: 408, h: 28, text: '{{website}}', name: 'Website', locked: true, color: '#AAAEC1', fit: 'fixed', style: { size: 22, weight: 400, align: 'right' }, anim: anim('fade', 1.7) }),
          ...brandBars(W, H),
        ],
      }),
    ],
  }
}

// ── Story 1080×1920 ──
// Text stays out of the top 250 px and the bottom 340 px, where Instagram draws its own buttons. The UnitiMed logo and
// the badge sit at the top of that bottom zone (y 1536–1665), as they did in the first design: BJ's call whether to move
// them. The story keeps its own look (full-width photo, no call to action): there is no official story to match.

function story(): TemplateLayout {
  const W = 1080, H = 1920
  const inset = CARD.inset
  return {
    w: W,
    h: H,
    pages: [
      page({
        bg: { color: BRAND.white },
        duration: 6,
        elements: [
          card(W, H),
          // the photo fills the top of the card (rounded with it) and fades into the navy
          cityPhoto(inset, inset, W - 2 * inset, 972, CARD.radius),
          shape('rect', {
            // solid navy from 40px above the photo's end to just past it, so the photo's bottom edge and corners never show
            x: inset, y: 520, w: W - 2 * inset, h: 466, fill: BRAND.navy, name: 'Photo fade',
            gradient: { type: 'linear', angle: 180, stops: [{ at: 0, color: 'rgba(12,24,77,0)' }, { at: 0.9, color: BRAND.navy }, { at: 1, color: BRAND.navy }] },
          }),
          // navy tile behind the logo: keeps the white lettering readable over any photo
          rect(48, 232, 340, 140, BRAND.navy, 22, { name: 'Logo tile', locked: true, anim: anim('fade', 0.2), shadow: { color: 'rgba(0,0,0,0.25)', blur: 24, x: 0, y: 6 } }),
          logo(LOGOS.gqr, 76, 257, 284, 'GQR logo', anim('fade', 0.2)),
          ...pill(72, 640, 300, 68, 29, 0.6),
          T({ x: 73, y: 736, w: 936, h: 200, text: '{{job_title}}', name: 'Job title', style: { size: 92, lineHeight: 1.05, valign: 'bottom' }, anim: anim('rise', 0.8) }),
          pin(72, 958, 50, anim('rise', 1.0)),
          T({ x: 128, y: 962, w: 880, h: 56, text: '{{location}}', name: 'Location', color: BRAND.teal, style: { size: 44 }, anim: anim('rise', 1.0) }),
          T({ x: 72, y: 1034, w: 936, h: 36, text: '{{job_type}}', name: 'Job type', locked: true, color: BRAND.muted, fit: 'fixed', style: { size: 25, letterSpacing: 2 }, anim: anim('fade', 1.1) }),
          rect(72, 1092, 936, 2, BRAND.rule, 0, { name: 'Rule' }),
          T({ x: 72.5, y: 1116, w: 936, h: 34, text: 'ESTIMATED WEEKLY GROSS PAY', name: 'Pay label', color: BRAND.pink, fit: 'fixed', style: { size: 26 }, anim: anim('fade', 1.2) }),
          T({ x: 73, y: 1152, w: 936, h: 136, text: '{{weekly_pay}}', name: 'Weekly pay', minSize: 48, style: { size: 116 }, anim: anim('rise', 1.3) }),
          T({ x: 72, y: 1290, w: 936, h: 64, text: WAGE_LINE, name: 'Wage line', color: BRAND.soft, style: { size: 24, weight: 400, italic: true, lineHeight: 1.3 }, anim: anim('fade', 1.4) }),
          ...details(72, 1372, 936, 150, 1.5),
          logo(LOGOS.unitimed, 80, 1562, 380, 'UnitiMed logo', anim('fade', 1.7)),
          logo(LOGOS.badge, 840, 1536, 168, 'Award badge', anim('pop', 1.8)),
          ...brandBars(W, H),
        ],
      }),
    ],
  }
}

// ── Landscape 1200×627 (LinkedIn / Facebook link) ───────────

function landscape(): TemplateLayout {
  const W = 1200, H = 627
  return {
    w: W,
    h: H,
    pages: [
      page({
        bg: { color: BRAND.white },
        duration: 5,
        elements: [
          card(W, H),
          cornerLight(W),
          photoFrame(612, 30, 558, 548, 30, 18), // a short shadow: the frame sits 22px from the card's edge
          cityPhoto(622, 40, 538, 528, 22),
          ...pill(646, 62, 214, 48, 20.5, 0.5),
          logo(LOGOS.badge, 1004, 426, 146, 'Award badge', anim('pop', 1.2)),
          logo(LOGOS.gqr, 46, 34, 196, 'GQR logo', anim('fade', 0.1)),
          T({ x: 300, y: 56, w: 290, h: 24, text: '{{job_type}}', name: 'Job type', locked: true, color: BRAND.muted, fit: 'fixed', style: { size: 16.5, align: 'right' }, anim: anim('fade', 0.2) }),
          T({ x: 45, y: 106, w: 548, h: 88, text: '{{job_title}}', name: 'Job title', minSize: 28, style: { size: 50, lineHeight: 1.05, valign: 'bottom' }, anim: anim('rise', 0.7) }),
          pin(44, 196, 30, anim('rise', 0.85)),
          T({ x: 78, y: 198, w: 512, h: 34, text: '{{location}}', name: 'Location', color: BRAND.teal, style: { size: 26 }, anim: anim('rise', 0.85) }),
          rect(44, 242, 548, 2, BRAND.rule, 0, { name: 'Rule' }),
          T({ x: 44.5, y: 256, w: 548, h: 22, text: 'ESTIMATED WEEKLY GROSS PAY', name: 'Pay label', color: BRAND.pink, fit: 'fixed', style: { size: 16 }, anim: anim('fade', 1.0) }),
          T({ x: 45, y: 276, w: 548, h: 76, text: '{{weekly_pay}}', name: 'Weekly pay', minSize: 30, style: { size: 64 }, anim: anim('rise', 1.1) }),
          T({ x: 44, y: 354, w: 548, h: 40, text: 'Includes est. wage of $__\u00A0{{wage_low}}\u00A0__ – $__\u00A0{{wage_high}}\u00A0__/hr + non-taxable travel benefits if eligible', name: 'Wage line', color: BRAND.soft, style: { size: 14.5, weight: 400, italic: true, lineHeight: 1.3 }, anim: anim('fade', 1.3) }),
          ...details(44, 402, 548, 108, 1.4),
          rect(44, 524, 548, 2, '#38426D', 0, { name: 'Rule' }),
          logo(LOGOS.unitimed, 48, 544, 216, 'UnitiMed logo', anim('fade', 1.6)),
          T({ x: 330, y: 540, w: 262, h: 26, text: '{{cta}}', name: 'Call to action', locked: true, color: BRAND.teal, fit: 'fixed', style: { size: 19, align: 'right' }, anim: anim('fade', 1.7) }),
          T({ x: 329, y: 566, w: 262, h: 22, text: '{{website}}', name: 'Website', locked: true, color: '#AAAEC1', fit: 'fixed', style: { size: 15.5, weight: 400, align: 'right' }, anim: anim('fade', 1.7) }),
          ...brandBars(W, H, 11),
        ],
      }),
    ],
  }
}

export const TRAVEL_JOB_POST: TemplateDef = {
  id: 'travel-job-post',
  name: 'Travel Job Post',
  category: 'job-post',
  description: 'The team’s hiring post — city photo, pay, shift details. Every size from one set of job details.',
  tags: ['hiring', 'travel', 'allied', 'job'],
  fieldDefs: JOB_FIELDS,
  layouts: { square: square(), portrait: portrait(), story: story(), landscape: landscape() },
  defaultSize: 'square',
  builtIn: true,
  version: 2, // 2 = matched to the official post (2026-11-18); replaces layouts saved from the first design
}
