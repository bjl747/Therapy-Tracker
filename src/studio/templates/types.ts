// A template is a FAMILY: one set of fields, one layout per size. Making a
// "kit" instantiates several sizes from the same job details.

import type { FieldDef, Page } from '../engine/model'

export interface TemplateLayout {
  w: number
  h: number
  pages: Page[]
}

export interface TemplateDef {
  id: string
  name: string
  category: 'job-post' | 'social' | 'flyer' | 'general'
  description?: string
  tags?: string[]
  fieldDefs: FieldDef[]
  /** keyed by size key (square, story, landscape, …) */
  layouts: Record<string, TemplateLayout>
  defaultSize: string
  /** shipped in code (read-only) vs. saved by an admin */
  builtIn?: boolean
  /** set on a built-in that an admin has changed (UI shows "Reset to original") */
  overridesBuiltIn?: boolean
  /** 'roundup' = several jobs in one post (Many jobs → Roundup post); default 'job' */
  kitMode?: 'job' | 'roundup'
  updatedAt?: number
}
