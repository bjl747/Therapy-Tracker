// Editor commands shared by the keyboard, menus, panels and the palette.

import { image, shape, text, uid, type Anim, type Design, type El, type ImageEl, type ShapeEl, type ShapeKind, type TextEl, type TextStyle } from '../engine/model'
import { markerKeys } from '../engine/fields'
import { aabb, type Pt } from '../engine/geometry'
import { ensureFont } from '../engine/fonts'
import { repo } from '../data'
import { currentPage, selectedEls, useEditor } from './store'
import { useUi } from './uiStore'
import { CLIP_MARKER, copyEls, pasteEls } from './clipboard'
import { gradientColor, luminance, parseColor } from './colors'

const ed = () => useEditor.getState()
const ui = () => useUi.getState()

export const toast = (msg: string) => ui().showToast(msg)

/** dark page → white ink, light page → brand navy */
export function inkFor(d: Design, pageIndex: number): string {
  const p = d.pages[pageIndex]
  const c = parseColor(p?.bg.gradient ? gradientColor(p.bg.gradient) : p?.bg.color)
  return c && luminance(c) < 0.4 ? '#FFFFFF' : '#0C184D'
}

/** top-left for a new w×h element: page centre, nudged if something already sits exactly there */
function place(w: number, h: number, at?: Pt): { x: number; y: number } {
  const s = ed()
  const d = s.design!
  let x = Math.round((at?.x ?? d.w / 2) - w / 2)
  let y = Math.round((at?.y ?? d.h / 2) - h / 2)
  const els = currentPage(s)?.elements ?? []
  while (els.some((e) => Math.abs(e.x - x) < 2 && Math.abs(e.y - y) < 2)) {
    x += 24
    y += 24
  }
  return { x, y }
}

export type TextPreset = 'heading' | 'sub' | 'body'

export function addText(preset: TextPreset, over: { text?: string; style?: Partial<TextStyle>; at?: Pt } = {}): void {
  const s = ed()
  const d = s.design
  if (!d || s.readOnly) return
  const base = Math.min(d.w, d.h * 1.4)
  const spec = {
    heading: { text: 'Add a heading', size: Math.round(base * 0.08), weight: 800, lines: 2, lh: 1.1 },
    sub: { text: 'Add a subheading', size: Math.round(base * 0.045), weight: 600, lines: 2, lh: 1.2 },
    body: { text: 'Add a little bit of body text', size: Math.round(base * 0.028), weight: 400, lines: 3, lh: 1.35 },
  }[preset]
  const w = Math.round(d.w * 0.72)
  const h = Math.round(spec.size * spec.lh * spec.lines)
  const style = { size: spec.size, weight: spec.weight, lineHeight: spec.lh, align: 'center' as const, valign: 'middle' as const, ...over.style }
  if (style.family) void ensureFont(style.family, style.weight)
  const el = text({
    ...place(w, h, over.at),
    w,
    h,
    text: over.text ?? spec.text,
    color: inkFor(d, s.pageIndex),
    name: { heading: 'Heading', sub: 'Subheading', body: 'Body text' }[preset],
    style,
  })
  s.addEl(el)
}

/** heading + body in one go (font pair presets) */
export function addTextPair(heading: string, body: string): void {
  const s = ed()
  const d = s.design
  if (!d || s.readOnly) return
  void ensureFont(heading, 700)
  void ensureFont(body, 400)
  const base = Math.min(d.w, d.h * 1.4)
  const w = Math.round(d.w * 0.72)
  const hs = Math.round(base * 0.075)
  const bs = Math.round(base * 0.03)
  const hh = Math.round(hs * 1.1 * 2)
  const bh = Math.round(bs * 1.35 * 3)
  const { x, y } = place(w, hh + bh + 16)
  const g = uid('g')
  const color = inkFor(d, s.pageIndex)
  const a = text({ x, y, w, h: hh, text: 'Your headline here', color, groupId: g, name: 'Heading', style: { family: heading, size: hs, weight: 700, lineHeight: 1.1, align: 'center', valign: 'bottom' } })
  const b = text({ x, y: y + hh + 16, w, h: bh, text: 'A supporting line that adds the detail people need.', color, groupId: g, name: 'Body text', style: { family: body, size: bs, weight: 400, lineHeight: 1.35, align: 'center', valign: 'top' } })
  s.apply((dd) => ({
    ...dd,
    pages: dd.pages.map((p, i) => (i === s.pageIndex ? { ...p, elements: [...p.elements, a, b] } : p)),
    updatedAt: Date.now(),
  }))
  useEditor.setState({ selection: [a.id, b.id] })
}

