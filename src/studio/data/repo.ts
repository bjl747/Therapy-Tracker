// ─────────────────────────────────────────────────────────────
// Storage abstraction. Demo mode (and this standalone repo) uses IndexedDB
// in the browser; inside the hub, firestoreRepo.ts implements the same
// interface on Firestore (hub_studio/...) + Firebase Storage.
// ─────────────────────────────────────────────────────────────

import { decodeImageFile, rasterSize } from './imageFile'
import type { Design } from '../engine/model'
import type { TemplateDef } from '../templates/types'

export interface DesignSummary {
  id: string
  name: string
  w: number
  h: number
  updatedAt: number
  kitId?: string
  /** small PNG data URL */
  thumb?: string
  ownerUid?: string
  ownerName?: string
}

export interface BrandAsset {
  id: string
  name: string
  url: string
  kind: 'logo' | 'photo' | 'badge' | 'other'
  w: number
  h: number
  createdAt: number
  /** set on a person's own uploads (hub_studio/uploads); brand files have none */
  ownerUid?: string
  /** uploader's name, shown to managers / admins in the team list (uploads since 2026-11-19) */
  ownerName?: string
}

export interface StudioRepo {
  listDesigns(): Promise<DesignSummary[]>
  getDesign(id: string): Promise<Design | null>
  saveDesign(d: Design, thumb?: string): Promise<void>
  /** store a thumbnail for a design that has none, without touching the design or its "updated" time.
   *  Returns the stored link (a data: URL in the browser store). */
  saveThumb(id: string, thumb: string): Promise<string>
  deleteDesign(id: string): Promise<void>
  /** templates saved by managers (built-ins live in code) */
  listTemplates(): Promise<TemplateDef[]>
  saveTemplate(t: TemplateDef): Promise<void>
  deleteTemplate(id: string): Promise<void>
  /** brand files: admins add them on the Brand tab, everyone uses them */
  listAssets(): Promise<BrandAsset[]>
  uploadAsset(file: File, kind: BrandAsset['kind']): Promise<BrandAsset>
  deleteAsset(id: string): Promise<void>
  /** a person's own photos ("Uploads"; images only, BJ's upload exception 2026-11-18). `team`: everyone's, for managers
   *  and admins (BJ, 2026-11-19). Studio View may upload too (BJ, 2026-11-19: used in the Job Kit). */
  listUploads(opts?: { team?: boolean }): Promise<BrandAsset[]>
  uploadImage(file: File): Promise<BrandAsset>
  deleteUpload(id: string): Promise<void>
}

// ── IndexedDB (demo / standalone) ───────────────────────────

const DB = 'gqr-studio'
const STORES = ['designs', 'summaries', 'templates', 'assets'] as const
type StoreName = (typeof STORES)[number]

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

let dbp: Promise<IDBDatabase> | null = null
const db = () => (dbp ??= openDb())

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const r = fn(d.transaction(store, mode).objectStore(store))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
const all = <T>(store: StoreName) => tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
const get = <T>(store: StoreName, key: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>)
const put = (store: StoreName, key: string, v: unknown) => tx(store, 'readwrite', (s) => s.put(v, key))
const del = (store: StoreName, key: string) => tx(store, 'readwrite', (s) => s.delete(key))

/** downscale an uploaded image and return a data URL (demo storage).
 *  SVGs (which createImageBitmap rejects in Chrome) are rasterised to PNG. */
export async function fileToDataUrl(file: File, max = 2000): Promise<{ url: string; w: number; h: number }> {
  const img = await decodeImageFile(file)
  try {
    const size = rasterSize(img.w, img.h, max, img.svg)
    const c = document.createElement('canvas')
    c.width = size.w
    c.height = size.h
    c.getContext('2d')!.drawImage(img.source, 0, 0, c.width, c.height)
    const png = img.svg || file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif'
    return { url: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9), w: c.width, h: c.height }
  } finally {
    img.close()
  }
}

export const localRepo: StudioRepo = {
  async listDesigns() {
    return (await all<DesignSummary>('summaries')).sort((a, b) => b.updatedAt - a.updatedAt)
  },
  async getDesign(id) {
    return (await get<Design>('designs', id)) ?? null
  },
  async saveDesign(d, thumb) {
    const updatedAt = Date.now()
    await put('designs', d.id, { ...d, updatedAt })
    const prev = await get<DesignSummary>('summaries', d.id)
    await put('summaries', d.id, {
      id: d.id,
      name: d.name,
      w: d.w,
      h: d.h,
      updatedAt,
      kitId: d.kitId,
      thumb: thumb ?? prev?.thumb,
      ownerUid: d.ownerUid,
    } satisfies DesignSummary)
  },
  async saveThumb(id, thumb) {
    const prev = await get<DesignSummary>('summaries', id)
    if (prev) await put('summaries', id, { ...prev, thumb })
    return thumb
  },
  async deleteDesign(id) {
    await del('designs', id)
    await del('summaries', id)
  },
  listTemplates: () => all<TemplateDef>('templates'),
  saveTemplate: (t) => put('templates', t.id, t).then(() => undefined),
  deleteTemplate: (id) => del('templates', id).then(() => undefined),
  async listAssets() {
    return (await all<BrandAsset>('assets')).filter((a) => !a.ownerUid).sort((a, b) => b.createdAt - a.createdAt)
  },
  async uploadAsset(file, kind) {
    const { url, w, h } = await fileToDataUrl(file)
    const a: BrandAsset = {
      id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: file.name.slice(0, 80),
      url,
      kind,
      w,
      h,
      createdAt: Date.now(),
    }
    await put('assets', a.id, a)
    return a
  },
  deleteAsset: (id) => del('assets', id).then(() => undefined),
  // the browser store keeps uploads in the brand-file store, marked with an owner (demo: one person, so team = mine)
  async listUploads() {
    return (await all<BrandAsset>('assets')).filter((a) => a.ownerUid).sort((a, b) => b.createdAt - a.createdAt)
  },
  async uploadImage(file) {
    const a = { ...(await localRepo.uploadAsset(file, 'photo')), ownerUid: 'local', ownerName: 'You' }
    await put('assets', a.id, a)
    return a
  },
  deleteUpload: (id) => del('assets', id).then(() => undefined),
}
