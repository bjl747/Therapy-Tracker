---
name: studio-templates
description: How to author or change Studio templates (template families with fields, {{markers}}, bound city photos, brand locks, animations, multiple sizes). Use when adding a new job-post design, a new size, or changing the GQR brand template.
---

# Authoring Studio templates

**Admins do this in the app** (Studio → Templates (admin)): change locked values, edit fields
(label, default, type, group, lock), add/remove sizes, "Edit design" on any size (opens the
editor in template mode → "Save to template"), create/copy/delete templates, "Reset to original"
for built-ins. Saved templates live in the repo and replace the built-in with the same id
(`src/studio/templates/store.ts`, helpers + tests in `templates/admin.ts`). Code-authored
built-ins below are only the starting point.

A template is a **family**: one `fieldDefs` list + one layout per size
(`src/studio/templates/types.ts`). Examples: `src/studio/templates/jobPost.ts` (one job, 4 sizes), `roundup.ts` (up to 5 jobs).
Register built-ins in `src/studio/templates/index.ts`.

## Rules
- **Fields**: `{ key, label, example, kind?, group? }`. `kind: 'location'` drives the city
  photo; `money` gets money formatting in the Job Kit (`kit/normalize.ts → tidyField`).
- **Locked fields** (BJ's rule): anything fixed by the template — job type, benefits line, call to
  action, website — gets `locked: true` on the FieldDef AND on the text element that shows it.
  Recruiters never see them in the Job Kit form (a "Set by the template" box shows the values),
  pasted spreadsheet columns can't map onto them, Hot Jobs can't override them, `instantiate()`
  always uses the template value, and the editor store refuses `setFields` for them unless the
  user is a manager. Change the value by editing the template's `example`.
- **Text** uses `{{key}}` markers. Use `fit: 'shrink'` (default) for anything variable so long
  titles never overflow; `fit: 'fixed'` for static labels.
- **City photo**: `image({ bind: 'location', kenBurns: true, ... })`. Users can pin another
  photo via `fields.location__photo`.
- **Optional rows**: `showIf: 'field_key'` hides an element (and skips it in the linter) when
  that field is empty — used by the roundup (`templates/roundup.ts`) so 1–5 jobs all look right.
- **Brand locks**: logos, brand bars → `locked: true` (only managers can move them).
- **Animation** (GIF): give elements `anim: { kind, delay, duration }` — stagger ~0.1–0.3 s,
  photo fades first, pill pops, details rise. Set `page.duration` (5–6 s).
- **Sizes**: keys from `SIZES` in `engine/model.ts` (square, portrait, story, landscape…).
  Story (1080×1920): keep text out of the top 250 px and bottom 340 px (app UI covers them).
- Brand colours live in `BRAND` (jobPost.ts). Logos in `public/brand/` (placeholders today —
  BJ will send originals).

## Check
`npm test`, then open `/studio/kit` and look at every size with a long job title
(e.g. "Cardiovascular Interventional Technologist") and a long location
("Rancho Santa Margarita, CA") — nothing may overflow or overlap. The editor's
"Ready to post" check lists overflow/contrast/missing-field issues.
