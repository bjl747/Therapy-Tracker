import { create } from 'zustand'
import { releaseAllSources, releaseSource } from './raster'
import {
  type Annotation,
  type Hist,
  type PageItem,
  type PageLayout,
  type Sel,
  EMPTY_SEL,
  baseName,
  clickSelect,
  deletePages,
  duplicatePages,
  emptyHist,
  insertAfterSelection,
  makeBlankPage,
  moveToEdge,
  movePages,
  pruneSelection,
  pushHist,
  redoHist,
  rotatePages,
  sameOrder,
  selectAll,
  undoHist,
  uid,
  widePageIds,
} from './lib'

export type FormValue = string | boolean
export type FormValues = Record<string, Record<string, FormValue>>

export interface FormField {
  name: string
  type: 'text' | 'checkbox' | 'dropdown' | 'radio'
  value: FormValue
  options?: string[]
  multiline?: boolean
  readOnly: boolean
}

export interface SourceMeta {
  id: string
  name: string
  kind: 'pdf' | 'image'
  bytes: number
  pageCount: number
  /** pdfjs could open it (thumbnails / rasterisation work). */
  renderable: boolean
  /** pdf-lib cannot copy its pages faithfully (encrypted / unparsable): export rasterises them. */
  rasterOnly: boolean
  fields: FormField[]
}

export interface Notice {
  id: string
  kind: 'error' | 'info'
  text: string
}

/** One undo step: the page list and the form values together. */
export interface Snap {
  pages: PageItem[]
  formValues: FormValues
}

/* ------------------------------------------------------------ pure helpers (tested) */

/** Source ids that still have a page in the document, in the order they first appear. */
export function usedSourceIds(pages: PageItem[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of pages) {
    if (p.src.kind === 'blank' || seen.has(p.src.sourceId)) continue
    seen.add(p.src.sourceId)
    out.push(p.src.sourceId)
  }
  return out
}

export function pagesOfSource(pages: PageItem[], sourceId: string): string[] {
  return pages.filter((p) => p.src.kind !== 'blank' && p.src.sourceId === sourceId).map((p) => p.id)
}

/**
 * Move every page of one file as a block before the previous file (dir -1) or after the next file (dir 1),
 * files ordered by first appearance. Blank pages stay where they are. Returns `pages` unchanged at an edge.
 */
export function moveSourceBlock(pages: PageItem[], sourceId: string, dir: -1 | 1): PageItem[] {
  const order = usedSourceIds(pages)
  const i = order.indexOf(sourceId)
  const other = order[i + dir]
  if (i < 0 || !other) return pages
  const ids = pagesOfSource(pages, sourceId)
  const otherIdx = pages.flatMap((p, k) => (p.src.kind !== 'blank' && p.src.sourceId === other ? [k] : []))
  const to = dir < 0 ? otherIdx[0] : otherIdx[otherIdx.length - 1] + 1
  const next = movePages(pages, ids, to)
  return sameOrder(next, pages) ? pages : next
}

/**
 * Suggested output name: the first PDF still in the document (in the order files were added) plus " - Packet",
 * else the first file still in it; 'document' when empty.
 */
export function autoFileName(pages: PageItem[], sources: Record<string, SourceMeta>): string {
  const used = new Set(usedSourceIds(pages))
  const list = Object.values(sources).filter((s) => used.has(s.id))
  const pick = list.find((s) => s.kind === 'pdf') ?? list[0]
  return pick ? `${baseName(pick.name).trim() || 'document'} - Packet` : 'document'
}

/** "cert", "cert (2)", "cert (3)": a name not yet in `used` (case-insensitive); adds it to `used`. */
export function uniqueName(name: string, used: Set<string>): string {
  let out = name
  for (let n = 2; used.has(out.toLowerCase()); n++) out = `${name} (${n})`
  used.add(out.toLowerCase())
  return out
}

/* ------------------------------------------------------------------- store */

interface State {
  sources: Record<string, SourceMeta>
  pages: PageItem[]
  sel: Sel
  hist: Hist<Snap>
  txBase: PageItem[] | null
  formValues: FormValues
  flatten: boolean
  /** Output layout (not part of undo). */
  layout: PageLayout
  fileName: string
  /** The user typed a name: stop suggesting one. */
  fileNameTouched: boolean
  loading: number
  notices: Notice[]
  /** Hub user the open documents belong to (cleared when someone else opens PDF Studio). */
  owner: string | null

