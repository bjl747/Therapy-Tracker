// Small "it just knows" helpers for the job form. Pure + tested.

/** "3227-3547" / "$3227 to 3,547" → "$3,227 – $3,547"; single values too */
export function formatMoneyRange(input: string): string {
  const s = input.trim()
  if (!s) return s
  const nums = s.match(/\d[\d,]*(?:\.\d+)?/g)
  if (!nums || nums.length === 0 || nums.length > 2) return s
  // leave free text alone ("DOE", "Up to $4k/wk")
  const stripped = s.replace(/[\d,.$\s–—-]|to/gi, '')
  if (stripped.length > 0) return s
  const fmt = (n: string) => {
    const v = Number(n.replace(/,/g, ''))
    if (!Number.isFinite(v)) return n
    return `$${v.toLocaleString('en-US', { maximumFractionDigits: v % 1 ? 2 : 0 })}`
  }
  return nums.length === 2 ? `${fmt(nums[0])} – ${fmt(nums[1])}` : fmt(nums[0])
}

/** "$39.50" → "39.50" (the template prints the $ itself) */
export function bareNumber(input: string): string {
  const m = input.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  return m ? m[0] : input.trim()
}

/** "3x12 nights" → "3x12s, Nights"; "5 x 8 days" → "5x8s, Days" */
export function formatShift(input: string): string {
  const s = input.trim()
  const m = /^(\d)\s*[x×*]\s*(\d{1,2})s?\b[\s,/-]*(days?|nights?|evenings?|rotating|mids?|variable|pm|am)?\s*$/i.exec(s)
  if (!m) return s
  const when = m[3]
    ? { day: 'Days', night: 'Nights', evening: 'Evenings', rotating: 'Rotating', mid: 'Mids', variable: 'Variable', pm: 'PMs', am: 'AMs' }[
        m[3].toLowerCase().replace(/s$/, '')
      ] ?? m[3]
    : ''
  return `${m[1]}x${m[2]}s${when ? `, ${when}` : ''}`
}

/** "13" / "13 wks" → "13 Weeks" */
export function formatDuration(input: string): string {
  const m = /^(\d{1,2})\s*(w|wk|wks|week|weeks)?$/i.exec(input.trim())
  return m ? `${m[1]} Weeks` : input.trim()
}

/** weekly hours implied by a shift ("3x12s" → 36) — used by pay hints */
export function shiftHours(shift: string): number | null {
  const m = /(\d)\s*[x×]\s*(\d{1,2})/i.exec(shift)
  return m ? Number(m[1]) * Number(m[2]) : null
}

/** apply the right formatter for a field on blur */
export function tidyField(key: string, value: string): string {
  if (key === 'job_title') return formatTitle(value)
  if (key === 'weekly_pay') return formatMoneyRange(value)
  if (key === 'wage_low' || key === 'wage_high') return bareNumber(value)
  if (key === 'shift') return formatShift(value)
  if (key === 'duration') return formatDuration(value)
  if (key === 'job_type' || key === 'cta') return value.toUpperCase()
  return value.trim()
}

/** healthcare acronyms that stay upper-case in titles */
const ACRONYMS = new Set([
  'RN', 'LPN', 'LVN', 'CNA', 'ICU', 'NICU', 'PICU', 'CVICU', 'MICU', 'SICU', 'ER', 'ED', 'OR', 'PACU', 'PCU', 'L&D', 'LDRP', 'CVOR',
  'CT', 'MRI', 'PET', 'IR', 'PT', 'PTA', 'OT', 'COTA', 'SLP', 'RT', 'RRT', 'CRT', 'MLS', 'MLT', 'MT', 'CST', 'SPD', 'EKG', 'ECG', 'EEG',
  'CVT', 'RCIS', 'ARRT', 'NP', 'PA', 'CRNA', 'LCSW', 'MSW', 'BSN', 'MDS', 'HHA', 'PRN', 'II', 'III', 'IV', 'OB', 'GI', 'PEDS',
])
const SMALL = new Set(['and', 'or', 'of', 'the', 'in', 'for', 'to', 'a', 'an', 'at'])

/** "registered nurse - icu" → "Registered Nurse – ICU" (acronyms kept) */
export function formatTitle(input: string): string {
  const s = input.trim().replace(/\s+-\s+/g, ' – ').replace(/\s{2,}/g, ' ')
  if (!s) return s
  return s
    .split(' ')
    .map((w, i) => {
      const bare = w.replace(/[^A-Za-z&]/g, '').toUpperCase()
      if (ACRONYMS.has(bare)) return w.toUpperCase()
      if (/[a-z][A-Z]/.test(w)) return w // keep deliberate camel case
      const lw = w.toLowerCase()
      if (i > 0 && SMALL.has(lw)) return lw
      return lw.replace(/(^|[-/(])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase())
    })
    .join(' ')
}
