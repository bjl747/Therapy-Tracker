# Studio — vision & decisions

Studio is the design tab of the GQR Allied Recruiter Hub: images, GIFs and
PDFs for a recruiting team. It started as a fork of Canvix (an open-source
Canva clone, kept in `legacy/canvix/` for reference) and was rebuilt from
scratch on the hub's stack.

## Who uses it, for what

| Job to be done | Today (Canva) | Studio |
|---|---|---|
| Post a job on social | Duplicate last post, retype 9 fields, hunt for a city photo, download, upload to LinkedIn | Pick/enter the job → every size + GIF made at once with the right city photo → copy straight to clipboard or download all |
| Many jobs at once | One by one | Paste rows (or later: pick Hot Jobs) → a kit per job, one ZIP |
| Edit a one-off graphic | Canva editor | Full editor (text, photos, shapes, layers, snapping, undo) |
| Combine / fix PDFs | Acrobat | PDF Studio: drop in many PDFs and images, reorder, rotate, delete, split, stamp text/images/signatures, real redaction, fill forms |
| Animated post | Canva animate | Built-in GIF export with Ken Burns photo pan and staggered element entrances |

## Principles (argued out, kept short)

1. **Content first, layout second.** Recruiters think in jobs, not in
   rectangles. The primary object is a *job* (fields); designs are views of
   it. Change the job once → every size updates. *(Rejected: "templates are
   just pre-filled designs" — that is what Canva does and why people retype
   the same 9 fields.)*
2. **No AI bill, still magic.** Everything runs in the browser with
   deterministic rules: nearest-city photo from coordinates, auto-fit text,
   layout constraints so long titles never break a design, a rule-based
   "remix" that produces brand-safe variations, image focus detection for
   cropping. *(Rejected: LLM captions — template captions with
   specialty-aware hashtags are good enough and free. Revisit only if the team
   asks for rewritten job descriptions.)*
3. **Brand lock by default.** Recruiters fill fields; managers edit templates.
   Locked elements cannot drift. A lint panel flags overflow, low contrast and
   text outside story safe-zones before export.
4. **One renderer.** The same Canvas 2D renderer draws the editor, the
   thumbnails and every export, so what you see is exactly what downloads.
   (No Konva — not approved; the editor is a canvas plus a thin
   interaction overlay.)
5. **Fewer clicks than Canva for the 90 % case**, full editor for the rest.
6. **Hub-native.** Hub stack, hub look (glass cards, tokens, Inter), hub
   access levels, `hub_studio` collections, demo mode, no new dependencies
   beyond the approved `pdfjs-dist` and `pdf-lib`.

## Explicitly out of scope

PowerPoint/presentations, video (MP4), websites, whiteboards, real-time
co-editing, social scheduling, LLM features.

## Open questions for BJ

- Hot Jobs field list and the pay-calculator hookup (connector ready in `src/studio/kit/connectors.ts`).
- Original logo files (current ones are cropped from a screenshot; transparent PNG/SVG wanted).
- GQR brand fonts — gqr.com blocked automated checks (see `docs/studio/BRAND-FONTS.md`).
- City photos: Wikimedia throttles cloud machines; finishing the download from a normal
  connection is fastest (`scripts/city-photos/README.md`).
- Which other sizes/brands the team posts.

## Decisions log

| Decision | Why |
|---|---|
| Own canvas editor, no Konva | Konva not approved; one renderer for screen + exports is a feature anyway |
| pdf.js + pdf-lib for PDFs | Approved by BJ; reliable on any PDF |
| No LLM | BJ's preference; deterministic captions/tidying/matching cover the need |
| GIF photo held still | moving photo made GIFs 10 MB; still photo + animated text ≈ 0.6 MB |
| Download names ASCII-only | Chrome saves non-ASCII names as "download" |
| Locked brand pieces can't be dragged even by managers | prevents accidents; unlock first |
