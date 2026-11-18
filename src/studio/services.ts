// Glue between the pure engine and the app: how bound images resolve.

import type { ImageEl } from './engine/model'
import type { BoundImage } from './engine/render'
import { photoUrl, resolveLocation, cityIndex } from './photos/cities'

/**
 * A bound image (bind: 'location') shows the photo for that field's value.
 * Users can pin a different photo: fields[`${bind}__photo`] = city id.
 */
export function resolveImage(el: ImageEl, fields: Record<string, string>): BoundImage | null {
  if (!el.bind) return null
  const pinned = fields[`${el.bind}__photo`]
  if (pinned) {
    const p = cityIndex().find((c) => c.id === pinned)
    if (p) return { src: photoUrl(p.id), credit: { ...p.credit } }
  }
  const value = fields[el.bind]
  if (!value) return null
  const m = resolveLocation(value)
  return m ? { src: photoUrl(m.photo.id), credit: { ...m.photo.credit } } : null
}

import type { Design } from './engine/model'
import { ensureFont, onFontsReady } from './engine/fonts'
import { clearTextCache } from './engine/render'
import { onImageLoaded } from './engine/images'
import { loadCityData, onCityDataReady } from './photos/cities'

/** load every font + the city index a design needs (call before exporting) */
export async function prepareDesign(d: Design): Promise<void> {
  const want = new Map<string, [string, number, boolean]>()
  for (const p of d.pages)
    for (const e of p.elements)
      if (e.type === 'text') want.set(`${e.style.family}|${e.style.weight}|${e.style.italic}`, [e.style.family, e.style.weight, e.style.italic])
  const binds = d.pages.some((p) => p.elements.some((e) => e.type === 'image' && e.bind))
  await Promise.all([...[...want.values()].map(([f, w, i]) => ensureFont(f, w, i)), binds ? loadCityData() : Promise.resolve()])
  clearTextCache()
}

/** subscribe to anything that should trigger a re-render */
export function onAssetsChanged(cb: () => void): () => void {
  const a = onImageLoaded(cb)
  const b = onFontsReady(() => {
    clearTextCache()
    cb()
  })
  const c = onCityDataReady(cb)
  return () => {
    a()
    b()
    c()
  }
}

/** standard render options for this app */
export const renderOpts = { resolveImage }
