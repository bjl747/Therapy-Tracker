---
name: studio-overview
description: Orientation for the GQR Studio project (Canva-style job-post, GIF and PDF tool built to drop into the GQR Allied Recruiter Hub). Load at the start of ANY session that touches this repo, before reading or changing code.
---

# Studio — start here

**What it is:** the "Studio" tab for BJ's GQR Allied Recruiter Hub. Recruiters
make job posts (images + GIFs) and edit PDFs. Started from Canvix (kept in
`legacy/canvix/`, reference only) and rebuilt on the hub's stack.

**Read next (in order):**
1. `docs/studio/VISION.md` — who uses it, principles, scope, open questions.
2. `docs/studio/ARCHITECTURE.md` — file map, key ideas, data model.
3. `docs/studio/LOOP-LOG.md` — what was built/critiqued each round, and what's next.
4. The README in the folder you're about to touch (`src/studio/*/README.md`).

**Run it**
- `npm install`, then `npm run dev` (demo mode is automatic without Firebase env vars) → http://localhost:5173/studio
- `npm test` (vitest), `npx tsc -b` (must be clean), `npm run build`.
- Visual checks: Playwright + Chromium are preinstalled in cloud sessions;
  screenshot at 1440×900 and 390×844, light and dark (`document.documentElement.classList.add('dark')`).

**Hard rules (from the hub's stack brief — don't break them)**
- Stack: React 18.3, TS 5.7 strict, Vite 6, Tailwind 3.4, react-router 7, zustand 4,
  lucide-react, date-fns, clsx, Firebase 12. Approved extras: `pdfjs-dist`, `pdf-lib`.
  **No other dependency without asking BJ** (Konva was declined — the editor is our own).
- Everything in `src/` outside `src/studio/` is a HUB SHIM. Real code goes in `src/studio/`.
- Hub look: glass `.card`, tokens in `src/index.css`, Inter, `.eyebrow` labels,
  no max-width caps, reflow 3440px → 360px, light + dark, skeletons not spinners,
  pop-ups portal to body and Esc closes only the top one.
- No AI/LLM APIs (BJ's preference) — "magic" is deterministic rules.
- Uploads are approved only for brand files/photos and PDF documents.
- Clean anything shown from stored data (`safeUrl`, `sanitizeText` in `src/lib/sanitize.ts`).

**User:** BJ is not a coder — explain in plain terms, short answers.

**Before you finish a session:** run the `studio-session-wrapup` skill.
