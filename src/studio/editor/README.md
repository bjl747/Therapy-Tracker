# Studio editor

`<Editor designId onExit canEditLocked? readOnly? />` — a Canva-style editor with
no canvas library. One `<canvas>` drawn by the shared renderer plus a thin
DOM/SVG overlay for everything that is editor-only.

## Architecture

```
Editor.tsx        load / autosave / keyboard / clipboard / layout (wide or compact)
 ├─ TopBar        name, undo/redo, tools, zoom, lint badge, preview, download
 ├─ rail + panel  Fields · Text · Photos · Brand · Elements · Layers · Animate
 ├─ Stage         canvas + overlay + all pointer input
 ├─ PageStrip     live thumbnails, add / duplicate / delete / reorder
 └─ Inspector     contextual controls for the selection (or the page)
```

**Canvas.** `Stage` owns a canvas the size of the *viewport* (× devicePixelRatio,
capped at 3) and calls `drawPage(ctx, design, page, { scale: zoom·dpr, origin })`.
`origin` (added to `RenderOptions`) places the page inside the canvas and clips
to it, so zooming to 400 % stays sharp and never allocates a giant bitmap. It is
the same `drawPage` every export uses — the editor cannot drift from the output.
Drawing happens in a `useLayoutEffect`, i.e. in the same commit as the overlay.

**Overlay.** An SVG (hover outline, selection frame, handles, pink snap guides,
marquee) and a few DOM nodes (lock badges, size/position tooltip, floating
selection toolbar, inline text editor, adjust-photo bar), all positioned in
screen coordinates. Nothing in the overlay receives pointer events except
elements marked `data-stage-ui`.

**Input.** Every pointer event lands on the stage container and is hit-tested
with math (`hitTest`, `hitHandle`), so mouse, pen and touch share one path and
handle targets can be bigger for fingers. Pointer moves are coalesced to one
`requestAnimationFrame`, and that frame runs inside `flushSync`, so store update
→ React commit → canvas draw all finish before the browser paints.

**State.** `store.ts` (zustand) is the document + selection + history.
`uiStore.ts` holds chrome state that must never be undoable or saved (open
panel, pan, adjust-photo mode, clipboard, menus). `stageApi` exposes zoom
commands from the mounted stage.

## Coordinate systems

| Space | Unit | Origin | Used by |
|---|---|---|---|
| page | design px | page top-left | the model, geometry, snapping |
| screen | CSS px | stage container top-left | overlay, hit-testing handles |
| device | physical px | canvas top-left | `drawPage` (`scale`, `origin`) |

`screen = page × view.zoom + (view.x, view.y)` — `toPage` / `toScreen` in
`viewport.ts`. `store.zoom === null` means *fit*: the view is derived from the
container size on every render, so it follows resizes and sheet open/close.
Any pan or zoom makes it explicit (`store.zoom` + `uiStore.pan`).
Thresholds are in screen px and divided by zoom (snap 6 px, handles 9 px mouse /
20 px touch).

## Gesture → undo model

Every continuous interaction is exactly one undo step:

1. `beginGesture()` stores the current design as `gestureBase`.
2. Each frame writes with `{ transient: true }` (no history).
3. `endGesture()` pushes `gestureBase` once if anything changed.

Used by: move, resize, rotate, Alt-drag duplicate (the copies are added inside
the gesture), photo re-framing, inline text editing (begin on mount, end on
commit; an emptied text box is removed in the same step), label scrubbing,
sliders, the native colour input, and each visit to a Fields input.
`Esc` during a pointer gesture restores `gestureBase`. Gestures have a kind:
`beginGesture('pointer')` (default: drags, sliders, scrubs, colour input) —
autosave waits for it to end and undo/redo are ignored while it is open;
`beginGesture('edit')` (Fields inputs, inline text) — autosave keeps saving as
you type, and undo first closes the visit and undoes it as one step. The save
chip reads "Unsaved changes" → "Saving…" (only during the write) → "Saved".

Stage gestures: `pending → move | marquee`, `resize`, `rotate`, `pan`, `crop`,
`pinch`. A press only becomes a drag after 3 px (8 px touch); otherwise it is a
click (select / toggle / double-click to enter).

## File map

