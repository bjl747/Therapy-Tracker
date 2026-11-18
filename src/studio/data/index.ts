// The repo the Studio UI talks to. The hub swaps in the Firestore
// implementation here; everything else imports `repo` from this file.
import { localRepo, type StudioRepo } from './repo'

export const repo: StudioRepo = localRepo
export type { StudioRepo, DesignSummary, BrandAsset } from './repo'
