// ─────────────────────────────────────────────────────────────
// The stage: one <canvas> the size of the viewport (drawn by the shared
// renderer) + a DOM/SVG overlay in screen coordinates for everything that is
// editor-only (selection, handles, guides, marquee, tooltips, inline text).
// All pointer input lands on the container and is hit-tested with math, so
// mouse, pen and touch share one code path.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import clsx from 'clsx'
import { Copy, Crop, Lock, MoreHorizontal, Pencil, RotateCw, Trash2, Unlock } from 'lucide-react'
import { cloneEl, isDrawn, uid, type Design, type El, type ImageEl, type TextEl } from '../engine/model'
import { aabb, hitEl, hitTest, intersects, normRect, resizeEl, rotatePt, snapMove, unionRect, type Guide, type Pt, type Rect } from '../engine/geometry'
import { clearTextCache, drawPage, imageFocus, textLayout } from '../engine/render'
import { frameCmds, frameD } from '../engine/frames'
import { fontString } from '../engine/text'
import { getImage, onImageLoaded, sizeOf } from '../engine/images'
import { ensureFont, onFontsReady } from '../engine/fonts'
import { loadCityData, onCityDataReady } from '../photos/cities'
import { resolveImage } from '../services'
import { currentPage, isTemplateFrame, lockedFor, selectedEls, useEditor } from './store'
import { stageApi, useUi } from './uiStore'
import { enterElement, isPhotoFrame, uploadAndAdd, uploadIntoFrame } from './actions'
import { cropOf, fromFrameSpace, movePhoto, photoBox, scalePhoto, toFrameSpace, trimFrame, trimmedOnPage, type Box, type Corner, type Edge } from './cropMath'
import { IconBtn, Slider } from './ui'
import {
  angleOf,
  clampBox,
  clampView,
  clampZoom,
  fitView,
  handleCursor,
  handlePositions,
  handlesFor,
  hitHandle,
  normDeg,
  pageGuide,
  scaleInto,
  snapAngle,
  snapCoord,
  snapTargets,
  stepZoom,
  toPage,
  toScreen,
  zoomAround,
  type Frame,
  type HandleId,
  type View,
} from './viewport'

const PINK = '#E74599'
const SNAP_PX = 6

interface Hud {
  guides: Guide[]
  marquee: Rect | null
  tip: { text: string; x: number; y: number } | null
  /** frame override while rotating several elements */
  frame: Frame | null
  mode: 'move' | 'resize' | 'rotate' | 'marquee' | 'pan' | 'crop' | null
}
const NO_HUD: Hud = { guides: [], marquee: null, tip: null, frame: null, mode: null }

interface Mods {
  shift: boolean
  alt: boolean
  meta: boolean
}

type Gesture =
  | { k: 'pending'; s: Pt; p: Pt; hit: string | null; hitSelected: boolean; mods: Mods; touch: boolean; timer: number }
  | { k: 'move'; p0: Pt; base: Record<string, Pt>; box: Rect; others: Rect[]; dup: boolean }
  | { k: 'resize'; handle: Exclude<HandleId, 'rot'>; frame0: Frame; els0: El[]; xs: number[]; ys: number[] }
  | { k: 'rotate'; c: Pt; a0: number; frame0: Frame; els0: El[] }
  | { k: 'marquee'; p0: Pt; base: string[]; key: string }
  | { k: 'pan'; s0: Pt; v0: View }
  | { k: 'crop'; id: string; how: 'move' | 'scale' | 'trim'; corner?: Corner; edge?: Edge; q0: Pt; P0: Box; iw: number; ih: number; src: string; el0: ImageEl }
  | { k: 'pinch'; d0: number; m0: Pt; v0: View }

function frameOf(els: El[]): Frame | null {
  if (!els.length) return null
  if (els.length === 1) {
    const e = els[0]
    return { x: e.x, y: e.y, w: e.w, h: e.h, rotation: e.rotation }
  }
  return { ...unionRect(els.map(aabb))!, rotation: 0 }
}

const frameKind = (els: El[]): 'box' | 'line' | 'multi' =>
  els.length > 1 ? 'multi' : els[0]?.type === 'shape' && els[0].shape === 'line' ? 'line' : 'box'

const r1 = (n: number) => Math.round(n * 10) / 10

/** extra patch when an element is scaled uniformly by s (fonts, radii follow) */
function scaledProps(el: El, s: number): Partial<El> {
  if (el.type === 'text') {
    return {
      style: { ...el.style, size: Math.max(4, Math.round(el.style.size * s * 2) / 2), letterSpacing: r1(el.style.letterSpacing * s) },
      minSize: el.minSize ? Math.max(4, r1(el.minSize * s)) : el.minSize,
      bg: el.bg ? { ...el.bg, radius: r1(el.bg.radius * s), padX: r1(el.bg.padX * s), padY: r1(el.bg.padY * s) } : el.bg,
    } as Partial<TextEl>
  }
  if (el.type === 'image') return { radius: r1(el.radius * s) } as Partial<ImageEl>
  if (el.type === 'effect') return {}
  return el.shape === 'rect' ? ({ radius: r1(el.radius * s) } as Partial<El>) : {}
}

/** what the image element is actually showing (bound photo or its own src), its size and focal point */
function imageInfo(el: ImageEl, design: Design): { iw: number; ih: number; src: string; focus: Pt } | null {
  const b = el.bind ? resolveImage(el, design.fields) : null
  const src = b?.src || el.src
  const img = src ? getImage(src) : null
  if (!img) return null
  const { w, h } = sizeOf(img)
  return w && h ? { iw: w, ih: h, src, focus: imageFocus(el, b, src) } : null
}

/** the photo frame under a page point (snap into frame): the topmost photo or empty frame, even under text */
function frameUnder(p: Pt | null): string | null {
  if (!p) return null
  const st = useEditor.getState()
  const pg = currentPage(st)
  if (!pg || st.readOnly) return null
  for (let i = pg.elements.length - 1; i >= 0; i--) {
    const e = pg.elements[i]
    if (isPhotoFrame(e) && isDrawn(e, st.design?.fields) && hitEl(e, p)) return e.id
  }
  return null
}

