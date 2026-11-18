import { clonePage, design, type Design } from '../engine/model'
import type { TemplateDef } from './types'

/** example values for every field (what a fresh template shows) */
export function exampleFields(t: TemplateDef): Record<string, string> {
  return Object.fromEntries(t.fieldDefs.map((f) => [f.key, f.example]))
}

/** a new Design from one size of a template family */
export function instantiate(
  t: TemplateDef,
  size: string,
  fields?: Record<string, string>,
  extra?: Partial<Design>,
): Design {
  const layout = t.layouts[size] ?? t.layouts[t.defaultSize]
  const lockedVals = Object.fromEntries(t.fieldDefs.filter((f) => f.locked).map((f) => [f.key, f.example]))
  return design({
    name: t.name,
    w: layout.w,
    h: layout.h,
    pages: layout.pages.map(clonePage),
    // locked fields always come from the template, whatever was typed/pasted
    fields: { ...exampleFields(t), ...fields, ...lockedVals },
    fieldDefs: t.fieldDefs,
    source: { templateId: t.id, size },
    ...extra,
  })
}
