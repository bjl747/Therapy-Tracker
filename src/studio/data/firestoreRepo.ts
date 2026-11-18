// ─────────────────────────────────────────────────────────────
// Firestore + Storage implementation of StudioRepo, for the hub (switched on by data/index.ts → configureRepo).
// Collections (rules: the hub's firestore.rules, "Studio" block):
//   hub_studio/designs/rows/{id}     full Design JSON (images = Storage URLs, never data: URLs; docs max 1 MB)
//   hub_studio/summaries/rows/{id}   list-view summary (thumb = Storage URL, owner)
//   hub_studio/uploads/rows/{id}     a person's own photos ("Your uploads"), ownerUid
//   hub_studio/templates/rows/{id}   admin-saved template families (admins write)
//   hub_studio/assets/rows/{id}      brand files (admins write)
// Storage: studio/{uid}/img|thumbs|uploads/… (the owner writes), studio/assets/… (admins write); images only, < 15 MB.
// Who sees what (BJ, 2026-11-18): like candidates. Recruiters list and open their own designs; managers, AMs and admins
// everyone's. Studio is off for everyone until an admin turns it on per person (Users → Access).
// ─────────────────────────────────────────────────────────────

import {
  collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore'
import { db, auth, loadStorage } from '@/lib/firebase'
import type { Design } from '../engine/model'
import type { TemplateDef } from '../templates/types'
import { fileToDataUrl, type BrandAsset, type DesignSummary, type StudioRepo } from './repo'

const rows = (kind: string) => collection(db, 'hub_studio', kind, 'rows')
const row = (kind: string, id: string) => doc(db, 'hub_studio', kind, 'rows', id)
const uid = () => auth.currentUser?.uid ?? ''
const myName = () => auth.currentUser?.displayName || auth.currentUser?.email || ''
const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** `cache`: long for files whose path changes when the content does; thumbnails are overwritten in place, so no-cache */
async function uploadBlob(path: string, blob: Blob, cache = 'public,max-age=31536000'): Promise<string> {
  // the hub's loadStorage() resolves to the firebase/storage module plus its `storage` instance
  const { ref, uploadBytes, getDownloadURL, storage } = await loadStorage()
  const r = ref(storage, path)
  await uploadBytes(r, blob, { contentType: blob.type || 'application/octet-stream', cacheControl: cache })
  return getDownloadURL(r)
}

async function removeFile(path: string | undefined): Promise<void> {
  if (!path) return
  try {
    const { ref, deleteObject, storage } = await loadStorage()
    await deleteObject(ref(storage, path))
  } catch {
    /* already gone, or not ours: the row is what the app reads */
  }
}

/** decoded by hand: the hub's CSP connect-src has no data:, so fetch(dataUrl) is refused */
function dataUrlToBlob(u: string): Blob {
  const comma = u.indexOf(',')
  const head = u.slice(5, comma) // after "data:"
  const type = head.split(';')[0] || 'application/octet-stream'
  const body = u.slice(comma + 1)
  if (!head.includes(';base64')) return new Blob([decodeURIComponent(body)], { type })
  const bin = atob(body)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return new Blob([out], { type })
}

/** Firestore (as the hub sets it up) refuses `undefined` anywhere in a document; the editor leaves some
 *  behind (ungroup, removed animations, replaced photos), so drop them before every write */
function noUndefined<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T
}

/** FNV-1a over the whole data URL: the same picture always gets the same file name */
function hashOf(s: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x5bd1e995)
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + s.length.toString(36)
}
const extOf = (type: string) => (type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : type === 'image/gif' ? 'gif' : 'jpg')

/** data: URL → Storage URL, uploaded once per picture: the editor keeps the data: URL in memory after a save, so every
 *  autosave used to upload it again under a new name (review 2026-11-18) */
const uploaded = new Map<string, Promise<string>>()
function externalise(src: string): Promise<string> {
  const h = hashOf(src)
  let p = uploaded.get(h)
  if (!p) {
    const blob = dataUrlToBlob(src)
    p = uploadBlob(`studio/${uid()}/img/${h}.${extOf(blob.type)}`, blob)
    p.catch(() => uploaded.delete(h))
    uploaded.set(h, p)
  }
  return p
}

/** move any data: URLs inside a design into Storage (Firestore docs max 1 MB) */
async function externaliseImages(d: Design): Promise<Design> {
  const out = structuredClone(d)
  for (const p of out.pages)
    for (const el of p.elements)
      if (el.type === 'image' && el.src.startsWith('data:')) el.src = await externalise(el.src)
  return noUndefined(out)
}

const byNewest = <T extends { updatedAt?: number; createdAt?: number }>(a: T, b: T) =>
  (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0)

/** an image file → a web-sized PNG / JPEG (SVGs are drawn to PNG: stored raw they can carry script, and Firefox shows
 *  viewBox-only SVGs at zero size) */
