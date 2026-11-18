---
name: studio-session-wrapup
description: End-of-session checklist for the Studio project — keeps the docs and skills true so the next session (or another person) understands everything. Run before the final commit of any session that changed Studio.
---

# Wrap up a Studio session

1. **Tests & types:** `npx tsc -b` clean, `npm test` green, `npm run build` succeeds. Fix or
   clearly log anything that isn't.
2. **Log the work:** add a dated entry to `docs/studio/LOOP-LOG.md` — what changed, what was
   critiqued, what's next. Keep the "Next up" list at the top current.
3. **Keep docs true:**
   - New/moved files → `docs/studio/ARCHITECTURE.md` file map.
   - New decision or scope change → `docs/studio/VISION.md` (decisions + reason).
   - Folder behaviour changed → that folder's `README.md`.
   - New template → `studio-templates` skill if the authoring rules changed.
   - Hub touch points (feature key, routes, rules, collections, deps) changed →
     `studio-hub-migration` skill.
4. **Skills:** if you learned something a future session needs (a gotcha, a command,
   a rule from BJ), add it to the most relevant skill in `.claude/skills/`.
5. **Commit** with a plain-English message and push to the session branch.
