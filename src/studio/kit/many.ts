// Job Kit "Many jobs" (BJ, 2026-11-19): the normal job form, repeated for up to five jobs (no spreadsheet paste:
// "We don't use excels"). Each job can be filled from Hot Jobs exactly like the one-job form; the five feed the
// "Hot Jobs This Week" roundup post and a kit per job in one ZIP.

import type { TemplateDef } from '../templates/types'
import { PAY_KEYS, type HotJob } from './connectors'

/** the most jobs in Many jobs: the roundup post has five rows */
export const MAX_JOBS = 5

/** a job with nothing typed in (locked template values only) */
export const blankJob = (t: TemplateDef): Record<string, string> =>
  Object.fromEntries(t.fieldDefs.map((f) => [f.key, f.locked ? f.example : '']))

/** true when none of the job's editable fields has anything in it */
export const isBlankJob = (j: Record<string, string>, t: TemplateDef) =>
  t.fieldDefs.filter((f) => !f.locked).every((f) => !(j[f.key] ?? '').trim())

/** a job with a title is ready to go on the roundup and get a kit */
export const isReadyJob = (j: Record<string, string>) => !!j.job_title?.trim()

/** Fill a job from a Hot Job, the same way in one-job and many-jobs mode. The pay starts clean: a hot job without a
 *  pay range (details missing on the post) must not keep the last job's pay or have the Work out pay strip refill it
 *  from old numbers, and the same for shift / duration: only what the post really has (BJ, 2026-11-18). `hot` marks
 *  the job as a hot job, so the strip asks for anything the post is missing instead of guessing. */
export function withHotJob(cur: Record<string, string>, picked: Record<string, string>): Record<string, string> {
  const clean = Object.fromEntries([...Object.values(PAY_KEYS), 'weekly_pay', 'wage_low', 'wage_high', 'shift', 'duration'].map((k) => [k, '']))
  return { ...cur, ...clean, ...picked, [PAY_KEYS.hot]: '1', location__photo: '' }
}

/** how many hot jobs can still be added: the blank jobs plus the room left under the limit */
export const openSlots = (jobs: Record<string, string>[], t: TemplateDef) =>
  jobs.filter((j) => isBlankJob(j, t)).length + Math.max(0, MAX_JOBS - jobs.length)

/** Several hot jobs picked at once: each fills the next blank job, then new jobs are added, never past five.
 *  Returns the new list and the index of the last job filled (to open it). */
export function placeHotJobs(jobs: Record<string, string>[], picks: Record<string, string>[], t: TemplateDef) {
  const out = jobs.map((j) => ({ ...j }))
  let last = -1
  for (const p of picks) {
    const i = out.findIndex((j) => isBlankJob(j, t))
    if (i >= 0) {
      out[i] = withHotJob(out[i], p)
      last = i
    } else if (out.length < MAX_JOBS) {
      out.push(withHotJob(blankJob(t), p))
      last = out.length - 1
    } else break
  }
  return { jobs: out, last }
}

/** newest first, as on the Hot Jobs tab (by when the job was posted); jobs without a date keep their order, last */
export function newestFirst(jobs: HotJob[]): HotJob[] {
  return jobs
    .map((j, i) => ({ j, i }))
    .sort((a, b) => (b.j.posted ?? '').localeCompare(a.j.posted ?? '') || a.i - b.i)
    .map((x) => x.j)
}
