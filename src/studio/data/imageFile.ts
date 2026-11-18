// Decoding uploaded image files. createImageBitmap() rejects SVG in Chrome
// (and some formats elsewhere), so we fall back to an <img> on an object URL.
// SVGs are rasterised to PNG for demo storage at a sensible size.

/** longest side an uploaded SVG is rasterised to (vector → crisp at any size up to this) */
export const SVG_RASTER_MAX = 1600

export interface DecodedImage {
  source: CanvasImageSource
  w: number
  h: number
  svg: boolean
  /** release the bitmap / object URL */
  close: () => void
}

export function isSvgFile(file: Pick<File, 'type'> & { name?: string }): boolean {
  return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name ?? '')
}

/** pure: an SVG's intrinsic size from width/height (px) or its viewBox; null if it has neither */
export function svgSize(svgText: string): { w: number; h: number } | null {
  const tag = /<svg\b[^>]*>/i.exec(svgText)?.[0]
  if (!tag) return null
  const attr = (n: string) => new RegExp(`\\s${n}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1]
  const px = (v: string | undefined) => {
    const m = v && /^\s*([\d.]+)\s*(px)?\s*$/i.exec(v)
    const n = m ? parseFloat(m[1]) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const vb = attr('viewBox')?.trim().split(/[\s,]+/).map(Number)
  const vbOk = vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0
  const w = px(attr('width'))
  const h = px(attr('height'))
  if (w && h) return { w, h }
  if (vbOk) {
    const r = vb![2] / vb![3]
    if (w) return { w, h: w / r }
    if (h) return { w: h * r, h }
    return { w: vb![2], h: vb![3] }
  }
  return null
}

/** pure: the canvas size to rasterise to. Bitmaps only shrink; SVGs scale to `svgMax` on the long side. */
export function rasterSize(w: number, h: number, max: number, svg: boolean, svgMax = SVG_RASTER_MAX): { w: number; h: number } {
  const long = Math.max(w, h, 1)
  const s = svg ? Math.min(svgMax, max) / long : Math.min(1, max / long)
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) }
}

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('This image could not be read'))
    img.src = url
  })
}

/** decode an uploaded image (PNG/JPG/WebP/SVG…). Always call close() when done. */
export async function decodeImageFile(file: File): Promise<DecodedImage> {
  const svg = isSvgFile(file)
  if (!svg && typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file)
      return { source: bmp, w: bmp.width, h: bmp.height, svg, close: () => bmp.close() }
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImg(url)
    let w = img.naturalWidth
    let h = img.naturalHeight
    if (svg) {
      // SVGs with only a viewBox report 0 (Firefox) or 300×150 (Chrome) — use the file's own numbers
      const own = svgSize(await file.text())
      if (own) ({ w, h } = own)
    }
    if (!w || !h) throw new Error('This image has no size')
    return { source: img, w, h, svg, close: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}
