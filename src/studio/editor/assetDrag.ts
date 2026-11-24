// Drag a picture from a left panel (Uploads, Photos, Brand) onto the page, like Canva (BJ, 2026-11-19).
//
// Pointer events, not HTML drag-and-drop, so it works with a mouse, a pen and a finger the same way:
//  - mouse / pen: the drag starts once the pointer has moved 5 px; a plain click still adds the picture to the middle
//  - touch: hold the tile for 300 ms (a plain swipe keeps scrolling the panel)
// A small copy of the picture follows the pointer; let go over the page and it lands there, centred on the pointer.
// Let go anywhere else and nothing happens.

import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ImageEl } from '../engine/model'
import type { Pt } from '../engine/geometry'
import { addImage, replacePhoto } from './actions'
import { loadImage } from '../engine/images'
import { useEditor } from './store'
import { stageApi, useUi } from './uiStore'

export interface DragAsset {
  src: string
  /** the picture's own size (it lands at the size a click would give it) */
  w: number
  h: number
  /** small picture shown under the pointer */
  preview: string
  opts?: Partial<ImageEl>
}

const MOVE_PX = 5
const HOLD_MS = 300

/** the next click on a tile right after a drag is the drag's own release: ignore it */
let swallowClick = false

/** a picture that can fill a photo frame: photos, not logos (Fit) */
const fillsFrames = (a: DragAsset) => a.opts?.fit !== 'contain'

/** drop: into the photo frame under the pointer (snap into frame, BJ 2026-11-19), else added to the page there */
export const dropHandlers: { drop: (a: DragAsset, at: Pt, frameId: string | null) => void } = {
  drop: (a, at, frameId) => {
    if (frameId) replacePhoto(frameId, { src: a.src, credit: a.opts?.credit, name: a.opts?.name })
    else addImage(a.src, { w: a.w, h: a.h }, { ...a.opts, at })
  },
}

function makeGhost(a: DragAsset): HTMLDivElement {
  const g = document.createElement('div')
  const k = Math.min(1, 120 / Math.max(a.w, a.h, 1))
  const w = Math.max(40, Math.round(a.w * k))
  const h = Math.max(40, Math.round(a.h * k))
  Object.assign(g.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    width: `${w}px`,
    height: `${h}px`,
    pointerEvents: 'none',
    zIndex: '9999',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 10px 30px rgb(0 0 0 / .28)',
    opacity: '0.92',
    transition: 'opacity .12s',
  } satisfies Partial<CSSStyleDeclaration>)
  const img = document.createElement('img')
  img.src = a.preview
  img.alt = ''
  img.draggable = false
  Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover', display: 'block' })
  g.appendChild(img)
  document.body.appendChild(g)
  return g
}

/** pointer + click handlers for a panel tile. `onAdd` is the click (add to the middle of the page). */
export function assetDragProps(asset: DragAsset | null, onAdd: () => void) {
  return {
    onClick: () => {
      if (swallowClick) {
        swallowClick = false
        return
      }
      onAdd()
    },
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (!asset || e.button !== 0 || useEditor.getState().readOnly) return
      const touch = e.pointerType === 'touch'
      const id = e.pointerId
      const x0 = e.clientX
      const y0 = e.clientY
      let ghost: HTMLDivElement | null = null
      let last = { x: x0, y: y0 }
      let hold = 0

      const place = () => {
        if (!ghost) return
        ghost.style.transform = `translate(${last.x - ghost.offsetWidth / 2}px, ${last.y - ghost.offsetHeight / 2}px)`
        // over a photo frame: the frame lights up and shows this photo; the small copy fades so the frame shows through
        const frame = fillsFrames(asset) ? stageApi.frameAt(last.x, last.y) : null
        useUi.getState().setDrop(frame ? { id: frame, src: asset.src } : null)
        ghost.style.opacity = frame ? '0.35' : stageApi.pageAt(last.x, last.y) ? '0.92' : '0.6'
      }
      const start = () => {
        if (ghost) return
        if (fillsFrames(asset)) void loadImage(asset.src)
        ghost = makeGhost(asset)
        document.body.style.cursor = 'grabbing'
        place()
      }
      // while a touch drag is on, the finger must not scroll the panel or the page
      const noScroll = (ev: TouchEvent) => {
        if (ghost) ev.preventDefault()
      }
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return
        last = { x: ev.clientX, y: ev.clientY }
        const far = Math.hypot(ev.clientX - x0, ev.clientY - y0) > (touch ? 10 : MOVE_PX)
        if (!ghost && far) {
          if (touch) return end(null) // moved before the hold: it's a scroll
          start()
        }
        place()
      }
      const end = (ev: PointerEvent | null) => {
        if (ev && ev.pointerId !== id) return
        window.clearTimeout(hold)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
        window.removeEventListener('touchmove', noScroll)
        window.removeEventListener('keydown', esc, true)
        if (!ghost) return
        ghost.remove()
        ghost = null
        document.body.style.cursor = ''
        useUi.getState().setDrop(null)
        swallowClick = true
        window.setTimeout(() => (swallowClick = false), 0)
        if (!ev) return
        const at = stageApi.pageAt(ev.clientX, ev.clientY)
        if (at) dropHandlers.drop(asset, at, fillsFrames(asset) ? stageApi.frameAt(ev.clientX, ev.clientY) : null)
      }
      const up = (ev: PointerEvent) => end(ev)
      const cancel = (ev: PointerEvent) => end(ev.pointerId === id ? null : ev)
      const esc = (ev: KeyboardEvent) => {
        if (ev.key !== 'Escape' || !ghost) return
        ev.preventDefault()
        ev.stopImmediatePropagation()
        end(null)
      }

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancel)
      window.addEventListener('touchmove', noScroll, { passive: false })
      window.addEventListener('keydown', esc, true)
      if (touch) hold = window.setTimeout(start, HOLD_MS)
    },
    onContextMenu: (e: { preventDefault: () => void }) => {
      // a long press on a phone opens the browser's image menu otherwise
      if (asset) e.preventDefault()
    },
  }
}
