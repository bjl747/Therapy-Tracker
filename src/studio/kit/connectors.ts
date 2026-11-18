// ─────────────────────────────────────────────────────────────
// Where job details can come from besides typing. The hub's Hot Jobs tab
// and Pay Intel calculator will plug in here (BJ to confirm field names).
// Today: a demo source with sample jobs, shaped like a typical Hot Job.
// ─────────────────────────────────────────────────────────────

import { formatDuration, formatMoneyRange, formatShift, formatTitle } from './normalize'

/** best guess at a Hot Job record — adjust to the hub's real hub_hotjobs fields */
export interface HotJob {
  id: string
  title: string
  city: string
  state: string
  jobType?: string
  weeklyLow?: number
  weeklyHigh?: number
  hourlyLow?: number
  hourlyHigh?: number
  shift?: string
  weeks?: number
  start?: string
  facility?: string
}

export interface JobSource {
  label: string
  list(): Promise<HotJob[]>
}

/** Pay Intel hook: given a job, return pay fields (weekly range + hourly range) */
export type PayEstimator = (job: HotJob) => Promise<Partial<Record<'weekly_pay' | 'wage_low' | 'wage_high', string>>>

export function hotJobToFields(j: HotJob): Record<string, string> {
  const out: Record<string, string> = {
    job_title: formatTitle(j.title),
    location: `${j.city}, ${j.state}`,
  }
  // job type is locked by the template (e.g. ALLIED TRAVEL) — not taken from the Hot Job
  if (j.weeklyLow) out.weekly_pay = formatMoneyRange(j.weeklyHigh ? `${j.weeklyLow}-${j.weeklyHigh}` : `${j.weeklyLow}`)
  const hr = (n: number) => (Number.isInteger(Math.round(n * 100) / 100) ? String(Math.round(n)) : n.toFixed(2))
  if (j.hourlyLow) out.wage_low = hr(j.hourlyLow)
  if (j.hourlyHigh) out.wage_high = hr(j.hourlyHigh)
  if (j.shift) out.shift = formatShift(j.shift)
  if (j.weeks) out.duration = formatDuration(String(j.weeks))
  if (j.start) out.start_date = j.start
  return out
}

const SAMPLE: HotJob[] = [
  { id: 'hj1', title: 'pharmacist', city: 'Fishersville', state: 'VA', jobType: 'Allied Travel', weeklyLow: 3227, weeklyHigh: 3547, hourlyLow: 39, hourlyHigh: 57, shift: '5x8 days', weeks: 13, start: 'ASAP' },
  { id: 'hj2', title: 'ct tech', city: 'Boise', state: 'ID', jobType: 'Allied Travel', weeklyLow: 2410, weeklyHigh: 2655, hourlyLow: 34, hourlyHigh: 48, shift: '3x12 nights', weeks: 13, start: 'Dec 2' },
  { id: 'hj3', title: 'physical therapist', city: 'Grand Junction', state: 'CO', jobType: 'Allied Travel', weeklyLow: 2380, weeklyHigh: 2590, hourlyLow: 36, hourlyHigh: 52, shift: '5x8 days', weeks: 13, start: 'ASAP' },
  { id: 'hj4', title: 'registered nurse - icu', city: 'Saint Louis', state: 'MO', jobType: 'Nurse Travel', weeklyLow: 2650, weeklyHigh: 2890, hourlyLow: 42, hourlyHigh: 60, shift: '3x12 nights', weeks: 13, start: 'Jan 6' },
  { id: 'hj5', title: 'mri tech', city: 'Bend', state: 'OR', jobType: 'Allied Travel', weeklyLow: 2720, weeklyHigh: 2960, hourlyLow: 38, hourlyHigh: 55, shift: '4x10 days', weeks: 13, start: 'ASAP' },
  { id: 'hj6', title: 'speech language pathologist', city: 'Lubbock', state: 'TX', jobType: 'Allied Travel', weeklyLow: 2300, weeklyHigh: 2520, hourlyLow: 35, hourlyHigh: 50, shift: '5x8 days', weeks: 12, start: 'Jan 13' },
]

export const demoHotJobs: JobSource = {
  label: 'Hot Jobs (sample data)',
  list: async () => SAMPLE,
}

/** Where "From Hot Jobs" reads. The hub plugs in its live Hot Jobs, with the pay range worked out by the Deal Sheet
 *  (hub-only src/studio/HubStudio.tsx → src/lib/hotJobPay.ts); this repo keeps the sample jobs. */
let source: JobSource = demoHotJobs
export const setHotJobSource = (s: JobSource) => {
  source = s
}
export const hotJobSource = () => source
