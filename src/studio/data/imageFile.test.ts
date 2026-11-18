import { describe, expect, it } from 'vitest'
import { isSvgFile, rasterSize, svgSize } from './imageFile'

describe('uploaded image decoding helpers', () => {
  it('detects SVG by type or extension', () => {
    expect(isSvgFile({ type: 'image/svg+xml' })).toBe(true)
    expect(isSvgFile({ type: '', name: 'Logo.SVG' })).toBe(true)
    expect(isSvgFile({ type: 'image/png', name: 'a.png' })).toBe(false)
  })
  it('reads an SVG size from width/height or viewBox', () => {
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80">')).toEqual({ w: 200, h: 80 })
    expect(svgSize("<?xml version='1.0'?><svg viewBox='0 0 400 100'></svg>")).toEqual({ w: 400, h: 100 })
    expect(svgSize('<svg width="100%" height="100%" viewBox="0,0,50,25">')).toEqual({ w: 50, h: 25 })
    expect(svgSize('<svg width="300px" viewBox="0 0 400 100">')).toEqual({ w: 300, h: 75 })
    expect(svgSize('<svg>')).toBeNull()
    expect(svgSize('not svg')).toBeNull()
  })
  it('rasterises SVG to the max long side, only shrinks bitmaps', () => {
    expect(rasterSize(200, 80, 2000, true, 1600)).toEqual({ w: 1600, h: 640 })
    expect(rasterSize(4000, 2000, 2000, true, 1600)).toEqual({ w: 1600, h: 800 })
    expect(rasterSize(200, 80, 2000, false)).toEqual({ w: 200, h: 80 })
    expect(rasterSize(4000, 1000, 2000, false)).toEqual({ w: 2000, h: 500 })
  })
})
