# Studio — build & critique log

## Next up
- Editor (Fable agent) — integrate, test drag/resize/rotate/text edit, phone layout.
- City photos: replace montage/collage images (28 named *montage/collage*, maybe more) with a
  single photo (Wikipedia lead image or another Wikidata image); finish 429-throttled downloads.
- Job Kit on phone: previews sit below a long form — add a compact live preview at the top.
- PDF Studio: add a back link to Studio home.
- Colour styles for job posts (Light / Bold) once BJ sends transparent logos (current
  placeholders have a navy box baked in, so only navy backgrounds work).
- GIF export holds all frames in memory (~186 MB at 1080², 40 frames) — stream frames to the worker.

## 2026-11-18 — Night 1: rebuild from Canvix
- Moved Canvix to `legacy/canvix/`; new Vite app on the hub stack with hub shims.
- Engine: document model with live `{{fields}}` + bound city photos; one Canvas 2D renderer
  for editor/previews/exports; text shrink-to-fit; own pixel filters; geometry & snapping.
- Editor store with gesture-based undo, brand locks, pages.
- Job Kit: one job → square/portrait/story/landscape + GIF + caption; batch paste from
  spreadsheets; smart field tidying; nearest-city photo with picker.
- Exporters (agent): PNG/JPG, own GIF encoder (worker), own ZIP, design→PDF.
- PDF Studio (agent) and canvas editor (agent) in progress.
- City photos: metadata for all 817 cities collected; downloads throttled by Wikimedia (429),
  resuming in the background.

### Critique round 1 (ideas)
- Kept: content-first kit, nearest-city photos, deterministic captions, batch paste, brand locks.
- Added: healthcare-aware title casing (RN, ICU, L&D…), money/shift/duration tidying, Hot Jobs
  connector (sample data) + Pay Intel hook type, photo focal points computed at build time
  (edge-energy centroid with a skyline prior), search-as-you-type over all 32k US places
  (replaced a 32k-option datalist that would have been slow).
- Rejected for now: colour "styles" (logos aren't transparent yet), LLM captions (no AI bill).

### Critique round 2 (screenshots: kit, home, brand, PDF at 1440 / 390, light + dark)
- Fixed: Download-kit bar overlapped previews → sticky bottom bar on all widths.
- Added: per-size "ready to post" warnings on kit previews (text shrank a lot / doesn't fit / empty field).
- Found: some Wikipedia city images are collages (e.g. Huntsville) — queued.
- Found: nearest photo can be far away while the library is incomplete (expected; resolves when
  downloads finish).