/** crop handles: the photo's four corners (resize the photo) and the frame's edges and corners (trim the frame) */
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']
const EDGES: Edge[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const cornerOf = (P: Box, c: Corner): Pt => ({ x: c.includes('w') ? P.x : P.x + P.w, y: c.includes('n') ? P.y : P.y + P.h })
const edgeOf = (w: number, h: number, e: Edge): Pt => ({
  x: e.includes('w') ? 0 : e.includes('e') ? w : w / 2,
  y: e.includes('n') ? 0 : e.includes('s') ? h : h / 2,
})

export function Stage({ compact }: { compact: boolean }) {
  const design = useEditor((s) => s.design)!
  const pageIndex = useEditor((s) => s.pageIndex)
  const selection = useEditor((s) => s.selection)
  const editingTextId = useEditor((s) => s.editingTextId)
  const tool = useEditor((s) => s.tool)
  const zoom = useEditor((s) => s.zoom)
  const readOnly = useEditor((s) => s.readOnly)
  const canEditLocked = useEditor((s) => s.canEditLocked)
  const pan = useUi((s) => s.pan)
  const cropId = useUi((s) => s.cropId)
  const drop = useUi((s) => s.drop)

  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<string | null>(null)
  const [hud, setHud] = useState<Hud>(NO_HUD)
  const [cursor, setCursor] = useState('default')
  const [space, setSpace] = useState(false)
  const [tick, setTick] = useState(0)

  const page = design.pages[Math.min(pageIndex, design.pages.length - 1)]
  const view: View = useMemo(
    () => (zoom === null ? fitView(design, size, compact ? 14 : 32) : { zoom, x: pan.x, y: pan.y }),
    [zoom, pan, design.w, design.h, size, compact], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const viewRef = useRef(view)
  viewRef.current = view
  const sizeRef = useRef(size)
  sizeRef.current = size
  const spaceRef = useRef(false)
  const g = useRef<Gesture | null>(null)
  const pointers = useRef(new Map<number, Pt>())
  const mv = useRef<{ s: Pt; mods: Mods; touch: boolean } | null>(null)
  const raf = useRef(0)
  const lastClick = useRef<{ t: number; s: Pt; id: string | null } | null>(null)

  // ── size, view plumbing ───────────────────────────────────

  useLayoutEffect(() => {
    const el = boxRef.current!
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  useEffect(() => useUi.getState().setViewZoom(view.zoom), [view.zoom])

  const setView = useCallback((v: View) => {
    const d = useEditor.getState().design
    if (!d) return
    const c = clampView({ ...v, zoom: clampZoom(v.zoom) }, d, sizeRef.current)
    useUi.getState().setPan({ x: c.x, y: c.y })
    useEditor.getState().setZoom(c.zoom)
  }, [])

  useEffect(() => {
    const centre = () => ({ x: sizeRef.current.w / 2, y: sizeRef.current.h / 2 })
    stageApi.zoomTo = (z) => {
      if (z === null) useEditor.getState().setZoom(null)
      else setView(zoomAround(viewRef.current, z, centre()))
    }
    stageApi.zoomStep = (dir) => setView(zoomAround(viewRef.current, stepZoom(viewRef.current.zoom, dir), centre()))
    stageApi.focus = () => boxRef.current?.focus({ preventScroll: true })
    stageApi.pageAt = (cx, cy) => {
      const r = boxRef.current?.getBoundingClientRect()
      if (!r || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null
      return toPage(viewRef.current, { x: cx - r.left, y: cy - r.top })
    }
    stageApi.frameAt = (cx, cy) => frameUnder(stageApi.pageAt(cx, cy))
    return () => {
      stageApi.zoomTo = stageApi.zoomStep = stageApi.focus = () => {}
      stageApi.pageAt = () => null
      stageApi.frameAt = () => null
    }
  }, [setView])

  // ── re-render triggers that are not store changes ─────────

  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    const offs = [
      onImageLoaded(bump),
      onCityDataReady(bump),
      onFontsReady(() => {
        clearTextCache()
        bump()
      }),
    ]
    void loadCityData()
    return () => offs.forEach((off) => off())
  }, [])

  const fontKey = useMemo(() => {
    const set = new Set<string>()
    for (const p of design.pages) for (const e of p.elements) if (e.type === 'text') set.add(`${e.style.family}|${e.style.weight}|${e.style.italic ? 1 : 0}`)
    return [...set].sort().join(',')
  }, [design.pages])
  useEffect(() => {
    for (const k of fontKey.split(',')) {
      const [family, weight, italic] = k.split('|')
      if (family) void ensureFont(family, Number(weight), italic === '1')
    }
  }, [fontKey])

  // ── draw (same commit as the overlay, so they never drift apart) ──

  useLayoutEffect(() => {
    const c = canvasRef.current
    if (!c || !size.w || !size.h) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const W = Math.round(size.w * dpr)
    const H = Math.round(size.h * dpr)
    if (c.width !== W || c.height !== H) {
      c.width = W
      c.height = H
    }
    const ctx = c.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, W, H)
    // a photo dragged over a frame shows in it before the drop (only once the picture has loaded)
    const shown =
      drop?.src && getImage(drop.src)
        ? {
            ...page,
            elements: page.elements.map((e) =>
              e.id === drop.id && e.type === 'image'
                ? ({ ...e, src: drop.src!, bind: undefined, focus: { x: 0.5, y: 0.5 }, zoom: 1, cropFor: undefined, fit: 'cover' } as ImageEl)
                : e,
            ),
          }
        : page
    drawPage(ctx, design, shown, {
      scale: view.zoom * dpr,
      origin: { x: Math.round(view.x * dpr), y: Math.round(view.y * dpr) },
      showMissing: true,
      skip: editingTextId ? new Set([editingTextId]) : undefined,
      resolveImage,
    })
  }, [design, page, view, size, editingTextId, tick, drop])

  // ── helpers ───────────────────────────────────────────────

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = boxRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  // brand locks stop dragging for everyone (managers unlock first); template photo frames for everyone but admins
  const pinned = useCallback((el: El) => !!el.locked || lockedFor(el, canEditLocked), [canEditLocked])
  const movable = useCallback((el: El) => !readOnly && !pinned(el), [readOnly, pinned])

  const selEls = useMemo(() => page.elements.filter((e) => selection.includes(e.id)), [page, selection])
  const frame = hud.frame ?? frameOf(selEls)
  const canTransform = selEls.length > 0 && selEls.every(movable)
  const cropEl = cropId ? page.elements.find((e) => e.id === cropId && e.type === 'image') : undefined
  const editingEl = editingTextId ? page.elements.find((e) => e.id === editingTextId && e.type === 'text') : undefined
  const handles = useMemo(
    () => (frame && canTransform && !cropEl && !editingEl ? handlePositions(frame, view, handlesFor(frame, view, frameKind(selEls))) : []),
    [frame, canTransform, cropEl, editingEl, view, selEls],
  )
  const handlesRef = useRef(handles)
  handlesRef.current = handles

  // leave photo-adjust mode when its element is gone or deselected
  useEffect(() => {
    if (cropId && (!cropEl || !selection.includes(cropId))) useUi.getState().setCrop(null)
  }, [cropId, cropEl, selection])

  const endGesture = useCallback((commit = true) => {
    const cur = g.current
    if (cur?.k === 'pending') window.clearTimeout(cur.timer)
    if (cur && (cur.k === 'move' || cur.k === 'resize' || cur.k === 'rotate' || cur.k === 'crop')) {
      const st = useEditor.getState()
      if (!commit && st.gestureBase) useEditor.setState({ design: st.gestureBase, gestureBase: null, gestureKind: null })
      else st.endGesture()
    }
    g.current = null
    mv.current = null
    setHud(NO_HUD)
    useUi.getState().setGesturing(false)
  }, [])

  // ── gesture steps ─────────────────────────────────────────

  const startDrag = (cur: Extract<Gesture, { k: 'pending' }>) => {
    window.clearTimeout(cur.timer)
    const st = useEditor.getState()
    const pg = currentPage(st)
    if (!pg || !st.design) return
    const hitEl_ = cur.hit ? pg.elements.find((e) => e.id === cur.hit) : null
    const additive = cur.mods.shift || cur.mods.meta
    if (hitEl_ && !st.readOnly && !pinned(hitEl_)) {
      // Shift/Cmd-drag on an unselected element adds it, then moves everything (Shift also constrains the axis)
      if (!cur.hitSelected && additive) st.select([hitEl_.id], 'add')
      let els = selectedEls(useEditor.getState()).filter((e) => !pinned(e))
      if (els.length) {
        st.beginGesture()
        useUi.getState().setGesturing(true)
        if (cur.mods.alt) {
          const groups = new Map<string, string>()
          const copies = els.map((e) => {
            const c = cloneEl(e)
            if (e.groupId) {
              if (!groups.has(e.groupId)) groups.set(e.groupId, uid('g'))
              c.groupId = groups.get(e.groupId)
            }
            return c
          })
          st.apply((d) => ({ ...d, pages: d.pages.map((p, i) => (i === st.pageIndex ? { ...p, elements: [...p.elements, ...copies] } : p)) }), { transient: true })
          useEditor.setState({ selection: copies.map((c) => c.id) })
          els = copies
        }
        const ids = new Set(els.map((e) => e.id))
        const all = currentPage(useEditor.getState())!.elements
        g.current = {
          k: 'move',
          p0: cur.p,
          base: Object.fromEntries(els.map((e) => [e.id, { x: e.x, y: e.y }])),
          box: unionRect(els.map(aabb))!,
          others: all.filter((e) => !ids.has(e.id) && isDrawn(e, useEditor.getState().design?.fields)).map(aabb),
          dup: cur.mods.alt,
        }
        setHover(null)
        return
      }
    }
    // key starts as an impossible value so the first frame always applies the marquee's selection
    g.current = { k: 'marquee', p0: cur.p, base: additive ? st.selection : [], key: '\u0000' }
    setHover(null)
  }

  const process = () => {
    raf.current = 0
    const m = mv.current
    const st = useEditor.getState()
    const d = st.design
    const pg = currentPage(st)
    if (!m || !d || !pg) return
    const v = viewRef.current
    const p = toPage(v, m.s)
    let cur = g.current

    if (!cur) {
      if (m.touch) return
      if (st.tool === 'hand' || spaceRef.current) {
        setCursor('grab')
        return
      }
      const h = hitHandle(handlesRef.current, m.s, 9)
      if (h) {
        const sel = selectedEls(st)
        setCursor(handleCursor(h, sel.length === 1 ? sel[0].rotation : 0))
        setHover(null)
        return
      }
      const crop = useUi.getState().cropId
      const hit = hitTest(pg.elements, p, 3 / v.zoom, d.fields)
      if (crop) setCursor(hit?.id === crop ? 'grab' : 'default')
      else setCursor(hit && st.selection.includes(hit.id) && !pinned(hit) && !st.readOnly ? 'move' : 'default')
      setHover(hit && !st.selection.includes(hit.id) ? hit.id : null)
      return
    }

    if (cur.k === 'pending') {
      if (Math.hypot(m.s.x - cur.s.x, m.s.y - cur.s.y) <= (cur.touch ? 8 : 3)) return
      startDrag(cur)
      cur = g.current
      if (!cur) return
    }
    const tipAt = clampBox(m.s.x + 14, m.s.y + 18, 130, 26, sizeRef.current)

    if (cur.k === 'move') {
      let dx = p.x - cur.p0.x
      let dy = p.y - cur.p0.y
      if (m.mods.shift) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0
        else dx = 0
      }
      const lockX = m.mods.shift && dx === 0
      const lockY = m.mods.shift && dy === 0
      const noSnap = m.mods.meta || (m.mods.alt && !cur.dup)
      const guides: Guide[] = []
      let snappedX = false
      let snappedY = false
      if (!noSnap) {
        const r = snapMove({ x: cur.box.x + dx, y: cur.box.y + dy, w: cur.box.w, h: cur.box.h }, cur.others, d, SNAP_PX / v.zoom)
        for (const gd of r.guides) {
          if (gd.axis === 'x' && !lockX) {
            dx += r.dx
            snappedX = true
            guides.push(gd)
          }
          if (gd.axis === 'y' && !lockY) {
            dy += r.dy
            snappedY = true
            guides.push(gd)
          }
        }
        // guide extents were computed before the other axis snapped
        for (const gd of guides) {
          if (gd.axis === 'x') {
            gd.from = Math.min(gd.from, cur.box.y + dy)
            gd.to = Math.max(gd.to, cur.box.y + dy + cur.box.h)
          } else {
            gd.from = Math.min(gd.from, cur.box.x + dx)
            gd.to = Math.max(gd.to, cur.box.x + dx + cur.box.w)
          }
        }
      }
      if (!snappedX) dx = Math.round(dx)
      if (!snappedY) dy = Math.round(dy)
      const patches: Record<string, Partial<El>> = {}
      for (const id in cur.base) patches[id] = { x: r1(cur.base[id].x + dx), y: r1(cur.base[id].y + dy) }
      st.updateEls(patches, { transient: true })
      setHud({ ...NO_HUD, mode: 'move', guides, tip: { text: `X ${Math.round(cur.box.x + dx)}   Y ${Math.round(cur.box.y + dy)}`, ...tipAt } })
      return
    }

    if (cur.k === 'resize') {
      const guides: Guide[] = []
      if (cur.els0.length === 1) {
        const el0 = cur.els0[0]
        const corner = cur.handle.length === 2
        const keep = corner && (el0.type === 'shape' ? m.mods.shift : !m.mods.shift)
        const pt = { ...p }
        if (!el0.rotation && !keep && !m.mods.meta) {
          const th = SNAP_PX / v.zoom
          if (/[ew]/.test(cur.handle)) {
            const t = snapCoord(pt.x, cur.xs, th)
            if (t !== null) {
              pt.x = t
              guides.push(pageGuide('x', t, d))
            }
          }
          if (/[ns]/.test(cur.handle)) {
            const t = snapCoord(pt.y, cur.ys, th)
            if (t !== null) {
              pt.y = t
              guides.push(pageGuide('y', t, d))
            }
          }
        }
        let r = resizeEl(el0, cur.handle, pt, keep, 8)
        if (!el0.rotation) {
          const x = Math.round(r.x)
          const y = Math.round(r.y)
          r = { x, y, w: Math.max(1, Math.round(r.x + r.w) - x), h: Math.max(1, Math.round(r.y + r.h) - y) }
        } else r = { x: r1(r.x), y: r1(r.y), w: r1(r.w), h: r1(r.h) }
        const patch: Partial<El> = { ...r, ...(keep ? scaledProps(el0, r.w / el0.w) : {}) }
        st.updateEl(el0.id, patch, { transient: true })
        setHud({ ...NO_HUD, mode: 'resize', guides, tip: { text: `W ${Math.round(r.w)} × H ${Math.round(r.h)}`, ...tipAt } })
      } else {
        const r = resizeEl(cur.frame0, cur.handle, p, true, 16)
        const patches: Record<string, Partial<El>> = {}
        for (const el0 of cur.els0) {
          const b = scaleInto(el0, cur.frame0, r)
          patches[el0.id] = { x: r1(b.x), y: r1(b.y), w: r1(b.w), h: r1(b.h), ...scaledProps(el0, b.s) }
        }
        st.updateEls(patches, { transient: true })
        setHud({ ...NO_HUD, mode: 'resize', tip: { text: `W ${Math.round(r.w)} × H ${Math.round(r.h)}`, ...tipAt } })
      }
      return
    }

    if (cur.k === 'rotate') {
      const delta = angleOf(cur.c, p) - cur.a0
      if (cur.els0.length === 1) {
        const el0 = cur.els0[0]
        const raw = el0.rotation + delta
        const rot = normDeg(Math.round(m.mods.shift ? snapAngle(raw, 15) : m.mods.meta ? raw : snapAngle(raw, 45, 3)))
        st.updateEl(el0.id, { rotation: rot }, { transient: true })
        setHud({ ...NO_HUD, mode: 'rotate', tip: { text: `${rot}°`, ...tipAt } })
      } else {
        const dd = Math.round(m.mods.shift ? snapAngle(delta, 15) : delta)
        const patches: Record<string, Partial<El>> = {}
        for (const el0 of cur.els0) {
          const c = rotatePt({ x: el0.x + el0.w / 2, y: el0.y + el0.h / 2 }, cur.c, dd)
          patches[el0.id] = { x: r1(c.x - el0.w / 2), y: r1(c.y - el0.h / 2), rotation: normDeg(Math.round(el0.rotation + dd)) }
        }
        st.updateEls(patches, { transient: true })
        setHud({ ...NO_HUD, mode: 'rotate', frame: { ...cur.frame0, rotation: dd }, tip: { text: `${normDeg(dd)}°`, ...tipAt } })
      }
      return
    }

    if (cur.k === 'marquee') {
      const rect = normRect(cur.p0, p)
      const ids = pg.elements
        .filter((e) => {
          if (!isDrawn(e, d.fields)) return false
          const b = aabb(e)
          if (!intersects(b, rect)) return false
          // locked layers (backgrounds) only join when fully enclosed
          return !pinned(e) || (b.x >= rect.x && b.y >= rect.y && b.x + b.w <= rect.x + rect.w && b.y + b.h <= rect.y + rect.h)
        })
        .map((e) => e.id)
      const next = [...new Set([...cur.base, ...ids])]
      const key = next.join(',')
      if (key !== cur.key) {
        cur.key = key
        st.select(next)
      }
      setHud({ ...NO_HUD, mode: 'marquee', marquee: rect })
      return
    }

    if (cur.k === 'pan') {
      setView({ zoom: cur.v0.zoom, x: cur.v0.x + m.s.x - cur.s0.x, y: cur.v0.y + m.s.y - cur.s0.y })
      return
    }

    if (cur.k === 'crop') {
      const el0 = cur.el0
      const q = toFrameSpace(el0, p)
      if (cur.how === 'trim' && cur.edge) {
        // the frame changes size and place on the page; the photo stays where it is
        const F = trimFrame(cur.P0, cur.edge, q, el0.w, el0.h, 16 / v.zoom)
        const box = trimmedOnPage(el0, F)
        const P = { ...cur.P0, x: cur.P0.x - F.x, y: cur.P0.y - F.y }
        const c = cropOf(P, cur.iw, cur.ih, F.w, F.h)
        st.updateEl(cur.id, { x: Math.round(box.x * 10) / 10, y: Math.round(box.y * 10) / 10, w: Math.round(F.w * 10) / 10, h: Math.round(F.h * 10) / 10 } as Partial<El>, { transient: true })
        st.setPhoto(cur.id, { ...c, cropFor: cur.src }, { transient: true })
        setHud({ ...NO_HUD, mode: 'crop', tip: { text: `${Math.round(F.w)} × ${Math.round(F.h)}`, ...tipAt } })
      } else {
        const P =
          cur.how === 'scale' && cur.corner
            ? scalePhoto(cur.P0, cur.corner, q, cur.iw, cur.ih, el0.w, el0.h)
            : movePhoto(cur.P0, q.x - cur.q0.x, q.y - cur.q0.y, el0.w, el0.h)
        const c = cropOf(P, cur.iw, cur.ih, el0.w, el0.h)
        st.setPhoto(cur.id, { ...c, cropFor: cur.src }, { transient: true })
        if (cur.how === 'scale') setHud({ ...NO_HUD, mode: 'crop', tip: { text: `${Math.round(c.zoom * 100)}%`, ...tipAt } })
      }
    }
  }

  // flushSync: the React commit (overlay) and the canvas draw happen inside
  // this animation frame, so what you see is never a frame behind the pointer
  const queue = () => {
    if (!raf.current) raf.current = requestAnimationFrame(() => flushSync(process))
  }
  const flush = () => {
    if (raf.current) {
      cancelAnimationFrame(raf.current)
      process()
    }
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const modsOf = (e: { shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean }): Mods => ({ shift: e.shiftKey, alt: e.altKey, meta: e.metaKey || e.ctrlKey })

  // ── pointer events ────────────────────────────────────────

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('[data-stage-ui]')) return
    const active = document.activeElement
    if (active instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) active.blur()
    const box = boxRef.current!
    const s = local(e)
    const v = viewRef.current
    const p = toPage(v, s)
    const touch = e.pointerType === 'touch'
    useUi.getState().setMenu(null)
    if (g.current && !touch) endGesture()

    if (touch) {
      pointers.current.set(e.pointerId, s)
      if (pointers.current.size === 2) {
        endGesture()
        const [a, b] = [...pointers.current.values()]
        g.current = { k: 'pinch', d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0: v }
        return
      }
      if (pointers.current.size > 2) return
    }
    try {
      box.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic pointer */
    }
    const st = useEditor.getState()
    const pg = currentPage(st)
    if (!pg) return

    if (e.button === 1 || ((st.tool === 'hand' || spaceRef.current) && e.button === 0)) {
      e.preventDefault()
      g.current = { k: 'pan', s0: s, v0: v }
      setHud({ ...NO_HUD, mode: 'pan' })
      return
    }
    const tol = (touch ? 10 : 3) / v.zoom
    if (e.button === 2) {
      const hit = hitTest(pg.elements, p, tol, st.design?.fields)
      if (hit && !st.selection.includes(hit.id)) st.select([hit.id])
      else if (!hit) st.select([])
      return
    }
    if (e.button !== 0) return

    // Crop mode: the photo's corners resize it, the frame's handles trim the frame (not on a template frame for
    // recruiters), dragging anywhere on the photo moves it inside the frame; anywhere else leaves Crop
    const crop = useUi.getState().cropId
    if (crop) {
      const el = pg.elements.find((x) => x.id === crop)
      const info = el && el.type === 'image' && st.design ? imageInfo(el, st.design) : null
      if (el && el.type === 'image' && info && el.fit === 'cover') {
        const q = toFrameSpace(el, p)
        const P0 = photoBox(info.iw, info.ih, el.w, el.h, info.focus, el.zoom)
        const near = (pt: Pt) => {
          const a = toScreen(v, fromFrameSpace(el, pt))
          return Math.hypot(a.x - s.x, a.y - s.y) <= (touch ? 18 : 10)
        }
        const corner = CORNERS.find((c) => near(cornerOf(P0, c)))
        const edge = !corner && !lockedFor(el, st.canEditLocked) ? EDGES.find((ed) => near(edgeOf(el.w, el.h, ed))) : undefined
        const inPhoto = q.x >= P0.x && q.x <= P0.x + P0.w && q.y >= P0.y && q.y <= P0.y + P0.h
        if (corner || edge || inPhoto) {
          st.beginGesture()
          useUi.getState().setGesturing(true)
          g.current = { k: 'crop', id: el.id, how: corner ? 'scale' : edge ? 'trim' : 'move', corner, edge, q0: q, P0, iw: info.iw, ih: info.ih, src: info.src, el0: el }
          setHud({ ...NO_HUD, mode: 'crop' })
          setCursor(corner || edge ? 'crosshair' : 'grabbing')
          return
        }
      } else if (el && hitEl(el, p)) return
      useUi.getState().setCrop(null)
    }

    // handles first
    const sel = selectedEls(st)
    const h = hitHandle(handlesRef.current, s, touch ? 20 : 9)
    if (h && sel.length) {
      const f0 = frameOf(sel)!
      st.beginGesture()
      useUi.getState().setGesturing(true)
      if (h === 'rot') {
        const c = { x: f0.x + f0.w / 2, y: f0.y + f0.h / 2 }
        g.current = { k: 'rotate', c, a0: angleOf(c, p), frame0: f0, els0: sel }
        setHud({ ...NO_HUD, mode: 'rotate' })
        setCursor('grabbing')
      } else {
        const ids = new Set(sel.map((x) => x.id))
        const t = snapTargets(pg.elements.filter((x) => !ids.has(x.id) && isDrawn(x, st.design?.fields)).map(aabb), st.design!)
        g.current = { k: 'resize', handle: h, frame0: f0, els0: sel, xs: t.xs, ys: t.ys }
        setHud({ ...NO_HUD, mode: 'resize' })
      }
      return
    }

    let hit = hitTest(pg.elements, p, tol, st.design?.fields)
    // inside a multi-selection's box but between its members: still drags the selection
    if (!hit && sel.length > 1) {
      const f0 = frameOf(sel)!
      if (p.x >= f0.x && p.x <= f0.x + f0.w && p.y >= f0.y && p.y <= f0.y + f0.h) hit = sel[0]
    }
    const mods = modsOf(e)
    const hitSelected = !!hit && st.selection.includes(hit.id)
    if (hit && !hitSelected && !mods.shift && !mods.meta) st.select([hit.id])
    const timer = touch
      ? window.setTimeout(() => {
          if (g.current?.k !== 'pending') return
          g.current = null
          const r = box.getBoundingClientRect()
          useUi.getState().setMenu({ x: r.left + s.x, y: r.top + s.y, page: p })
        }, 550)
      : 0
    g.current = { k: 'pending', s, p, hit: hit?.id ?? null, hitSelected, mods, touch, timer }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = local(e)
    const touch = e.pointerType === 'touch'
    if (touch && pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, s)
    const cur = g.current
    if (cur?.k === 'pinch') {
      if (pointers.current.size < 2) return
      const [a, b] = [...pointers.current.values()]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const z = zoomAround(cur.v0, cur.v0.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / cur.d0), cur.m0)
      setView({ zoom: z.zoom, x: z.x + mid.x - cur.m0.x, y: z.y + mid.y - cur.m0.y })
      return
    }
    if (!cur && (e.target as Element).closest('[data-stage-ui]')) {
      if (hover) setHover(null)
      return
    }
    mv.current = { s, mods: modsOf(e), touch }
    queue()
  }

  const click = (cur: Extract<Gesture, { k: 'pending' }>) => {
    const st = useEditor.getState()
    const now = performance.now()
    const last = lastClick.current
    const dbl = !!last && now - last.t < 420 && Math.hypot(last.s.x - cur.s.x, last.s.y - cur.s.y) < (cur.touch ? 28 : 8) && last.id === cur.hit
    lastClick.current = { t: now, s: cur.s, id: cur.hit }
    if (!cur.hit) {
      if (!cur.mods.shift && !cur.mods.meta) st.select([])
      return
    }
    if (cur.mods.shift || cur.mods.meta) {
      st.select([cur.hit], 'toggle')
      lastClick.current = null // a toggle is never the first half of a double-click
      return
    }
    if (dbl) {
      lastClick.current = null
      enterElement(cur.hit)
      return
    }
    // clicking one member of a multi-selection narrows to it (its group stays together)
    if (cur.hitSelected && st.selection.length > 1) st.select([cur.hit])
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    const cur = g.current
    if (!cur) return
    if (cur.k === 'pinch') {
      g.current = null
      return
    }
    if (mv.current && cur.k !== 'pending') {
      mv.current = { s: local(e), mods: modsOf(e), touch: e.pointerType === 'touch' }
      flush()
    }
    if (cur.k === 'pending') {
      window.clearTimeout(cur.timer)
      g.current = null
      click(cur)
      return
    }
    endGesture()
    setCursor('default')
  }

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    endGesture()
  }

  // ── wheel / pinch zoom, keyboard modifiers ────────────────

  useEffect(() => {
    const box = boxRef.current!
    const wheel = (e: WheelEvent) => {
      if ((e.target as Element).closest('[data-stage-scroll]')) return
      e.preventDefault()
      const v = viewRef.current
      const s = local(e)
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      if (e.ctrlKey || e.metaKey) {
        const dy = e.deltaY * unit
        const f = Math.abs(dy) >= 50 ? (dy > 0 ? 1 / 1.2 : 1.2) : Math.exp(-dy * 0.01)
        setView(zoomAround(v, v.zoom * f, s))
      } else {
        let dx = e.deltaX * unit
        let dy = e.deltaY * unit
        if (e.shiftKey && !dx) {
          dx = dy
          dy = 0
        }
        setView({ zoom: v.zoom, x: v.x - dx, y: v.y - dy })
      }
    }
    // Safari trackpad pinch
    let g0 = 1
    const gs = (e: Event) => {
      e.preventDefault()
      g0 = viewRef.current.zoom
    }
    const gc = (e: Event) => {
      e.preventDefault()
      const ge = e as Event & { scale: number; clientX: number; clientY: number }
      setView(zoomAround(viewRef.current, g0 * ge.scale, local(ge)))
    }
    box.addEventListener('wheel', wheel, { passive: false })
    box.addEventListener('gesturestart', gs)
    box.addEventListener('gesturechange', gc)
    return () => {
      box.removeEventListener('wheel', wheel)
      box.removeEventListener('gesturestart', gs)
      box.removeEventListener('gesturechange', gc)
    }
  }, [setView]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e.target) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        if (!spaceRef.current) {
          spaceRef.current = true
          setSpace(true)
        }
      }
      if (e.key === 'Escape' && g.current && g.current.k !== 'pending' && g.current.k !== 'pinch') {
        e.preventDefault()
        e.stopImmediatePropagation()
        endGesture(false)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false
        setSpace(false)
      }
    }
    const blur = () => {
      spaceRef.current = false
      setSpace(false)
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [endGesture])

  // ── drop files ────────────────────────────────────────────

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    useUi.getState().setDrop(null)
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    e.preventDefault()
    const p = toPage(viewRef.current, local(e))
    // a photo dropped on a frame goes into it (the first one, when several are dropped); the rest are added
    const frameId = frameUnder(p)
    const rest = frameId ? files.slice(1) : files
    if (frameId) void uploadIntoFrame(files[0], frameId)
    rest.slice(0, 8).forEach((f, i) => void uploadAndAdd(f, { x: p.x + i * 24, y: p.y + i * 24 }))
  }

  // ── crop overlay geometry ─────────────────────────────────
  const cropInfo = cropEl && cropEl.type === 'image' && cropEl.fit === 'cover' ? imageInfo(cropEl, design) : null
  const cropBox = cropEl && cropEl.type === 'image' && cropInfo ? photoBox(cropInfo.iw, cropInfo.ih, cropEl.w, cropEl.h, cropInfo.focus, cropEl.zoom) : null

  // ── overlay geometry ──────────────────────────────────────

  const z = view.zoom
  const sc = (pt: Pt) => toScreen(view, pt)
  const box = (f: Frame, key: string, stroke: string, width: number, dash?: string) => {
    const c = sc({ x: f.x + f.w / 2, y: f.y + f.h / 2 })
    return (
      <rect
        key={key}
        x={-f.w * z * 0.5}
        y={-f.h * z * 0.5}
        width={f.w * z}
        height={f.h * z}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeDasharray={dash}
        transform={`translate(${c.x} ${c.y}) rotate(${f.rotation})`}
      />
    )
  }
  const hoverEl = hover && !hud.mode ? page.elements.find((e) => e.id === hover) : undefined
  const accent = 'rgb(var(--accent))'
  const busy = hud.mode !== null
  const showChrome = !busy && !editingEl && !cropEl
  const selBox = frame ? aabb(frame) : null
  const lockEls = [...selEls, ...(hoverEl && !selEls.some((s) => s.id === hoverEl.id) ? [hoverEl] : [])].filter((e) => pinned(e))

  const stageCursor = hud.mode === 'pan' ? 'grabbing' : tool === 'hand' || space ? (hud.mode ? 'grabbing' : 'grab') : hud.mode === 'move' ? 'move' : cursor

  // floating toolbar position (above the selection, else below)
  let bar: CSSProperties | null = null
  if (selBox && showChrome && selEls.length) {
    const tl = sc({ x: selBox.x, y: selBox.y })
    const br = sc({ x: selBox.x + selBox.w, y: selBox.y + selBox.h })
    const w = 230
    const above = tl.y - 50
    const y = above >= 6 ? above : Math.min(size.h - 46, br.y + 48)
    const pos = clampBox((tl.x + br.x) / 2 - w / 2, y, w, 40, size)
    bar = { left: pos.x + w / 2, top: pos.y }
  }
  const allLocked = selEls.length > 0 && selEls.every((e) => pinned(e))

  return (
    <div
      ref={boxRef}
      tabIndex={-1}
      className="relative h-full w-full min-w-0 select-none overflow-hidden outline-none"
      style={{ touchAction: 'none', cursor: stageCursor, background: 'rgb(var(--surface-3) / .55)' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={() => !g.current && setHover(null)}
      onContextMenu={(e) => {
        if ((e.target as Element).closest('textarea')) return
        e.preventDefault()
        useUi.getState().setMenu({ x: e.clientX, y: e.clientY, page: toPage(viewRef.current, local(e)) })
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        // a file from the computer over a photo frame: outline the frame it will go into
        const id = frameUnder(toPage(viewRef.current, local(e)))
        useUi.getState().setDrop(id ? { id, src: null } : null)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) useUi.getState().setDrop(null)
      }}
      onDrop={onDrop}
      data-testid="studio-stage"
    >
      {/* the paper */}
      <div
        className="pointer-events-none absolute"
        style={{
          left: view.x,
          top: view.y,
          width: design.w * z,
          height: design.h * z,
          boxShadow: '0 1px 2px rgb(8 13 36 / .10), 0 12px 40px rgb(8 13 36 / .18)',
          background: '#fff',
        }}
      />
      <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0" style={{ width: size.w, height: size.h }} />

      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={size.w} height={size.h} aria-hidden>
        {hoverEl && box(hoverEl, 'hover', accent, 1.5)}
        {/* snap into frame: the frame a dragged photo will go into */}
        {(() => {
          const t = drop ? page.elements.find((e) => e.id === drop.id) : undefined
          if (!t || t.type !== 'image') return null
          const c = sc({ x: t.x + t.w / 2, y: t.y + t.h / 2 })
          return (
            <path
              key="drop"
              d={frameD(frameCmds(t.frame, t.w, t.h, t.radius), z, (-t.w * z) / 2, (-t.h * z) / 2)}
              fill="rgb(var(--accent) / .08)"
              stroke={accent}
              strokeWidth={3}
              transform={`translate(${c.x} ${c.y}) rotate(${t.rotation})`}
            />
          )
        })()}
        {/* Crop: the whole photo, faded outside the frame, with its corner handles; the frame's trim handles */}
        {cropEl && cropEl.type === 'image' && cropInfo && cropBox && !editingEl && (() => {
          const el = cropEl
          const c = sc({ x: el.x + el.w / 2, y: el.y + el.h / 2 })
          const flip = el.flipX ? ` translate(${el.w * z} 0) scale(-1 1)` : ''
          const P = cropBox
          const trim = !readOnly && !lockedFor(el, canEditLocked)
          const mid = `crop-mask-${el.id}`
          return (
            <g key="crop" transform={`translate(${c.x} ${c.y}) rotate(${el.rotation}) translate(${(-el.w * z) / 2} ${(-el.h * z) / 2})${flip}`}>
              <defs>
                <mask id={mid} maskUnits="userSpaceOnUse" x={P.x * z} y={P.y * z} width={P.w * z} height={P.h * z}>
                  <rect x={P.x * z} y={P.y * z} width={P.w * z} height={P.h * z} fill="#fff" />
                  <path d={frameD(frameCmds(el.frame, el.w, el.h, el.radius), z)} fill="#000" />
                </mask>
              </defs>
              <image href={cropInfo.src} x={P.x * z} y={P.y * z} width={P.w * z} height={P.h * z} preserveAspectRatio="none" opacity={0.42} mask={`url(#${mid})`} />
              <rect x={P.x * z} y={P.y * z} width={P.w * z} height={P.h * z} fill="none" stroke="#fff" strokeWidth={1} opacity={0.9} />
              <path d={frameD(frameCmds(el.frame, el.w, el.h, el.radius), z)} fill="none" stroke={accent} strokeWidth={1.5} />
              {trim &&
                EDGES.map((ed) => {
                  const q = edgeOf(el.w, el.h, ed)
                  const corner = ed.length === 2
                  const across = ed === 'e' || ed === 'w'
                  return corner ? (
                    <rect key={ed} x={q.x * z - 5} y={q.y * z - 5} width={10} height={10} rx={2} fill={accent} stroke="#fff" strokeWidth={1.5} />
                  ) : (
                    <rect key={ed} x={q.x * z - (across ? 3 : 8)} y={q.y * z - (across ? 8 : 3)} width={across ? 6 : 16} height={across ? 16 : 6} rx={3} fill={accent} stroke="#fff" strokeWidth={1.5} />
                  )
                })}
              {CORNERS.map((cn) => {
                const q = cornerOf(P, cn)
                return <circle key={cn} cx={q.x * z} cy={q.y * z} r={7} fill="#fff" stroke={accent} strokeWidth={2} />
              })}
            </g>
          )
        })()}
        {!editingEl && selEls.length > 1 && selEls.map((e) => box(e, e.id, accent, 1))}
        {!editingEl && frame && selEls.length > 0 && box(frame, 'frame', accent, selEls.length > 1 ? 1 : 1.5, cropEl || selEls.length > 1 ? '5 4' : undefined)}
        {hud.guides.map((gd, i) => {
          const a = sc(gd.axis === 'x' ? { x: gd.at, y: gd.from } : { x: gd.from, y: gd.at })
          const b = sc(gd.axis === 'x' ? { x: gd.at, y: gd.to } : { x: gd.to, y: gd.at })
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PINK} strokeWidth={1} />
        })}
        {hud.marquee && (
          <rect
            x={sc(hud.marquee).x}
            y={sc(hud.marquee).y}
            width={hud.marquee.w * z}
            height={hud.marquee.h * z}
            fill="rgb(var(--accent) / .10)"
            stroke={accent}
            strokeWidth={1}
          />
        )}
        {hud.mode !== 'move' &&
          hud.mode !== 'marquee' &&
          frame &&
          handles.map((h) => {
            if (h.id === 'rot') {
              const base = handlePositions(frame, view, ['s'])[0]
              return (
                <g key="rot">
                  <line x1={base.x} y1={base.y} x2={h.x} y2={h.y} stroke={accent} strokeWidth={1} />
                  <circle cx={h.x} cy={h.y} r={9} fill="#fff" stroke={accent} strokeWidth={1.25} />
                </g>
              )
            }
            if (h.id.length === 2) return <circle key={h.id} cx={h.x} cy={h.y} r={5} fill="#fff" stroke={accent} strokeWidth={1.5} />
            const vertical = h.id === 'e' || h.id === 'w'
            const len = Math.max(6, Math.min(14, (vertical ? frame.h : frame.w) * z * 0.36))
            return (
              <rect
                key={h.id}
                x={-len / 2}
                y={-3}
                width={len}
                height={6}
                rx={3}
                fill="#fff"
                stroke={accent}
                strokeWidth={1.5}
                transform={`translate(${h.x} ${h.y}) rotate(${frame.rotation + (vertical ? 90 : 0)})`}
              />
            )
          })}
      </svg>

      {/* rotate glyph (lucide icon over the svg knob) */}
      {hud.mode !== 'move' &&
        hud.mode !== 'marquee' &&
        handles
          .filter((h) => h.id === 'rot')
          .map((h) => (
            <RotateCw key="rot-icon" size={11} strokeWidth={2.5} className="pointer-events-none absolute text-accent" style={{ left: h.x - 5.5, top: h.y - 5.5 }} />
          ))}

      {/* lock badges */}
      {!busy &&
        lockEls.map((e) => {
          const b = aabb(e)
          const p = sc({ x: b.x + b.w, y: b.y })
          const pos = clampBox(p.x - 22, p.y + 4, 18, 18, size, 2)
          return (
            <div
              key={`lock-${e.id}`}
              className="pointer-events-none absolute flex h-[18px] w-[18px] items-center justify-center rounded-md bg-ink/80 text-surface-1"
              style={{ left: pos.x, top: pos.y }}
              title="Locked"
            >
              <Lock size={11} />
            </div>
          )
        })}

      {editingEl && editingEl.type === 'text' && <TextEditor key={editingEl.id} el={editingEl} view={view} />}

      {cropEl && cropEl.type === 'image' && selBox && !busy && (
        <CropBar
          el={cropEl}
          view={view}
          size={size}
          below={
            cropBox
              ? CORNERS.map((cn) => toScreen(view, fromFrameSpace(cropEl, cornerOf(cropBox, cn)))).reduce((a, b) => (b.y > a.y ? b : a))
              : null
          }
          src={cropInfo?.src}
        />
      )}

      {bar && (
        <div
          data-stage-ui
          className="card absolute flex -translate-x-1/2 items-center gap-0.5 p-1"
          style={{ ...bar, background: 'rgb(var(--surface-1))', cursor: 'default' }}
        >
          {!readOnly && allLocked && !canEditLocked && selEls.length === 1 && isTemplateFrame(selEls[0]) ? (
            // a template photo frame: the photo can be swapped (drag one onto it) and cropped, nothing else
            <>
              <span className="flex h-8 items-center gap-1.5 whitespace-nowrap px-2 text-[12px] font-semibold text-ink-2" title="Drag a photo onto it to swap it">
                <Lock size={13} /> Template frame
              </span>
              <IconBtn title="Crop the photo (double-click)" onClick={() => enterElement(selEls[0].id)}>
                <Crop size={15} />
              </IconBtn>
            </>
          ) : readOnly || (allLocked && !canEditLocked) ? (
            <span className="flex h-8 items-center gap-1.5 whitespace-nowrap px-2 text-[12px] font-semibold text-ink-2">
              <Lock size={13} /> {readOnly ? 'View only' : 'Brand locked'}
            </span>
          ) : (
            <>
              {selEls.length === 1 && selEls[0].type === 'text' && (
                <IconBtn title="Edit text (Enter)" onClick={() => enterElement(selEls[0].id)}>
                  <Pencil size={15} />
                </IconBtn>
              )}
              {selEls.length === 1 && selEls[0].type === 'image' && (
                <IconBtn title="Crop (double-click)" onClick={() => enterElement(selEls[0].id)}>
                  <Crop size={15} />
                </IconBtn>
              )}
              <IconBtn title="Duplicate" onClick={() => useEditor.getState().duplicateSelected()}>
                <Copy size={15} />
              </IconBtn>
              {canEditLocked && (
                <IconBtn title={allLocked ? 'Unlock' : 'Lock (brand lock)'} active={allLocked} onClick={() => useEditor.getState().toggleLock()}>
                  {allLocked ? <Lock size={15} /> : <Unlock size={15} />}
                </IconBtn>
              )}
              <IconBtn title="Delete" onClick={() => useEditor.getState().deleteSelected()}>
                <Trash2 size={15} />
              </IconBtn>
              <IconBtn
                title="More"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  useUi.getState().setMenu({ x: r.left, y: r.bottom + 6, page: null })
                }}
              >
                <MoreHorizontal size={15} />
              </IconBtn>
            </>
          )}
        </div>
      )}

      {hud.tip && (
        <div
          className="pointer-events-none absolute whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums text-white"
          style={{ left: hud.tip.x, top: hud.tip.y, background: 'rgb(12 24 77 / .92)' }}
        >
          {hud.tip.text}
        </div>
      )}
    </div>
  )
}

