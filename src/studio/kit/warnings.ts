// Per-size "ready to post" warnings for the Job Kit previews.
import type { Design } from '../engine/model'
import { resolveText, missingKeys } from '../engine/fields'
import { textLayout } from '../engine/render'
import { resolveImage } from '../services'
import { cityIndex } from '../photos/cities'

export interface KitWarning {
  level: 'warn' | 'error'
  text: string
}

export function kitWarnings(d: Design): KitWarning[] {
  const out: KitWarning[] = []
  const missing = new Set<string>()
  for (const p of d.pages)
    for (const el of p.elements) {
      if (el.showIf && !d.fields[el.showIf]?.trim()) continue
      if (el.type === 'image' && el.bind && !el.hidden && cityIndex().length > 0 && d.fields[el.bind]?.trim() && !resolveImage(el, d.fields)) {
        out.push({ level: 'warn', text: 'No city photo for this location yet — pick one with “Change”' })
        continue
      }
      if (el.type !== 'text' || el.hidden) continue
      missingKeys(el.text, d.fields).forEach((k) => missing.add(k))
      const t = resolveText(el.text, d.fields)
      if (!t.trim()) continue
      const l = textLayout(el, t)
      const label = el.name ?? (t.length > 24 ? `${t.slice(0, 24)}…` : t)
      if (l.overflow) out.push({ level: 'error', text: `“${label}” doesn’t fit` })
      else if (el.fit === 'shrink' && l.size < el.style.size * 0.62)
        out.push({ level: 'warn', text: `“${label}” shrank to ${Math.round((l.size / el.style.size) * 100)}% to fit` })
    }
  const labels = new Map((d.fieldDefs ?? []).map((f) => [f.key, f.label]))
  for (const k of missing) out.push({ level: 'warn', text: `${labels.get(k) ?? k} is empty` })
  return out
}
