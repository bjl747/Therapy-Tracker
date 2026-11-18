# Studio — build & critique log

## Next up
- (kept current by each session — see entries below)

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
