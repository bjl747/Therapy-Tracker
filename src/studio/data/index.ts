// The repo the Studio UI talks to; everything imports `repo` from this file.
//
// Demo mode (and this standalone repo) keeps everything in the browser (`localRepo`). In the hub, StudioPage calls
// `configureRepo` with the signed-in person before anything loads, and the same `repo` then talks to Firestore +
// Storage (`firestoreRepo`, hub_studio/*). Wired 2026-11-18 (BJ: "wire Studio to the hub database so the team can use it").
import { DEMO } from '@/lib/demo'
import { localRepo, type DesignSummary, type StudioRepo } from './repo'
import { makeFirestoreRepo } from './firestoreRepo'

let current: StudioRepo = localRepo
let key = 'local'

/** Pick the store for this person. `seeAll`: managers, AMs and admins list everyone's designs (recruiters only theirs). */
export function configureRepo(opts: { uid: string | null | undefined; seeAll: boolean }): void {
  const next = DEMO || !opts.uid ? 'local' : `hub:${opts.uid}:${opts.seeAll ? 'all' : 'own'}`
  if (next === key) return
  key = next
  current = next === 'local' ? localRepo : makeFirestoreRepo({ seeAll: opts.seeAll })
}

/** true when designs are saved to the hub (not this browser) */
export const savesToHub = () => key !== 'local'

export const repo: StudioRepo = {
  listDesigns: () => current.listDesigns(),
  getDesign: (id) => current.getDesign(id),
  saveDesign: (d, thumb) => current.saveDesign(d, thumb),
  deleteDesign: (id) => current.deleteDesign(id),
  listTemplates: () => current.listTemplates(),
  saveTemplate: (t) => current.saveTemplate(t),
  deleteTemplate: (id) => current.deleteTemplate(id),
  listAssets: () => current.listAssets(),
  uploadAsset: (f, kind) => current.uploadAsset(f, kind),
  deleteAsset: (id) => current.deleteAsset(id),
  listUploads: () => current.listUploads(),
  uploadImage: (f) => current.uploadImage(f),
  deleteUpload: (id) => current.deleteUpload(id),
}

/** Designs still in this browser from before Studio saved to the hub (admins tried it browser-only on 2026-11-18). */
export async function localLeftovers(): Promise<DesignSummary[]> {
  if (!savesToHub()) return []
  try {
    return (await localRepo.listDesigns()).filter((d) => !d.id.startsWith('tpl_'))
  } catch {
    return []
  }
}

/** Copy this browser's designs (and, for admins, template changes) into the hub, then clear them here.
 *  A design that fails to copy stays in the browser. */
export async function moveLocalToHub(opts: { isAdmin: boolean }): Promise<{ moved: number; failed: number }> {
  if (!savesToHub()) return { moved: 0, failed: 0 }
  let moved = 0
  let failed = 0
  for (const s of await localRepo.listDesigns()) {
    if (s.id.startsWith('tpl_')) continue
    const d = await localRepo.getDesign(s.id)
    if (!d) continue
    try {
      // the copy belongs to whoever moves it (browser designs have no hub owner)
      await current.saveDesign({ ...d, ownerUid: undefined }, s.thumb)
      await localRepo.deleteDesign(s.id)
      moved++
    } catch {
      failed++
    }
  }
  if (opts.isAdmin) {
    for (const t of await localRepo.listTemplates().catch(() => [])) {
      try {
        await current.saveTemplate(t)
        await localRepo.deleteTemplate(t.id)
      } catch {
        /* stays local */
      }
    }
  }
  return { moved, failed }
}

export type { StudioRepo, DesignSummary, BrandAsset } from './repo'
