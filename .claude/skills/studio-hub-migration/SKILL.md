---
name: studio-hub-migration
description: How to move the Studio tool from this standalone repo into BJ's GQR Allied Recruiter Hub (React/Vite/Firebase) — the exact touch points, Firestore/Storage rules, collections, and what NOT to copy. Use when integrating, or when changing anything the hub depends on.
---

# Moving Studio into the hub

Deploys happen only from the hub session, only when BJ says so.

## Copy
- `src/studio/**` → hub `src/studio/**` (unchanged).
- `public/fonts/**`, `public/photos/cities/**`, `public/brand/**` → hub `public/`.
- `scripts/city-photos/**` → hub `scripts/` (optional; for rebuilding photos).
- Dependencies: add `pdfjs-dist` and `pdf-lib` (approved). Nothing else.

## Don't copy (hub already has its own)
Everything else under `src/` (App.tsx, main.tsx, index.css, context/, lib/,
components/) — those are shims that imitate the hub.

## The 5 touch points (from the hub brief)
1. `src/lib/types.ts`: add `'studio'` to `FeatureKey`.
2. `src/lib/access.ts`: add the FEATURES entry and the `studio` keys exactly as in this
   repo's shim `src/lib/access.ts` (group `resources`; every role defaults to `edit`).
3. Routes: `pageLoaders.studio = () => import('@/studio/StudioPage')`, path `/studio`, and
   `{can('studio') !== 'none' && <Route path="/studio/*" element={<StudioPage />} />}`.
4. Nav: `{ to: '/studio', label: 'Studio', icon: Palette, feature: 'studio' }` in the
   Resources section of `buildNav`.
5. Firestore rules (both `firestore.rules` and `firestore.hub.rules.snippet`):
   ```
   match /hub_studio/{kind}/rows/{id} {
     allow read: if hubCan('studio', 'view') || hubActive();
     allow create: if hubCan('studio', 'edit') && request.resource.data.ownerUid == request.auth.uid;
     allow update, delete: if hubManager() || resource.data.ownerUid == request.auth.uid;
   }
   ```
   (templates/assets writes: restrict to `hubManager()`.) Recruiters list only their own
   designs (query `where('ownerUid','==',uid)`); managers/AMs/admins list all.
   Storage rules: `studio/{uid}/**` write by owner, `studio/assets/**` write by managers,
   read by any active hub user; images only, ≤ 15 MB.

## Wire the data layer
- Write `src/studio/data/firestoreRepo.ts` implementing `StudioRepo` (see `data/repo.ts`)
  with `db` from `@/lib/firebase` and `await loadStorage()` for uploads. Upload images to
  Storage and store URLs (never data URLs — Firestore docs max 1 MB). Store thumbnails in
  Storage too.
- In `src/studio/data/index.ts`: `export const repo = DEMO ? localRepo : firestoreRepo`.
- `onSnapshot` listeners for live lists; no offline cache (BJ's choice).

## Swap shims for hub pieces
- `src/studio/ui/toast.tsx` → can forward to the hub Toast context (keep the call shape).
- `useAuth()` from `@/context/AuthContext` is already the hub's API (`user`, `can`, `isManager`).

## Check after moving
`npx tsc -b`, `npm run build`, demo mode (`VITE_HUB_DEMO=true`) works with no login,
light + dark, phone width, PDF Studio loads its worker (Vite `?url` import).