export function addImage(src: string, natural: { w: number; h: number }, o: Partial<ImageEl> & { at?: Pt } = {}): void {
  const s = ed()
  const d = s.design
  if (!d || s.readOnly) return
  const { at, ...rest } = o
  const nw = Math.max(1, natural.w)
  const nh = Math.max(1, natural.h)
  const k = Math.min((d.w * 0.6) / nw, (d.h * 0.6) / nh)
  const w = Math.round(nw * k)
  const h = Math.round(nh * k)
  s.addEl(image({ ...place(w, h, at), w, h, src, focus: { x: 0.5, y: 0.5 }, ...rest }))
}

export function addShape(kind: ShapeKind, o: Partial<ShapeEl> = {}): void {
  const s = ed()
  const d = s.design
  if (!d || s.readOnly) return
  const unit = Math.round(Math.min(d.w, d.h) * 0.24)
  const w = o.w ?? unit
  const h = o.h ?? unit
  s.addEl(shape(kind, { ...place(w, h), w, h, ...o }))
}

/** pill / badge: a text element with a highlight behind it */
export function addBadge(label: string, bg: string, color: string, radius: number): void {
  const s = ed()
  const d = s.design
  if (!d || s.readOnly) return
  const size = Math.round(Math.min(d.w, d.h) * 0.032)
  const w = Math.round(size * label.length * 0.72 + size)
  const h = Math.round(size * 1.3)
  const padX = Math.round(size * 0.8)
  const padY = Math.round(size * 0.45)
  const el: TextEl = text({
    ...place(w, h),
    w,
    h,
    text: label,
    color,
    name: 'Badge',
    bg: { color: bg, radius: radius >= 999 ? Math.round(h / 2 + padY) : radius, padX, padY },
    style: { size, weight: 700, align: 'center', valign: 'middle', upper: true, letterSpacing: Math.round(size * 0.06) },
  })
  s.addEl(el)
}

export async function uploadAndAdd(file: File, at?: Pt): Promise<void> {
  if (ed().readOnly) return
  if (!file.type.startsWith('image/')) {
    toast('Only image files can be added')
    return
  }
  try {
    const a = await repo.uploadAsset(file, 'photo')
    addImage(a.url, { w: a.w, h: a.h }, { at, name: a.name.replace(/\.[a-z0-9]+$/i, '') })
  } catch {
    toast('That image could not be read')
  }
}

// ── clipboard ───────────────────────────────────────────────

export function copySelection(): boolean {
  const s = ed()
  const p = currentPage(s)
  const els = selectedEls(s)
  if (!p || !els.length) return false
  ui().setClip(copyEls(els, p.id))
  return true
}

export function cutSelection(): boolean {
  if (!copySelection()) return false
  ed().deleteSelected()
  return true
}

export function pasteClip(at?: Pt): boolean {
  const s = ed()
  const p = currentPage(s)
  const clip = ui().clip
  if (!s.design || !p || !clip || s.readOnly) return false
  const copies = pasteEls(clip, { pageId: p.id, w: s.design.w, h: s.design.h }, at)
  s.apply((d) => ({
    ...d,
    pages: d.pages.map((pg, i) => (i === s.pageIndex ? { ...pg, elements: [...pg.elements, ...copies] } : pg)),
    updatedAt: Date.now(),
  }))
  useEditor.setState({ selection: copies.map((c) => c.id), editingTextId: null })
  if (!at && clip.pageId === p.id) ui().setClip({ ...clip, pastes: clip.pastes + 1 })
  return true
}

/** best effort: make our clip the newest thing on the system clipboard (menu-driven copy) */
export function markSystemClipboard(): void {
  try {
    void navigator.clipboard?.writeText(CLIP_MARKER).catch(() => {})
  } catch {
    /* clipboard not available */
  }
}

// ── text / image entry ──────────────────────────────────────

