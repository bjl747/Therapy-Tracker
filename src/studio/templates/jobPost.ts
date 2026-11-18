// ─────────────────────────────────────────────────────────────
// "Travel Job Post" — the team's current hiring post, rebuilt as a template
// FAMILY: one set of job fields → square, portrait, story and landscape
// layouts. Text uses {{markers}}; the photo is bound to the job's location.
// Logos are placeholders cropped from the original post (public/brand/).
// ─────────────────────────────────────────────────────────────

import { image, page, shape, text, type Anim, type El, type FieldDef } from '../engine/model'
import type { TemplateDef, TemplateLayout } from './types'

export const BRAND = {
  navy: '#0C184D',
  panel: '#18255E',
  rule: '#3E4B7B',
  pink: '#E74599',
  teal: '#2BBACC',
  cyan: '#12C4D1',
  blue: '#2940DA',
  muted: '#9A9FC4',
  soft: '#96A3C5',
  white: '#FFFFFF',
}

export const LOGOS = {
  gqr: { src: '/brand/gqr-healthcare.png', w: 325, h: 115 },
  unitimed: { src: '/brand/unitimed.png', w: 400, h: 78 },
  badge: { src: '/brand/bluepipes-2026-badge.png', w: 224, h: 176 },
}

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

const PIN =
  'M50 0 C28 0 12 17 12 38 C12 66 50 100 50 100 C50 100 88 66 88 38 C88 17 72 0 50 0 Z ' +
  'M50 22 C59 22 66 29 66 38 C66 47 59 54 50 54 C41 54 34 47 34 38 C34 29 41 22 50 22 Z'

const anim = (kind: Anim['kind'], delay: number, duration = 0.6): Anim => ({ kind, delay, duration })
const T = (o: Parameters<typeof text>[0]) => text({ color: BRAND.white, ...o, style: { family: 'Inter', ...o.style } })
const rect = (x: number, y: number, w: number, h: number, fill: string, radius = 0, extra: Partial<El> = {}) =>
  shape('rect', { x, y, w, h, fill, radius, ...(extra as object) })
const logo = (l: { src: string; w: number; h: number }, x: number, y: number, scale: number, name: string, a?: Anim) =>
  image({ src: l.src, x, y, w: Math.round(l.w * scale), h: Math.round(l.h * scale), fit: 'contain', name, locked: true, anim: a })
const brandBars = (w: number, y: number, h: number) => [
  rect(0, y, w / 3, h, BRAND.blue, 0, { locked: true, name: 'Brand bar' }),
  rect(w / 3, y, w / 3, h, BRAND.cyan, 0, { locked: true, name: 'Brand bar' }),
  rect((2 * w) / 3, y, w / 3, h, BRAND.pink, 0, { locked: true, name: 'Brand bar' }),
]
const cityPhoto = (x: number, y: number, w: number, h: number, radius: number) =>
  image({ x, y, w, h, radius, bind: 'location', name: 'City photo', kenBurns: true, anim: anim('fade', 0, 0.8) })
const pill = (x: number, y: number, w: number, h: number, size: number, delay: number) => [
  rect(x, y, w, h, BRAND.pink, h / 2, { name: 'Now hiring pill', anim: anim('pop', delay, 0.5) }),
  T({
    x, y, w, h, text: 'NOW HIRING', name: 'Now hiring', fit: 'fixed',
    style: { size, weight: 800, align: 'center', valign: 'middle', letterSpacing: 0.5 },
    anim: anim('pop', delay, 0.5),
  }),
]
const pin = (x: number, y: number, s: number, a?: Anim) =>
  shape('path', { x, y, w: s * 0.76, h: s, path: PIN, fill: BRAND.teal, name: 'Pin', anim: a })

