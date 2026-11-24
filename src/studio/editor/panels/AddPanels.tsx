// "Add things" panels: Text, Photos (city library), Brand (logos + brand files), Elements. Uploads: UploadsPanel.tsx.

import { useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react'
import { ImageOff, Search, Trash2, Upload } from 'lucide-react'
import type { ShapeEl, ShapeKind } from '../../engine/model'
import { ensureFontsFor, FONT_PAIRS, FONTS } from '../../engine/fonts'
import { loadImage, sizeOf } from '../../engine/images'
import { photoUrl, searchCities, thumbUrl } from '../../photos/cities'
import { repo, type BrandAsset } from '../../data'
import { useEditor } from '../store'
import { addBadge, addFrame, addImage, addOrFill, addShape, addText, addTextPair, toast } from '../actions'
import { FRAME_SHAPES } from '../../engine/frames'
import { FrameIcon } from '../Inspector'
import { assetDragProps } from '../assetDrag'
import { useUi } from '../uiStore'
import { useCityData } from '../hooks'
import { Section, Skeleton } from '../ui'
import { IconLibrary, LightEffects, MoreShapes, Stickers } from './ElementLibrary'

// ── Text ────────────────────────────────────────────────────

export function TextPanel() {
  const fieldDefs = useEditor((s) => s.design?.fieldDefs)
  const readOnly = useEditor((s) => s.readOnly)
  useEffect(() => {
    void ensureFontsFor(FONTS.map((f) => f.family))
  }, [])
  const tile = 'w-full min-w-0 rounded-xl border border-line bg-surface-1 px-3 text-left text-ink transition-colors hover:border-accent/60 hover:bg-surface-2 disabled:opacity-50'
  return (
    <div>
      <Section title="Add text">
        <button type="button" disabled={readOnly} className={`${tile} py-3 text-[22px] font-extrabold leading-tight`} onClick={() => addText('heading')}>
          Add a heading
        </button>
        <button type="button" disabled={readOnly} className={`${tile} py-2.5 text-[16px] font-semibold`} onClick={() => addText('sub')}>
          Add a subheading
        </button>
        <button type="button" disabled={readOnly} className={`${tile} py-2.5 text-[13px]`} onClick={() => addText('body')}>
          Add a little bit of body text
        </button>
      </Section>
      {!!fieldDefs?.length && (
        <Section title="Field text — fills in from the job">
          <div className="flex flex-wrap gap-1.5">
            {fieldDefs.map((f) => (
              <button key={f.key} type="button" disabled={readOnly} className="chip hover:border-accent/50" title={`Adds text that always shows “${f.label}”`} onClick={() => addText('sub', { text: `{{${f.key}}}` })}>
                {f.label}
              </button>
            ))}
          </div>
        </Section>
      )}
      <Section title="Font combinations">
        {FONT_PAIRS.map((p) => (
          <button key={p.label} type="button" disabled={readOnly} className={`${tile} py-2.5`} onClick={() => addTextPair(p.heading, p.body)} title={`${p.heading} + ${p.body}`}>
            <div className="truncate text-[19px] leading-tight" style={{ fontFamily: `"${p.heading}", Inter, sans-serif`, fontWeight: 700 }}>
              {p.label}
            </div>
            <div className="truncate text-[12px] text-ink-2" style={{ fontFamily: `"${p.body}", Inter, sans-serif` }}>
              {p.heading} with {p.body}
            </div>
          </button>
        ))}
      </Section>
    </div>
  )
}

// ── Photos ──────────────────────────────────────────────────

export function PhotosPanel() {
  const state = useCityData()
  const readOnly = useEditor((s) => s.readOnly)
  const [q, setQ] = useState('')
  const results = useMemo(() => (state === 'ready' ? searchCities(q, 60) : []), [q, state])
  return (
    <div className="flex min-h-0 flex-col">
      <div className="sticky top-0 z-10 border-b border-line/60 p-3" style={{ background: 'rgb(var(--surface-1))' }}>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="input pl-8" placeholder="Search US cities — “Austin” or “TX”" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search city photos" />
        </div>
      </div>
      <div className="p-3">
        {state === 'loading' && (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/3] w-full" />
            ))}
          </div>
        )}
        {state === 'empty' && (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-[13px] text-ink-3">
            <ImageOff size={22} />
            <div className="font-semibold text-ink-2">City photos are still being added</div>
            <div>Upload your own in Uploads, or drop an image onto the page.</div>
          </div>
        )}
        {state === 'ready' && !results.length && <div className="py-8 text-center text-[13px] text-ink-3">No city matches “{q}”</div>}
        {state === 'ready' && results.length > 0 && (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(116px, 1fr))' }}>
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={readOnly}
                title={`Photo: ${c.credit.author} · ${c.credit.license} · ${c.credit.provider}`}
                className="group relative touch-pan-y select-none overflow-hidden rounded-lg border border-line bg-surface-3 hover:border-accent"
                {...assetDragProps(
                  readOnly ? null : { src: photoUrl(c.id), w: c.width, h: c.height, preview: thumbUrl(c.id), opts: { credit: { ...c.credit }, name: `${c.city}, ${c.st}` } },
                  () => addOrFill(photoUrl(c.id), { w: c.width, h: c.height }, { credit: { ...c.credit }, name: `${c.city}, ${c.st}` }),
                )}
              >
                <img src={thumbUrl(c.id)} alt={`${c.city}, ${c.state}`} loading="lazy" draggable={false} className="aspect-[4/3] w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1 pt-4 text-left text-[11px] font-semibold text-white">
                  {c.city}, {c.st}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Brand ───────────────────────────────────────────────────

const BUILT_IN = [
  { url: '/brand/gqr-healthcare-white.png', name: 'GQR Healthcare' },
  { url: '/brand/unitimed-white.png', name: 'Unitimed' },
  { url: '/brand/bluepipes-2026-badge-clear.png', name: 'BluePipes 2026 badge' },
]

export function BrandPanel() {
  const readOnly = useEditor((s) => s.readOnly)
  // admins open the editor with canEditLocked; only they may remove a brand file
  const isAdmin = useEditor((s) => s.canEditLocked)
  const [assets, setAssets] = useState<BrandAsset[] | null>(null)
  // brand files the admins added on Studio → Brand (a person's own photos are in Uploads since 2026-11-19)
  const refresh = () => repo.listAssets().then((l) => setAssets(l.filter((a) => !a.ownerUid)), () => setAssets([]))
  useEffect(() => {
    void refresh()
  }, [])
  const addStatic = async (url: string, name: string) => {
    const img = await loadImage(url)
    if (!img) return toast('That file is missing')
    const { w, h } = sizeOf(img)
    addImage(url, { w, h }, { fit: 'contain', name })
  }
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({})
  const sizeFor = (url: string) => sizes[url] ?? null
  const tile = 'group relative flex aspect-square touch-pan-y select-none items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2 p-2 hover:border-accent disabled:opacity-50'
  const checker = { backgroundImage: 'repeating-conic-gradient(rgb(var(--surface-3)) 0 25%, transparent 0 50%)', backgroundSize: '14px 14px' }
  // built-in logos: their size is read once the tile's picture loads, so a drag can place them at the click size
  const noteSize = (url: string) => (e: SyntheticEvent<HTMLImageElement>) => {
    const i = e.currentTarget
    if (i.naturalWidth && !sizes[url]) setSizes((m) => ({ ...m, [url]: { w: i.naturalWidth, h: i.naturalHeight } }))
  }

  return (
    <div>
      <Section title="Brand logos">
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
          {BUILT_IN.map((b) => {
            const sz = sizeFor(b.url)
            return (
              // navy behind them: the official logos are transparent with white lettering
              <button
                key={b.url}
                type="button"
                disabled={readOnly}
                className={tile}
                style={{ background: '#0C184D' }}
                title={b.name}
                {...assetDragProps(sz && !readOnly ? { src: b.url, ...sz, preview: b.url, opts: { fit: 'contain', name: b.name } } : null, () => void addStatic(b.url, b.name))}
              >
                <img src={b.url} alt={b.name} className="max-h-full max-w-full object-contain" loading="lazy" draggable={false} onLoad={noteSize(b.url)} />
              </button>
            )
          })}
        </div>
      </Section>
      {!!assets?.length && (
        <Section title="Brand files">
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
            {assets.map((a) => {
              const opts = { fit: a.kind === 'logo' ? ('contain' as const) : ('cover' as const), name: a.name.replace(/\.[a-z0-9]+$/i, '') }
              return (
                <div key={a.id} className="group relative">
                  <button
                    type="button"
                    disabled={readOnly}
                    className={`${tile} w-full`}
                    style={checker}
                    title={a.name}
                    {...assetDragProps(readOnly ? null : { src: a.url, w: a.w, h: a.h, preview: a.url, opts }, () => addImage(a.url, { w: a.w, h: a.h }, opts))}
                  >
                    <img src={a.url} alt={a.name} className="max-h-full max-w-full object-contain" loading="lazy" draggable={false} />
                  </button>
                  {isAdmin && !readOnly && (
                    <button
                      type="button"
                      title="Remove this brand file (designs that use it keep it)"
                      aria-label={`Remove ${a.name}`}
                      className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white hover:bg-red-600 group-hover:flex"
                      onClick={() => void repo.deleteAsset(a.id).then(refresh, () => toast('That couldn’t be removed'))}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}
      <Section>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2.5 text-left text-[12.5px] text-ink-3 hover:border-accent/60 hover:text-ink-2"
          onClick={() => useUi.getState().setLeftTab('uploads')}
        >
          <Upload size={14} className="shrink-0" /> Your own photos are in Uploads
        </button>
      </Section>
    </div>
  )
}

// ── Elements ────────────────────────────────────────────────

export const ICON_PATHS: { name: string; path: string }[] = [
  { name: 'Map pin', path: 'M50 4C30.7 4 15 19.7 15 39c0 25.4 35 57 35 57s35-31.6 35-57C85 19.7 69.3 4 50 4zm0 48.5c-7.5 0-13.5-6-13.5-13.5S42.500 25.5 50 25.5 63.5 31.500 63.5 39 57.500 52.500 50 52.500z' },
  { name: 'Check', path: 'M10 54l13-13 17 17 37-40 13 12-49 54z' },
  { name: 'Arrow', path: 'M6 41h54V19l34 31-34 31V59H6z' },
  { name: 'Medical cross', path: 'M37 8h26v29h29v26H63v29H37V63H8V37h29z' },
  { name: 'Heart', path: 'M50 90C19 67 7 51 7 33.500 7 19.500 18 9 31.500 9 39 9 46 12.800 50 19c4-6.200 11-10 18.500-10C82 9 93 19.500 93 33.500 93 51 81 67 50 90z' },
  { name: 'Chevron', path: 'M28 8l44 42-44 42-13-13 30-29-30-29z' },
  { name: 'Speech bubble', path: 'M14 10h72a8 8 0 0 1 8 8v44a8 8 0 0 1-8 8H46L24 90V70H14a8 8 0 0 1-8-8V18a8 8 0 0 1 8-8z' },
  { name: 'Bolt', path: 'M58 4L16 56h28l-6 40 46-56H54z' },
]

function starPoints(n: number): string {
  const pts: string[] = []
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? 46 : 46 * 0.45
    const a = (Math.PI * i) / n - Math.PI / 2
    pts.push(`${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`)
  }
  return pts.join(' ')
}

export function ElementsPanel() {
  const readOnly = useEditor((s) => s.readOnly)
  const unit = useEditor((s) => (s.design ? Math.round(Math.min(s.design.w, s.design.h) * 0.24) : 240))
  const tile = 'flex aspect-square items-center justify-center rounded-lg border border-line bg-surface-1 text-accent hover:border-accent hover:bg-surface-2 disabled:opacity-50'
  const shapes: { name: string; kind: ShapeKind; o?: Partial<ShapeEl>; svg: ReactNode }[] = [
    { name: 'Rectangle', kind: 'rect', svg: <rect x="8" y="16" width="84" height="68" /> },
    { name: 'Rounded rectangle', kind: 'rect', o: { radius: Math.round(unit * 0.16) }, svg: <rect x="8" y="16" width="84" height="68" rx="16" /> },
    { name: 'Circle', kind: 'ellipse', svg: <circle cx="50" cy="50" r="42" /> },
    { name: 'Triangle', kind: 'triangle', svg: <path d="M50 10 92 88H8z" /> },
    { name: 'Star', kind: 'star', o: { points: 5 }, svg: <polygon points={starPoints(5)} /> },
    { name: 'Burst', kind: 'star', o: { points: 12 }, svg: <polygon points={starPoints(12)} /> },
    { name: 'Line', kind: 'line', o: { w: unit * 2, h: 6 }, svg: <rect x="8" y="46" width="84" height="8" rx="4" /> },
    { name: 'Outline', kind: 'rect', o: { fill: 'transparent', stroke: { color: '#2940DA', width: 6 }, radius: Math.round(unit * 0.08) }, svg: <rect x="12" y="20" width="76" height="60" rx="8" fill="none" stroke="currentColor" strokeWidth="7" /> },
  ]
  return (
    <div>
      <Section title="Shapes">
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))' }}>
          {shapes.map((s) => (
            <button key={s.name} type="button" disabled={readOnly} className={tile} title={s.name} aria-label={`Add ${s.name}`} onClick={() => addShape(s.kind, s.o)}>
              <svg viewBox="0 0 100 100" className="h-3/5 w-3/5" fill="currentColor">
                {s.svg}
              </svg>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Photo frames">
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))' }}>
          {FRAME_SHAPES.map((fs) => (
            <button
              key={fs.id}
              type="button"
              disabled={readOnly}
              className={tile}
              title={`${fs.label} frame: drop a photo into it`}
              aria-label={`Add ${/^[aeiou]/i.test(fs.label) ? 'an' : 'a'} ${fs.label.toLowerCase()} photo frame`}
              onClick={() => addFrame(fs.id, fs.label)}
            >
              <span className="text-ink-3 [&_svg]:h-7 [&_svg]:w-7">
                <FrameIcon shape={fs.id} size={28} />
              </span>
            </button>
          ))}
        </div>
        <p className="text-[11.5px] text-ink-3">Drag a photo from Uploads or Photos onto a frame to fill it.</p>
      </Section>
      <LightEffects />
      <MoreShapes />
      <Section title="Quick icons">
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))' }}>
          {ICON_PATHS.map((ic) => (
            <button
              key={ic.name}
              type="button"
              disabled={readOnly}
              className={tile}
              title={ic.name}
              aria-label={`Add ${ic.name} icon`}
              onClick={() => addShape('path', { path: ic.path, name: ic.name, w: Math.round(unit * 0.5), h: Math.round(unit * 0.5), fill: '#E74599' })}
            >
              <svg viewBox="0 0 100 100" className="h-3/5 w-3/5" fill="currentColor" fillRule="evenodd">
                <path d={ic.path} />
              </svg>
            </button>
          ))}
        </div>
      </Section>
      <IconLibrary />
      <Stickers />
      <Section title="Pills & badges">
        <div className="flex flex-wrap gap-2">
          {[
            { t: 'Now hiring', bg: '#E74599', c: '#FFFFFF', r: 999 },
            { t: 'New', bg: '#12C4D1', c: '#0C184D', r: 999 },
            { t: 'Urgent need', bg: '#0C184D', c: '#FFFFFF', r: 999 },
            { t: '$2,500 / week', bg: '#2940DA', c: '#FFFFFF', r: 10 },
            { t: 'Apply today', bg: '#FFFFFF', c: '#0C184D', r: 10 },
          ].map((b) => (
            <button
              key={b.t}
              type="button"
              disabled={readOnly}
              onClick={() => addBadge(b.t, b.bg, b.c, b.r)}
              className="h-7 whitespace-nowrap border border-line px-3 text-[11px] font-bold uppercase tracking-wide"
              style={{ background: b.bg, color: b.c, borderRadius: b.r === 999 ? 999 : 8 }}
            >
              {b.t}
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}
