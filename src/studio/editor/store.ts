// ─────────────────────────────────────────────────────────────
// Editor store (zustand). All edits go through here so undo/redo, brand
// locks and dirty-tracking are consistent.
//
// Undo model: every action that changes the design pushes the PREVIOUS
// design onto `past`. Continuous gestures (drag, resize, slider) call
// beginGesture() once, then update with {transient: true} on every frame,
// and endGesture() — so a whole drag is a single undo step.
// ─────────────────────────────────────────────────────────────

import { create } from 'zustand'
import {
  cloneEl,
  clonePage,
  isDrawn,
  page as newPage,
  uid,
  type Design,
  type El,
  type ImageEl,
  type Page,
  type PageBg,
} from '../engine/model'
import { aabb, alignMoves, distributeMoves, unionRect, type AlignKind } from '../engine/geometry'

const MAX_HISTORY = 120

/** A template's photo frame (BJ, 2026-11-19: "That frame shape, size and position should be locked. They can only
 *  change out the photo and crop the photo in that frame."): a locked image, or the photo that follows a field (the
 *  job post's city photo). For everyone but admins it can't be moved, resized, turned, reshaped or deleted, but its
 *  photo can be swapped and cropped (`setPhoto`). */
export const isTemplateFrame = (el: El): el is ImageEl => el.type === 'image' && (!!el.locked || !!el.bind)
/** the navy panel the job post's city photo sits in (templates/jobPost.ts `photoFrame`): part of the template's
 *  frame, so it is locked for recruiters with the photo (matched by its template name, so designs already saved get it) */
export const isFramePanel = (el: El): boolean => el.type === 'shape' && el.name === 'Photo frame'
/** locked for this person: brand locks, template photo frames (see isTemplateFrame) and their panel */
export const lockedFor = (el: El, canEditLocked: boolean): boolean => !canEditLocked && (!!el.locked || isTemplateFrame(el) || isFramePanel(el))

/** what a photo swap or a crop may change on an image, locked or not */
export type PhotoPatch = Partial<Pick<ImageEl, 'src' | 'bind' | 'credit' | 'focus' | 'zoom' | 'cropFor' | 'fit' | 'locked' | 'name'>>
const PHOTO_KEYS = new Set(['src', 'bind', 'credit', 'focus', 'zoom', 'cropFor', 'fit', 'locked', 'name'])

export type Tool = 'select' | 'hand'
export type GestureKind = 'pointer' | 'edit'

interface EditorState {
  design: Design | null
  pageIndex: number
  selection: string[]
  editingTextId: string | null
  tool: Tool
  /** fit-to-screen when null */
  zoom: number | null
  past: Design[]
  future: Design[]
  /** design changed since last save */
  dirty: boolean
  /** managers may move/edit brand-locked elements */
  canEditLocked: boolean
  /** read-only (access level 'view') */
  readOnly: boolean
  /** the Fields (job details) may be changed even when read-only: a Job Kit post opened by someone with View
   *  (BJ, 2026-11-19: "they still need to be able to edit in the form in that screen"). Never saved to the hub. */
  editFields: boolean
  gestureBase: Design | null
  /** what kind of gesture is open: 'pointer' = drag / resize / rotate /
   *  slider scrub (autosave waits for it, undo is ignored during it);
   *  'edit' = a Fields input or inline text visit (one undo step per visit,
   *  but autosave keeps saving while you type) */
  gestureKind: GestureKind | null

  load: (d: Design, opts?: { canEditLocked?: boolean; readOnly?: boolean; editFields?: boolean }) => void
  close: () => void
  markSaved: () => void
  setPage: (i: number) => void
  setZoom: (z: number | null) => void
  setTool: (t: Tool) => void
  select: (ids: string[], mode?: 'replace' | 'add' | 'toggle') => void
  selectAll: () => void
  setEditingText: (id: string | null) => void

  beginGesture: (kind?: GestureKind) => void
  endGesture: () => void
  /** low-level: replace the design (pushes history unless transient) */
  apply: (fn: (d: Design) => Design, opts?: { transient?: boolean }) => void