  addSource: (meta: SourceMeta, pages: PageItem[]) => void
  click: (id: string, mods: { shift?: boolean; toggle?: boolean }) => void
  setSel: (sel: Sel) => void
  selectAllPages: () => void
  clearSel: () => void
  rotateSel: (delta: number) => void
  deleteSel: () => void
  duplicateSel: () => void
  insertBlank: () => void
  moveSel: (edge: 'start' | 'end') => void
  /** Move `ids` before original index `toIndex`. */
  reorder: (ids: string[], toIndex: number) => void
  /** Select every page of one file. */
  selectSource: (sourceId: string) => void
  /** Remove every page of one file (undoable; the selection is only pruned). */
  removeSource: (sourceId: string) => void
  /** Move one file's pages as a block past the previous / next file (undoable). */
  moveSource: (sourceId: string, dir: -1 | 1) => void
  /** Turn every landscape page a quarter turn so it fills the portrait sheet (one undo step). */
  turnWidePages: () => void
  setLayout: (l: PageLayout) => void
  undo: () => void
  redo: () => void
  /** Replace a page's annotations. Use transient + begin/endTx for drags. */
  setAnnotations: (pageId: string, annots: Annotation[], transient?: boolean) => void
  beginTx: () => void
  endTx: () => void
  setFormValue: (sourceId: string, name: string, v: FormValue | null) => void
  setFlatten: (v: boolean) => void
  setFileName: (n: string) => void
  setLoading: (delta: number) => void
  notify: (kind: Notice['kind'], text: string) => void
  dismiss: (id: string) => void
  /** Clear everything (not undoable). */
  reset: () => void
  /** PDF Studio opened by `owner`: anything left by another user (or before a sign-out) is cleared first. */
  claim: (owner: string) => void
}

const initial = () => ({
  sources: {} as Record<string, SourceMeta>,
  pages: [] as PageItem[],
  sel: EMPTY_SEL,
  hist: emptyHist<Snap>(),
  txBase: null as PageItem[] | null,
  formValues: {} as FormValues,
  flatten: false,
  layout: 'letter' as PageLayout,
  fileName: 'document',
  fileNameTouched: false,
  loading: 0,
  notices: [] as Notice[],
})

/** The form field typed into last: consecutive edits of one field are one undo step. */
let lastFormEdit: string | null = null

