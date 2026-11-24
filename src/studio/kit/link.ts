// The Job Kit ↔ single post link (BJ, 2026-11-19: "When they click into one post like the square post, they still need
// to be able to edit in the form in that screen. That form should also carry back and forth").
//
// When a post is opened from the Job Kit, this tab remembers which job it came from (the One job form, or Many jobs
// job n) and which designs belong to it. While that post is open, every change to its form is written straight back to
// that job, and Back returns to it. Opening a post of the same job again reuses the designs already made (Edit access)
// instead of saving a new set every time. Kept in this tab's session storage only.

import { useEffect } from 'react'
import { SIZES, type Design } from '../engine/model'
import { useEditor } from '../editor/store'
import { stashPreview } from '../data'
import { KIT_KEYS } from './storage'

export type KitSource = { mode: 'one' } | { mode: 'many'; index: number }

export interface KitLink {
  source: KitSource
  templateId: string
  /** Edit access: the saved designs of this job, one per size, all with this kitId */
  kitId?: string
  ids?: Record<string, string>
  /** View access: the post opened to look at (never saved) */
  previewId?: string
  /** job title + place when the designs were made or last changed: a different job never reuses them */
  job?: string
}

/** a Job Kit post's name: "<title> — <place> (<size>)"; the post screen's top bar keeps following the form (BJ, 2026-11-19) */
export const kitPostName = (f: Record<string, string>, size: string) =>
  `${f.job_title || 'Job post'} — ${f.location || ''} (${SIZES[size as keyof typeof SIZES]?.label ?? size})`

export const jobKey = (f: Record<string, string>) => `${f.job_title ?? ''}|${f.location ?? ''}`.trim().toLowerCase()

const LINK_KEY = KIT_KEYS.link

export function getKitLink(): KitLink | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(LINK_KEY) ?? 'null') as KitLink | null
    return v && v.source && v.templateId ? v : null
  } catch {
    return null
  }
}
export function setKitLink(l: KitLink | null): void {
  try {
    if (l) sessionStorage.setItem(LINK_KEY, JSON.stringify(l))
    else sessionStorage.removeItem(LINK_KEY)
  } catch {
    /* private mode: no link, the post just doesn't carry back */
  }
}
export const sameSource = (a: KitSource, b: KitSource) => a.mode === b.mode && (a.mode === 'one' || (b.mode === 'many' && a.index === b.index))

/** the link when this design was opened from the Job Kit */
export function linkFor(d: Pick<Design, 'id' | 'kitId'> | null | undefined): KitLink | null {
  const l = getKitLink()
  if (!l || !d) return null
  return (l.kitId && d.kitId === l.kitId) || l.previewId === d.id ? l : null
}

/** where Back goes for a design opened from the Job Kit (the same job, in One job or Many jobs) */
export function kitBackPath(l: KitLink): string {
  return l.source.mode === 'many' ? `/studio/kit?mode=many&job=${l.source.index}` : '/studio/kit'
}

/** write a post's form back into the Job Kit job it came from */
function writeBack(l: KitLink, fields: Record<string, string>) {
  try {
    if (l.source.mode === 'one') {
      const cur = JSON.parse(localStorage.getItem(KIT_KEYS.draft) ?? '{}') as Record<string, string>
      localStorage.setItem(KIT_KEYS.draft, JSON.stringify({ ...cur, ...fields }))
    } else {
      const list = JSON.parse(sessionStorage.getItem(KIT_KEYS.many) ?? '[]') as Record<string, string>[]
      const i = l.source.index
      if (!Array.isArray(list) || !list[i]) return
      list[i] = { ...list[i], ...fields }
      sessionStorage.setItem(KIT_KEYS.many, JSON.stringify(list))
    }
  } catch {
    /* private mode */
  }
}

/** while a post opened from the Job Kit is on screen, carry its form back to the Job Kit as it changes */
export function useKitWriteBack(designId: string): void {
  useEffect(
    () =>
      useEditor.subscribe((s, prev) => {
        const d = s.design
        if (!d || d.id !== designId || d.fields === prev.design?.fields) return
        const l = linkFor(d)
        if (!l) return
        // the name follows the job title and place, unless the person renamed the post themselves (no history step:
        // Undo of the field change brings the old name back with it)
        let cur = d
        const size = d.source?.size
        if (size && prev.design?.id === d.id && d.name === kitPostName(prev.design.fields, size)) {
          const name = kitPostName(d.fields, size)
          if (name !== d.name) useEditor.setState({ design: (cur = { ...d, name }) })
        }
        writeBack(l, d.fields)
        if (l.kitId) setKitLink({ ...l, job: jobKey(d.fields) })
        // a View user's post lives only in this tab: keep its new form for a page refresh too
        if (l.previewId === d.id) stashPreview(cur)
      }),
    [designId],
  )
}
