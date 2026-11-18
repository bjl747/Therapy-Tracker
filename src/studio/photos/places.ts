// Search-as-you-type over every US place (Census Gazetteer, ~32k names).

import { STATE_NAMES, normPlace } from './location'

type Places = Record<string, Record<string, [number, number]>>
let flat: { name: string; st: string; key: string }[] | null = null
let loading: Promise<void> | null = null

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

export function loadPlaces(): Promise<void> {
  loading ??= fetch('/photos/cities/places.json')
    .then((r) => (r.ok ? r.json() : {}))
    .then((p: Places) => {
      flat = []
      for (const [st, names] of Object.entries(p))
        for (const key of Object.keys(names)) flat.push({ name: titleCase(key), st, key })
    })
    .catch(() => {
      loading = null
    })
  return loading ?? Promise.resolve()
}

/** "fishers" → ["Fishers, IN", "Fishersville, VA", …]; "boise id" narrows by state */
export function suggestPlaces(q: string, limit = 8): string[] {
  if (!flat) return []
  const m = /^(.*?)(?:,?\s+([A-Za-z]{2}))?$/.exec(q.trim())
  let text = normPlace(m?.[1] ?? q)
  let st = m?.[2]?.toUpperCase()
  if (st && !STATE_NAMES[st]) {
    text = normPlace(q)
    st = undefined
  }
  if (!text) return []
  const starts: string[] = []
  const contains: string[] = []
  for (const p of flat) {
    if (st && p.st !== st) continue
    if (p.key.startsWith(text)) starts.push(`${p.name}, ${p.st}`)
    else if (contains.length < limit && p.key.includes(` ${text}`)) contains.push(`${p.name}, ${p.st}`)
    if (starts.length >= limit * 4) break
  }
  return [...starts.sort((a, b) => a.length - b.length), ...contains].slice(0, limit)
}
