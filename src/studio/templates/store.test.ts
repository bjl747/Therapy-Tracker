import { describe, expect, it } from 'vitest'
import { effectiveTemplates } from './store'
import { BUILT_IN_TEMPLATES } from './index'
import type { TemplateDef } from './types'

const builtIn = BUILT_IN_TEMPLATES.find((t) => t.id === 'travel-job-post')!

describe('saved copies of built-in templates', () => {
  it('a copy saved from an older design gives way to the new layouts but keeps its wording', () => {
    const old: TemplateDef = {
      ...builtIn, version: undefined, builtIn: false,
      layouts: { square: { w: 1080, h: 1080, pages: [] } },
      fieldDefs: builtIn.fieldDefs.map((f) => (f.key === 'website' ? { ...f, example: 'gqr.com' } : f)),
    }
    const t = effectiveTemplates([old]).find((x) => x.id === builtIn.id)!
    expect(t.layouts).toBe(builtIn.layouts)
    expect(t.fieldDefs.find((f) => f.key === 'website')?.example).toBe('gqr.com')
    expect(t.overridesBuiltIn).toBe(true)
    expect(t.version).toBe(builtIn.version)
  })
  it('a copy saved from the current design still replaces the built-in', () => {
    const saved: TemplateDef = { ...builtIn, builtIn: false, layouts: { square: { w: 1080, h: 1080, pages: [] } } }
    const t = effectiveTemplates([saved]).find((x) => x.id === builtIn.id)!
    expect(t.layouts).toBe(saved.layouts)
  })
  it('the built-in job post uses the official typeface, logos and card', () => {
    const els = builtIn.layouts.square.pages[0].elements
    expect(builtIn.layouts.square.pages[0].bg.color).toBe('#FFFFFF')
    expect(els.filter((e) => e.type === 'text').every((e) => e.type === 'text' && e.style.family === 'Liberation Sans' && e.style.kerning === false)).toBe(true)
    expect(els.filter((e) => e.type === 'image' && e.src).map((e) => (e.type === 'image' ? e.src : ''))).toEqual(
      expect.arrayContaining(['/brand/gqr-healthcare-white.png', '/brand/unitimed-white.png', '/brand/bluepipes-2026-badge-clear.png', '/brand/job-post-corner-light.png']),
    )
  })
})
