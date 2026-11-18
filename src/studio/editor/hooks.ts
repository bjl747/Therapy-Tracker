import { useEffect, useMemo, useState } from 'react'
import type { El } from '../engine/model'
import { currentPage, useEditor } from './store'
import { cityIndex, loadCityData, onCityDataReady } from '../photos/cities'
import { onImageLoaded } from '../engine/images'
import { clearTextCache } from '../engine/render'
import { onFontsReady } from '../engine/fonts'

/** 'loading' until the city index has been fetched; then whether it has any photos */
export function useCityData(): 'loading' | 'empty' | 'ready' {
  const [state, setState] = useState<'loading' | 'empty' | 'ready'>(() => (cityIndex().length ? 'ready' : 'loading'))
  useEffect(() => {
    let alive = true
    const check = () => alive && setState(cityIndex().length ? 'ready' : 'empty')
    const off = onCityDataReady(check)
    void loadCityData().then(check)
    return () => {
      alive = false
      off()
    }
  }, [])
  return state
}

/** changes whenever an image / font / the city index finishes loading (redraw thumbnails) */
export function useAssetTick(): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let t = 0
    // coalesce bursts (a page of photos arriving together)
    const bump = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => setTick((n) => n + 1), 60)
    }
    const offs = [
      onImageLoaded(bump),
      onCityDataReady(bump),
      onFontsReady(() => {
        clearTextCache()
        bump()
      }),
    ]
    return () => {
      window.clearTimeout(t)
      offs.forEach((off) => off())
    }
  }, [])
  return tick
}

/** element width via ResizeObserver */
export function useWidth(el: HTMLElement | null): number {
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [el])
  return w
}

/** selected elements on the current page (stable between unrelated store changes) */
export function useSelected(): El[] {
  const page = useEditor((s) => currentPage(s))
  const selection = useEditor((s) => s.selection)
  return useMemo(() => (page ? page.elements.filter((e) => selection.includes(e.id)) : []), [page, selection])
}
