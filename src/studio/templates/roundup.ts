// ─────────────────────────────────────────────────────────────
// "Hot Jobs This Week" — several openings in one post. Rows 1–5 each have
// title / location / pay fields; empty rows disappear (showIf). Built from
// the Job Kit's "Many jobs" paste with one click.
// ─────────────────────────────────────────────────────────────

import { image, page, shape, text, type Anim, type El, type FieldDef } from '../engine/model'
import type { TemplateDef, TemplateLayout } from './types'
import { BRAND, LOGOS } from './jobPost'

export const ROUNDUP_ROWS = 5

export const ROUNDUP_FIELDS: FieldDef[] = [
  { key: 'headline', label: 'Headline', example: 'HOT JOBS THIS WEEK', group: 'Post' },
  { key: 'job_type', label: 'Job type', example: 'ALLIED TRAVEL', group: 'Post' },
  { key: 'location', label: 'Photo location', example: 'Richmond, VA', kind: 'location', group: 'Post' },
  ...Array.from({ length: ROUNDUP_ROWS }, (_, i): FieldDef[] => [
    { key: `job${i + 1}_title`, label: `Job ${i + 1} title`, example: ['Pharmacist', 'CT Tech', 'Physical Therapist', '', ''][i], group: `Job ${i + 1}` },
    { key: `job${i + 1}_location`, label: `Job ${i + 1} location`, example: ['Fishersville, VA', 'Boise, ID', 'Grand Junction, CO', '', ''][i], group: `Job ${i + 1}` },
    { key: `job${i + 1}_pay`, label: `Job ${i + 1} weekly pay`, example: ['$3,227 – $3,547', '$2,410 – $2,655', '$2,380 – $2,590', '', ''][i], group: `Job ${i + 1}` },
  ]).flat(),
  { key: 'cta', label: 'Call to action', example: 'APPLY TODAY', group: 'Footer' },
  { key: 'website', label: 'Website', example: 'unitimed.com', group: 'Footer' },
]

const anim = (kind: Anim['kind'], delay: number, duration = 0.5): Anim => ({ kind, delay, duration })
const T = (o: Parameters<typeof text>[0]) => text({ color: BRAND.white, ...o, style: { family: 'Inter', ...o.style } })

function rows(x: number, y0: number, w: number, rowH: number, gap: number, scale: number): El[] {
  const out: El[] = []
  for (let i = 0; i < ROUNDUP_ROWS; i++) {
    const n = i + 1
    const y = y0 + i * (rowH + gap)
    const a = anim('slide-left', 0.6 + i * 0.18)
    const show = `job${n}_title`
    out.push(
      shape('rect', { x, y, w, h: rowH, fill: BRAND.panel, radius: 18 * scale, showIf: show, anim: a, name: `Row ${n}` }),
      shape('rect', { x, y: y + rowH * 0.18, w: 6 * scale, h: rowH * 0.64, fill: [BRAND.pink, BRAND.cyan, BRAND.blue, BRAND.pink, BRAND.cyan][i], radius: 3, showIf: show, anim: a }),
      T({ x: x + 30 * scale, y: y + rowH * 0.14, w: w * 0.6, h: rowH * 0.42, text: `{{job${n}_title}}`, showIf: show, style: { size: 34 * scale, weight: 800 }, anim: a }),
      T({ x: x + 30 * scale, y: y + rowH * 0.56, w: w * 0.6, h: rowH * 0.3, text: `{{job${n}_location}}`, color: BRAND.teal, showIf: show, style: { size: 23 * scale, weight: 700 }, anim: a }),
      T({ x: x + w * 0.62, y: y + rowH * 0.2, w: w * 0.38 - 26 * scale, h: rowH * 0.36, text: `{{job${n}_pay}}`, showIf: show, style: { size: 30 * scale, weight: 800, align: 'right' }, anim: a }),
      T({ x: x + w * 0.62, y: y + rowH * 0.58, w: w * 0.38 - 26 * scale, h: rowH * 0.26, text: 'EST. WEEKLY', color: BRAND.muted, fit: 'fixed', showIf: show, style: { size: 15 * scale, weight: 700, align: 'right', letterSpacing: 1 }, anim: a }),
    )
  }
  return out
}

const bars = (w: number, y: number, h: number) => [
  shape('rect', { x: 0, y, w: w / 3, h, fill: BRAND.blue, locked: true }),
  shape('rect', { x: w / 3, y, w: w / 3, h, fill: BRAND.cyan, locked: true }),
  shape('rect', { x: (2 * w) / 3, y, w: w / 3, h, fill: BRAND.pink, locked: true }),
]

