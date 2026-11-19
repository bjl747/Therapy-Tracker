// ─────────────────────────────────────────────────────────────
// The template library everyone sees = built-in templates (in code) with any
// admin changes applied, plus templates admins created. Admin edits are
// saved through the repo (hub: hub_studio/templates/rows/{id}, admin-only
// writes). A saved template with the same id as a built-in REPLACES it;
// "Reset to original" deletes the saved copy.
// Exception: when a built-in's design is replaced in code (its `version` goes up), a saved copy made from the older design
// no longer hides it. The new layouts are used, with the saved copy's field wording (locked values such as the website,
// examples) carried over, so nobody has to reset anything and no wording is lost.
// ─────────────────────────────────────────────────────────────

import { create } from 'zustand'
import { useEffect, useMemo } from 'react'
import { repo } from '../data'
import { BUILT_IN_TEMPLATES } from './index'
import type { TemplateDef } from './types'

interface TemplateLib {
  saved: TemplateDef[]
  loaded: boolean
  load: () => Promise<void>
  save: (t: TemplateDef) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useTemplateLib = create<TemplateLib>((set, get) => ({
  saved: [],
  loaded: false,
  load: async () => {
    try {
      const saved = await repo.listTemplates()
      set({ saved: Array.isArray(saved) ? saved : [], loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
  save: async (t) => {
    const clean: TemplateDef = { ...t, builtIn: false, updatedAt: Date.now() }
    await repo.saveTemplate(clean)
    set({ saved: [...get().saved.filter((x) => x.id !== t.id), clean] })
  },
  remove: async (id) => {
    await repo.deleteTemplate(id)
    set({ saved: get().saved.filter((x) => x.id !== id) })
  },
}))

/** built-ins (with admin changes applied) first, then admin-created templates */
export function effectiveTemplates(saved: TemplateDef[]): TemplateDef[] {
  const byId = new Map(saved.map((t) => [t.id, t]))
  const builtIns = BUILT_IN_TEMPLATES.map((b) => {
    const o = byId.get(b.id)
    if (!o) return b
    if ((o.version ?? 1) < (b.version ?? 1)) {
      // saved from an older design: the new design, with the saved wording for the fields that still exist
      const savedField = new Map((o.fieldDefs ?? []).map((f) => [f.key, f]))
      const fieldDefs = b.fieldDefs.map((f) => {
        const s = savedField.get(f.key)
        return s ? { ...f, label: s.label ?? f.label, example: s.example ?? f.example, locked: s.locked ?? f.locked } : f
      })
      return { ...b, name: o.name || b.name, description: o.description ?? b.description, fieldDefs, builtIn: false, overridesBuiltIn: true as const }
    }
    return { ...o, overridesBuiltIn: true as const }
  })
  const ids = new Set(BUILT_IN_TEMPLATES.map((b) => b.id))
  const custom = saved.filter((t) => !ids.has(t.id)).sort((a, b) => a.name.localeCompare(b.name))
  return [...builtIns, ...custom]
}

/** React hook: the live template list (loads once) */
export function useTemplates(): { templates: TemplateDef[]; loaded: boolean } {
  const { saved, loaded, load } = useTemplateLib()
  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  // stable identity between renders (effects depend on template objects)
  const templates = useMemo(() => effectiveTemplates(saved), [saved])
  return { templates, loaded }
}

export const isBuiltInId = (id: string) => BUILT_IN_TEMPLATES.some((b) => b.id === id)
export const originalOf = (id: string) => BUILT_IN_TEMPLATES.find((b) => b.id === id)

/** single-job templates (Job Kit) vs. multi-job roundups */
export const kitTemplates = (ts: TemplateDef[]) => ts.filter((t) => t.category === 'job-post' && t.kitMode !== 'roundup')
export const roundupTemplates = (ts: TemplateDef[]) => ts.filter((t) => t.kitMode === 'roundup')
