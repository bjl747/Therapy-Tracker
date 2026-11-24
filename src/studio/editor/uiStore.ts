// Editor chrome state that is NOT part of the document (so never undoable,
// never saved): open panels, pan offset, photo-adjust mode, clipboard…

import { create } from 'zustand'
import type { Pt } from '../engine/geometry'
import type { ClipData } from './clipboard'

export type LeftTab = 'fields' | 'text' | 'photos' | 'uploads' | 'brand' | 'elements' | 'layers' | 'animate'

interface UiState {
  leftTab: LeftTab | null
  /** compact layout: inspector bottom sheet */
  inspectorOpen: boolean
  /** Fields panel should focus this field (n changes on every request) */
  focusField: { key: string; n: number } | null
  /** image being re-framed ("adjust photo" mode) */
  cropId: string | null
  /** a photo being dragged over a frame (snap into frame): the frame is outlined and, when `src` is known, shows
   *  the new photo until the drop */
  drop: { id: string; src: string | null } | null
  /** page origin inside the stage when zoom is explicit (store.zoom !== null) */
  pan: Pt
  /** the zoom actually on screen (fit resolves to a number) */
  viewZoom: number
  clip: ClipData | null
  /** context menu: screen position + page point under it */
  menu: { x: number; y: number; page: Pt | null } | null
  paletteOpen: boolean
  previewOpen: boolean
  /** a pointer gesture is in flight (panels skip expensive work) */
  gesturing: boolean
  toast: { msg: string; n: number } | null

  setLeftTab: (t: LeftTab | null) => void
  toggleLeftTab: (t: LeftTab) => void
  setInspectorOpen: (v: boolean) => void
  focusFieldKey: (key: string) => void
  setCrop: (id: string | null) => void
  setDrop: (d: { id: string; src: string | null } | null) => void
  setPan: (p: Pt) => void
  setViewZoom: (z: number) => void
  setClip: (c: ClipData | null) => void
  setMenu: (m: UiState['menu']) => void
  setPalette: (v: boolean) => void
  setPreview: (v: boolean) => void
  setGesturing: (v: boolean) => void
  showToast: (msg: string) => void
}

let toastN = 0

export const useUi = create<UiState>((set, get) => ({
  leftTab: null,
  inspectorOpen: false,
  focusField: null,
  cropId: null,
  drop: null,
  pan: { x: 0, y: 0 },
  viewZoom: 1,
  clip: null,
  menu: null,
  paletteOpen: false,
  previewOpen: false,
  gesturing: false,
  toast: null,

  setLeftTab: (t) => set({ leftTab: t, ...(t ? { inspectorOpen: false } : {}) }),
  toggleLeftTab: (t) => set({ leftTab: get().leftTab === t ? null : t, inspectorOpen: false }),
  setInspectorOpen: (v) => set({ inspectorOpen: v }),
  focusFieldKey: (key) => set({ leftTab: 'fields', inspectorOpen: false, focusField: { key, n: (get().focusField?.n ?? 0) + 1 } }),
  setCrop: (id) => set({ cropId: id }),
  setDrop: (d) => {
    const cur = get().drop
    if (cur?.id !== d?.id || cur?.src !== d?.src) set({ drop: d })
  },
  setPan: (p) => set({ pan: p }),
  setViewZoom: (z) => {
    if (Math.abs(get().viewZoom - z) > 0.0005) set({ viewZoom: z })
  },
  setClip: (c) => set({ clip: c }),
  setMenu: (m) => set({ menu: m }),
  setPalette: (v) => set({ paletteOpen: v }),
  setPreview: (v) => set({ previewOpen: v }),
  setGesturing: (v) => {
    if (get().gesturing !== v) set({ gesturing: v })
  },
  showToast: (msg) => set({ toast: { msg, n: ++toastN } }),
}))

/** imperative hooks into the stage (set by <Stage/> while mounted) */
export const stageApi: {
  /** null = fit to screen */
  zoomTo: (z: number | null) => void
  zoomStep: (dir: 1 | -1) => void
  focus: () => void
  /** the page point under a window point, or null when it isn't over the stage (dragging from a panel) */
  pageAt: (clientX: number, clientY: number) => Pt | null
  /** the photo frame under a window point (snap into frame), or null */
  frameAt: (clientX: number, clientY: number) => string | null
} = {
  zoomTo: () => {},
  zoomStep: () => {},
  focus: () => {},
  pageAt: () => null,
  frameAt: () => null,
}
