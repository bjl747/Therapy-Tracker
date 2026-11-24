// Glue between the pure engine and the app: how bound images resolve.

import type { ImageEl } from './engine/model'
import { fieldValue } from './engine/fields'
import type { BoundImage } from './engine/render'
import { photoUrl, resolveLocation, cityIndex } from './photos/cities'

/** a pinned photo that is one of the person's uploads (its link) rather than a city id (Job Kit, BJ 2026-11-19).
 *  Only web links and picture data: anything else is ignored. */
export const isPhotoLink = (v: string | undefined): v is string => !!v && /^(https:\/\/|data:image\/(png|jpeg|webp|gif);)/.test(v)

/**
 * A bound image (bind: 'location') shows the photo for that field's value.
 * Users can pin a different photo: fields[`${bind}__photo`] = city id, or the link of one of their uploads.
 */
export function resolveImage(el: ImageEl, fields: Record<string, string>): BoundImage | null {
  if (!el.bind) return null
  const pinned = fieldValue(fields, `${el.bind}__photo`)
  if (isPhotoLink(pinned)) return { src: pinned, focus: { x: 0.5, y: 0.5 } }
  if (pinned) {
    const p = cityIndex().find((c) => c.id === pinned)
    if (p) return { src: photoUrl(p.id), focus: p.focus, credit: { ...p.credit } }
  }
  const value = fieldValue(fields, el.bind)
  if (!value) return null
  const m = resolveLocation(value)
  return m ? { src: photoUrl(m.photo.id), focus: m.photo.focus, credit: { ...m.photo.credit } } : null
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