  updateEl: (id: string, patch: Partial<El>, opts?: { transient?: boolean }) => void
  updateEls: (patches: Record<string, Partial<El>>, opts?: { transient?: boolean }) => void
  /** swap or crop a photo: allowed on template frames too (only the photo keys in PhotoPatch are applied) */
  setPhoto: (id: string, patch: PhotoPatch, opts?: { transient?: boolean }) => void
  addEl: (el: El, opts?: { select?: boolean }) => void
  deleteSelected: () => void
  duplicateSelected: () => void
  nudge: (dx: number, dy: number) => void
  order: (where: 'front' | 'back' | 'forward' | 'backward') => void
  group: () => void
  ungroup: () => void
  align: (k: AlignKind) => void
  distribute: (axis: 'x' | 'y') => void
  toggleLock: () => void

  setFields: (patch: Record<string, string>) => void
  rename: (name: string) => void
  setBg: (bg: Partial<PageBg>) => void
  addPage: (after?: number) => void
  duplicatePage: (i?: number) => void
  deletePage: (i?: number) => void
  movePage: (from: number, to: number) => void
  setPageDuration: (s: number) => void

  undo: () => void
  redo: () => void
}

export const currentPage = (s: Pick<EditorState, 'design' | 'pageIndex'>): Page | null =>
  s.design ? s.design.pages[Math.min(s.pageIndex, s.design.pages.length - 1)] ?? null : null

export const selectedEls = (s: Pick<EditorState, 'design' | 'pageIndex' | 'selection'>): El[] => {
  const p = currentPage(s)
  if (!p) return []
  const set = new Set(s.selection)
  return p.elements.filter((e) => set.has(e.id))
}

function mapPage(d: Design, i: number, fn: (p: Page) => Page): Design {
  return { ...d, pages: d.pages.map((p, j) => (j === i ? fn(p) : p)), updatedAt: Date.now() }
}

/** expand a selection to whole groups */
function withGroups(p: Page, ids: string[]): string[] {
  const groups = new Set(p.elements.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId!))
  if (!groups.size) return ids
  return p.elements.filter((e) => ids.includes(e.id) || (e.groupId && groups.has(e.groupId))).map((e) => e.id)
}

