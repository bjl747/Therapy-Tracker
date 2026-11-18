import { create } from 'zustand'
import { releaseAllSources, releaseSource } from './raster'
import {
  type Annotation,
  type Hist,
  type PageItem,
  type Sel,
  EMPTY_SEL,
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
  selectAll,
  undoHist,
  uid,
} from './lib'

export type FormValue = string | boolean

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

interface State {
  sources: Record<string, SourceMeta>
  pages: PageItem[]
  sel: Sel
  hist: Hist<PageItem[]>
  txBase: PageItem[] | null
  formValues: Record<string, Record<string, FormValue>>
  flatten: boolean
  compress: { on: boolean; quality: number }
  fileName: string
  fileNameTouched: boolean
  loading: number
  notices: Notice[]

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
  undo: () => void
  redo: () => void
  /** Replace a page's annotations. Use transient + begin/endTx for drags. */
  setAnnotations: (pageId: string, annots: Annotation[], transient?: boolean) => void
  beginTx: () => void
  endTx: () => void
  setFormValue: (sourceId: string, name: string, v: FormValue | null) => void
  setFlatten: (v: boolean) => void
  setCompress: (c: Partial<{ on: boolean; quality: number }>) => void
  setFileName: (n: string) => void
  setLoading: (delta: number) => void
  notify: (kind: Notice['kind'], text: string) => void
  dismiss: (id: string) => void
  reset: () => void
}

const initial = {
  sources: {} as Record<string, SourceMeta>,
  pages: [] as PageItem[],
  sel: EMPTY_SEL,
  hist: emptyHist<PageItem[]>(),
  txBase: null as PageItem[] | null,
  formValues: {} as Record<string, Record<string, FormValue>>,
  flatten: true,
  compress: { on: false, quality: 0.7 },
  fileName: 'document',
  fileNameTouched: false,
  loading: 0,
  notices: [] as Notice[],
}

export const usePdfStudio = create<State>((set, get) => {
  /** Apply an undoable change to pages (and optionally selection). */
  const commit = (next: PageItem[], sel?: Sel) =>
    set((s) => {
      if (next === s.pages) return {}
      return { pages: next, hist: pushHist(s.hist, s.pages), sel: pruneSelection(sel ?? s.sel, next.map((p) => p.id)) }
    })

  return {
    ...initial,

    addSource: (meta, pages) =>
      set((s) => {
        const first = Object.keys(s.sources).length === 0
        const next = [...s.pages, ...pages]
        return {
          sources: { ...s.sources, [meta.id]: meta },
          pages: next,
          hist: pushHist(s.hist, s.pages),
          fileName: first && !s.fileNameTouched ? meta.name.replace(/\.[a-z0-9]{1,5}$/i, '') : s.fileName,
        }
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

    undo: () =>
      set((s) => {
        const r = undoHist(s.hist, s.pages)
        return r ? { pages: r.present, hist: r.hist, sel: pruneSelection(s.sel, r.present.map((p) => p.id)) } : {}
      }),
    redo: () =>
      set((s) => {
        const r = redoHist(s.hist, s.pages)
        return r ? { pages: r.present, hist: r.hist, sel: pruneSelection(s.sel, r.present.map((p) => p.id)) } : {}
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
        return { txBase: null, hist: pushHist(s.hist, s.txBase) }
      }),

    setFormValue: (sourceId, name, v) =>
      set((s) => {
        const cur = { ...(s.formValues[sourceId] ?? {}) }
        if (v === null) delete cur[name]
        else cur[name] = v
        return { formValues: { ...s.formValues, [sourceId]: cur } }
      }),
    setFlatten: (v) => set({ flatten: v }),
    setCompress: (c) => set((s) => ({ compress: { ...s.compress, ...c } })),
    setFileName: (n) => set({ fileName: n, fileNameTouched: true }),
    setLoading: (delta) => set((s) => ({ loading: Math.max(0, s.loading + delta) })),
    notify: (kind, text) => set((s) => ({ notices: [...s.notices.slice(-4), { id: uid('n'), kind, text }] })),
    dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
    reset: () => {
      // free every source's object URLs, thumbnails and pdf.js documents
      for (const id of Object.keys(get().sources)) releaseSource(id)
      releaseAllSources()
      set({ ...initial, hist: emptyHist<PageItem[]>() })
    },
  }
})
