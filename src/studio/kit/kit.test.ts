import { describe, expect, it } from 'vitest'
import { formatTitle, bareNumber, formatDuration, formatMoneyRange, formatShift, shiftHours, shiftLength, tidyField } from './normalize'
import { article, caption, hashtags } from './captions'
import { matchLocation, type CityPhoto } from '../photos/cities'
import { parseLocation, formatLocation } from '../photos/location'

describe('normalize', () => {
  it('formats money ranges', () => {
    expect(formatMoneyRange('3227-3547')).toBe('$3,227 – $3,547')
    expect(formatMoneyRange('$3227 to 3,547')).toBe('$3,227 – $3,547')
    expect(formatMoneyRange('2500')).toBe('$2,500')
    expect(formatMoneyRange('DOE')).toBe('DOE')
    expect(formatMoneyRange('Up to $4k/wk')).toBe('Up to $4k/wk')
  })
  it('formats shifts and durations', () => {
    expect(formatShift('3x12 nights')).toBe('3x12s, Nights')
    expect(formatShift('5 x 8 days')).toBe('5x8s, Days')
    expect(formatShift('4x10s')).toBe('4x10s')
    expect(formatShift('Mon-Fri 8-5')).toBe('Mon-Fri 8-5')
    expect(formatDuration('13')).toBe('13 Weeks')
    expect(formatDuration('8 wks')).toBe('8 Weeks')
    expect(shiftHours('3x12s, Nights')).toBe(36)
    // hours in one shift, for the pay calculator (what a hot job's description gave, or what the recruiter typed)
    expect(shiftLength('4x10s, Days')).toBe(10)
    expect(shiftLength('2x12s, Nights, PRN')).toBe(12)
    expect(shiftLength('10s, Nights')).toBe(10)
    expect(shiftLength('3x12s or 4x12s, Nights')).toBe(12)
    expect(shiftLength('8-hour shifts')).toBe(8)
    expect(shiftLength('36 or 48 hrs')).toBeNull()
    expect(shiftLength('Days')).toBeNull()
    expect(shiftLength('')).toBeNull()
    // a shift already in display form stays as it is
    expect(formatShift('4x10s, Days')).toBe('4x10s, Days')
    expect(formatShift('2x12s, Nights, PRN')).toBe('2x12s, Nights, PRN')
    expect(bareNumber('$39.50')).toBe('39.50')
    expect(tidyField('job_type', 'allied travel')).toBe('ALLIED TRAVEL')
  })
})

describe('titles', () => {
  it('title-cases with acronyms', () => {
    expect(formatTitle('registered nurse - icu')).toBe('Registered Nurse – ICU')
    expect(formatTitle('CT TECH')).toBe('CT Tech')
    expect(formatTitle('rn l&d')).toBe('RN L&D')
    expect(formatTitle('director of nursing')).toBe('Director of Nursing')
    expect(formatTitle('physical therapist (pt)')).toBe('Physical Therapist (PT)')
  })
})

describe('captions', () => {
  const job = { job_title: 'Pharmacist', location: 'Fishersville, VA', job_type: 'ALLIED TRAVEL', weekly_pay: '$3,227 – $3,547', shift: '5x8s, Days', website: 'unitimed.com' }
  it('builds specialty + location hashtags', () => {
    const t = hashtags(job)
    expect(t).toContain('#Pharmacist')
    expect(t).toContain('#FishersvilleJobs')
    expect(t).toContain('#VirginiaJobs')
    expect(t).toContain('#AlliedHealth')
    expect(t.length).toBeLessThanOrEqual(8)
  })
  it('is deterministic and variant cycles', () => {
    expect(caption(job)).toBe(caption(job))
    expect(caption(job, 1)).not.toBe(caption(job))
    expect(caption(job)).toContain('$3,227 – $3,547')
  })
})

