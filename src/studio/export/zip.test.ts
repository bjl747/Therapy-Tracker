import { describe, expect, it } from 'vitest'
import { crc32, dosDateTime, makeZip } from './zip'

describe('crc32', () => {
  it('matches the known vector', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686)
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array(0))).toBe(0)
  })
})

describe('dosDateTime', () => {
  it('packs fields', () => {
    const { time, date } = dosDateTime(new Date(2024, 4, 17, 13, 45, 30))
    expect(time).toBe((13 << 11) | (45 << 5) | 15)
    expect(date).toBe(((2024 - 1980) << 9) | (5 << 5) | 17)
  })
})

describe('makeZip', () => {
  it('writes local headers, central directory and end record', async () => {
    const when = new Date(2024, 0, 2, 3, 4, 6)
    const hello = new TextEncoder().encode('hello')
    const blob = await makeZip([
      { name: 'a.txt', data: hello, date: when },
      { name: 'Ünï/名前.bin', data: new Blob([new Uint8Array([1, 2, 3])]), date: when },
      { name: 'a.txt', data: hello, date: when },
    ])
    const z = new Uint8Array(await blob.arrayBuffer())
    const dv = new DataView(z.buffer)
    expect(dv.getUint32(0, true)).toBe(0x04034b50)
    expect(dv.getUint16(6, true) & 0x0800).toBe(0x0800)
    expect(dv.getUint16(8, true)).toBe(0)
    expect(dv.getUint32(14, true)).toBe(0x3610a686)
    expect(dv.getUint32(18, true)).toBe(5)
    expect(dv.getUint32(22, true)).toBe(5)
    const nl = dv.getUint16(26, true)
    expect(new TextDecoder().decode(z.subarray(30, 30 + nl))).toBe('a.txt')
    expect(new TextDecoder().decode(z.subarray(30 + nl, 35 + nl))).toBe('hello')

    // end of central directory
    const eocd = z.length - 22
    expect(dv.getUint32(eocd, true)).toBe(0x06054b50)
    expect(dv.getUint16(eocd + 8, true)).toBe(3)
    expect(dv.getUint16(eocd + 10, true)).toBe(3)
    const cdSize = dv.getUint32(eocd + 12, true)
    const cdOff = dv.getUint32(eocd + 16, true)
    expect(cdOff + cdSize).toBe(eocd)

    // walk the central directory
    let p = cdOff
    const names: string[] = []
    const offs: number[] = []
    for (let i = 0; i < 3; i++) {
      expect(dv.getUint32(p, true)).toBe(0x02014b50)
      expect(dv.getUint16(p + 8, true) & 0x0800).toBe(0x0800)
      const n = dv.getUint16(p + 28, true)
      names.push(new TextDecoder().decode(z.subarray(p + 46, p + 46 + n)))
      offs.push(dv.getUint32(p + 42, true))
      p += 46 + n
    }
    expect(names).toEqual(['a.txt', 'Ünï/名前.bin', 'a (2).txt'])
    expect(offs[0]).toBe(0)
    for (const o of offs) expect(dv.getUint32(o, true)).toBe(0x04034b50)
    expect(dv.getUint16(10, true)).toBe((3 << 11) | (4 << 5) | 3)
    expect(dv.getUint16(12, true)).toBe((44 << 9) | (1 << 5) | 2)
  })

  it('handles an empty archive', async () => {
    const z = new Uint8Array(await (await makeZip([])).arrayBuffer())
    expect(z.length).toBe(22)
  })
})
