// Design thumbnails for the My designs grid (small PNG of the first page).
//
// Until 2026-11-19 a thumbnail was only made when the editor autosaved a change, and drawn straight away, so designs
// saved from the Job Kit, a template or Start blank had none (BJ: "it's showing only one"). `designThumb` waits for the
// fonts, the city photo and every picture on the page first (capped, so a slow picture can't hold a save up), the same
// way an export does.

import type { Design } from '../engine/model'
import { drawPage, preloadPageImages } from '../engine/render'
import { prepareDesign, resolveImage } from '../services'

/** longest side of a thumbnail, px */
export const THUMB_MAX = 320
/** longest wait for fonts / pictures before drawing anyway */
const WAIT_MS = 6000

/** draw the first page now, with whatever has loaded. Undefined when the canvas is tainted (a picture without CORS). */
export function drawThumb(d: Design, max = THUMB_MAX): string | undefined {
  const page = d.pages[0]
  if (!page) return undefined
  try {
    const k = max / Math.max(d.w, d.h)
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(d.w * k))
    c.height = Math.max(1, Math.round(d.h * k))
    drawPage(c.getContext('2d')!, d, page, { scale: k, resolveImage })
    return c.toDataURL('image/png')
  } catch {
    return undefined
  }
}

/** wait for the page's fonts and pictures (at most WAIT_MS), then draw it */
export async function designThumb(d: Design, max = THUMB_MAX): Promise<string | undefined> {
  const page = d.pages[0]
  if (!page) return undefined
  const ready = (async () => {
    await prepareDesign(d)
    await preloadPageImages(d, page, { resolveImage })
  })().catch(() => undefined)
  await Promise.race([ready, new Promise((r) => setTimeout(r, WAIT_MS))])
  return drawThumb(d, max)
}
