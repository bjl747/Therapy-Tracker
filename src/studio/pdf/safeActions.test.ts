// Security review 2026-11-19 (F1): copied pages keep plain links and lose scripts, launch actions and attachments.
import { describe, expect, it } from 'vitest'
import * as L from 'pdf-lib'
import { PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { isSafeAction, stripUnsafeActions } from './safeActions'

const N = (s: string) => PDFName.of(s)

/** A source page carrying every kind of action, copied into a new document the way export.ts does. */
async function hostilePage() {
  const src = await PDFDocument.create()
  const page = src.addPage([612, 792])
  const ctx = src.context
  const link = (action: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10], A: action, ...extra } as never))
  const js = { S: 'JavaScript', JS: PDFString.of('app.alert(1)') }
  const field = ctx.register(ctx.obj({ FT: 'Tx', T: PDFString.of('Name'), AA: { K: js } }))
  const annots = [
    link({ S: 'URI', URI: PDFString.of('https://gqr.com/jobs') }), // kept
    link({ S: 'URI', URI: PDFString.of('mailto:jane@example.com') }), // kept
    link({ S: 'URI', URI: PDFString.of('javascript:alert(1)') }), // action removed
    link({ S: 'URI', URI: PDFString.of('file:///C:/Windows/System32/cmd.exe') }), // action removed
    link(js), // action removed
    link({ S: 'Launch', F: PDFString.of('cmd.exe') }), // action removed
    link({ S: 'GoTo', D: [page.ref, 'Fit'] }), // kept
    link({ S: 'URI', URI: PDFString.of('https://ok.example'), Next: js }), // kept, chain removed
    link({ S: 'URI', URI: PDFString.of('https://ok.example') }, { AA: { E: js } }), // kept, /AA removed
    ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'FileAttachment', Rect: [0, 0, 10, 10] })), // dropped
    ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Widget', Rect: [0, 0, 10, 10], Parent: field, AA: { Fo: js } })), // kept, both /AA removed
  ]
  page.node.set(N('Annots'), ctx.obj(annots))
  page.node.set(N('AA'), ctx.obj({ O: js }))
  const out = await PDFDocument.create()
  const [copied] = await out.copyPages(src, [0])
  out.addPage(copied)
  return { out, copied }
}

const actionsOf = (page: L.PDFPage) => {
  const arr = page.node.Annots()!
  return Array.from({ length: arr.size() }, (_, i) => {
    const a = arr.lookup(i, PDFDict)
    const act = a.lookupMaybe(N('A'), PDFDict)
    const s = act?.lookupMaybe(N('S'), PDFName)?.decodeText() ?? null
    const uri = act?.lookupMaybe(N('URI'), PDFString)?.decodeText() ?? null
    return { sub: a.lookup(N('Subtype'), PDFName).decodeText(), s, uri, aa: a.has(N('AA')), next: !!act?.has(N('Next')) }
  })
}

describe('stripUnsafeActions', () => {
  it('keeps web, email and in-document links and removes everything else', async () => {
    const { copied } = await hostilePage()
    const removed = stripUnsafeActions(L, copied)
    // page /AA + javascript: + file: + JavaScript + Launch + /Next + link /AA + attachment + widget /AA + field /AA
    expect(removed).toBe(10)
    expect(copied.node.has(N('AA'))).toBe(false)
    const acts = actionsOf(copied)
    expect(acts).toHaveLength(10) // the attachment is gone
    expect(acts.some((a) => a.sub === 'FileAttachment')).toBe(false)
    expect(acts.filter((a) => a.s).map((a) => a.uri ?? a.s)).toEqual([
      'https://gqr.com/jobs', 'mailto:jane@example.com', 'GoTo', 'https://ok.example', 'https://ok.example',
    ])
    expect(acts.every((a) => !a.aa && !a.next)).toBe(true)
    const widget = copied.node.Annots()!.lookup(9, PDFDict)
    expect(widget.lookup(N('Parent'), PDFDict).has(N('AA'))).toBe(false)
  })

  it('is a no-op the second time (duplicated pages share annotations)', async () => {
    const { copied } = await hostilePage()
    stripUnsafeActions(L, copied)
    expect(stripUnsafeActions(L, copied)).toBe(0)
  })

  it('survives a save and reload', async () => {
    const { out, copied } = await hostilePage()
    stripUnsafeActions(L, copied)
    const back = await PDFDocument.load(await out.save())
    const acts = actionsOf(back.getPage(0))
    expect(acts.filter((a) => a.s === 'JavaScript' || a.s === 'Launch')).toHaveLength(0)
    expect(acts.filter((a) => a.uri?.startsWith('https:'))).toHaveLength(3)
  })

  it('leaves a page with no annotations alone', async () => {
    const doc = await PDFDocument.create()
    expect(stripUnsafeActions(L, doc.addPage())).toBe(0)
  })

  it('judges actions by scheme, ignoring case and spaces', async () => {
    const doc = await PDFDocument.create()
    const act = (o: Record<string, unknown>) => doc.context.obj(o as never) as unknown as PDFDict
    expect(isSafeAction(L, act({ S: 'URI', URI: PDFString.of('  HTTPS://x.com') }))).toBe(true)
    expect(isSafeAction(L, act({ S: 'URI', URI: PDFString.of('JavaScript:x') }))).toBe(false)
    expect(isSafeAction(L, act({ S: 'URI' }))).toBe(false)
    expect(isSafeAction(L, act({ S: 'Named', N: 'NextPage' }))).toBe(true)
    expect(isSafeAction(L, act({ S: 'SubmitForm', F: PDFString.of('https://x.com') }))).toBe(false)
    expect(isSafeAction(L, act({ S: 'GoToR', F: PDFString.of('other.pdf') }))).toBe(false)
  })
})
