import { describe, expect, it } from 'vitest'
import { applyDesignToTemplate, designForTemplateEdit, newTemplate, slugKey, templateProblems } from './admin'
import { TRAVEL_JOB_POST } from './jobPost'
import { text } from '../engine/model'
import { effectiveTemplates } from './store'

describe('admin template helpers', () => {
  it('slugKey', () => {
    expect(slugKey('Sign-on Bonus!')).toBe('sign_on_bonus')
    expect(slugKey('2nd shift')).toBe('f_2nd_shift')
  })
  it('round-trips a size through the editor and keeps new defaults + new fields', () => {
    const d = designForTemplateEdit(TRAVEL_JOB_POST, 'square')
    expect(d.source?.templateEdit).toBe(true)
    expect(d.fields.cta).toBe('APPLY TODAY')
    d.fields.cta = 'APPLY NOW'
    d.pages[0].elements.push(text({ text: 'Bonus: {{sign_on_bonus}}' }))
    const t = applyDesignToTemplate(TRAVEL_JOB_POST, d, 'square')
    expect(t.fieldDefs.find((f) => f.key === 'cta')?.example).toBe('APPLY NOW')
    expect(t.fieldDefs.some((f) => f.key === 'sign_on_bonus')).toBe(true)
    expect(t.layouts.square.pages[0].elements.length).toBe(TRAVEL_JOB_POST.layouts.square.pages[0].elements.length + 1)
    expect(t.layouts.story).toBe(TRAVEL_JOB_POST.layouts.story)
  })
  it('new templates: blank and copies get fresh ids', () => {
    const blank = newTemplate('Per Diem Post')
    expect(blank.id).toMatch(/^tpl-per-diem-post-/)
    expect(templateProblems(blank)).toEqual([])
    const copy = newTemplate('Copy', TRAVEL_JOB_POST)
    expect(copy.id).not.toBe(TRAVEL_JOB_POST.id)
    expect(copy.layouts.square.pages[0].elements[0].id).not.toBe(TRAVEL_JOB_POST.layouts.square.pages[0].elements[0].id)
  })
  it('a saved template replaces the built-in with the same id', () => {
    const changed = { ...TRAVEL_JOB_POST, name: 'Changed' }
    const list = effectiveTemplates([changed, newTemplate('Mine')])
    expect(list[0].name).toBe('Changed')
    expect(list[0].overridesBuiltIn).toBe(true)
    expect(list.some((t) => t.name === 'Mine')).toBe(true)
  })
  it('flags broken templates', () => {
    expect(templateProblems({ ...newTemplate('x'), name: ' ' })).toContain('Give the template a name.')
    expect(templateProblems({ ...newTemplate('x'), defaultSize: 'story' })).toContain('The default size must be one of the template’s sizes.')
  })
})
