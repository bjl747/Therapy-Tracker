import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyPngPromiseToClipboard, safeFileName } from './raster'

describe('safeFileName', () => {
  it('strips illegal characters and trims', () => {
    expect(safeFileName('  Summer / Sale: 50%?  ')).toBe('Summer Sale 50%')
    expect(safeFileName('a<b>c|d"e*f\\g')).toBe('a b c d e f g')
  })
  it('removes leading/trailing dots and falls back when empty or reserved', () => {
    expect(safeFileName('..hidden.')).toBe('hidden')
    expect(safeFileName('///')).toBe('design')
    expect(safeFileName('', 'x')).toBe('x')
    expect(safeFileName('CON')).toBe('design')
  })
  it('keeps unicode and limits length', () => {
    expect(safeFileName('Café 名前')).toBe('Cafe')
    expect(safeFileName('a'.repeat(200)).length).toBe(80)
  })
})

describe('safeFileName — browser-safe ASCII', () => {
  it('turns dashes and accents into plain ASCII', () => {
    expect(safeFileName('Pharmacist — Fishersville, VA (Square post)')).toBe('Pharmacist - Fishersville, VA (Square post)')
    expect(safeFileName('Café – Niño')).toBe('Cafe - Nino')
  })
})

describe('copyPngPromiseToClipboard (Safari needs the write inside the click)', () => {
  class FakeItem {
    constructor(public items: Record<string, unknown>) {}
  }
  const setup = (write: (items: FakeItem[]) => Promise<void>) => {
    const calls: FakeItem[][] = []
    vi.stubGlobal('ClipboardItem', FakeItem)
    vi.stubGlobal('navigator', { clipboard: { write: (items: FakeItem[]) => (calls.push(items), write(items)) } })
    return calls
  }
  afterEach(() => vi.unstubAllGlobals())

  it('starts the write synchronously with the still-pending PNG promise', async () => {
    let resolve!: (b: Blob) => void
    const png = new Promise<Blob>((r) => (resolve = r))
    const calls = setup(async (items) => void (await (items[0].items['image/png'] as Promise<Blob>)))
    const done = copyPngPromiseToClipboard(png)
    expect(calls.length).toBe(1) // before the PNG exists
    expect(calls[0][0].items['image/png']).toBe(png)
    resolve(new Blob(['x'], { type: 'image/png' }))
    await expect(done).resolves.toBeUndefined()
  })

  it('reports the export error when making the PNG failed', async () => {
    setup(async (items) => void (await (items[0].items['image/png'] as Promise<Blob>)))
    await expect(copyPngPromiseToClipboard(Promise.reject(new Error('canvas too large')))).rejects.toThrow('canvas too large')
  })

  it('wraps clipboard permission errors', async () => {
    setup(() => Promise.reject(new Error('NotAllowedError')))
    await expect(copyPngPromiseToClipboard(Promise.resolve(new Blob()))).rejects.toThrow(/Could not copy the image.*NotAllowedError/)
  })

  it('says so when the browser cannot copy images', async () => {
    vi.stubGlobal('navigator', {})
    await expect(copyPngPromiseToClipboard(Promise.resolve(new Blob()))).rejects.toThrow(/not supported/)
  })
})