/** the three-column details panel, reused across sizes */
function details(x: number, y: number, w: number, h: number, delay: number): El[] {
  const col = w / 3
  const labelY = y + h * 0.13
  const valueY = labelY + h * 0.2
  const cols = [
    ['SHIFT', '{{shift}}'],
    ['DURATION', '{{duration}}'],
    ['START DATE', '{{start_date}}'],
  ]
  const a = anim('rise', delay)
  return [
    rect(x, y, w, h, BRAND.panel, 20, { name: 'Details panel', anim: a }),
    ...cols.flatMap(([label, val], i) => [
      T({ x: x + col * i + 8, y: labelY, w: col - 16, h: h * 0.18, text: label, color: BRAND.teal, fit: 'fixed', style: { size: h * 0.135, weight: 700, align: 'center' }, anim: a }),
      T({ x: x + col * i + 8, y: valueY, w: col - 16, h: h * 0.24, text: val, style: { size: h * 0.19, weight: 700, align: 'center' }, anim: a }),
    ]),
    rect(x + col - 1, y + h * 0.18, 2, h * 0.3, BRAND.rule, 0, { anim: a }),
    rect(x + col * 2 - 1, y + h * 0.18, 2, h * 0.3, BRAND.rule, 0, { anim: a }),
    rect(x + w * 0.028, y + h * 0.65, w * 0.944, 1, BRAND.rule, 0, { anim: a }),
    T({ x, y: y + h * 0.73, w, h: h * 0.2, text: '{{benefits}}', locked: true, color: BRAND.muted, style: { size: h * 0.13, weight: 700, align: 'center' }, anim: a }),
  ]
}

// ── Square 1080×1080 (matches the current post) ─────────────

function square(): TemplateLayout {
  const W = 1080
  return {
    w: W,
    h: 1080,
    pages: [
      page({
        bg: { color: BRAND.navy },
        duration: 5,
        elements: [
          logo(LOGOS.gqr, 60, 45, 1, 'GQR logo', anim('fade', 0.1)),
          T({ x: 600, y: 94, w: 410, h: 34, text: '{{job_type}}', locked: true, color: BRAND.muted, style: { size: 22, weight: 700, align: 'right' }, anim: anim('fade', 0.2) }),
          rect(72, 172, 936, 290, BRAND.panel, 30, { name: 'Photo frame' }),
          cityPhoto(84, 184, 912, 266, 22),
          ...pill(106, 206, 250, 58, 23, 0.5),
          T({ x: 72, y: 474, w: 750, h: 104, text: '{{job_title}}', name: 'Job title', minSize: 34, style: { size: 60, weight: 800, lineHeight: 1.05, valign: 'bottom' }, anim: anim('rise', 0.7) }),
          pin(74, 584, 32, anim('rise', 0.85)),
          T({ x: 114, y: 580, w: 700, h: 40, text: '{{location}}', name: 'Location', color: BRAND.teal, style: { size: 32, weight: 700 }, anim: anim('rise', 0.85) }),
          logo(LOGOS.badge, 834, 490, 1, 'Award badge', anim('pop', 1.1)),
          rect(72, 630, 750, 2, BRAND.rule),
          T({ x: 72, y: 644, w: 700, h: 26, text: 'ESTIMATED WEEKLY GROSS PAY', color: BRAND.pink, fit: 'fixed', style: { size: 19, weight: 700 }, anim: anim('fade', 1.0) }),
          T({ x: 72, y: 668, w: 936, h: 90, text: '{{weekly_pay}}', name: 'Weekly pay', style: { size: 84, weight: 800, letterSpacing: -1 }, anim: anim('rise', 1.1) }),
          T({ x: 72, y: 758, w: 936, h: 28, text: 'Includes estimated wage of ${{wage_low}} – ${{wage_high}}/hr and non-taxable travel benefits if eligible', color: BRAND.soft, style: { size: 19, weight: 400, italic: true }, anim: anim('fade', 1.3) }),
          ...details(72, 802, 936, 122, 1.4),
          rect(72, 946, 936, 2, BRAND.rule),
          logo(LOGOS.unitimed, 72, 962, 1, 'UnitiMed logo', anim('fade', 1.6)),
          T({ x: 600, y: 972, w: 408, h: 36, text: '{{cta}}', locked: true, color: BRAND.teal, style: { size: 28, weight: 800, align: 'right' }, anim: anim('fade', 1.7) }),
          T({ x: 600, y: 1012, w: 408, h: 28, text: '{{website}}', locked: true, color: '#8F96B2', style: { size: 20, weight: 500, align: 'right' }, anim: anim('fade', 1.7) }),
          ...brandBars(W, 1058, 22),
        ],
      }),
    ],
  }
}

// ── Portrait 1080×1350 (Instagram 4:5) ──────────────────────

