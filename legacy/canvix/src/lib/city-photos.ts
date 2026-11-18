// ─────────────────────────────────────────────────────────────
// city-photos — the bundled US-city photo library (Canva 2.0).
//
//   public/photos/cities/index.json   one photo per US city with
//                                     50k+ people (Wikimedia Commons,
//                                     free licences, credit per photo)
//   public/photos/cities/places.json  coordinates of every US place
//                                     (Census Gazetteer) so ANY town
//                                     resolves to its nearest photo
//
// findCityPhoto("Fishersville, VA") → the exact city when we have it,
// else the nearest library city in the same state, else the nearest
// anywhere. applyCityPhoto() drops that photo into a template's
// "City photo" layer, cover-cropped to the layer's frame.
// ─────────────────────────────────────────────────────────────

import type { PageData, ImageElement, AnyElement } from './types'

export interface CityPhoto {
  id: string
  city: string
  state: string
  st: string
  population: number
  width: number
  height: number
  lat?: number
  lon?: number
  credit: { provider: string; author: string; license: string; url: string }
}

type Places = Record<string, Record<string, [number, number]>>

export const STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
}

let cityCache: Promise<CityPhoto[]> | null = null
export function loadCityPhotos(): Promise<CityPhoto[]> {
  cityCache ??= fetch('/photos/cities/index.json')
    .then((r) => (r.ok ? r.json() : []))
    .then((d) => (Array.isArray(d) ? (d as CityPhoto[]) : []))
    .catch(() => {
      cityCache = null
      return []
    })
  return cityCache
}

let placesCache: Promise<Places> | null = null
function loadPlaces(): Promise<Places> {
  placesCache ??= fetch('/photos/cities/places.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => {
      placesCache = null
      return {}
    })
  return placesCache
}

/** same normalisation as the build script (scripts/city-photos/places.py) */
export function normPlace(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bst\./g, 'saint')
    .replace(/\bft\./g, 'fort')
    .replace(/\bmt\./g, 'mount')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** "Fishersville, VA" / "Fishersville, Virginia" / "Virginia" / "VA" */
export function parseLocation(input: string): { city: string; st: string } | null {
  const parts = input.split(',').map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return null
  const toSt = (s: string): string | null => {
    const up = s.toUpperCase().replace(/\./g, '')
    if (STATES[up]) return up
    const hit = Object.entries(STATES).find(([, name]) => name.toLowerCase() === s.toLowerCase())
    return hit ? hit[0] : null
  }
  const last = parts[parts.length - 1]
  const st = toSt(last)
  if (!st) return null
  return { city: parts.length > 1 ? parts.slice(0, -1).join(' ') : '', st }
}

function distanceKm(a: [number, number], b: [number, number]): number {
  const r = (d: number) => (d * Math.PI) / 180
  const dLat = r(b[0] - a[0])
  const dLon = r(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLon / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

export interface CityMatch {
  photo: CityPhoto
  /** 'exact' = the job's own city; 'nearby' = closest city we have */
  kind: 'exact' | 'nearby' | 'state'
}

export async function findCityPhoto(location: string): Promise<CityMatch | null> {
  const loc = parseLocation(location)
  if (!loc) return null
  const photos = await loadCityPhotos()
  if (!photos.length) return null
  const key = normPlace(loc.city)
  const inState = photos.filter((p) => p.st === loc.st)

  const exact = inState.find((p) => normPlace(p.city) === key)
  if (exact) return { photo: exact, kind: 'exact' }

  if (key) {
    const places = await loadPlaces()
    const here = places[loc.st]?.[key]
    if (here) {
      const nearest = (list: CityPhoto[]) =>
        list
          .filter((p) => p.lat !== undefined && p.lon !== undefined)
          .map((p) => ({ p, d: distanceKm(here, [p.lat!, p.lon!]) }))
          .sort((a, b) => a.d - b.d)[0]?.p
      const best = nearest(inState) ?? nearest(photos)
      if (best) return { photo: best, kind: 'nearby' }
    }
  }
  // unknown town or state-only: the state's biggest city
  const biggest = [...inState].sort((a, b) => b.population - a.population)[0]
  return biggest ? { photo: biggest, kind: 'state' } : null
}

/** cover-crop an image to a frame's aspect ratio → JPEG data URL */
async function coverCrop(src: string, frameW: number, frameH: number): Promise<{ url: string; w: number; h: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('Could not load the city photo.'))
    i.src = src
  })
  // 1.5× the frame keeps exports crisp without bloating the design
  const scale = Math.min(1.5, img.naturalWidth / frameW, img.naturalHeight / frameH)
  const w = Math.max(1, Math.round(frameW * scale))
  const h = Math.max(1, Math.round(frameH * scale))
  const frameRatio = frameW / frameH
  let sw = img.naturalWidth
  let sh = sw / frameRatio
  if (sh > img.naturalHeight) {
    sh = img.naturalHeight
    sw = sh * frameRatio
  }
  const sx = (img.naturalWidth - sw) / 2
  // skylines sit a little above centre — bias the crop upward slightly
  const sy = (img.naturalHeight - sh) * 0.45
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
  return { url: canvas.toDataURL('image/jpeg', 0.86), w, h }
}

/**
 * Put the location's photo into every image layer named `layerName`.
 * Returns the pages unchanged (and match = null) when nothing fits.
 */
export async function applyCityPhoto(
  pages: PageData[],
  location: string,
  layerName: string,
): Promise<{ pages: PageData[]; match: CityMatch | null }> {
  const match = await findCityPhoto(location)
  if (!match) return { pages, match: null }
  const full = `/photos/cities/${match.photo.id}.jpg`
  const out: PageData[] = []
  for (const page of pages) {
    const elements: AnyElement[] = []
    for (const el of page.elements ?? []) {
      if (el.type === 'image' && el.name === layerName) {
        const cropped = await coverCrop(full, el.width, el.height)
        elements.push({
          ...(el as ImageElement),
          src: cropped.url,
          naturalWidth: cropped.w,
          naturalHeight: cropped.h,
          credit: match.photo.credit,
        })
      } else {
        elements.push(el)
      }
    }
    out.push({ ...page, elements })
  }
  return { pages: out, match }
}
