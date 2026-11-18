// ─────────────────────────────────────────────────────────────
// collection-job-posts — Canva 2.0 job-post templates.
//
// Smart template (fields + {{markers}}) built from the team's
// existing hiring post. The image named CITY_PHOTO_LAYER is swapped
// for a photo of the job's location at fill time (see
// src/lib/city-photos.ts) — the closest city in the bundled
// US-city library when the exact town isn't in it.
// ─────────────────────────────────────────────────────────────

import { createImageElement } from '../types'
import type { TemplateDef } from './helpers'
import { tx, sh } from './helpers'

/** layer name the fill step looks for to drop in the city photo */
export const CITY_PHOTO_LAYER = 'City photo'

const NAVY = '#0C184D'
const PANEL = '#18255E'
const RULE = '#3E4B7B'
const PINK = '#E74599'
const TEAL = '#2BBACC'
const BLUE = '#2940DA'
const MUTED = '#9A9FC4'

const PIN =
  'M50 0 C28 0 12 17 12 38 C12 66 50 100 50 100 C50 100 88 66 88 38 C88 17 72 0 50 0 Z ' +
  'M50 22 C59 22 66 29 66 38 C66 47 59 54 50 54 C41 54 34 47 34 38 C34 29 41 22 50 22 Z'

const img = (src: string, w: number, h: number, o: Record<string, unknown>) =>
  createImageElement(src, w, h, { radius: 0, ...o } as Parameters<typeof createImageElement>[3])

const label = (x: number, text: string) =>
  tx({ x, y: 818, width: 300, height: 24, text, fontFamily: 'Inter', bold: true, fontSize: 17, fill: TEAL, align: 'center' })
const value = (x: number, text: string) =>
  tx({ x, y: 842, width: 300, height: 32, text, fontFamily: 'Inter', bold: true, fontSize: 24, fill: '#FFFFFF', align: 'center', autoFit: true })