export const useEditor = create<EditorState>((set, get) => {
  /** ids the user may change (brand locks respected) */
  const editable = (ids: string[]): string[] => {
    const s = get()
    if (s.readOnly) return []
    const p = currentPage(s)
    if (!p) return []
    return ids.filter((id) => {
      const el = p.elements.find((e) => e.id === id)
      return el && !lockedFor(el, s.canEditLocked)
    })
  }

  const commit = (next: Design, opts?: { transient?: boolean }) => {
    const s = get()
    if (!s.design || s.readOnly) return
    if (opts?.transient || s.gestureBase) {
      set({ design: next, dirty: true })
      return
    }
    set({ design: next, past: [...s.past, s.design].slice(-MAX_HISTORY), future: [], dirty: true })
  }

  return {
    design: null,
    pageIndex: 0,
    selection: [],
    editingTextId: null,
    tool: 'select',
    zoom: null,
    past: [],
    future: [],
    dirty: false,
    canEditLocked: false,
    readOnly: false,
    editFields: true,
    gestureBase: null,
    gestureKind: null,

    load: (d, opts) =>
      set({
        design: d,
        pageIndex: 0,
        selection: [],
        editingTextId: null,
        past: [],
        future: [],
        dirty: false,
        zoom: null,
        canEditLocked: opts?.canEditLocked ?? false,
        readOnly: opts?.readOnly ?? false,
        editFields: !(opts?.readOnly ?? false) || !!opts?.editFields,
        gestureBase: null,
        gestureKind: null,
      }),
    close: () => set({ design: null, selection: [], past: [], future: [], editingTextId: null, gestureBase: null, gestureKind: null }),
    markSaved: () => set({ dirty: false }),
    setPage: (i) => {
      const d = get().design
      if (!d) return
      set({ pageIndex: Math.max(0, Math.min(i, d.pages.length - 1)), selection: [], editingTextId: null })
    },
    setZoom: (z) => set({ zoom: z === null ? null : Math.max(0.05, Math.min(8, z)) }),
    setTool: (t) => set({ tool: t }),
    select: (ids, mode = 'replace') => {
      const s = get()
      const p = currentPage(s)
      if (!p) return
      const full = withGroups(p, ids)
      let next: string[]
      if (mode === 'replace') next = full
      else if (mode === 'add') next = [...new Set([...s.selection, ...full])]
      else {
        const on = full.every((id) => s.selection.includes(id))
        next = on ? s.selection.filter((id) => !full.includes(id)) : [...new Set([...s.selection, ...full])]
      }
      set({ selection: next, editingTextId: next.includes(s.editingTextId ?? '') ? s.editingTextId : null })
    },
    selectAll: () => {
      const s = get()
      const p = currentPage(s)
      if (p) set({ selection: p.elements.filter((e) => isDrawn(e, s.design?.fields)).map((e) => e.id) })
    },
    setEditingText: (id) => set({ editingTextId: id }),

    beginGesture: (kind = 'pointer') => {
      const s = get()
      if (!s.design) return
      if (!s.gestureBase) set({ gestureBase: s.design, gestureKind: kind })
      // a pointer gesture inside an open edit (e.g. a slider while a field is
      // focused) shares its undo step but must still hold autosave back
      else if (kind === 'pointer' && s.gestureKind !== 'pointer') set({ gestureKind: 'pointer' })
    },
    endGesture: () => {
      const s = get()
      if (!s.gestureBase) return
      const changed = s.gestureBase !== s.design
      set({
        gestureBase: null,
        gestureKind: null,
        ...(changed ? { past: [...s.past, s.gestureBase].slice(-MAX_HISTORY), future: [] } : {}),
      })
    },
    apply: (fn, opts) => {
      const d = get().design
      if (d) commit(fn(d), opts)
    },

    updateEl: (id, patch, opts) => get().updateEls({ [id]: patch }, opts),
    setPhoto: (id, patch, opts) => {
      const s = get()
      if (!s.design || s.readOnly) return
      const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => PHOTO_KEYS.has(k))) as PhotoPatch
      commit(
        mapPage(s.design, s.pageIndex, (p) => ({
          ...p,
          elements: p.elements.map((e) => {
            if (e.id !== id || e.type !== 'image') return e
            const next = { ...e, ...clean } as ImageEl
            // keys set to undefined are removed (the hub's database refuses undefined)
            for (const k of Object.keys(clean) as (keyof PhotoPatch)[]) if (clean[k] === undefined) delete next[k]
            return next
          }),
        })),
        opts,
      )
    },
    updateEls: (patches, opts) => {
      const s = get()
      if (!s.design) return
      const ok = new Set(editable(Object.keys(patches)))
      if (!ok.size) return
      commit(
        mapPage(s.design, s.pageIndex, (p) => ({
          ...p,
          elements: p.elements.map((e) => (ok.has(e.id) ? ({ ...e, ...patches[e.id] } as El) : e)),
        })),
        opts,
      )
    },
    addEl: (el, opts) => {
      const s = get()
      if (!s.design || s.readOnly) return
      commit(mapPage(s.design, s.pageIndex, (p) => ({ ...p, elements: [...p.elements, el] })))
      if (opts?.select !== false) set({ selection: [el.id] })
    },
    deleteSelected: () => {
      const s = get()
      if (!s.design) return
      const ids = new Set(editable(s.selection))
      if (!ids.size) return
      commit(mapPage(s.design, s.pageIndex, (p) => ({ ...p, elements: p.elements.filter((e) => !ids.has(e.id)) })))
      set({ selection: [], editingTextId: null })
    },
    duplicateSelected: () => {
      const s = get()
      const p = currentPage(s)
      if (!s.design || !p || s.readOnly) return
      const sel = p.elements.filter((e) => s.selection.includes(e.id))
      if (!sel.length) return
      const groupMap = new Map<string, string>()
      const copies = sel.map((e) => {
        const c = cloneEl(e)
        c.x += 24
        c.y += 24
        c.locked = false
        if (e.groupId) {
          if (!groupMap.has(e.groupId)) groupMap.set(e.groupId, uid('g'))
          c.groupId = groupMap.get(e.groupId)
        }
        return c
      })
      commit(mapPage(s.design, s.pageIndex, (pg) => ({ ...pg, elements: [...pg.elements, ...copies] })))
      set({ selection: copies.map((c) => c.id) })
    },
    nudge: (dx, dy) => {
      const s = get()
      const els = selectedEls(s)
      const patches: Record<string, Partial<El>> = {}
      for (const e of els) patches[e.id] = { x: e.x + dx, y: e.y + dy }
      get().updateEls(patches)
    },
    order: (where) => {
      const s = get()
      if (!s.design) return
      const ids = new Set(editable(s.selection))
      if (!ids.size) return
      commit(
        mapPage(s.design, s.pageIndex, (p) => {
          const els = [...p.elements]
          if (where === 'front') return { ...p, elements: [...els.filter((e) => !ids.has(e.id)), ...els.filter((e) => ids.has(e.id))] }
          if (where === 'back') return { ...p, elements: [...els.filter((e) => ids.has(e.id)), ...els.filter((e) => !ids.has(e.id))] }
          if (where === 'forward') {
            for (let i = els.length - 2; i >= 0; i--)
              if (ids.has(els[i].id) && !ids.has(els[i + 1].id)) [els[i], els[i + 1]] = [els[i + 1], els[i]]
          } else {
            for (let i = 1; i < els.length; i++)
              if (ids.has(els[i].id) && !ids.has(els[i - 1].id)) [els[i], els[i - 1]] = [els[i - 1], els[i]]
          }
          return { ...p, elements: els }
        }),
      )
    },
    group: () => {
      const ids = editable(get().selection)
      if (ids.length < 2) return
      const g = uid('g')
      get().updateEls(Object.fromEntries(ids.map((id) => [id, { groupId: g }])))
    },
    ungroup: () => {
      const ids = editable(get().selection)
      get().updateEls(Object.fromEntries(ids.map((id) => [id, { groupId: undefined }])))
    },
    align: (k) => {
      const s = get()
      if (!s.design) return
      const els = selectedEls(s).filter((e) => editable([e.id]).length)
      // a group behaves as one box
      const moves = alignMoves(els, k, s.design)
      if (els.length > 1 && new Set(els.map((e) => e.groupId ?? e.id)).size === 1) {
        const box = unionRect(els.map(aabb))!
        const proxy = { ...els[0], id: '__group', x: box.x, y: box.y, w: box.w, h: box.h, rotation: 0 }
        const m = alignMoves([proxy], k, s.design).__group
        for (const e of els) moves[e.id] = m
      }
      get().updateEls(Object.fromEntries(els.map((e) => [e.id, { x: e.x + moves[e.id].x, y: e.y + moves[e.id].y }])))
    },
    distribute: (axis) => {
      const els = selectedEls(get())
      const moves = distributeMoves(els, axis)
      get().updateEls(
        Object.fromEntries(els.filter((e) => moves[e.id]).map((e) => [e.id, { x: e.x + moves[e.id].x, y: e.y + moves[e.id].y }])),
      )
    },
    toggleLock: () => {
      const s = get()
      if (!s.canEditLocked || !s.design) return
      const els = selectedEls(s)
      const lock = !els.every((e) => e.locked)
      commit(
        mapPage(s.design, s.pageIndex, (p) => ({
          ...p,
          elements: p.elements.map((e) => (s.selection.includes(e.id) ? { ...e, locked: lock } : e)),
        })),
      )
    },

    setFields: (patch) => {
      const s = get()
      const { design: d, canEditLocked } = s
      if (!d || !s.editFields) return
      const locked = new Set((d.fieldDefs ?? []).filter((f) => f.locked).map((f) => f.key))
      const allowed = canEditLocked ? patch : Object.fromEntries(Object.entries(patch).filter(([k]) => !locked.has(k)))
      if (!Object.keys(allowed).length) return
      const next = { ...d, fields: { ...d.fields, ...allowed }, updatedAt: Date.now() }
      if (!s.readOnly) return commit(next)
      // read-only with the form open (a View user's Job Kit post): the change stays on screen, nothing is saved
      set(s.gestureBase ? { design: next } : { design: next, past: [...s.past, d].slice(-MAX_HISTORY), future: [] })
    },
    rename: (name) => {
      const d = get().design
      if (d) commit({ ...d, name: name.slice(0, 120) || 'Untitled design' })
    },
    setBg: (bg) => {
      const s = get()
      if (s.design) commit(mapPage(s.design, s.pageIndex, (p) => ({ ...p, bg: { ...p.bg, ...bg } })))
    },
    addPage: (after) => {
      const s = get()
      if (!s.design) return
      const at = (after ?? s.pageIndex) + 1
      const pages = [...s.design.pages]
      pages.splice(at, 0, newPage({ bg: { color: currentPage(s)?.bg.color ?? '#FFFFFF' } }))
      commit({ ...s.design, pages })
      set({ pageIndex: at, selection: [] })
    },
    duplicatePage: (i) => {
      const s = get()
      if (!s.design) return
      const at = i ?? s.pageIndex
      const pages = [...s.design.pages]
      pages.splice(at + 1, 0, clonePage(pages[at]))
      commit({ ...s.design, pages })
      set({ pageIndex: at + 1, selection: [] })
    },
    deletePage: (i) => {
      const s = get()
      if (!s.design || s.design.pages.length <= 1) return
      const at = i ?? s.pageIndex
      commit({ ...s.design, pages: s.design.pages.filter((_, j) => j !== at) })
      set({ pageIndex: Math.max(0, Math.min(at, s.design.pages.length - 2)), selection: [] })
    },
    movePage: (from, to) => {
      const s = get()
      if (!s.design || from === to) return
      const pages = [...s.design.pages]
      const [p] = pages.splice(from, 1)
      pages.splice(to, 0, p)
      commit({ ...s.design, pages })
      set({ pageIndex: to })
    },
    setPageDuration: (sec) => {
      const s = get()
      if (s.design) commit(mapPage(s.design, s.pageIndex, (p) => ({ ...p, duration: Math.max(1, Math.min(20, sec)) })))
    },

    undo: () => {
      // never mid-drag: the gesture would later push a stale base (history corruption)
      if (get().gestureKind === 'pointer') return
      // a field / inline-text visit counts as done: its edits become the step being undone
      if (get().gestureBase) get().endGesture()
      const s = get()
      if (!s.past.length || !s.design) return
      const prev = s.past[s.past.length - 1]
      set({
        design: prev,
        past: s.past.slice(0, -1),
        future: [s.design, ...s.future].slice(0, MAX_HISTORY),
        pageIndex: Math.min(s.pageIndex, prev.pages.length - 1),
        selection: s.selection.filter((id) => prev.pages.some((p) => p.elements.some((e) => e.id === id))),
        editingTextId: null,
        dirty: true,
      })
    },
    redo: () => {
      if (get().gestureKind === 'pointer') return
      if (get().gestureBase) get().endGesture()
      const s = get()
      if (!s.future.length || !s.design) return
      const next = s.future[0]
      set({
        design: next,
        future: s.future.slice(1),
        past: [...s.past, s.design].slice(-MAX_HISTORY),
        pageIndex: Math.min(s.pageIndex, next.pages.length - 1),
        editingTextId: null,
        dirty: true,
      })
    },
  }
})
