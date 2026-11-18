// Pure helpers for admin template management (tested).

import { clonePage, design, page, SIZES, type Design, type FieldDef } from '../engine/model'
import { markerKeys } from '../engine/fields'
import type { TemplateDef } from './types'

export const slugKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'f_$1')
    .slice(0, 30) || 'field'

export const templateEditId = (templateId: string, size: string) => `tpl_${templateId}_${size}`

/** a design an admin can edit for one size of a template (all fields = defaults) */
export function designForTemplateEdit(t: TemplateDef, size: string): Design {
  const layout = t.layouts[size]
  return design({
    id: templateEditId(t.id, size),
    name: `Template: ${t.name} — ${SIZES[size as keyof typeof SIZES]?.label ?? size}`,
    w: layout.w,
    h: layout.h,
    pages: layout.pages.map((p) => structuredClone(p)),
    fields: Object.fromEntries(t.fieldDefs.map((f) => [f.key, f.example])),
    fieldDefs: t.fieldDefs,
    source: { templateId: t.id, size, templateEdit: true },
  })
}

const titleCase = (k: string) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

/** write an edited design back into its template (layout + default values + any new fields) */
export function applyDesignToTemplate(t: TemplateDef, d: Design, size: string): TemplateDef {
  const defs: FieldDef[] = t.fieldDefs.map((f) => ({ ...f, example: d.fields[f.key] ?? f.example }))
  const have = new Set(defs.map((f) => f.key))
  for (const p of d.pages)
    for (const el of p.elements) {
      const keys = el.type === 'text' ? markerKeys(el.text) : el.type === 'image' && el.bind ? [el.bind] : []
      for (const k of keys)
        if (!have.has(k)) {
          have.add(k)
          defs.push({ key: k, label: titleCase(k), example: d.fields[k] ?? '', kind: el.type === 'image' ? 'location' : 'text', group: 'Details' })
        }
    }
  return {
    ...t,
    fieldDefs: defs,
    layouts: { ...t.layouts, [size]: { w: d.w, h: d.h, pages: d.pages.map((p) => structuredClone(p)) } },
    updatedAt: Date.now(),
  }
}

/** a brand-new template, blank or copied from another */
export function newTemplate(name: string, from?: TemplateDef): TemplateDef {
  const id = `tpl-${slugKey(name).replace(/_/g, '-')}-${Date.now().toString(36)}`
  if (from)
    return {
      ...structuredClone(from),
      id,
      name,
      builtIn: false,
      overridesBuiltIn: undefined,
      layouts: Object.fromEntries(Object.entries(from.layouts).map(([k, l]) => [k, { ...l, pages: l.pages.map(clonePage) }])),
      updatedAt: Date.now(),
    }
  return {
    id,
    name,
    category: 'job-post',
    description: '',
    fieldDefs: [
      { key: 'job_title', label: 'Job title', example: 'Job title', group: 'Job' },
      { key: 'location', label: 'Location', example: 'City, ST', kind: 'location', group: 'Job' },
    ],
    layouts: { square: blankLayout('square') },
    defaultSize: 'square',
    builtIn: false,
    updatedAt: Date.now(),
  }
}

export function blankLayout(size: string, bg = '#0C184D') {
  const s = SIZES[size as keyof typeof SIZES] ?? SIZES.square
  return { w: s.w, h: s.h, pages: [page({ bg: { color: bg } })] }
}

/** problems that would make a template unusable (shown before saving) */
export function templateProblems(t: TemplateDef): string[] {
  const out: string[] = []
  if (!t.name.trim()) out.push('Give the template a name.')
  if (!Object.keys(t.layouts).length) out.push('Add at least one size.')
  if (!t.layouts[t.defaultSize]) out.push('The default size must be one of the template’s sizes.')
  const keys = t.fieldDefs.map((f) => f.key)
  const dup = keys.find((k, i) => keys.indexOf(k) !== i)
  if (dup) out.push(`Two fields use the same key “${dup}”.`)
  if (t.fieldDefs.some((f) => !f.label.trim())) out.push('Every field needs a label.')
  return out
}