describe('locations', () => {
  const photo = (id: string, city: string, st: string, lat: number, lon: number, population: number): CityPhoto => ({
    id, city, st, state: st, population, lat, lon, width: 1280, height: 853,
    credit: { provider: 'Wikimedia Commons', author: 'x', license: 'CC0', url: '' },
  })
  const photos = [
    photo('richmond-va', 'Richmond', 'VA', 37.54, -77.43, 230000),
    photo('charlottesville-va', 'Charlottesville', 'VA', 38.03, -78.48, 46000),
    photo('virginia-beach-va', 'Virginia Beach', 'VA', 36.85, -75.98, 450000),
    photo('st-louis-mo', 'St. Louis', 'MO', 38.63, -90.2, 280000),
  ]
  const places = { VA: { fishersville: [38.1, -78.99] as [number, number] }, MO: {} }
  it('parses many location spellings', () => {
    expect(parseLocation('Fishersville, VA')).toEqual({ city: 'Fishersville', st: 'VA' })
    expect(parseLocation('Fishersville, Virginia')).toEqual({ city: 'Fishersville', st: 'VA' })
    expect(parseLocation('Fishersville VA')).toEqual({ city: 'Fishersville', st: 'VA' })
    expect(parseLocation('Virginia')).toEqual({ city: '', st: 'VA' })
    expect(parseLocation('Nowhere')).toBeNull()
    expect(formatLocation('fishersville , va')).toBe('fishersville, VA')
  })
  it('exact, nearest-in-state, and state fallbacks', () => {
    expect(matchLocation('Richmond, VA', photos, places)?.kind).toBe('exact')
    expect(matchLocation('Saint Louis, MO', photos, places)?.photo.id).toBe('st-louis-mo')
    const near = matchLocation('Fishersville, VA', photos, places)
    expect(near?.kind).toBe('nearby')
    expect(near?.photo.id).toBe('charlottesville-va')
    const st = matchLocation('Tinytown, VA', photos, places)
    expect(st?.kind).toBe('state')
    expect(st?.photo.id).toBe('virginia-beach-va')
  })
})

import { instantiate } from '../templates/instantiate'
import { TRAVEL_JOB_POST } from '../templates/jobPost'
import { useEditor } from '../editor/store'

describe('template-locked fields', () => {
  it('instantiate ignores typed values for locked fields', () => {
    const d = instantiate(TRAVEL_JOB_POST, 'square', { job_type: 'NURSE TRAVEL', website: 'evil.example', job_title: 'RN' })
    expect(d.fields.job_type).toBe('ALLIED TRAVEL')
    expect(d.fields.website).toBe('unitimed.com')
    expect(d.fields.job_title).toBe('RN')
  })
  it('recruiters cannot change locked fields in the editor; managers can', () => {
    const d = instantiate(TRAVEL_JOB_POST, 'square')
    useEditor.getState().load(d, { canEditLocked: false })
    useEditor.getState().setFields({ cta: 'CALL NOW', job_title: 'PT' })
    expect(useEditor.getState().design!.fields.cta).toBe('APPLY TODAY')
    expect(useEditor.getState().design!.fields.job_title).toBe('PT')
    useEditor.getState().load(d, { canEditLocked: true })
    useEditor.getState().setFields({ cta: 'CALL NOW' })
    expect(useEditor.getState().design!.fields.cta).toBe('CALL NOW')
  })
})

import { wrap } from '../engine/text'
describe('wrap breaks long words anywhere on a line', () => {
  const m = (t: string) => t.length * 10
  it('second word longer than the box', () => {
    const lines = wrap('Hi Supercalifragilistic', 100, m)
    expect(lines.every((l) => l.width <= 100)).toBe(true)
    expect(lines.map((l) => l.text).join('')).toBe('HiSupercalifragilistic')
  })
  it('normal wrapping unchanged', () => {
    expect(wrap('aaa bbb ccc', 70, m).map((l) => l.text)).toEqual(['aaa bbb', 'ccc'])
    expect(wrap('a\nb', 100, m).map((l) => l.text)).toEqual(['a', 'b'])
  })
})

import { resolveText, missingKeys } from '../engine/fields'
describe('markers can’t reach object internals', () => {
  it('{{constructor}} / {{__proto__}} / {{toString}} are just unknown fields', () => {
    expect(resolveText('Pay {{constructor}}', {})).toBe('Pay ')
    expect(resolveText('{{toString}}{{__proto__}}', {}, true)).toBe('‹toString›{{__proto__}}') // not a valid key → left as typed
    expect(missingKeys('{{constructor}} {{job}}', { job: 'RN' })).toEqual(['constructor'])
  })
})

