// Paste many jobs at once: rows copied from Excel / Google Sheets (tab
// separated) or CSV, with a header row. Headers are matched to field keys
// fuzzily ("Job Title", "Title", "Position" → job_title).

import type { FieldDef } from '../engine/model'

const ALIASES: Record<string, string[]> = {
  job_title: ['title', 'job', 'position', 'role', 'specialty', 'profession', 'discipline'],
  location: ['city', 'location', 'city state', 'city, state', 'loc', 'facility location'],
  job_type: ['type', 'job type', 'category'],
  weekly_pay: ['weekly', 'weekly pay', 'weekly gross', 'gross weekly', 'pay', 'weekly gross pay', 'est weekly'],
  wage_low: ['wage low', 'hourly low', 'low', 'min wage', 'rate low'],
  wage_high: ['wage high', 'hourly high', 'high', 'max wage', 'rate high'],
  shift: ['shift', 'schedule', 'hours'],
  duration: ['duration', 'length', 'weeks', 'contract length'],
  start_date: ['start', 'start date', 'starts'],
  benefits: ['benefits'],
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function matchHeader(header: string, fields: FieldDef[]): string | null {
  const h = norm(header)
  if (!h) return null
  for (const f of fields) if (norm(f.key) === h || norm(f.label) === h) return f.key
  for (const f of fields) if ((ALIASES[f.key] ?? []).some((a) => norm(a) === h)) return f.key
  for (const f of fields) if ((ALIASES[f.key] ?? []).some((a) => h.includes(norm(a)) && norm(a).length > 3)) return f.key
  return null
}

/** split pasted text into rows of cells (tabs win over commas; quotes honoured) */
export function parseTable(text: string): string[][] {
  const t = text.replace(/\r\n?/g, '\n').trim()
  if (!t) return []
  const sep = t.split('\n')[0].includes('\t') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) {
      if (ch === '"' && t[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"' && cell === '') q = true
    else if (ch === sep) {
      row.push(cell.trim())
      cell = ''
    } else if (ch === '\n') {
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  row.push(cell.trim())
  rows.push(row)
  return rows.filter((r) => r.some((c) => c))
}

export interface BatchResult {
  jobs: Record<string, string>[]
  /** header → field key (null = ignored) */
  mapping: (string | null)[]
  headers: string[]
}

export function parseJobs(text: string, fields: FieldDef[]): BatchResult {
  const rows = parseTable(text)
  if (rows.length < 2) return { jobs: [], mapping: [], headers: rows[0] ?? [] }
  const headers = rows[0]
  const mapping = headers.map((h) => matchHeader(h, fields))
  const jobs = rows.slice(1).map((r) => {
    const job: Record<string, string> = {}
    mapping.forEach((key, i) => {
      if (key && r[i]) job[key] = r[i]
    })
    return job
  })
  return { jobs: jobs.filter((j) => Object.keys(j).length > 0), mapping, headers }
}