function portrait(): TemplateLayout {
  const W = 1080
  return {
    w: W,
    h: 1350,
    pages: [
      page({
        bg: { color: BRAND.navy },
        duration: 5,
        elements: [
          logo(LOGOS.gqr, 60, 50, 1, 'GQR logo', anim('fade', 0.1)),
          T({ x: 600, y: 100, w: 410, h: 34, text: '{{job_type}}', locked: true, color: BRAND.muted, style: { size: 22, weight: 700, align: 'right' }, anim: anim('fade', 0.2) }),
          rect(72, 186, 936, 420, BRAND.panel, 32, { name: 'Photo frame' }),
          cityPhoto(84, 198, 912, 396, 24),
          ...pill(108, 222, 260, 60, 24, 0.5),
          T({ x: 72, y: 610, w: 740, h: 112, text: '{{job_title}}', name: 'Job title', minSize: 38, style: { size: 70, weight: 800, lineHeight: 1.05, valign: 'bottom' }, anim: anim('rise', 0.7) }),
          pin(74, 722, 38, anim('rise', 0.85)),
          T({ x: 120, y: 716, w: 690, h: 48, text: '{{location}}', name: 'Location', color: BRAND.teal, style: { size: 36, weight: 700 }, anim: anim('rise', 0.85) }),
          logo(LOGOS.badge, 826, 640, 1.04, 'Award badge', anim('pop', 1.1)),
          rect(72, 790, 936, 2, BRAND.rule),
          T({ x: 72, y: 812, w: 700, h: 30, text: 'ESTIMATED WEEKLY GROSS PAY', color: BRAND.pink, fit: 'fixed', style: { size: 22, weight: 700 }, anim: anim('fade', 1.0) }),
          T({ x: 72, y: 846, w: 936, h: 120, text: '{{weekly_pay}}', name: 'Weekly pay', style: { size: 104, weight: 800, letterSpacing: -1 }, anim: anim('rise', 1.1) }),
          T({ x: 72, y: 970, w: 936, h: 30, text: 'Includes estimated wage of ${{wage_low}} – ${{wage_high}}/hr and non-taxable travel benefits if eligible', color: BRAND.soft, style: { size: 20, weight: 400, italic: true }, anim: anim('fade', 1.3) }),
          ...details(72, 1024, 936, 140, 1.4),
          rect(72, 1192, 936, 2, BRAND.rule),
          logo(LOGOS.unitimed, 72, 1212, 1.05, 'UnitiMed logo', anim('fade', 1.6)),
          T({ x: 600, y: 1220, w: 408, h: 38, text: '{{cta}}', locked: true, color: BRAND.teal, style: { size: 30, weight: 800, align: 'right' }, anim: anim('fade', 1.7) }),
          T({ x: 600, y: 1262, w: 408, h: 30, text: '{{website}}', locked: true, color: '#8F96B2', style: { size: 21, weight: 500, align: 'right' }, anim: anim('fade', 1.7) }),
          ...brandBars(W, 1326, 24),
        ],
      }),
    ],
  }
}

// ── Story 1080×1920 (keeps text out of the top 250 / bottom 340 px UI zones) ──

function story(): TemplateLayout {
  const W = 1080
  return {
    w: W,
    h: 1920,
    pages: [
      page({
        bg: { color: BRAND.navy },
        duration: 6,
        elements: [
          cityPhoto(0, 0, W, 980, 0),
          shape('rect', {
            x: 0, y: 560, w: W, h: 440, fill: BRAND.navy, name: 'Photo fade',
            gradient: { type: 'linear', angle: 180, stops: [{ at: 0, color: 'rgba(12,24,77,0)' }, { at: 1, color: BRAND.navy }] },
          }),
          // navy tile behind the logo (the placeholder logo has navy baked in; also
          // keeps a transparent logo readable over any photo)
          rect(48, 232, 340, 140, BRAND.navy, 22, { name: 'Logo tile', locked: true, anim: anim('fade', 0.2), shadow: { color: 'rgba(0,0,0,0.25)', blur: 24, x: 0, y: 6 } }),
          logo(LOGOS.gqr, 72, 250, 0.9, 'GQR logo', anim('fade', 0.2)),
          ...pill(72, 640, 300, 70, 28, 0.6),
          T({ x: 72, y: 740, w: 936, h: 200, text: '{{job_title}}', name: 'Job title', style: { size: 96, weight: 800, lineHeight: 1.05, valign: 'bottom' }, anim: anim('rise', 0.8) }),
          pin(76, 966, 44, anim('rise', 1.0)),
          T({ x: 128, y: 958, w: 880, h: 58, text: '{{location}}', name: 'Location', color: BRAND.teal, style: { size: 44, weight: 700 }, anim: anim('rise', 1.0) }),
          T({ x: 72, y: 1028, w: 936, h: 36, text: '{{job_type}}', locked: true, color: BRAND.muted, fit: 'fixed', style: { size: 26, weight: 700, letterSpacing: 2 }, anim: anim('fade', 1.1) }),
          rect(72, 1092, 936, 2, BRAND.rule),
          T({ x: 72, y: 1116, w: 936, h: 34, text: 'ESTIMATED WEEKLY GROSS PAY', color: BRAND.pink, fit: 'fixed', style: { size: 26, weight: 700 }, anim: anim('fade', 1.2) }),
          T({ x: 72, y: 1154, w: 936, h: 130, text: '{{weekly_pay}}', name: 'Weekly pay', style: { size: 112, weight: 800, letterSpacing: -1 }, anim: anim('rise', 1.3) }),
          T({ x: 72, y: 1288, w: 936, h: 62, text: 'Includes estimated wage of ${{wage_low}} – ${{wage_high}}/hr and non-taxable travel benefits if eligible', color: BRAND.soft, style: { size: 24, weight: 400, italic: true, lineHeight: 1.3 }, anim: anim('fade', 1.4) }),
          ...details(72, 1370, 936, 150, 1.5),
          logo(LOGOS.unitimed, 72, 1548, 0.95, 'UnitiMed logo', anim('fade', 1.7)),
          logo(LOGOS.badge, 830, 1520, 0.8, 'Award badge', anim('pop', 1.8)),
          ...brandBars(W, 1896, 24),
        ],
      }),
    ],
  }
}