export const COLLECTION_JOB_POSTS: TemplateDef[] = [
  {
    slug: 'job-post-travel-square',
    name: 'Job Post — Travel (Square)',
    category: 'social',
    width: 1080,
    height: 1080,
    accent: PINK,
    badge: 'new',
    fields: [
      { key: 'job_title', label: 'Job title', example: 'Pharmacist' },
      { key: 'location', label: 'Location (City, ST)', example: 'Fishersville, VA' },
      { key: 'job_type', label: 'Job type', example: 'ALLIED TRAVEL' },
      { key: 'weekly_pay', label: 'Weekly gross pay', example: '$3,227 – $3,547' },
      { key: 'wage_low', label: 'Hourly wage — low', example: '39' },
      { key: 'wage_high', label: 'Hourly wage — high', example: '57' },
      { key: 'shift', label: 'Shift', example: '5x8s, Days' },
      { key: 'duration', label: 'Duration', example: '13 Weeks' },
      { key: 'start_date', label: 'Start date', example: 'ASAP' },
      { key: 'benefits', label: 'Benefits line', example: 'MEDICAL  ·  DENTAL  ·  VISION  ·  HSA / FSA  ·  REFERRAL BONUS' },
    ],
    pages: [
      {
        id: 'p1',
        background: { type: 'solid', color: NAVY },
        elements: [
          // header
          img('/brand/gqr-healthcare.png', 325, 115, { x: 60, y: 45, width: 325, height: 115, name: 'GQR logo' }),
          tx({ x: 640, y: 96, width: 370, height: 32, text: '{{job_type}}', fontFamily: 'Inter', bold: true, fontSize: 22, fill: MUTED, align: 'right' }),

          // city photo card
          sh('rect', { x: 72, y: 172, width: 936, height: 290, cornerRadius: 30, fill: PANEL }),
          img('/photos/cities/richmond-va.jpg', 1280, 853, {
            x: 84, y: 184, width: 912, height: 266, radius: 22, name: CITY_PHOTO_LAYER,
          }),
          sh('rect', { x: 106, y: 206, width: 250, height: 58, cornerRadius: 29, fill: PINK }),
          tx({ x: 106, y: 220, width: 250, height: 32, text: 'NOW HIRING', fontFamily: 'Inter', bold: true, fontSize: 23, fill: '#FFFFFF', align: 'center' }),

          // title + location
          tx({ x: 72, y: 486, width: 740, height: 70, text: '{{job_title}}', fontFamily: 'Inter', bold: true, fontSize: 58, fill: '#FFFFFF', align: 'left', autoFit: true }),
          sh('path', { x: 72, y: 556, width: 26, height: 34, pathData: PIN, fill: TEAL }),
          tx({ x: 112, y: 553, width: 700, height: 42, text: '{{location}}', fontFamily: 'Inter', bold: true, fontSize: 31, fill: TEAL, align: 'left', autoFit: true }),
          img('/brand/bluepipes-2026-badge.png', 224, 176, { x: 834, y: 500, width: 224, height: 176, name: 'Award badge' }),

          // pay
          sh('rect', { x: 72, y: 604, width: 760, height: 2, cornerRadius: 0, fill: RULE }),
          tx({ x: 72, y: 624, width: 700, height: 26, text: 'ESTIMATED WEEKLY GROSS PAY', fontFamily: 'Inter', bold: true, fontSize: 19, fill: PINK, align: 'left' }),
          tx({ x: 72, y: 652, width: 936, height: 104, text: '{{weekly_pay}}', fontFamily: 'Inter', bold: true, fontSize: 90, fill: '#FFFFFF', align: 'left', autoFit: true }),
          tx({ x: 72, y: 757, width: 936, height: 26, text: 'Includes estimated wage of ${{wage_low}} – ${{wage_high}}/hr and non-taxable travel benefits if eligible', fontFamily: 'Inter', italic: true, fontSize: 18, fill: '#96A3C5', align: 'left' }),

          // details panel
          sh('rect', { x: 72, y: 802, width: 936, height: 122, cornerRadius: 20, fill: PANEL }),
          label(78, 'SHIFT'),
          label(390, 'DURATION'),
          label(702, 'START DATE'),
          value(78, '{{shift}}'),
          value(390, '{{duration}}'),
          value(702, '{{start_date}}'),
          sh('rect', { x: 384, y: 824, width: 2, height: 36, cornerRadius: 0, fill: RULE }),
          sh('rect', { x: 696, y: 824, width: 2, height: 36, cornerRadius: 0, fill: RULE }),
          sh('rect', { x: 98, y: 882, width: 884, height: 1, cornerRadius: 0, fill: RULE }),
          tx({ x: 72, y: 893, width: 936, height: 24, text: '{{benefits}}', fontFamily: 'Inter', bold: true, fontSize: 16, fill: MUTED, align: 'center' }),

          // footer
          sh('rect', { x: 72, y: 946, width: 936, height: 2, cornerRadius: 0, fill: RULE }),
          img('/brand/unitimed.png', 400, 78, { x: 72, y: 962, width: 400, height: 78, name: 'UnitiMed logo' }),
          tx({ x: 640, y: 974, width: 368, height: 34, text: 'APPLY TODAY', fontFamily: 'Inter', bold: true, fontSize: 26, fill: TEAL, align: 'right' }),
          tx({ x: 640, y: 1012, width: 368, height: 26, text: 'unitimed.com', fontFamily: 'Inter', fontSize: 19, fill: '#8F96B2', align: 'right' }),
          sh('rect', { x: 0, y: 1058, width: 360, height: 22, cornerRadius: 0, fill: BLUE }),
          sh('rect', { x: 360, y: 1058, width: 360, height: 22, cornerRadius: 0, fill: '#12C4D1' }),
          sh('rect', { x: 720, y: 1058, width: 360, height: 22, cornerRadius: 0, fill: PINK }),
        ],
      },
    ],
  },
]