/** Enter / double-click: edit text inline, or jump to its field when it is field-driven */
export function enterElement(id: string): void {
  const s = ed()
  const el = currentPage(s)?.elements.find((e) => e.id === id)
  if (!el || s.readOnly) return
  if (el.locked && !s.canEditLocked) {
    if (el.type === 'text') {
      const keys = markerKeys(el.text)
      if (keys.length) ui().focusFieldKey(keys[0])
      else toast('This element is locked by your brand template')
    } else if (el.type === 'image' && el.bind) ui().focusFieldKey(el.bind)
    else toast('This element is locked by your brand template')
    return
  }
  useEditor.setState({ selection: [id] })
  if (el.type === 'text') {
    const keys = markerKeys(el.text)
    if (keys.length) ui().focusFieldKey(keys[0])
    else {
      ui().setCrop(null)
      s.setEditingText(id)
    }
  } else if (el.type === 'image') {
    s.setEditingText(null)
    ui().setCrop(id)
  }
}

// ── layers ──────────────────────────────────────────────────

/** move an element to a new z-index (0 = back) */
export function reorderEl(id: string, to: number): void {
  const s = ed()
  s.apply((d) => ({
    ...d,
    pages: d.pages.map((p, i) => {
      if (i !== s.pageIndex) return p
      const from = p.elements.findIndex((e) => e.id === id)
      if (from < 0) return p
      const els = [...p.elements]
      const [el] = els.splice(from, 1)
      els.splice(Math.max(0, Math.min(els.length, to)), 0, el)
      return { ...p, elements: els }
    }),
    updatedAt: Date.now(),
  }))
}

/** patch any element on the current page regardless of brand lock (hide / lock toggles) */
export function patchElRaw(id: string, patch: Partial<El>): void {
  const s = ed()
  s.apply((d) => ({
    ...d,
    pages: d.pages.map((p, i) => (i === s.pageIndex ? { ...p, elements: p.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as El) : e)) } : p)),
    updatedAt: Date.now(),
  }))
}

// ── animation ───────────────────────────────────────────────

/** pure: a tasteful staggered entrance for every element on a page */
export function autoAnimatePlan(els: El[], page: { w: number; h: number }): { anims: Record<string, { anim: Anim; kenBurns?: boolean }>; duration: number } {
  const anims: Record<string, { anim: Anim; kenBurns?: boolean }> = {}
  const area = page.w * page.h
  let delay = 0.15
  // background first, then top-to-bottom like you'd read it
  const order = els
    .filter((e) => !e.hidden)
    .map((e, z) => ({ e, z, box: aabb(e) }))
    .sort((a, b) => a.box.y + a.box.h / 2 - (b.box.y + b.box.h / 2) || a.z - b.z)
  for (const { e, box } of order) {
    const cover = (Math.min(box.x + box.w, page.w) - Math.max(box.x, 0)) * (Math.min(box.y + box.h, page.h) - Math.max(box.y, 0))
    if (cover / area > 0.6) {
      anims[e.id] = { anim: { kind: 'none', delay: 0, duration: 0.6 }, kenBurns: e.type === 'image' ? true : undefined }
      continue
    }
    const kind: Anim['kind'] = e.type === 'text' ? 'rise' : e.type === 'image' ? 'fade' : cover / area < 0.03 ? 'pop' : 'fade'
    anims[e.id] = { anim: { kind, delay: Math.round(delay * 100) / 100, duration: 0.6 } }
    delay += 0.18
  }
  return { anims, duration: Math.max(3, Math.ceil((delay + 0.6 + 1.2) * 2) / 2) }
}

export function autoAnimate(): void {
  const s = ed()
  const p = currentPage(s)
  if (!s.design || !p || s.readOnly) return
  const plan = autoAnimatePlan(p.elements, s.design)
  s.apply((d) => ({
    ...d,
    pages: d.pages.map((pg, i) =>
      i === s.pageIndex
        ? {
            ...pg,
            duration: plan.duration,
            elements: pg.elements.map((e) => {
              const a = plan.anims[e.id]
              if (!a) return e
              return e.type === 'image' && a.kenBurns !== undefined ? { ...e, anim: a.anim, kenBurns: a.kenBurns } : { ...e, anim: a.anim }
            }),
          }
        : pg,
    ),
    updatedAt: Date.now(),
  }))
}

export function clearAnimations(): void {
  const s = ed()
  if (!s.design || s.readOnly) return
  s.apply((d) => ({
    ...d,
    pages: d.pages.map((pg, i) =>
      i === s.pageIndex
        ? { ...pg, elements: pg.elements.map((e) => (e.type === 'image' ? { ...e, anim: undefined, kenBurns: false } : { ...e, anim: undefined })) }
        : pg,
    ),
    updatedAt: Date.now(),
  }))
}
