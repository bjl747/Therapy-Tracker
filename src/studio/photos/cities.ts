// ─────────────────────────────────────────────────────────────
// US city photo library — one free-licensed photo per US city with 50k+
// people (Wikimedia Commons) + Census coordinates for every US place, so
// ANY town resolves to the nearest city we have a photo of.
//
//   public/photos/cities/index.json    [{id, city, state, st, population, width, height, lat, lon, credit}]
//   public/photos/cities/places.json   {ST: {normalised place name: [lat, lon]}}
//   public/photos/cities/<id>.jpg      1280px    thumbs/<id>.jpg 400px
//
// Built by scripts/city-photos/. The renderer resolves bound images through
// resolveLocationPhoto(), which is SYNC (uses the loaded index) and kicks off
// loading on first use — the editor re-renders when onCityDataReady fires.
// ─────────────────────────────────────────────────────────────

import { STATE_NAMES, parseLocation, normPlace } from './location'

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
  /** point of interest 0..1 (scripts/city-photos/focus.py) */
  focus?: { x: number; y: number }
  credit: { provider: string; author: string; license: string; url: string }
}

export interface CityMatch {
  photo: CityPhoto
  /** exact = the job's own city; nearby = closest city we have; state = state's biggest city */
  kind: 'exact' | 'nearby' | 'state'
  /** km from the requested town (nearby only) */
  distanceKm?: number
}

type Places = Record<string, Record<string, [number, number]>>

export const PHOTO_BASE = '/photos/cities'
export const photoUrl = (id: string) => `${PHOTO_BASE}/${id}.jpg`
export const thumbUrl = (id: string) => `${PHOTO_BASE}/thumbs/${id}.jpg`

const memo = new Map<string, CityMatch | null>()
let index: CityPhoto[] | null = null
let places: Places | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

export function onCityDataReady(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

let lastFail = 0

/** load the index + places once; a failed load (network blip) is retried later
 *  instead of being remembered as "no photos" for the whole session */
export function loadCityData(): Promise<void> {
  if (index && places) return Promise.resolve()
  if (!loading && Date.now() - lastFail < 15_000) return Promise.resolve()
  const get = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${u}: ${r.status}`))))
  loading ??= Promise.all([get(`${PHOTO_BASE}/index.json`), get(`${PHOTO_BASE}/places.json`)])
    .then(([i, p]) => {
      index = Array.isArray(i) ? (i as CityPhoto[]) : []
      places = p && typeof p === 'object' ? (p as Places) : {}
      memo.clear()
      listeners.forEach((l) => l())
    })
    .catch((e) => {
      console.warn('City photos could not load — will retry', e)
      lastFail = Date.now()
      loading = null
    })
  return loading
}

/** true once the photo index is available (exports can warn when it isn't) */
export const cityDataReady = () => !!index && !!places

export function cityIndex(): CityPhoto[] {
  if (!index) void loadCityData()
  return index ?? []
}

function distanceKm(a: [number, number], b: [number, number]): number {
  const r = (d: number) => (d * Math.PI) / 180
  const dLat = r(b[0] - a[0])
  const dLon = r(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLon / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** pure matcher (exported for tests) */
export function matchLocation(location: string, photos: CityPhoto[], pl: Places): CityMatch | null {
  const loc = parseLocation(location)
  if (!loc || !photos.length) return null
  const key = normPlace(loc.city)
  const inState = photos.filter((p) => p.st === loc.st)
  const exact = key ? inState.find((p) => normPlace(p.city) === key) : undefined
  if (exact) return { photo: exact, kind: 'exact' }
  const here = key ? pl[loc.st]?.[key] : undefined
  if (here) {
    const ranked = (list: CityPhoto[]) =>
      list
        .filter((p) => p.lat !== undefined && p.lon !== undefined)
        .map((p) => ({ p, d: distanceKm(here, [p.lat!, p.lon!]) }))
        .sort((a, b) => a.d - b.d)
    const best = ranked(inState)[0] ?? ranked(photos)[0]
    if (best) return { photo: best.p, kind: 'nearby', distanceKm: Math.round(best.d) }
  }
  const biggest = [...inState].sort((a, b) => b.population - a.population)[0]
  if (biggest) return { photo: biggest, kind: 'state' }
  // no photo in this state at all: nearest city to the state's centre
  const pts = Object.values(pl[loc.st] ?? {})
  if (!pts.length) return null
  const centre: [number, number] = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length]
  const near = photos
    .filter((p) => p.lat !== undefined && p.lon !== undefined)
    .map((p) => ({ p, d: distanceKm(here ?? centre, [p.lat!, p.lon!]) }))
    .sort((a, b) => a.d - b.d)[0]
  return near ? { photo: near.p, kind: 'nearby', distanceKm: Math.round(near.d) } : null
}

/** nearest few candidates (for the "other photos near here" picker) */
export function nearbyCities(location: string, count = 8): CityPhoto[] {
  const photos = cityIndex()
  const loc = parseLocation(location)
  if (!loc || !places) return []
  const key = normPlace(loc.city)
  const own = photos.find((p) => p.st === loc.st && normPlace(p.city) === key)
  const origin: [number, number] | undefined =
    places[loc.st]?.[key] ?? (own?.lat !== undefined && own.lon !== undefined ? [own.lat, own.lon] : undefined)
  if (!origin) return photos.filter((p) => p.st === loc.st).sort((a, b) => b.population - a.population).slice(0, count)
  return photos
    .filter((p) => p.lat !== undefined)
    .map((p) => ({ p, d: distanceKm(origin, [p.lat!, p.lon!]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((x) => x.p)
}


/** SYNC lookup for the renderer; null until the data has loaded */
export function resolveLocation(location: string): CityMatch | null {
  if (!index || !places) {
    void loadCityData()
    return null
  }
  const k = location.trim().toLowerCase()
  if (!memo.has(k)) memo.set(k, matchLocation(location, index, places))
  return memo.get(k) ?? null
}

export function searchCities(q: string, limit = 120): CityPhoto[] {
  const photos = cityIndex()
  const s = q.trim().toLowerCase()
  if (!s) return photos.slice(0, limit)
  const words = s.split(/[\s,]+/).filter(Boolean)
  return photos
    .filter((p) => {
      const hay = `${p.city} ${p.state}`.toLowerCase()
      const st = p.st.toLowerCase()
      return words.every((w) => (w.length <= 2 ? st === w || hay.split(' ').some((x) => x.startsWith(w)) : hay.includes(w)))
    })
    .slice(0, limit)
}

export { STATE_NAMES }