// ── Landscape 1200×627 (LinkedIn / Facebook link) ───────────

function landscape(): TemplateLayout {
  const W = 1200
  return {
    w: W,
    h: 627,
    pages: [
      page({
        bg: { color: BRAND.navy },
        duration: 5,
        elements: [
          rect(612, 24, 564, 556, BRAND.panel, 28, { name: 'Photo frame' }),
          cityPhoto(622, 34, 544, 536, 22),
          ...pill(646, 58, 220, 52, 21, 0.5),
          logo(LOGOS.badge, 1000, 428, 0.72, 'Award badge', anim('pop', 1.2)),
          logo(LOGOS.gqr, 40, 30, 0.62, 'GQR logo', anim('fade', 0.1)),
          T({ x: 300, y: 52, w: 290, h: 26, text: '{{job_type}}', locked: true, color: BRAND.muted, style: { size: 17, weight: 700, align: 'right' }, anim: anim('fade', 0.2) }),
          T({ x: 44, y: 98, w: 548, h: 94, text: '{{job_title}}', name: 'Job title', minSize: 28, style: { size: 52, weight: 800, lineHeight: 1.05, valign: 'bottom' }, anim: anim('rise', 0.7) }),
          pin(46, 198, 28, anim('rise', 0.85)),
          T({ x: 80, y: 194, w: 512, h: 36, text: '{{location}}', name: 'Location', color: BRAND.teal, style: { size: 26, weight: 700 }, anim: anim('rise', 0.85) }),
          T({ x: 44, y: 256, w: 548, h: 22, text: 'ESTIMATED WEEKLY GROSS PAY', color: BRAND.pink, fit: 'fixed', style: { size: 16, weight: 700 }, anim: anim('fade', 1.0) }),
          T({ x: 44, y: 280, w: 548, h: 72, text: '{{weekly_pay}}', name: 'Weekly pay', style: { size: 64, weight: 800, letterSpacing: -1 }, anim: anim('rise', 1.1) }),
          T({ x: 44, y: 354, w: 548, h: 38, text: 'Includes est. wage of ${{wage_low}} – ${{wage_high}}/hr + non-taxable travel benefits if eligible', color: BRAND.soft, style: { size: 14, weight: 400, italic: true, lineHeight: 1.3 }, anim: anim('fade', 1.3) }),
          ...details(44, 404, 548, 110, 1.4),
          logo(LOGOS.unitimed, 44, 536, 0.56, 'UnitiMed logo', anim('fade', 1.6)),
          T({ x: 330, y: 538, w: 262, h: 26, text: '{{cta}}', locked: true, color: BRAND.teal, style: { size: 20, weight: 800, align: 'right' }, anim: anim('fade', 1.7) }),
          T({ x: 330, y: 566, w: 262, h: 22, text: '{{website}}', locked: true, color: '#8F96B2', style: { size: 15, weight: 500, align: 'right' }, anim: anim('fade', 1.7) }),
          ...brandBars(W, 607, 20),
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
}