async function webImage(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  if (!file.type.startsWith('image/')) throw new Error('Only image files can be uploaded')
  const { url, w, h } = await fileToDataUrl(file, 2400)
  return { blob: dataUrlToBlob(url), w, h }
}

type StoredAsset = BrandAsset & { path?: string }
const cleanAsset = ({ path: _p, ...a }: StoredAsset): BrandAsset => a

export function makeFirestoreRepo(opts: { seeAll: boolean }): StudioRepo {
  return {
    async listDesigns() {
      // recruiters see their own designs; managers / AMs / admins see everyone's. The recruiter query has no orderBy
      // so it needs no composite index (sorted here instead).
      const q = opts.seeAll ? query(rows('summaries'), orderBy('updatedAt', 'desc')) : query(rows('summaries'), where('ownerUid', '==', uid()))
      const snap = await getDocs(q)
      const list = snap.docs.map((s) => s.data() as DesignSummary)
      return opts.seeAll ? list : list.sort(byNewest)
    },
    async getDesign(id) {
      const s = await getDoc(row('designs', id))
      return s.exists() ? (s.data() as Design) : null
    },
    async saveDesign(d, thumb) {
      const ownerUid = d.ownerUid ?? uid()
      const clean = await externaliseImages({ ...d, ownerUid })
      const updatedAt = Date.now()
      let thumbUrl: string | undefined
      // thumbnails go under the SAVER's folder: a manager saving a recruiter's design can't write the recruiter's
      if (thumb?.startsWith('data:')) thumbUrl = await uploadBlob(`studio/${uid()}/thumbs/${d.id}.png`, dataUrlToBlob(thumb), 'no-cache')
      else if (thumb && /^https:\/\//.test(thumb)) thumbUrl = thumb // undo-delete / duplicate keep the stored one
      await setDoc(row('designs', d.id), { ...clean, updatedAt, savedAt: serverTimestamp() })
      const summary: DesignSummary = {
        id: d.id,
        name: d.name,
        w: d.w,
        h: d.h,
        updatedAt,
        ownerUid,
        ...(ownerUid === uid() && myName() ? { ownerName: myName() } : {}),
        ...(d.kitId ? { kitId: d.kitId } : {}),
        ...(thumbUrl ? { thumb: thumbUrl } : {}),
      }
      await setDoc(row('summaries', d.id), summary, { merge: true })
    },
    async deleteDesign(id) {
      // Storage files stay: a duplicate shares its images, and Undo brings the design back with the same links
      await deleteDoc(row('designs', id))
      await deleteDoc(row('summaries', id))
    },
    async listTemplates() {
      return (await getDocs(rows('templates'))).docs.map((s) => s.data() as TemplateDef)
    },
    async saveTemplate(t) {
      await setDoc(row('templates', t.id), noUndefined({ ...t, updatedAt: Date.now() }))
    },
    async deleteTemplate(id) {
      await deleteDoc(row('templates', id))
    },

    // brand files (admins)
    async listAssets() {
      return (await getDocs(query(rows('assets'), orderBy('createdAt', 'desc')))).docs.map((s) => cleanAsset(s.data() as StoredAsset))
    },
    async uploadAsset(file, kind) {
      const { blob, w, h } = await webImage(file)
      const id = newId('a')
      const path = `studio/assets/${id}.${extOf(blob.type)}`
      const url = await uploadBlob(path, blob)
      const a: StoredAsset = { id, name: file.name.slice(0, 80), url, kind, w, h, createdAt: Date.now(), path }
      try {
        await setDoc(row('assets', id), a)
      } catch (e) {
        await removeFile(path) // no row, no orphan file
        throw e
      }
      return cleanAsset(a)
    },
    // Removing a brand file or an upload drops it from the list only: designs keep their own link to the picture, so
    // deleting the file would blank it in every design that uses it.
    async deleteAsset(id) {
      await deleteDoc(row('assets', id))
    },

    // a person's own photos ("Your uploads"); each person lists only their own, managers included
    async listUploads() {
      const snap = await getDocs(query(rows('uploads'), where('ownerUid', '==', uid())))
      return snap.docs.map((s) => cleanAsset(s.data() as StoredAsset)).sort(byNewest)
    },
    async uploadImage(file) {
      const { blob, w, h } = await webImage(file)
      const id = newId('u')
      const path = `studio/${uid()}/uploads/${id}.${extOf(blob.type)}`
      const url = await uploadBlob(path, blob)
      const a: StoredAsset = { id, name: file.name.slice(0, 80), url, kind: 'photo', w, h, createdAt: Date.now(), ownerUid: uid(), path }
      try {
        await setDoc(row('uploads', id), a)
      } catch (e) {
        await removeFile(path)
        throw e
      }
      return cleanAsset(a)
    },
    async deleteUpload(id) {
      await deleteDoc(row('uploads', id))
    },
  }
}
