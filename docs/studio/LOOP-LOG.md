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

### Critique round 3 (editor landed; full workflow test: kit → download → editor)
- Editor (Fable agent): canvas + overlay, snapping, rotate/resize, inline text, photo re-framing,
  panels, lint, preview, exports; 145 tests. Reviewed screenshots at desktop/phone/ultrawide.
- Kit → ZIP → editor works end to end with no errors (~1.5 s for a whole kit).
- Fixed: very long titles shrank to 52 % → title boxes now allow two lines (bottom-aligned) in
  square/portrait/landscape; km vs mi mismatch → miles everywhere; ZIP names were cut at 40 chars.
- Fixed: animated GIF was 10 MB (moving photo changes every pixel) → 600 px, 12 fps, photo held
  still in GIFs, 3 s hold on the final frame → ~0.5–0.75 MB.

### Critique round 4 (batch paste with messy data)
- 3 pasted rows with odd headers ("Position", "City, State", "Weekly Gross"), "Boise ID" without
  comma, "St. Louis, Missouri", "$2,650 to $2,890", "8 wks" → all tidied correctly.
- Fixed: Boise got a grey box — Census calls it "Boise City" (alias added), and states with no
  downloaded photo now borrow the nearest city's photo. Bound photos with no match draw a brand
  gradient instead of grey, and the kit warns before download.

### Critique round 5 (using the editor like a person)
- Open a kit design → drag, click text, undo, export PNG via the Download popover — works.
- Locked brand pieces (badge/logos) start a marquee instead of moving — intended (managers unlock first).
- Clicking a field-driven text (e.g. location) jumps to that field in the Job details panel — good.
- Fixed: downloads were saved as "download" — Chrome drops names with non-ASCII (our "—");
  `safeFileName` now makes names plain ASCII.
- Fixed: React duplicate-key warning (lock badge listed twice when a locked element was both
  selected and hovered).