function square(): TemplateLayout {
  return {
    w: 1080,
    h: 1080,
    pages: [
      page({
        bg: { color: BRAND.navy },
        duration: 5,
        elements: [
          image({ x: 0, y: 0, w: 1080, h: 300, bind: 'location', name: 'City photo', kenBurns: true, anim: anim('fade', 0, 0.8) }),
          shape('rect', { x: 0, y: 120, w: 1080, h: 190, fill: BRAND.navy, gradient: { type: 'linear', angle: 180, stops: [{ at: 0, color: 'rgba(12,24,77,0)' }, { at: 1, color: BRAND.navy }] } }),
          image({ src: LOGOS.gqr.src, x: 60, y: 36, w: 228, h: 81, fit: 'contain', locked: true, name: 'GQR logo' }),
          T({ x: 60, y: 196, w: 960, h: 80, text: '{{headline}}', style: { size: 64, weight: 900, letterSpacing: -0.5 }, anim: anim('rise', 0.2) }),
          T({ x: 60, y: 276, w: 600, h: 30, text: '{{job_type}}', color: BRAND.pink, fit: 'fixed', style: { size: 22, weight: 800, letterSpacing: 2 }, anim: anim('fade', 0.4) }),
          ...rows(60, 330, 960, 112, 14, 1),
          image({ src: LOGOS.unitimed.src, x: 60, y: 966, w: 360, h: 70, fit: 'contain', locked: true, name: 'UnitiMed logo' }),
          T({ x: 600, y: 970, w: 420, h: 34, text: '{{cta}}', color: BRAND.teal, style: { size: 28, weight: 800, align: 'right' }, anim: anim('fade', 1.6) }),
          T({ x: 600, y: 1008, w: 420, h: 28, text: '{{website}}', color: '#8F96B2', style: { size: 20, weight: 500, align: 'right' }, anim: anim('fade', 1.6) }),
          ...bars(1080, 1058, 22),
        ],
      }),
    ],
  }
}

function story(): TemplateLayout {
  return {
    w: 1080,
    h: 1920,
    pages: [
      page({
        bg: { color: BRAND.navy },
        duration: 6,
        elements: [
          image({ x: 0, y: 0, w: 1080, h: 720, bind: 'location', name: 'City photo', kenBurns: true, anim: anim('fade', 0, 0.8) }),
          shape('rect', { x: 0, y: 400, w: 1080, h: 330, fill: BRAND.navy, gradient: { type: 'linear', angle: 180, stops: [{ at: 0, color: 'rgba(12,24,77,0)' }, { at: 1, color: BRAND.navy }] } }),
          shape('rect', { x: 48, y: 232, w: 340, h: 140, fill: BRAND.navy, radius: 22, locked: true, name: 'Logo tile' }),
          image({ src: LOGOS.gqr.src, x: 72, y: 250, w: 292, h: 104, fit: 'contain', locked: true, name: 'GQR logo' }),
          T({ x: 72, y: 560, w: 936, h: 190, text: '{{headline}}', style: { size: 92, weight: 900, lineHeight: 1.02, valign: 'bottom' }, anim: anim('rise', 0.2) }),
          T({ x: 72, y: 760, w: 936, h: 38, text: '{{job_type}}', color: BRAND.pink, fit: 'fixed', style: { size: 28, weight: 800, letterSpacing: 2 }, anim: anim('fade', 0.4) }),
          ...rows(72, 830, 936, 150, 18, 1.3),
          image({ src: LOGOS.unitimed.src, x: 72, y: 1720 - 160, w: 400, h: 78, fit: 'contain', locked: true, name: 'UnitiMed logo' }),
          T({ x: 560, y: 1566, w: 448, h: 40, text: '{{cta}}', color: BRAND.teal, style: { size: 32, weight: 800, align: 'right' }, anim: anim('fade', 1.8) }),
          ...bars(1080, 1896, 24),
        ],
      }),
    ],
  }
}

export const HOT_JOBS_ROUNDUP: TemplateDef = {
  id: 'hot-jobs-roundup',
  name: 'Hot Jobs Roundup',
  category: 'job-post',
  description: 'Up to five openings in one post — paste a list of jobs and it builds itself.',
  tags: ['hiring', 'roundup', 'weekly', 'list'],
  fieldDefs: ROUNDUP_FIELDS,
  layouts: { square: square(), story: story() },
  defaultSize: 'square',
  builtIn: true,
}

/** roundup fields from a list of jobs (first five) */
export function roundupFields(jobs: Record<string, string>[], base: Record<string, string> = {}): Record<string, string> {
  const f: Record<string, string> = { ...base }
  for (let i = 0; i < ROUNDUP_ROWS; i++) {
    const j = jobs[i]
    f[`job${i + 1}_title`] = j?.job_title ?? ''
    f[`job${i + 1}_location`] = j?.location ?? ''
    f[`job${i + 1}_pay`] = j?.weekly_pay ?? ''
  }
  if (!f.location && jobs[0]?.location) f.location = jobs[0].location
  return f
}
