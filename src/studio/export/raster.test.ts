import { describe, expect, it } from 'vitest'
import { safeFileName } from './raster'

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
    expect(safeFileName('Café 名前')).toBe('Café 名前')
    expect(safeFileName('a'.repeat(200)).length).toBe(80)
  })
})
