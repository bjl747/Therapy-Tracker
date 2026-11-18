import { describe, expect, it } from 'vitest'
import { bareNumber, formatDuration, formatMoneyRange, formatShift, shiftHours, tidyField } from './normalize'
import { caption, hashtags } from './captions'
import { matchHeader, parseJobs, parseTable } from './batch'
import { JOB_FIELDS } from '../templates/jobPost'
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
    expect(bareNumber('$39.50')).toBe('39.50')
    expect(tidyField('job_type', 'allied travel')).toBe('ALLIED TRAVEL')
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

describe('batch paste', () => {
  it('maps fuzzy headers', () => {
    expect(matchHeader('Job Title', JOB_FIELDS)).toBe('job_title')
    expect(matchHeader('City, State', JOB_FIELDS)).toBe('location')
    expect(matchHeader('Weekly Gross', JOB_FIELDS)).toBe('weekly_pay')
    expect(matchHeader('Recruiter', JOB_FIELDS)).toBeNull()
  })
  it('parses tab-separated rows with quotes', () => {
    expect(parseTable('a\tb\n"x, y"\tz')).toEqual([['a', 'b'], ['x, y', 'z']])
    const r = parseJobs('Title\tCity\tWeekly\nRN\tBoise, ID\t2500\nPT\tAustin, TX\t', JOB_FIELDS)
    expect(r.jobs).toEqual([
      { job_title: 'RN', location: 'Boise, ID', weekly_pay: '2500' },
      { job_title: 'PT', location: 'Austin, TX' },
    ])
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
