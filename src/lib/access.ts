// HUB SHIM — mirrors the documented shape of the hub's access.ts.
// Migration: copy the 'studio' entries below into the real FEATURES /
// ALL_EDIT / NONE / ROLE_DEFAULTS.
import type { AccessLevel, FeatureKey, Role } from './types'

export const FEATURES = [
  {
    key: 'studio' as FeatureKey,
    label: 'Studio',
    group: 'resources',
    blurb: 'Design job posts, GIFs and PDFs — brand templates, city photos, PDF tools.',
    maxLevel: 'edit' as AccessLevel,
  },
  // The hub has PDF Studio as its own switch (none / view), separate from Studio (2026-11-19)
  { key: 'studio_pdf' as FeatureKey, label: 'PDF Studio', group: 'resources', blurb: 'Studio → PDF tools.', maxLevel: 'view' as AccessLevel },
]

export const ALL_EDIT: Record<FeatureKey, AccessLevel> = { hotjobs: 'edit', payintel: 'edit', studio: 'edit', studio_pdf: 'view' }
export const NONE: Record<FeatureKey, AccessLevel> = { hotjobs: 'none', payintel: 'none', studio: 'none', studio_pdf: 'none' }

// Studio: everyone can make designs ('edit' = create/save own designs and use
// templates). Template/brand management is gated separately by isManager.
export const ROLE_DEFAULTS: Record<Role, Record<FeatureKey, AccessLevel>> = {
  admin: ALL_EDIT,
  manager: { hotjobs: 'edit', payintel: 'edit', studio: 'edit', studio_pdf: 'view' },
  account_manager: { hotjobs: 'view', payintel: 'view', studio: 'edit', studio_pdf: 'view' },
  recruiter: { hotjobs: 'view', payintel: 'view', studio: 'edit', studio_pdf: 'view' },
}
