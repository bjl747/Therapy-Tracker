// Post captions without an AI bill: specialty-aware templates + hashtags.
// Deterministic — the same job gives the same caption; "variant" cycles.

import { parseLocation, STATE_NAMES } from '../photos/location'

export interface Job {
  job_title?: string
  location?: string
  job_type?: string
  weekly_pay?: string
  wage_low?: string
  wage_high?: string
  shift?: string
  duration?: string
  start_date?: string
  benefits?: string
  cta?: string
  website?: string
  [k: string]: string | undefined
}

/** specialty → hashtags (first match wins; checked against the job title) */
const SPECIALTIES: [RegExp, string[]][] = [
  [/pharm/i, ['#Pharmacist', '#PharmacyJobs']],
  [/\b(rn|registered nurse|nurse)\b/i, ['#TravelNurse', '#NursingJobs']],
  [/\b(lpn|lvn)\b/i, ['#LPN', '#NursingJobs']],
  [/\b(cna|nursing assistant)\b/i, ['#CNA', '#HealthcareJobs']],
  [/\b(pt|physical therap)/i, ['#PhysicalTherapy', '#TravelTherapy']],
  [/\b(pta)\b/i, ['#PTA', '#TravelTherapy']],
  [/\b(ot|occupational therap)/i, ['#OccupationalTherapy', '#TravelTherapy']],
  [/\b(cota)\b/i, ['#COTA', '#TravelTherapy']],
  [/\b(slp|speech)/i, ['#SLP', '#SpeechTherapy']],
  [/\b(rt|respiratory)/i, ['#RespiratoryTherapist', '#RTJobs']],
  [/\b(ct|mri|x-?ray|rad tech|radiolog|imaging|mammo|sonograph|ultrasound)/i, ['#RadTech', '#ImagingJobs']],
  [/\b(cath lab|cvt|echo)/i, ['#CathLab', '#CardiacJobs']],
  [/\b(surg tech|surgical tech|cst)\b/i, ['#SurgTech', '#ORJobs']],
  [/\b(lab|mls|mlt|medical technologist|phlebot)/i, ['#LabJobs', '#MedicalLaboratory']],
  [/\b(sterile|spd)\b/i, ['#SterileProcessing', '#HealthcareJobs']],
  [/\b(dietitian)/i, ['#Dietitian', '#HealthcareJobs']],
  [/\b(social work|lcsw|msw)/i, ['#SocialWork', '#HealthcareJobs']],
]

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export function hashtags(job: Job): string[] {
  const title = job.job_title ?? ''
  const tags = new Set<string>()
  for (const [re, t] of SPECIALTIES)
    if (re.test(title)) {
      t.forEach((x) => tags.add(x))
      break
    }
  if (/travel/i.test(job.job_type ?? '') || !tags.size) tags.add('#TravelJobs')
  if (/allied/i.test(job.job_type ?? '')) tags.add('#AlliedHealth')
  const loc = parseLocation(job.location ?? '')
  if (loc) {
    if (loc.city) tags.add(`#${loc.city.replace(/[^A-Za-z0-9]/g, '')}Jobs`)
    tags.add(`#${STATE_NAMES[loc.st].replace(/[^A-Za-z]/g, '')}Jobs`)
  }
  tags.add('#NowHiring')
  tags.add('#HealthcareCareers')
  return [...tags].slice(0, 8)
}

const OPENERS = [
  (j: Job) => `📍 Now hiring: ${j.job_title} in ${j.location}!`,
  (j: Job) => `${j.job_title} wanted in ${j.location} 🚀`,
  (j: Job) => `New opportunity alert: ${j.job_title} — ${j.location}`,
  (j: Job) => `Ready for your next assignment? We're hiring ${article(j.job_title)} ${j.job_title} in ${j.location}.`,
]

/** "a" or "an" by sound: "an RN", "an LPN", "an ICU nurse", "a CNA", "a Unit Clerk" */
export function article(title: string | undefined): 'a' | 'an' {
  const w = (title ?? '').trim().split(/[\s–—/-]+/)[0] ?? ''
  if (!w) return 'a'
  // spelled-out letters (RN, LPN, MRI, NP, SLP, FNP, X-ray): the letter's name decides
  if (w.length > 1 && w === w.toUpperCase() && /^[A-Z]/.test(w)) return /^[AEFHILMNORSX]/.test(w) ? 'an' : 'a'
  if (/^(uni|use|usu|ur[aeiou]|eu|one)/i.test(w)) return 'a'
  if (/^(hour|honest|hono)/i.test(w)) return 'an'
  return /^[aeiou]/i.test(w) ? 'an' : 'a'
}

const CLOSERS = [
  (j: Job) => `Apply today at ${j.website || 'our website'} or message us to learn more.`,
  (j: Job) => `Interested? Apply at ${j.website || 'our website'} — our team will reach out fast.`,
  (j: Job) => `Know someone who'd be a great fit? Share this post! Apply at ${j.website || 'our website'}.`,
]

export function caption(job: Job, variant = 0): string {
  const j: Job = { ...job, job_title: job.job_title?.trim() || 'Healthcare professional', location: job.location?.trim() || 'a great location' }
  const seed = hash(`${j.job_title}|${j.location}`) + variant
  const lines = [OPENERS[seed % OPENERS.length](j), '']
  if (j.weekly_pay) lines.push(`💰 Est. weekly gross pay: ${j.weekly_pay}`)
  if (j.wage_low && j.wage_high) lines.push(`⏱️ Est. wage: $${j.wage_low} – $${j.wage_high}/hr (+ non-taxable travel benefits if eligible)`)
  if (j.shift) lines.push(`🗓️ Shift: ${j.shift}`)
  if (j.duration) lines.push(`📆 Duration: ${j.duration}`)
  if (j.start_date) lines.push(`🚦 Start: ${j.start_date}`)
  if (j.benefits) lines.push(`✅ ${j.benefits.replace(/\s*·\s*/g, ' · ').replace(/\s{2,}/g, ' ')}`)
  lines.push('', CLOSERS[(seed >>> 3) % CLOSERS.length](j), '', hashtags(j).join(' '))
  return lines.join('\n')
}
