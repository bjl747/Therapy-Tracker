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
  // What the post itself says, for the Job Kit's Work out pay strip to show and double-check (BJ, 2026-11-18). Each is
  // set only when it is on the post: nothing here is a default or a guess.
  billRate?: number
  /** the Deal Key vendor's id; none when the vendor was typed by hand on the post */
  vendorId?: string
  vendorName?: string
  /** the post's own fee / NBO text ("4%-5%", "Varies (8-13)") */
  vendorFee?: string
  nbo?: string
  zip?: string
  hours?: number
}

export interface JobSource {
  label: string
  list(): Promise<HotJob[]>
}

/** Pay Intel hook: given a job, return pay fields (weekly range + hourly range) */
export type PayEstimator = (job: HotJob) => Promise<Partial<Record<'weekly_pay' | 'wage_low' | 'wage_high', string>>>

/** A fresh job's numbers for the Job Kit's "Work out pay" strip (BJ, 2026-11-18). */
export interface PayQuote {
  billRate: number
  vendorId: string
  city: string
  state: string
  zip?: string
  hours?: number
  weeks?: number
  /** the post's start date text ("ASAP", "12/7", "Jan 12") */
  start?: string
  /** a hot job's own fee / NBO text: used instead of the vendor's (and on their own when the vendor was typed by hand) */
  fee?: string
  nbo?: string
}
export type PayAnswer =
  | { ok: true; weekly: [number, number]; hourly: [number, number]; note: string }
  | { ok: false; reason: string }
/** The hub's pay calculator (the Deal Sheet with the hub's margin rules) and Deal Key's vendor list. Without it (this
 *  standalone repo) the Job Kit hides the strip and pay is typed in. */
export interface PayTools {
  vendors(): Promise<{ id: string; name: string; fee: string }[]>
  estimate(q: PayQuote): Promise<PayAnswer>
  defaults: { hours: number; weeks: number }
}
let payTools: PayTools | null = null
export const setPayTools = (t: PayTools | null) => {
  payTools = t
}
export const getPayTools = () => payTools

/** The Work out pay strip's numbers, kept with the job (so Recent jobs bring them back); they aren't on any design.
 *  `fee` / `nbo` / `vendorName` and `hot` are only set when the job came from Hot Jobs. */
export const PAY_KEYS = {
  bill: 'pay__bill', vendor: 'pay__vendor', zip: 'pay__zip', hours: 'pay__hours', weeks: 'pay__weeks',
  fee: 'pay__fee', nbo: 'pay__nbo', vendorName: 'pay__vendor_name', hot: 'pay__hot',
} as const
/** the strip's vendor value for a hot job whose vendor was typed by hand (its fee is on the post, not in Deal Key) */
export const POST_VENDOR = '@post'

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
  // the post's own numbers → the Work out pay strip
  if (j.billRate) out[PAY_KEYS.bill] = Number.isInteger(j.billRate) ? String(j.billRate) : j.billRate.toFixed(2)
  if (j.vendorId || j.vendorFee) {
    out[PAY_KEYS.vendor] = j.vendorId || POST_VENDOR
    if (j.vendorName) out[PAY_KEYS.vendorName] = j.vendorName
    if (j.vendorFee) out[PAY_KEYS.fee] = j.vendorFee
    if (j.nbo) out[PAY_KEYS.nbo] = j.nbo
  }
  if (j.zip) out[PAY_KEYS.zip] = j.zip
  if (j.hours) out[PAY_KEYS.hours] = String(j.hours)
  if (j.weeks) out[PAY_KEYS.weeks] = String(j.weeks)
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