// ── inline text editing ─────────────────────────────────────

function TextEditor({ el, view }: { el: TextEl; view: View }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)
  const l = textLayout(el, el.style.upper ? el.text.toUpperCase() : el.text)
  const ls = el.style.letterSpacing * (l.size / el.style.size || 1)
  const top = el.style.valign === 'middle' ? (el.h - l.height) / 2 : el.style.valign === 'bottom' ? el.h - l.height : 0
  const c = toScreen(view, { x: el.x + el.w / 2, y: el.y + el.h / 2 })

  useEffect(() => {
    done.current = false
    // an 'edit' gesture: one undo step for the visit, but autosave keeps going while typing
    useEditor.getState().beginGesture('edit')
    const t = ref.current
    if (t) {
      t.focus({ preventScroll: true })
      t.select()
    }
    return () => {
      // empty text boxes are removed, like every other design tool
      const st = useEditor.getState()
      const cur = currentPage(st)?.elements.find((e) => e.id === el.id)
      if (cur && cur.type === 'text' && !cur.text.trim()) {
        st.apply((d) => ({ ...d, pages: d.pages.map((p) => ({ ...p, elements: p.elements.filter((e) => e.id !== el.id) })) }), { transient: true })
        useEditor.setState({ selection: st.selection.filter((id) => id !== el.id) })
      }
      useEditor.getState().endGesture()
    }
  }, [el.id])

  const commit = () => {
    if (done.current) return
    done.current = true
    useEditor.getState().setEditingText(null)
  }

  return (
    <div
      data-stage-ui
      className="absolute"
      style={{
        left: c.x,
        top: c.y,
        width: el.w,
        height: el.h,
        transform: `translate(-50%, -50%) rotate(${el.rotation}deg) scale(${view.zoom})`,
        opacity: el.opacity,
        boxShadow: `0 0 0 ${1.5 / view.zoom}px rgb(var(--accent))`,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {el.bg && (
        <div
          className="pointer-events-none absolute"
          style={{ left: -el.bg.padX, top: -el.bg.padY, right: -el.bg.padX, bottom: -el.bg.padY, background: el.bg.color, borderRadius: Math.min(el.bg.radius, (el.h + el.bg.padY * 2) / 2) }}
        />
      )}
      <textarea
        ref={ref}
        aria-label="Edit text"
        spellCheck={false}
        value={el.text}
        onChange={(e) => useEditor.getState().updateEl(el.id, { text: e.target.value } as Partial<El>, { transient: true })}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault()
            commit()
          }
        }}
        className="absolute inset-0 m-0 block h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
        style={{
          paddingTop: Math.max(0, top),
          font: fontString(el.style, l.size),
          lineHeight: `${l.lineHeight}px`,
          letterSpacing: `${ls}px`,
          textAlign: el.style.align,
          textTransform: el.style.upper ? 'uppercase' : 'none',
          textDecoration: el.style.underline ? 'underline' : 'none',
          color: el.color,
          caretColor: el.color,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
          cursor: 'text',
        }}
      />
    </div>
  )
}

