import { beforeEach, describe, expect, it } from 'vitest'
import { design, page, shape, text, type Design } from '../engine/model'
import { useEditor } from './store'

const box = shape('rect', { id: 'a', x: 10, y: 10, w: 100, h: 100 })
const row = text({ id: 'r', x: 0, y: 300, w: 400, h: 60, text: '{{job4}}', showIf: 'job4' })
const hid = shape('rect', { id: 'h', x: 0, y: 0, w: 50, h: 50, hidden: true })
const mk = (): Design => design({ w: 1080, h: 1080, fields: { job4: '' }, pages: [page({ elements: [box, row, hid] })] })
const st = () => useEditor.getState()
const xOf = () => st().design!.pages[0].elements.find((e) => e.id === 'a')!.x

describe('editor store', () => {
  beforeEach(() => st().load(mk()))

  it('one gesture = one undo step', () => {
    st().beginGesture()
    st().updateEl('a', { x: 20 }, { transient: true })
    st().updateEl('a', { x: 30 }, { transient: true })
    st().endGesture()
    expect(st().past.length).toBe(1)
    st().undo()
    expect(xOf()).toBe(10)
  })

  it('ignores undo / redo while a pointer gesture is open', () => {
    st().updateEl('a', { x: 20 }) // one committed step
    st().beginGesture()
    st().updateEl('a', { x: 50 }, { transient: true })
    st().undo()
    st().redo()
    expect(xOf()).toBe(50)
    expect(st().past.length).toBe(1)
    st().endGesture()
    expect(st().past.length).toBe(2)
    st().undo()
    expect(xOf()).toBe(20)
    st().undo()
    expect(xOf()).toBe(10)
    expect(st().past.length).toBe(0)
    expect(st().future.length).toBe(2)
  })

  it('undo during a field visit ends the visit and undoes it as one step', () => {
    st().beginGesture('edit')
    st().setFields({ job4: 'R' })
    st().setFields({ job4: 'RN' })
    expect(st().gestureKind).toBe('edit')
    st().undo()
    expect(st().gestureBase).toBeNull()
    expect(st().design!.fields.job4).toBe('')
    expect(st().future.length).toBe(1)
    st().redo()
    expect(st().design!.fields.job4).toBe('RN')
    // the blur that follows is harmless
    st().endGesture()
    expect(st().past.length).toBe(1)
  })

  it('a pointer gesture inside a field visit upgrades the kind', () => {
    st().beginGesture('edit')
    st().beginGesture('pointer')
    expect(st().gestureKind).toBe('pointer')
    st().endGesture()
    expect(st().gestureKind).toBeNull()
  })

  it('select all skips hidden layers and switched-off showIf rows', () => {
    st().selectAll()
    expect(st().selection).toEqual(['a'])
    st().setFields({ job4: 'ICU RN' })
    st().selectAll()
    expect(st().selection).toEqual(['a', 'r'])
  })
})
