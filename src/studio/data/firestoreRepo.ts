// ─────────────────────────────────────────────────────────────
// Firestore + Storage implementation of StudioRepo, for the hub.
// Not used in demo mode / this standalone repo (no Firebase project here) —
// see .claude/skills/studio-hub-migration. Collections:
//   hub_studio/designs/rows/{id}     full Design JSON (images = Storage URLs)
//   hub_studio/summaries/rows/{id}   list-view summary (thumb = Storage URL)
//   hub_studio/templates/rows/{id}   manager-saved template families
//   hub_studio/assets/rows/{id}      brand files metadata (bytes in Storage)
// ─────────────────────────────────────────────────────────────

import { decodeImageFile } from './imageFile'
import {
  collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore'
import { db, auth, loadStorage } from '@/lib/firebase'
import type { Design } from '../engine/model'
import type { TemplateDef } from '../templates/types'
import type { BrandAsset, DesignSummary, StudioRepo } from './repo'

const rows = (kind: string) => collection(db, 'hub_studio', kind, 'rows')
const row = (kind: string, id: string) => doc(db, 'hub_studio', kind, 'rows', id)
const uid = () => auth.currentUser?.uid ?? ''

/** `cache`: long for files at a new path every time; thumbnails are overwritten in place, so no-cache */
async function uploadBlob(path: string, blob: Blob, cache = 'public,max-age=31536000'): Promise<string> {
  // the hub's loadStorage() resolves to the firebase/storage module plus its `storage` instance
  const { ref, uploadBytes, getDownloadURL, storage } = await loadStorage()
  const r = ref(storage, path)
  await uploadBytes(r, blob, { contentType: blob.type || 'application/octet-stream', cacheControl: cache })
  return getDownloadURL(r)
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

/** move any data: URLs inside a design into Storage (Firestore docs max 1 MB) */
async function externaliseImages(d: Design): Promise<Design> {
  const out = structuredClone(d)
  for (const p of out.pages)
    for (const el of p.elements)
      if (el.type === 'image' && el.src.startsWith('data:')) {
        const blob = dataUrlToBlob(el.src)
        el.src = await uploadBlob(`studio/${uid()}/img/${el.id}-${Date.now().toString(36)}`, blob)
      }
  return noUndefined(out)
}

export function makeFirestoreRepo(opts: { seeAll: boolean }): StudioRepo {
  return {
    async listDesigns() {
      // recruiters see their own designs; managers / AMs / admins see everyone's
      const q = opts.seeAll
        ? query(rows('summaries'), orderBy('updatedAt', 'desc'))
        : query(rows('summaries'), where('ownerUid', '==', uid()), orderBy('updatedAt', 'desc'))
      const snap = await getDocs(q)
      return snap.docs.map((s) => s.data() as DesignSummary)
    },
    async getDesign(id) {
      const s = await getDoc(row('designs', id))
      return s.exists() ? (s.data() as Design) : null
    },
    async saveDesign(d, thumb) {
      const clean = await externaliseImages({ ...d, ownerUid: d.ownerUid ?? uid() })
      const updatedAt = Date.now()
      let thumbUrl: string | undefined
      // thumbnails go under the SAVER's folder: a manager saving a recruiter's design can't write theirs
      if (thumb?.startsWith('data:')) thumbUrl = await uploadBlob(`studio/${uid()}/thumbs/${d.id}.png`, dataUrlToBlob(thumb), 'no-cache')
      await setDoc(row('designs', d.id), { ...clean, updatedAt, savedAt: serverTimestamp() })
      const summary: DesignSummary = {
        id: d.id,
        name: d.name,
        w: d.w,
        h: d.h,
        updatedAt,
        ownerUid: clean.ownerUid,
        ...(d.kitId ? { kitId: d.kitId } : {}),
        ...(thumbUrl ? { thumb: thumbUrl } : {}),
      }
      await setDoc(row('summaries', d.id), summary, { merge: true })
    },
    async deleteDesign(id) {
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
    async listAssets() {
      return (await getDocs(query(rows('assets'), orderBy('createdAt', 'desc')))).docs.map((s) => s.data() as BrandAsset)
    },
    async uploadAsset(file, kind) {
      // dimensions only (the original file goes to Storage); SVG-safe, unlike createImageBitmap
      const img = await decodeImageFile(file)
      const { w, h } = img
      img.close()
      const id = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      const url = await uploadBlob(`studio/assets/${id}-${file.name.replace(/[^\w.-]+/g, '_').slice(0, 60)}`, file)
      const a: BrandAsset = { id, name: file.name.slice(0, 80), url, kind, w: Math.round(w), h: Math.round(h), createdAt: Date.now() }
      await setDoc(row('assets', id), a)
      return a
    },
    async deleteAsset(id) {
      await deleteDoc(row('assets', id))
    },
  }
}
