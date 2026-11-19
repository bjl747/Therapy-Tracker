// The Elements panel's libraries (BJ, 2026-11-18: "more elements"): more shapes, light effects, stickers and a
// searchable icon library (medical icons in two styles, and Lucide line icons). Shapes and effects are drawn in code; stickers are SVG files and icons are path data under
// /studio/ (public/studio, licences in public/studio/LICENSES.md), fetched only when their section is opened.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { EffectSpec } from '../../engine/model'
import { drawEffect } from '../../engine/effects'
import { useEditor } from '../store'
import { addEffect, addImage, addShape } from '../actions'
import { Section, Seg, Skeleton } from '../ui'
import { SHAPE_LIBRARY } from '../shapeLibrary'

const TILE = 'flex aspect-square items-center justify-center rounded-lg border border-line bg-surface-1 text-accent hover:border-accent hover:bg-surface-2 disabled:opacity-50'
const GRID = { gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))' }
const useUnit = () => useEditor((s) => (s.design ? Math.round(Math.min(s.design.w, s.design.h) * 0.24) : 240))

// one fetch per file, shared by every open panel
const cache = new Map<string, Promise<unknown>>()
function load<T>(url: string): Promise<T> {
  let p = cache.get(url)
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`)
      return r.json()
    })
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return p as Promise<T>
}
function useFile<T>(url: string | null): { data: T | null; failed: boolean } {
  const [state, setState] = useState<{ url: string | null; data: T | null; failed: boolean }>({ url: null, data: null, failed: false })
  useEffect(() => {
    if (!url) return
    let live = true
    load<T>(url).then(
      (data) => live && setState({ url, data, failed: false }),
      () => live && setState({ url, data: null, failed: true }),
    )
    return () => {
      live = false
    }
  }, [url])
  return state.url === url ? { data: state.data, failed: state.failed } : { data: null, failed: false }
}

/** a section that shows its content (and loads its file) only once it has been opened */
function Fold({ title, count, children }: { title: string; count?: string; children: (open: boolean) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Section
      title={title}
      right={
        <button type="button" className="chip hover:border-accent/50" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : count ? `Show ${count}` : 'Show'}
        </button>
      }
    >
      {open ? children(open) : null}
    </Section>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative mb-2">
      <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
      <input className="input pl-8" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    </div>
  )
}

// ── more shapes ─────────────────────────────────────────────

export function MoreShapes() {
  const readOnly = useEditor((s) => s.readOnly)
  const unit = useUnit()
  return (
    <>
      {SHAPE_LIBRARY.map((g) => (
        <Section key={g.group} title={g.group}>
          <div className="grid gap-2" style={GRID}>
            {g.items.map((s) => {
              const ratio = s.ratio ?? 1
              // added at about the same area whatever the shape's proportions
              const w = Math.round(unit * Math.sqrt(ratio) * (ratio > 3 ? 1.3 : 1))
              const h = Math.max(8, Math.round(w / ratio))
              return (
                <button
                  key={s.name}
                  type="button"
                  disabled={readOnly}
                  className={TILE}
                  title={s.name}
                  aria-label={`Add ${s.name}`}
                  onClick={() =>
                    addShape('path', s.line
                      ? { path: s.path, name: s.name, w, h, fill: 'transparent', stroke: { color: '#E74598', width: Math.max(3, Math.round(unit * 0.03)) } }
                      : { path: s.path, name: s.name, w, h })
                  }
                >
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '64%', height: `${Math.max(14, Math.min(64, 64 / ratio))}%` }} fill={s.line ? 'none' : 'currentColor'} stroke={s.line ? 'currentColor' : 'none'} strokeWidth={s.line ? 7 : 0} strokeLinecap="round" strokeLinejoin="round">
                    <path d={s.path} vectorEffect="non-scaling-stroke" />
                  </svg>
                </button>
              )
            })}
          </div>
        </Section>
      ))}
    </>
  )
}

// ── light effects ───────────────────────────────────────────

const EFFECTS: { name: string; fx: EffectSpec; hint: string }[] = [
  { name: 'Glow', hint: 'A soft pool of light', fx: { kind: 'glow', color: '#3B6BFF', intensity: 0.8 } },
  { name: 'Lens flare', hint: 'Bright core, streak and ghost circles', fx: { kind: 'flare', color: '#4F8CFF', color2: '#12C4D1', intensity: 0.85, streak: true, rays: 0, ghosts: true, angle: 135 } },
  { name: 'Sun flare', hint: 'A flare with rays of light', fx: { kind: 'flare', color: '#5B8DFF', color2: '#E74598', intensity: 0.9, streak: true, rays: 14, ghosts: true, angle: 135, seed: 7 } },
  { name: 'Light leak', hint: 'Colour washing in from one side', fx: { kind: 'leak', color: '#E74598', color2: '#263FD9', intensity: 0.8, angle: 20 } },
  { name: 'Bokeh', hint: 'Soft out-of-focus circles', fx: { kind: 'bokeh', color: '#12C4D1', color2: '#E74598', intensity: 0.9, count: 14, seed: 4 } },
  { name: 'Sparkles', hint: 'Small four-point stars', fx: { kind: 'sparkles', color: '#9CC3FF', intensity: 1, count: 9, seed: 9 } },
]

function EffectPreview({ fx }: { fx: EffectSpec }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.fillStyle = '#101D57'
    ctx.fillRect(0, 0, c.width, c.height)
    drawEffect(ctx, fx, 0, 0, c.width, c.height)
  }, [fx])
  return <canvas ref={ref} width={132} height={132} className="h-full w-full rounded-[7px]" aria-hidden />
}

export function LightEffects() {
  const readOnly = useEditor((s) => s.readOnly)
  return (
    <Section title="Light effects">
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
        {EFFECTS.map((e) => (
          <button key={e.name} type="button" disabled={readOnly} className="min-w-0 rounded-lg border border-line bg-surface-1 p-1 text-left hover:border-accent disabled:opacity-50" title={e.hint} aria-label={`Add ${e.name}`} onClick={() => addEffect(e.fx, { name: e.name })}>
            <div className="aspect-square">
              <EffectPreview fx={e.fx} />
            </div>
            <div className="truncate px-0.5 pt-1 text-[11px] font-semibold text-ink-2">{e.name}</div>
          </button>
        ))}
      </div>
      <p className="px-0.5 pt-1.5 text-[11.5px] leading-snug text-ink-3">Light shows on dark backgrounds and photos. Change its colour and strength on the right.</p>
    </Section>
  )
}

// ── stickers ────────────────────────────────────────────────

interface Sticker { id: string; name: string; pack: string; tags: string[] }

export function Stickers() {
  const readOnly = useEditor((s) => s.readOnly)
  return (
    <Fold title="Stickers & illustrations" count="174">
      {() => <StickerGrid readOnly={readOnly} />}
    </Fold>
  )
}
function StickerGrid({ readOnly }: { readOnly: boolean }) {
  const unit = useUnit()
  const { data, failed } = useFile<Sticker[]>('/studio/stickers/index.json')
  const [q, setQ] = useState('')
  const [pack, setPack] = useState('')
  const packs = useMemo(() => [...new Set((data ?? []).map((s) => s.pack))], [data])
  const term = q.trim().toLowerCase()
  const shown = useMemo(
    () => (data ?? []).filter((s) => (term ? `${s.name} ${s.pack} ${s.tags.join(' ')}`.toLowerCase().includes(term) : !pack || s.pack === pack)),
    [data, term, pack],
  )
  if (failed) return <p className="text-[12px] text-ink-3">The stickers couldn’t load. Try again in a moment.</p>
  if (!data) return <Skeleton className="h-24 w-full" />
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Search stickers…" />
      {!term && (
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          <button type="button" className={`chip shrink-0 ${pack === '' ? 'chip-on' : ''}`} onClick={() => setPack('')}>
            All
          </button>
          {packs.map((p) => (
            <button key={p} type="button" className={`chip shrink-0 ${pack === p ? 'chip-on' : ''}`} onClick={() => setPack(p)}>
              {p.replace('Illustrations · ', '')}
              {p.startsWith('Illustrations') ? ' art' : ''}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-2" style={GRID}>
        {shown.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={readOnly}
            className="flex aspect-square items-center justify-center rounded-lg border border-line bg-surface-2 p-1 hover:border-accent disabled:opacity-50"
            title={s.name}
            aria-label={`Add ${s.name}`}
            onClick={() => {
              const px = s.id.startsWith('illus-') ? 600 : 480
              const size = Math.round(unit * (s.id.startsWith('illus-') ? 1.9 : 1.25))
              addImage(`/studio/stickers/${s.id}.svg`, { w: px, h: px }, { fit: 'contain', name: s.name, w: size, h: size })
            }}
          >
            <img src={`/studio/stickers/${s.id}.svg`} alt="" loading="lazy" className="h-full w-full object-contain" />
          </button>
        ))}
      </div>
      {!shown.length && <p className="py-3 text-center text-[12px] text-ink-3">Nothing matches “{q.trim()}”.</p>}
    </>
  )
}

// ── icon library ────────────────────────────────────────────

/** `d`: path parts joined with "|" ("E:" = even-odd part); medical icons sit in a 48 box, line icons in a 24 box */
interface IconData { id: string; name: string; tags: string[]; d: string; cat?: string }
type IconSet = 'line' | 'health-filled' | 'health-outline'
const ICON_SETS: { value: IconSet; label: string; title: string }[] = [
  { value: 'health-filled', label: 'Medical', title: 'Solid medical icons' },
  { value: 'health-outline', label: 'Outline', title: 'Outline medical icons' },
  { value: 'line', label: 'Line', title: 'General line icons' },
]
const ICON_PAGE = 72
// what a recruiter reaches for first; anything not listed follows in A–Z order
const CAT_ORDER = ['People', 'Specialties', 'Devices', 'Places', 'Symbols', 'Objects', 'Medications', 'Diagnostics', 'PPE', 'Vehicles', 'Emotions', 'Exercise', 'Nutrition', 'Graphs', 'Shapes', 'Typography', 'Conditions', 'Blood']
// clinicians lead their category (a recruiting team's most-used pictures)
const STAFF = /nurse|doctor|health[- ]?worker|physio|therap|surgeon|pharmac|midwife|clinic|dentist|stethoscope|hospital/i
const staffRank = (i: { name: string }) => (STAFF.test(i.name) ? 0 : 1)
const catRank = (c?: string) => {
  const i = CAT_ORDER.indexOf(c ?? '')
  return i < 0 ? CAT_ORDER.length : i
}

export function IconLibrary() {
  const readOnly = useEditor((s) => s.readOnly)
  return (
    <Fold title="Icon library" count="2,300+">
      {() => <IconGrid readOnly={readOnly} />}
    </Fold>
  )
}
function IconGrid({ readOnly }: { readOnly: boolean }) {
  const unit = useUnit()
  const [set, setSet] = useState<IconSet>('health-filled')
  const { data, failed } = useFile<IconData[]>(`/studio/icons/${set}.json`)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [limit, setLimit] = useState(ICON_PAGE)
  const line = set === 'line'
  useEffect(() => setLimit(ICON_PAGE), [q, set, cat])
  const term = q.trim().toLowerCase()
  const sorted = useMemo(
    () => (data && data[0]?.cat ? [...data].sort((a, b) => catRank(a.cat) - catRank(b.cat) || (a.cat ?? '').localeCompare(b.cat ?? '') || staffRank(a) - staffRank(b)) : data ?? []),
    [data],
  )
  const cats = useMemo(() => [...new Set(sorted.map((i) => i.cat).filter((c): c is string => !!c))], [sorted])
  const found = useMemo(() => {
    if (!term) return cat && !line ? sorted.filter((i) => i.cat === cat) : sorted
    const words = term.split(/\s+/)
    return sorted.filter((i) => {
      const hay = `${i.name} ${i.cat ?? ''} ${i.tags.join(' ')}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
  }, [sorted, term, cat, line])
  const add = (i: IconData) => {
    const size = Math.round(unit * 0.55)
    if (line) addShape('path', { path: i.d, box: 24, name: i.name, w: size, h: size, fill: 'transparent', stroke: { color: '#E74598', width: Math.max(2, Math.round(size * 0.083)) } })
    else addShape('path', { path: i.d, box: 48, name: i.name, w: size, h: size, fill: '#E74598' })
  }
  return (
    <>
      <div className="mb-2">
        <Seg value={set} onChange={setSet} options={ICON_SETS} />
      </div>
      <SearchBox value={q} onChange={setQ} placeholder={data ? `Search ${data.length.toLocaleString('en-US')} ${line ? 'line' : 'medical'} icons…` : 'Search icons…'} />
      {!line && !term && cats.length > 1 && (
        <select className="input mb-2" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Icon category">
          <option value="">All categories</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
      {failed ? (
        <p className="text-[12px] text-ink-3">The icons couldn’t load. Try again in a moment.</p>
      ) : !data ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          <div className="grid gap-2" style={GRID}>
            {found.slice(0, limit).map((i) => (
              <button key={i.id} type="button" disabled={readOnly} className={TILE} title={i.cat ? `${i.name} · ${i.cat}` : i.name} aria-label={`Add ${i.name} icon`} onClick={() => add(i)}>
                {line ? (
                  <svg viewBox="0 0 24 24" className="h-3/5 w-3/5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {i.d.split('|').map((part, k) => (
                      <path key={k} d={part} />
                    ))}
                  </svg>
                ) : (
                  <svg viewBox="0 0 48 48" className="h-[70%] w-[70%]" fill="currentColor">
                    {i.d.split('|').map((part, k) => (part.startsWith('E:') ? <path key={k} d={part.slice(2)} fillRule="evenodd" /> : <path key={k} d={part} />))}
                  </svg>
                )}
              </button>
            ))}
          </div>
          {!found.length && <p className="py-3 text-center text-[12px] text-ink-3">Nothing matches “{q.trim()}”.</p>}
          {found.length > limit && (
            <button type="button" className="chip mx-auto mt-2 flex hover:border-accent/50" onClick={() => setLimit((n) => n + ICON_PAGE * 2)}>
              Show more ({(found.length - limit).toLocaleString('en-US')} left)
            </button>
          )}
        </>
      )}
    </>
  )
}