| File | What |
|---|---|
| `Editor.tsx` | shell, load, autosave + thumbnail, shortcuts, clipboard events, layouts, toast |
| `Stage.tsx` | canvas, overlay, gestures, wheel/pinch zoom, inline text, adjust photo, drop |
| `viewport.ts` | pure: view math, fit, zoom-around-cursor, handles, snapping helpers (tested) |
| `store.ts` | document store, history, brand locks (unchanged) |
| `uiStore.ts` | chrome state + `stageApi` |
| `actions.ts` | commands: add text/image/shape/badge/light effect, clipboard, layers, auto-animate |
| `clipboard.ts` | pure: copy / paste offsets, fresh ids, group remap (tested) |
| `lint.ts` | pure: "Ready to post" checks (tested) |
| `colors.ts` | pure: parsing, WCAG contrast, document palette, brand palette (tested) |
| `ui.tsx` | Popover / Modal with a shared Esc stack, NumField (scrub), Slider, ColorField, menus |
| `Inspector.tsx` | layout + text / image / shape / light effect / page controls |
| `TopBar.tsx` | top bar, zoom menu, lint badge, export panel, preview player |
| `Menus.tsx` | context menu, command palette |
| `PageStrip.tsx` | page thumbnails |
| `panels/*` | left panels (`ElementLibrary.tsx`: light effects, more shapes, icon library, stickers; files under `public/studio/`) |
| `shapeLibrary.ts` | the 37 extra shapes, each one path in a 100 box (tested) |
| `hooks.ts` | city data, asset tick, selection, width |

Engine addition: `RenderOptions.origin` (render.ts). Tests added for
`engine/geometry.ts` and `engine/text.ts`.

## Keyboard

| Keys | Action |
|---|---|
| Delete / Backspace | delete selection |
| Ctrl/Cmd+Z · Shift+Ctrl/Cmd+Z · Ctrl+Y | undo · redo |
| Ctrl/Cmd+C / X / V | copy / cut / paste (elements, also across pages; images and plain text from other apps) |
| Ctrl/Cmd+D | duplicate |
| Ctrl/Cmd+A | select all |
| Arrows · Shift+Arrows | nudge 1 px · 10 px |
| Ctrl/Cmd+G · Shift+Ctrl/Cmd+G | group · ungroup |
| ] / [ · Ctrl/Cmd+] / [ | forward / backward · front / back |
| Enter | edit text / jump to its field / adjust photo |
| Esc | cancel drag → leave adjust mode → deselect (popups first: only the topmost closes) |
| T | add a heading and start typing |
| V · H · hold Space | select tool · hand tool · temporary pan |
| Ctrl/Cmd+0 · 1 · = · − | fit · 100 % · zoom in · out |
| Ctrl/Cmd+K | command palette |
| Ctrl/Cmd+S | save now |

Pointer: click selects the topmost element (its whole group); double-click
enters (a group member, text, photo); Shift/Cmd-click toggles; drag on empty
space or on a locked layer = marquee; Shift while moving constrains the axis;
Alt at drag start duplicates; Ctrl/Cmd (or Alt pressed mid-drag) disables
snapping; corner handles keep the ratio for images and text (text scales its
font), Shift inverts; side handles resize the box only; Shift while rotating
snaps to 15°, otherwise it gently sticks to 45° steps. Ctrl/Cmd+wheel or pinch
zooms around the cursor; wheel / two fingers pan; middle mouse pans; long-press
on touch opens the context menu.

Shortcuts are ignored while typing in an input and while a popup is open.

## Brand locks

`locked` elements never move or resize by drag (managers unlock first; they can
still restyle them in the inspector). Without `canEditLocked` the inspector
shows an explanation instead of controls, and double-clicking a locked
field-driven text or bound photo jumps to its field. `readOnly` blocks every
write in the store.

## Known limits

- Inline text editing uses a `<textarea>`; its line breaking can differ from the
  canvas by a word at the margin for unusual fonts. The canvas is the truth once
  you commit.
- Text with `{{markers}}` is edited through the Fields panel, not inline.
- Resizing several elements is uniform only (corner handles); rotated single
  elements do not snap while resizing.
- Lines resize by their ends along their own axis (no free endpoint dragging).
- Colours have no alpha slider (element opacity covers most cases); gradients
  are two stops.
- GIF export is the current page at ≤720 px; ZIP is one PNG per page.
- Photo re-framing works in "Fill" mode only.
- The thumbnail is skipped (previous one kept) if a cross-origin image taints
  the canvas.
- Leaving the tab mid-save relies on IndexedDB finishing the write; there is no
  `beforeunload` prompt.
