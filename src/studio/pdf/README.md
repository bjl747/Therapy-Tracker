# PDF Studio

Acrobat-style page organiser and editor for building submission packets. Everything runs in the browser; no file is uploaded.

Usage: `import { PdfStudio } from '@/studio/pdf/PdfStudio'` and render it inside a container with a height (root is `flex flex-col h-full min-h-0`, with 16px/24px side padding). Pass `owner` (the signed-in user's id): a document left by someone else is cleared when PDF Studio opens.

## Features
- **Add** PDFs and PNG / JPG / WebP images (one page per image) by drop, picker or a dropped folder. While PDF Studio is open a file dropped anywhere in the window is added (the browser never opens it), and leaving or reloading with pages open asks first. Drops are read one batch after another. HEIC photos get a "save as JPG" message.
- **Letter portrait pages** (Document panel, on by default): every output page is an 8.5 x 11 portrait sheet with the page's content fitted and centred; Rotate (R / Shift+R) turns the content on the sheet, so a packet never mixes page shapes. "Turn wide pages sideways" turns every landscape page a quarter turn left so it fills the sheet (one undo step). Off = each page keeps its own size and rotation (the old behaviour). The grid previews the sheets.
- **Organise:** lazy thumbnails (they show edits); drag reorder (mouse, or the grip on touch; release outside the grid or Esc cancels); multi-select (click, shift, ctrl/cmd, checkbox, select all, Deselect); rotate, delete, duplicate, blank Letter page, move to start / end; undo / redo (form values included; steps that change nothing are dropped). A hint shows when nothing is selected, and disabled buttons say why.
- **Files** (Document panel): only files still in the document are listed; click a name to select its pages, arrows move the file's pages as a block, the bin removes them (Undo brings them back). **Start over** clears everything (asks first).
- **Name:** suggested as the first PDF's name + " - Packet" until the user types one.
- **Split:** extract selection, split every N, split by file (repeated names get " (2)"), selected pages as PNG.
- **Page editor** (double-click a page, its pencil, or Edit page): **Edit text** (click a line of the page's own text to retype it; default on PDF pages with text), **Add text** (type straight on the page), Signature, Image, White-out, Highlight, Redact, Move. New items are upright as you see the page, also on rotated pages. Undo / Redo / Done in the editor; Esc leaves typing, then deselects, then closes.
- AcroForm filling; fillable forms stay fillable (Flatten is off by default, 2026-11-24; on = values baked in as text, fields removed); Download PDF; size estimate. No compression (removed 2026-11-24). Choosing Redact first warns that the page will not be readable by ATS.
- **Safe output** (security review 2026-11-19): copied pages keep only web / email / in-document links; scripts, launch and other actions, `/AA` and attachment / media annotations are removed on export, with a notice (`safeActions.ts`). Files over 100 MB are skipped (`MAX_FILE_MB` in `ingest.ts`). In the hub, the document is cleared on sign-out (`HubStudio.tsx`).
- Shortcuts (only when focus is in PDF Studio, never from the hub header / menu / pop-ups): Del, Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z (or Ctrl+Y), Ctrl/Cmd+A, R / Shift+R, Esc.

## File map
- `PdfStudio.tsx` page component, toolbar, window drop guard, shortcuts
- `PageGrid.tsx` thumbnails (Letter sheet frame), selection, pointer drag-reorder
- `PageEditor.tsx` / `SignaturePad.tsx` editor modal and signature pad; `textRuns.ts` reads a page's text lines with pdf.js, `textGroup.ts` (pure) groups them and builds replacements
- `Panels.tsx` document (files, Letter switch, Start over), split, forms panels, export bar; `useExporter.ts` download actions
- `Modal.tsx` + `layers.ts` portaled modal (wrapped in `studio-root` so Studio's styles apply), Esc goes to the top layer first
- `store.ts` zustand store (sources meta, pages, selection, undo history of pages + form values, layout, owner)
- `lib.ts` pure logic (reorder, selection, history, split plans, rotation transforms, Letter sheet math); `annot.ts` (pure) the frame of turned text / images; tests in the Studio repo (`lib.test.ts`, `sheet.test.ts`, `store.test.ts`, `textGroup.test.ts`)
- `pdfjs.ts` lazy pdfjs/pdf-lib loading, worker setup, source byte registry, ingest generation; `ingest.ts` file reading
- `acroform.ts` keeps fields live and drops annotation entries left dangling by flattening
- `raster.ts` canvas rendering, annotation painting, thumbnail cache (capped); `export.ts` pdf-lib pipeline; `safeActions.ts` strips unsafe actions from copied pages (test `safeActions.test.ts` in the Studio repo)

## How export works
Annotations are stored per page in "base space" (top-left origin, points, page at intrinsic rotation), so they rotate with the page. Text and image items also carry `rot`, the turn of their content inside the box, so items added on a rotated page read upright. "Edit text" items carry a `cover` rectangle painted first in the page's sampled colour.
Each source is copied once (`copyPages` with all its pages), so shared fonts and images are not duplicated. Per output page:
1. Rasterise if the page has a redaction, or its source is encrypted/unparsable: pdfjs renders it, annotations are painted (redactions solid black), and the result is embedded as one image (fitted on the Letter sheet in Letter mode). A page that cannot be read is left out with a warning; the export stops only if no page can be read.
2. Otherwise the copied page loses unsafe actions (`safeActions.ts`) and gets its annotations stamped with pdf-lib. In Letter mode its content is then wrapped in one transform (scale + quarter turns) onto a 612 x 792 sheet, links and annotation boxes moved with it, `/Rotate` 0; a page already Letter portrait and unturned is left alone. In original mode the user rotation is added to `/Rotate`.
3. Blank and image pages are created from scratch, then placed the same way.
Form values are applied (and optionally flattened) on the source document before copying; in Letter mode a source with form fields on a turned page is flattened (with a warning) because turned live fields draw squashed.

## Known limits
- Password-protected PDFs that need a password are rejected with a message. Owner-password/encrypted ones open (`ignoreEncryption`) but export as images.
- With "Flatten" off the copied fields are registered in the packet's own AcroForm (`acroform.ts`; a name used by two files gets `_2`). Values typed there live in the form fields, so an ATS may not read them; Flatten makes them page text.
- Only text, checkbox, dropdown and radio fields are listed; no option lists, signatures or buttons.
- Text items use Helvetica / Helvetica Bold (WinAnsi); other characters become `?`. Width is approximate; no wrapping.
- **Edit text and White-out only cover the old words**: they are still in the file, so copy / paste and résumé-reading software can find them. Redact removes them (and turns that page into a picture). Scanned pages and image pages have no text to pick: use White-out, then Add text.
- JPEGs are redrawn so their EXIF rotation is applied (page images and placed images; placed images are capped at 2000 px). WebP pages are converted to PNG.
- In Letter mode small pages are enlarged to fill the sheet and content runs to the sheet's edge (no margin); "Download page as PNG" saves the page itself, not the sheet.
- Very large files are held in memory twice (registry + pdfjs worker). Touch drag-reorder works from the grip handle only.