describe('review fixes (2026-11-18)', () => {
  it('picks a / an by sound', () => {
    expect(article('RN – ICU')).toBe('an')
    expect(article('LPN')).toBe('an')
    expect(article('MRI Tech')).toBe('an')
    expect(article('CNA')).toBe('a')
    expect(article('CT Tech')).toBe('a')
    expect(article('Occupational Therapist')).toBe('an')
    expect(article('Ultrasound Tech')).toBe('an')
    expect(article('Unit Clerk')).toBe('a')
    expect(article('Pharmacist')).toBe('a')
  })
})

describe('title abbreviations (2026-11-18)', () => {
  it('keeps short all-caps abbreviations as typed', () => {
    expect(formatTitle('Respiratory (RRT/CRT)')).toBe('Respiratory (RRT/CRT)')
    expect(formatTitle('Cath Lab – CVT')).toBe('Cath Lab – CVT')
    expect(formatTitle('OR Tech')).toBe('OR Tech')
    expect(formatTitle('PHARMACIST')).toBe('Pharmacist')
    expect(formatTitle('rn - icu')).toBe('RN – ICU')
  })
})

import { MAX_JOBS, blankJob, isBlankJob, newestFirst, openSlots, placeHotJobs, withHotJob } from './many'
import { PAY_KEYS } from './connectors'
describe('Many jobs (2026-11-19)', () => {
  const T = TRAVEL_JOB_POST
  const hot = (t: string) => ({ job_title: t, location: 'Boise, ID' })
  it('a blank job keeps only the locked values', () => {
    const b = blankJob(T)
    expect(isBlankJob(b, T)).toBe(true)
    expect(b.job_type).toBe('ALLIED TRAVEL')
    expect(isBlankJob({ ...b, shift: '3x12' }, T)).toBe(false)
  })
  it('a hot job starts the pay, shift and duration clean and marks the job hot', () => {
    const j = withHotJob({ job_title: 'Old', weekly_pay: '$9', shift: '5x8', duration: '13 weeks', [PAY_KEYS.bill]: '99', location__photo: 'x' }, hot('CT Tech'))
    expect(j).toMatchObject({ job_title: 'CT Tech', weekly_pay: '', shift: '', duration: '', [PAY_KEYS.bill]: '', [PAY_KEYS.hot]: '1', location__photo: '' })
  })
  it('several hot jobs fill blank jobs first, then add jobs, never past five', () => {
    const jobs = [{ ...blankJob(T), job_title: 'Mine' }, blankJob(T)]
    expect(openSlots(jobs, T)).toBe(1 + MAX_JOBS - 2)
    const r = placeHotJobs(jobs, ['A', 'B', 'C', 'D', 'E'].map(hot), T)
    expect(r.jobs.map((j) => j.job_title)).toEqual(['Mine', 'A', 'B', 'C', 'D'])
    expect(r.last).toBe(4)
  })
  it('lists hot jobs newest first, like the Hot Jobs tab; undated ones last in their order', () => {
    const js = [
      { id: 'a', title: '', city: '', state: '', posted: '2026-11-01T10:00:00Z' },
      { id: 'b', title: '', city: '', state: '' },
      { id: 'c', title: '', city: '', state: '', posted: '2026-11-18T10:00:00Z' },
      { id: 'd', title: '', city: '', state: '' },
    ]
    expect(newestFirst(js).map((j) => j.id)).toEqual(['c', 'a', 'b', 'd'])
  })
})

import { HOT_JOBS_ROUNDUP, roundupFields } from '../templates/roundup'
describe('roundup post (demo test, 2026-11-19)', () => {
  it('draws "EST. WEEKLY" only under a pay', () => {
    const d = instantiate(HOT_JOBS_ROUNDUP, 'square', roundupFields([{ job_title: 'RRT', location: 'Springfield, MO' }, { job_title: 'CVT', location: 'Boise, ID', weekly_pay: '$2,410' }]))
    const labels = d.pages[0].elements.filter((e) => e.type === 'text' && e.text === 'EST. WEEKLY')
    const shown = labels.filter((e) => !e.showIf || !!d.fields[e.showIf]?.trim())
    expect(shown.map((e) => e.showIf)).toEqual(['job2_pay'])
  })
})
