import { describe, expect, it } from 'vitest'
import * as L from 'pdf-lib'
import { dropDanglingAnnots, registerForm } from './acroform'

async function source(flatten = false) {
  const d = await L.PDFDocument.create()
  const page = d.addPage([612, 792])
  const form = d.getForm()
  const t = form.createTextField('fullname')
  t.addToPage(page, { x: 60, y: 500, width: 200, height: 24 })
  t.setText('Jane')
  form.createCheckBox('agree').addToPage(page, { x: 60, y: 460, width: 18, height: 18 })
  form.updateFieldAppearances()
  if (flatten) form.flatten()
  return d
}

async function packet(sources: L.PDFDocument[]) {
  const out = await L.PDFDocument.create()
  for (const s of sources) for (const p of await out.copyPages(s, s.getPageIndices())) out.addPage(p)
  return out
}

const font = (d: L.PDFDocument) => () => d.embedStandardFont(L.StandardFonts.Helvetica).ref

describe('acroform', () => {
  it('keeps copied fields live, with their values, and separates same-named fields', async () => {
    const out = await packet([await source(), await source()])
    expect(registerForm(L, out, font(out))).toBe(4)
    const form = (await L.PDFDocument.load(await out.save())).getForm()
    expect(form.getFields().map((f) => f.getName()).sort()).toEqual(['agree', 'agree_2', 'fullname', 'fullname_2'])
    expect(form.getTextField('fullname').getText()).toBe('Jane')
    form.getTextField('fullname_2').setText('later')
    expect(form.getTextField('fullname').getText()).toBe('Jane')
  })
  it('adds no form when there are no fields', async () => {
    const d = await L.PDFDocument.create()
    d.addPage()
    expect(registerForm(L, d, font(d))).toBe(0)
    expect(d.catalog.get(L.PDFName.of('AcroForm'))).toBeUndefined()
  })
  it('drops annotation entries left behind by flattening', async () => {
    const out = await packet([await source(true)])
    dropDanglingAnnots(L, out)
    const annots = out.getPage(0).node.Annots()
    for (let i = 0; i < (annots?.size() ?? 0); i++) expect(out.context.lookup(annots!.get(i))).toBeDefined()
    expect(dropDanglingAnnots(L, out)).toBe(0)
  })
})