// ── adjust photo bar ────────────────────────────────────────

function CropBar({ el, view, size, below, src }: { el: ImageEl; view: View; size: { w: number; h: number }; below: Pt | null; src?: string }) {
  const b = aabb(el)
  const bl = toScreen(view, { x: b.x + b.w / 2, y: b.y + b.h })
  // under the whole photo (it reaches past the frame while cropping), else under the frame
  const y = Math.max(bl.y, below?.y ?? 0)
  const w = Math.min(330, size.w - 12)
  const pos = clampBox(bl.x - w / 2, y + 12, w, 44, size)
  const photo = useEditor.getState().setPhoto
  return (
    <div
      data-stage-ui
      className="card absolute flex items-center gap-2 px-2.5 py-1.5"
      style={{ left: pos.x, top: pos.y, width: w, background: 'rgb(var(--surface-1))', cursor: 'default' }}
    >
      <span className="eyebrow shrink-0 whitespace-nowrap">Zoom</span>
      {el.fit === 'cover' ? (
        <Slider
          title="Photo zoom (or drag the photo's corners)"
          min={1}
          max={Math.max(3, Math.ceil(el.zoom))}
          step={0.01}
          value={el.zoom}
          onChange={(v) => photo(el.id, { zoom: v, ...(src ? { cropFor: src, focus: el.focus } : {}) })}
        />
      ) : (
        <button type="button" className="btn h-7 min-w-0 flex-1 px-2 text-[12px]" onClick={() => photo(el.id, { fit: 'cover', zoom: 1 })}>
          Fill the frame to crop
        </button>
      )}
      <button type="button" className={clsx('btn btn-primary h-7 shrink-0 px-2.5 text-[12px]')} onClick={() => useUi.getState().setCrop(null)}>
        Done
      </button>
    </div>
  )
}