export const usePdfStudio = create<State>((set, get) => {
  type S = State
  const snap = (s: S): Snap => ({ pages: s.pages, formValues: s.formValues })
  /** The suggested name for `pages`, unless the user typed one. */
  const named = (s: S, pages: PageItem[], sources = s.sources) =>
    s.fileNameTouched ? {} : { fileName: autoFileName(pages, sources) }

  /** Apply an undoable change to pages (and optionally selection). A change that moves nothing is dropped. */
  const commit = (next: PageItem[], sel?: Sel) =>
    set((s) => {
      if (next === s.pages || sameOrder(next, s.pages)) return {}
      lastFormEdit = null
      return {
        pages: next,
        hist: pushHist(s.hist, snap(s)),
        sel: pruneSelection(sel ?? s.sel, next.map((p) => p.id)),
        ...named(s, next),
      }
    })

  const restore = (s: S, r: { hist: Hist<Snap>; present: Snap }) => {
    lastFormEdit = null
    return {
      pages: r.present.pages,
      formValues: r.present.formValues,
      hist: r.hist,
      sel: pruneSelection(s.sel, r.present.pages.map((p) => p.id)),
      ...named(s, r.present.pages),
    }
  }

  return {
    ...initial(),
    owner: null,

    addSource: (meta, pages) =>
      set((s) => {
        lastFormEdit = null
        const sources = { ...s.sources, [meta.id]: meta }
        const next = [...s.pages, ...pages]
        return { sources, pages: next, hist: pushHist(s.hist, snap(s)), ...named(s, next, sources) }
      }),

    click: (id, mods) => set((s) => ({ sel: clickSelect(s.sel, s.pages.map((p) => p.id), id, mods) })),
    setSel: (sel) => set({ sel }),
    selectAllPages: () => set((s) => ({ sel: selectAll(s.pages.map((p) => p.id)) })),
    clearSel: () => set({ sel: EMPTY_SEL }),

    rotateSel: (delta) => {
      const { pages, sel } = get()
      if (sel.ids.length) commit(rotatePages(pages, sel.ids, delta))
    },
    deleteSel: () => {
      const { pages, sel } = get()
      if (sel.ids.length) commit(deletePages(pages, sel.ids), EMPTY_SEL)
    },
    duplicateSel: () => {
      const { pages, sel } = get()
      if (!sel.ids.length) return
      const d = duplicatePages(pages, sel.ids)
      commit(d.pages, { ids: d.newIds, anchor: d.newIds[0] ?? null })
    },
    insertBlank: () => {
      const { pages, sel } = get()
      const blank = makeBlankPage()
      commit(insertAfterSelection(pages, sel.ids, blank), { ids: [blank.id], anchor: blank.id })
    },
    moveSel: (edge) => {
      const { pages, sel } = get()
      if (sel.ids.length) commit(moveToEdge(pages, sel.ids, edge))
    },
    reorder: (ids, toIndex) => {
      const { pages } = get()
      commit(movePages(pages, ids, toIndex))
    },

    selectSource: (sourceId) => {
      const ids = pagesOfSource(get().pages, sourceId)
      set({ sel: ids.length ? { ids, anchor: ids[0] } : EMPTY_SEL })
    },
    removeSource: (sourceId) => {
      const { pages } = get()
      const ids = pagesOfSource(pages, sourceId)
      if (ids.length) commit(deletePages(pages, ids))
    },
    moveSource: (sourceId, dir) => commit(moveSourceBlock(get().pages, sourceId, dir)),

    turnWidePages: () => {
      const { pages, notify } = get()
      const ids = widePageIds(pages)
      if (!ids.length) {
        notify('info', 'No wide pages: every page already stands upright on the sheet.')
        return
      }
      commit(rotatePages(pages, ids, -90))
      notify('info', `Turned ${ids.length} wide ${ids.length === 1 ? 'page' : 'pages'} sideways. Undo puts ${ids.length === 1 ? 'it' : 'them'} back.`)
    },
    setLayout: (layout) => set({ layout }),

    undo: () =>
      set((s) => {
        const r = undoHist(s.hist, snap(s))
        return r ? restore(s, r) : {}
      }),
    redo: () =>
      set((s) => {
        const r = redoHist(s.hist, snap(s))
        return r ? restore(s, r) : {}
      }),

    setAnnotations: (pageId, annots, transient) => {
      const { pages } = get()
      const next = pages.map((p) => (p.id === pageId ? { ...p, annotations: annots } : p))
      if (transient) set({ pages: next })
      else commit(next)
    },
    beginTx: () => set((s) => ({ txBase: s.pages })),
    endTx: () =>
      set((s) => {
        if (!s.txBase) return {}
        if (s.txBase === s.pages) return { txBase: null }
        lastFormEdit = null
        return { txBase: null, hist: pushHist(s.hist, { pages: s.txBase, formValues: s.formValues }) }
      }),

    setFormValue: (sourceId, name, v) =>
      set((s) => {
        const cur = { ...(s.formValues[sourceId] ?? {}) }
        if (v === null) delete cur[name]
        else cur[name] = v
        const key = `${sourceId}\u0000${name}`
        // typing into one field is one undo step; the first keystroke saves the values from before it
        const hist = lastFormEdit === key ? s.hist : pushHist(s.hist, snap(s))
        lastFormEdit = key
        return { formValues: { ...s.formValues, [sourceId]: cur }, hist }
      }),
    setFlatten: (v) => set({ flatten: v }),
    setFileName: (n) => set({ fileName: n, fileNameTouched: true }),
    setLoading: (delta) => set((s) => ({ loading: Math.max(0, s.loading + delta) })),
    notify: (kind, text) => set((s) => ({ notices: [...s.notices.slice(-4), { id: uid('n'), kind, text }] })),
    dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
    reset: () => {
      // free every source's object URLs, thumbnails and pdf.js documents
      for (const id of Object.keys(get().sources)) releaseSource(id)
      releaseAllSources()
      lastFormEdit = null
      set({ ...initial() })
    },
    claim: (owner) => {
      if (get().owner === owner) return
      get().reset()
      set({ owner })
    },
  }
})
