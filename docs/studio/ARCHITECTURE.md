# Studio — architecture

```
src/
  studio/                 ← THE TOOL (this whole folder moves into the hub)
    StudioPage.tsx        routes under /studio/*  (named export StudioPage)
    services.ts           resolveImage (city photos), prepareDesign (fonts), onAssetsChanged
    engine/               PURE TS, no React — document model + the one renderer
      model.ts            Design → Page → El (text | image | shape); factories; SIZES
      render.ts           drawPage(ctx, design, page, opts) — editor, thumbnails AND exports
      text.ts             word wrap + shrink-to-fit (pure, measure fn injected)
      geometry.ts         rotated bounds, hit test, snapping, resize, align/distribute
      images.ts           image cache + pixel filters (identical in every browser)
      fields.ts           {{field}} markers
      fonts.ts            self-hosted OFL fonts (public/fonts), FontFace loading
    editor/               the canvas editor (no Konva — canvas + DOM overlay); see editor/README.md
      store.ts            zustand: selection, gestures, undo/redo, pages, brand locks
    kit/                  Job Kit: one job → every size + GIF + caption; batch paste
      normalize.ts        "$3,227 – $3,547", "3x12s, Nights"… (tested)
      captions.ts         specialty-aware captions + hashtags (no AI)
      batch.ts            paste-from-spreadsheet parser with fuzzy headers
    templates/            template FAMILIES (one field set, a layout per size)
      jobPost.ts          the team's travel job post: square / portrait / story / landscape
    photos/               US city photo library + location parsing / nearest-city matching
    export/               PNG/JPG, GIF encoder (own, worker), ZIP (own), design→PDF (pdf-lib)
    pdf/                  PDF Studio (pdf.js + pdf-lib): merge, reorder, sign, redact, forms
    data/                 StudioRepo interface; IndexedDB (demo) now, Firestore in the hub
    home/                 Studio home (Create · My designs · Brand)
    ui/                   DesignCanvas (live preview), toast
  (everything else in src/ is a HUB SHIM — stand-ins for the hub's own files)
public/
  photos/cities/          ~800 city photos + index.json + places.json (scripts/city-photos)
  fonts/                  woff2 + LICENSES.md
  brand/                  logo placeholders (cropped from a screenshot — replace)
legacy/canvix/            the original open-source app, reference only, not built
```

## Key ideas

- **Live fields.** Text holds `{{markers}}`; images can `bind` to a field. Values
  live in `design.fields` and resolve at render time, so a job's details
  change every page/size instantly and nothing is baked in.
- **One renderer.** `engine/render.ts` draws editor, previews and exports.
  Filters are our own pixel code, text layout our own, fonts self-hosted —
  output is identical across browsers.
- **Brand locks.** `locked: true` elements can't be moved/edited unless
  `canEditLocked` (managers).
- **Undo.** Every store action pushes the previous Design; continuous gestures
  wrap updates in `beginGesture()`/`endGesture()` → one undo step.
- **City photos.** `resolveLocation("Fishersville, VA")` → exact city photo,
  else nearest city with a photo in the same state (Census coordinates), else the
  state's largest city. Users can pin another photo (`fields.location__photo`).

## Data (hub)

Collections (to create when wiring Firestore — see `.claude/skills/studio-hub-migration`):

| Path | What |
|---|---|
| `hub_studio/designs/rows/{id}` | Design JSON (images as Storage URLs, never data URLs — 1 MB doc limit) |
| `hub_studio/summaries/rows/{id}` | name, size, owner, updatedAt, thumb URL (list view) |
| `hub_studio/templates/rows/{id}` | manager-saved template families |
| `hub_studio/assets/rows/{id}` | brand files (logos/photos) metadata; bytes in Storage `studio/assets/` |

Recruiters see their own designs; managers/admins see everyone's (same rule as candidates).

## Dependencies

Only hub-stack libraries plus the two BJ approved: `pdfjs-dist`, `pdf-lib`.
GIF and ZIP encoders are hand-written (no deps). `vitest` is a dev-only test
runner in this standalone repo.
