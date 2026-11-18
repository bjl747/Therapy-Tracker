# PDF Studio

Acrobat-style page organiser and editor. Everything runs in the browser; no file is uploaded.

Usage: `import { PdfStudio } from '@/studio/pdf/PdfStudio'` and render it inside a container with a height (root is `flex flex-col h-full min-h-0`, with 16px/24px side padding).

## Features
Add PDFs and PNG/JPG/WebP (one page per image) by drop or picker; lazy thumbnails; drag reorder (mouse, or the grip on touch); multi-select (click, shift, ctrl/cmd, checkbox, select all); rotate, delete, duplicate, blank Letter page, move to start/end; undo/redo; extract selection, split every N, split by source file; page editor (text, image, drawn signature, white-out, highlight, redact); AcroForm filling with optional flatten; Download PDF / page as PNG; size estimate and lossy JPEG compression.
Shortcuts: Del, Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z (or Ctrl+Y), Ctrl/Cmd+A, R / Shift+R, Esc.

## File map
- `PdfStudio.tsx` page component, toolbar, drop handling, shortcuts
- `PageGrid.tsx` thumbnails, selection, pointer drag-reorder
- `PageEditor.tsx` / `SignaturePad.tsx` editor modal and signature pad
- `Panels.tsx` document, split, forms panels, export bar; `useExporter.ts` download actions
- `Modal.tsx` + `layers.ts` portaled modal, Esc closes only the top layer
- `store.ts` zustand store (sources meta, pages, selection, undo history, form values)
- `lib.ts` pure logic (reorder, selection, history, split plans, rotation transforms); tests in `lib.test.ts`
- `pdfjs.ts` lazy pdfjs/pdf-lib loading, worker setup, source byte registry; `ingest.ts` file reading
- `raster.ts` canvas rendering, annotation painting, thumbnail cache; `export.ts` pdf-lib pipeline

## How export works
Annotations are stored per page in "base space" (top-left origin, points, page at intrinsic rotation), so they rotate with the page. Per output page:
1. Rasterise if compress is on, the page has a redaction, or its source is encrypted/unparsable: pdfjs renders it (2x, or 1.5x when compressing), annotations are painted (redactions solid black), and the result is embedded as one full-page image. Original text and objects are gone.
2. Otherwise `copyPages`, add user rotation to `/Rotate`, stamp annotations with pdf-lib (coordinates mapped through the page's crop box and intrinsic rotation).
3. Blank and image pages are created from scratch.
Form values are applied (and optionally flattened) on the source document before copying.
Source bytes live once in `pdfjs.ts` (the store holds metadata only); pdfjs receives a copy because it transfers its buffer.

## Known limits
- Password-protected PDFs that need a password are rejected with a message. Owner-password/encrypted ones open (`ignoreEncryption`) but export as images.
- With "Flatten" off, filled values stay visible but copied widgets are not a live AcroForm.
- Only text, checkbox, dropdown and radio fields are listed; no option lists, signatures or buttons.
- Text annotations use Helvetica (WinAnsi); other characters become `?`. Text box width is approximate; no wrapping.
- White-out hides but does not delete content; use Redact. Redaction also rasterises the whole page.
- JPEG EXIF orientation is ignored; WebP is converted to PNG on import.
- Thumbnails do not show annotations (a badge shows the count). Very large files are held in memory twice (registry + pdfjs worker).
- Touch drag-reorder works from the grip handle only.
