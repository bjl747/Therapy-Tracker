// ─────────────────────────────────────────────────────────────
// Job Kit — the fast path. Type (or paste) a job once → every size of the
// post, an animated GIF and a ready caption, with the right city photo.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  ArrowLeft, Check, ClipboardCopy, Download, Film, ImageDown, Layers, MapPin, PencilLine, Rows3, Shuffle, Sparkles, X,
} from 'lucide-react'
import { SIZES, uid, type Design, type FieldDef } from '../engine/model'
import { instantiate } from '../templates/instantiate'
import type { TemplateDef } from '../templates/types'
import { BUILT_IN_TEMPLATES } from '../templates'
import { DesignCanvas, useAssetTick } from '../ui/DesignCanvas'
import { caption } from './captions'
import { tidyField } from './normalize'
import { parseJobs } from './batch'
import { nearbyCities, resolveLocation, searchCities, thumbUrl, cityIndex, type CityPhoto } from '../photos/cities'
import { formatLocation } from '../photos/location'
import { prepareDesign, resolveImage } from '../services'
import { repo } from '../data'
import { useToast } from '../ui/toast'

const DRAFT_KEY = 'studio.kit.draft'

function loadDraft(): Record<string, string> | null {
  try {
    const v = localStorage.getItem(DRAFT_KEY)
    return v ? (JSON.parse(v) as Record<string, string>) : null
  } catch {
    return null
  }
}
function saveDraft(f: Record<string, string>) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(f))
  } catch {
    /* private mode */
  }
}

const KIT_SIZES = ['square', 'portrait', 'story', 'landscape'] as const

/** render + encode everything for one job (shared by single + batch) */
async function buildKitFiles(
  t: TemplateDef,
  fields: Record<string, string>,
  sizes: string[],
  gif: boolean,
  prefix: string,
  onStep?: (msg: string) => void,
) {
  const { exportPng } = await import('../export/raster')
  const { exportGif } = await import('../export/animate')
  const files: { name: string; data: Blob | Uint8Array }[] = []
  for (const size of sizes) {
    const d = instantiate(t, size, fields)
    await prepareDesign(d)
    onStep?.(`${SIZES[size as keyof typeof SIZES]?.label ?? size} PNG`)
    files.push({ name: `${prefix}${size}.png`, data: await exportPng(d, 0, { scale: 1, resolveImage }) })
    if (gif && size === 'square') {
      onStep?.('Animated GIF')
      files.push({ name: `${prefix}${size}-animated.gif`, data: await exportGif(d, 0, { scale: 0.75, fps: 15, resolveImage }) })
    }
  }
  files.push({ name: `${prefix}caption.txt`, data: new TextEncoder().encode(caption(fields)) })
  return files
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'job'

export function JobKit() {
  const nav = useNavigate()
  const toast = useToast()
  const template = BUILT_IN_TEMPLATES[0]
  const [fields, setFields] = useState<Record<string, string>>(
    () => loadDraft() ?? Object.fromEntries(template.fieldDefs.map((f) => [f.key, f.example])),
  )
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'one' | 'many'>(params.get('mode') === 'many' ? 'many' : 'one')
  const [sizes, setSizes] = useState<string[]>(['square', 'story', 'landscape'])
  const [gif, setGif] = useState(true)
  const [variant, setVariant] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [photoPicker, setPhotoPicker] = useState(false)
  useAssetTick()

  useEffect(() => {
    const t = setTimeout(() => saveDraft(fields), 400)
    return () => clearTimeout(t)
  }, [fields])

  const designs = useMemo(
    () => Object.fromEntries(KIT_SIZES.map((s) => [s, instantiate(template, s, fields)])) as Record<string, Design>,
    [template, fields],
  )
  const text = useMemo(() => caption(fields, variant), [fields, variant])
  const match = fields.location ? resolveLocation(fields.location) : null
  const pinned = fields['location__photo'] ? cityIndex().find((c) => c.id === fields['location__photo']) : undefined

  const set = (k: string, v: string) => setFields((f) => ({ ...f, [k]: v }))
  const tidy = (k: string) => setFields((f) => ({ ...f, [k]: tidyField(k, f[k] ?? '') }))

  const downloadKit = async () => {
    setBusy('Preparing…')
    try {
      const files = await buildKitFiles(template, fields, sizes, gif, '', (m) => setBusy(`Rendering ${m}…`))
      const { makeZip } = await import('../export/zip')
      const { downloadBlob } = await import('../export/raster')
      downloadBlob(await makeZip(files), `${slug(`${fields.job_title}-${fields.location}`)}-kit.zip`)
      toast('Kit downloaded', `${files.length} files`)
    } catch (e) {
      toast('Could not build the kit', e instanceof Error ? e.message : undefined, 'error')
    } finally {
      setBusy(null)
    }
  }

  const copyImage = async (size: string) => {
    try {
      const { exportPng, copyPngToClipboard } = await import('../export/raster')
      const d = designs[size]
      await prepareDesign(d)
      await copyPngToClipboard(await exportPng(d, 0, { scale: 1, resolveImage }))
      toast('Image copied', 'Paste it straight into LinkedIn, Facebook or Teams.')
    } catch (e) {
      toast('Copy failed', e instanceof Error ? e.message : undefined, 'error')
    }
  }

  const downloadOne = async (size: string, kind: 'png' | 'gif') => {
    setBusy(kind === 'gif' ? 'Making GIF…' : 'Rendering…')
    try {
      const { exportPng, downloadBlob } = await import('../export/raster')
      const d = designs[size]
      await prepareDesign(d)
      const name = slug(`${fields.job_title}-${fields.location}-${size}`)
      if (kind === 'gif') {
        const { exportGif } = await import('../export/animate')
        downloadBlob(await exportGif(d, 0, { scale: 0.75, fps: 15, resolveImage }), `${name}.gif`)
      } else downloadBlob(await exportPng(d, 0, { scale: 1, resolveImage }), `${name}.png`)
    } finally {
      setBusy(null)
    }
  }

  /** save every chosen size as a design (one kit) and open the one clicked */
  const openInEditor = async (size: string) => {
    const kitId = uid('k')
    let openId = ''
    for (const s of sizes.includes(size) ? sizes : [...sizes, size]) {
      const d = instantiate(template, s, fields, {
        kitId,
        name: `${fields.job_title || 'Job post'} — ${fields.location || ''} (${SIZES[s as keyof typeof SIZES]?.label ?? s})`,
      })
      await repo.saveDesign(d)
      if (s === size) openId = d.id
    }
    nav(`/studio/design/${openId}`)
  }

  const groups = useMemo(() => {
    const g = new Map<string, FieldDef[]>()
    for (const f of template.fieldDefs) g.set(f.group ?? 'Details', [...(g.get(f.group ?? 'Details') ?? []), f])
    return [...g.entries()]
  }, [template])

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex flex-wrap items-center gap-2 px-4 md:px-6 pt-4 pb-3">
        <button className="btn" onClick={() => nav('/studio')} aria-label="Back to Studio">
          <ArrowLeft size={15} />
        </button>
        <div className="min-w-0">
          <div className="eyebrow">Studio · Job Kit</div>
          <h1 className="text-[19px] font-extrabold leading-tight truncate">{template.name}</h1>
        </div>
        <div className="flex-1" />
        <Seg
          value={mode}
          onChange={(v) => setMode(v as 'one' | 'many')}
          options={[
            { value: 'one', label: 'One job', icon: <PencilLine size={14} /> },
            { value: 'many', label: 'Many jobs', icon: <Rows3 size={14} /> },
          ]}
        />
      </div>

      {mode === 'many' ? (
        <BatchMode template={template} sizes={sizes} gif={gif} onPick={(f) => { setFields(f); setMode('one') }} />
      ) : (
        <div className="grid gap-4 px-4 md:px-6 pb-28 lg:pb-6 min-h-0 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)_380px]">
          {/* ── job details ── */}
          <section className="card card-accent p-4 min-w-0 self-start lg:sticky lg:top-4">
            <div className="flex items-center justify-between mb-2">
              <div className="eyebrow">Job details</div>
              <button
                className="text-[11.5px] font-semibold text-ink-3 hover:text-accent whitespace-nowrap"
                onClick={() => setFields(Object.fromEntries(template.fieldDefs.map((f) => [f.key, ''])))}
              >
                Clear all
              </button>
            </div>
            {groups.map(([g, defs]) => (
              <fieldset key={g} className="mb-3">
                <legend className="text-[11px] font-bold text-ink-2 mb-1.5">{g}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {defs.map((f) => (
                    <label
                      key={f.key}
                      className={clsx('min-w-0', (f.key === 'job_title' || f.key === 'location' || f.key === 'benefits' || f.key === 'weekly_pay') && 'col-span-2')}
                    >
                      <span className="block text-[11px] font-semibold text-ink-3 mb-1 truncate">{f.label}</span>
                      <input
                        className="input"
                        value={fields[f.key] ?? ''}
                        placeholder={f.example}
                        list={f.kind === 'location' ? 'studio-places' : undefined}
                        onChange={(e) => set(f.key, e.target.value)}
                        onBlur={() => {
                          tidy(f.key)
                          if (f.kind === 'location') set(f.key, formatLocation(fields[f.key] ?? ''))
                        }}
                      />
                      {f.kind === 'location' && (
                        <LocationHint
                          match={match}
                          pinned={pinned}
                          onChange={() => setPhotoPicker(true)}
                          onUnpin={() => set('location__photo', '')}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <PlaceSuggestions />
          </section>

          {/* ── previews ── */}
          <section className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="eyebrow mr-1">Sizes</span>
              {KIT_SIZES.map((s) => (
                <button
                  key={s}
                  className={clsx('chip', sizes.includes(s) && 'chip-on')}
                  onClick={() => setSizes((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]))}
                  aria-pressed={sizes.includes(s)}
                >
                  {sizes.includes(s) && <Check size={12} />} {SIZES[s].label}
                </button>
              ))}
              <button className={clsx('chip', gif && 'chip-on')} onClick={() => setGif(!gif)} aria-pressed={gif}>
                <Film size={12} /> Animated GIF
              </button>
            </div>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
              {sizes.map((s) => (
                <PreviewCard
                  key={s}
                  design={designs[s]}
                  label={SIZES[s as keyof typeof SIZES].label}
                  hint={SIZES[s as keyof typeof SIZES].hint}
                  onCopy={() => void copyImage(s)}
                  onPng={() => void downloadOne(s, 'png')}
                  onGif={gif ? () => void downloadOne(s, 'gif') : undefined}
                  onEdit={() => void openInEditor(s)}
                />
              ))}
              {sizes.length === 0 && (
                <div className="card p-8 text-center text-ink-3 text-sm">Pick at least one size above.</div>
              )}
            </div>
          </section>

          {/* ── caption ── */}
          <section className="card p-4 min-w-0 self-start lg:col-start-2 2xl:col-start-auto 2xl:sticky 2xl:top-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="eyebrow">Post caption</div>
              <div className="flex gap-1.5">
                <button className="btn h-8 px-2.5" onClick={() => setVariant((v) => v + 1)} aria-label="Different wording">
                  <Shuffle size={14} /> Reword
                </button>
                <button
                  className="btn h-8 px-2.5"
                  onClick={() => void navigator.clipboard.writeText(text).then(() => toast('Caption copied'))}
                >
                  <ClipboardCopy size={14} /> Copy
                </button>
              </div>
            </div>
            <pre className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-ink-2 font-sans">{text}</pre>
          </section>
        </div>
      )}

      {/* sticky action bar */}
      {mode === 'one' && (
        <div className="fixed lg:static bottom-0 inset-x-0 z-20 px-4 md:px-6 py-3 lg:py-0 lg:pb-6 bg-surface-0/90 lg:bg-transparent backdrop-blur border-t border-line lg:border-0 flex items-center gap-2 justify-end">
          {busy && <span className="text-[12px] text-ink-3 truncate">{busy}</span>}
          <button className="btn btn-primary h-10 px-4" onClick={() => void downloadKit()} disabled={!!busy || !sizes.length}>
            <Download size={16} /> Download kit
            <span className="opacity-80 font-normal tabular-nums">({sizes.length + (gif && sizes.includes('square') ? 1 : 0) + 1} files)</span>
          </button>
        </div>
      )}

      {photoPicker && (
        <PhotoPicker
          location={fields.location ?? ''}
          current={pinned?.id ?? match?.photo.id}
          onPick={(id) => {
            set('location__photo', id)
            setPhotoPicker(false)
          }}
          onClose={() => setPhotoPicker(false)}
        />
      )}
    </div>
  )
}

// ── pieces ──────────────────────────────────────────────────

export function Seg({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; icon?: React.ReactNode }[]
}) {
  return (
    <div className="inline-flex p-0.5 rounded-[11px] bg-surface-2 border border-line" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'h-8 px-3 rounded-[9px] text-[12.5px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors',
            value === o.value ? 'bg-surface-1 text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

function PreviewCard({
  design,
  label,
  hint,
  onCopy,
  onPng,
  onGif,
  onEdit,
}: {
  design: Design
  label: string
  hint: string
  onCopy: () => void
  onPng: () => void
  onGif?: () => void
  onEdit: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(300)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // tall formats shouldn't dominate the grid
  const maxH = 520
  const width = Math.min(w, (maxH * design.w) / design.h)
  return (
    <div className="card p-3 min-w-0 flex flex-col">
      <div className="flex items-baseline justify-between gap-2 mb-2 min-w-0">
        <div className="text-[13px] font-bold whitespace-nowrap">{label}</div>
        <div className="text-[11px] text-ink-3 truncate tabular-nums">
          {design.w}×{design.h} · {hint}
        </div>
      </div>
      <div ref={box} className="flex-1 flex items-center justify-center rounded-xl bg-surface-2/70 p-2 min-h-[120px]">
        <button onClick={onEdit} className="rounded-lg overflow-hidden shadow-md ring-1 ring-black/5 hover:ring-accent/60 transition" aria-label={`Edit ${label}`}>
          <DesignCanvas design={design} width={Math.max(60, width - 16)} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        <button className="btn h-8 px-2.5 flex-1" onClick={onCopy} title="Copy image to paste into LinkedIn, Facebook…">
          <ClipboardCopy size={14} /> Copy
        </button>
        <button className="btn h-8 px-2.5 flex-1" onClick={onPng}>
          <ImageDown size={14} /> PNG
        </button>
        {onGif && (
          <button className="btn h-8 px-2.5 flex-1" onClick={onGif}>
            <Film size={14} /> GIF
          </button>
        )}
        <button className="btn h-8 px-2.5 flex-1" onClick={onEdit}>
          <PencilLine size={14} /> Edit
        </button>
      </div>
    </div>
  )
}

function LocationHint({
  match,
  pinned,
  onChange,
  onUnpin,
}: {
  match: ReturnType<typeof resolveLocation>
  pinned?: CityPhoto
  onChange: () => void
  onUnpin: () => void
}) {
  const index = cityIndex()
  if (!index.length)
    return <span className="block mt-1 text-[11px] text-ink-3">City photos are still being added — a placeholder is used for now.</span>
  const p = pinned ?? match?.photo
  if (!p) return <span className="block mt-1 text-[11px] text-ink-3">Type “City, ST” to pick a photo automatically.</span>
  const why = pinned
    ? 'your pick'
    : match?.kind === 'exact'
      ? 'exact match'
      : match?.kind === 'nearby'
        ? `nearest photo · ${match.distanceKm} km`
        : 'largest city in the state'
  return (
    <span className="flex items-center gap-2 mt-1.5 min-w-0">
      <img src={thumbUrl(p.id)} alt="" className="w-10 h-7 rounded object-cover shrink-0" />
      <span className="text-[11.5px] text-ink-2 truncate min-w-0">
        <MapPin size={11} className="inline -mt-0.5" /> {p.city}, {p.st} <span className="text-ink-3">· {why}</span>
      </span>
      <button type="button" className="text-[11.5px] font-semibold text-accent whitespace-nowrap" onClick={onChange}>
        Change
      </button>
      {pinned && (
        <button type="button" className="text-ink-3" onClick={onUnpin} aria-label="Use automatic photo">
          <X size={12} />
        </button>
      )}
    </span>
  )
}

/** <datalist> of US places for the location input (loaded lazily) */
function PlaceSuggestions() {
  const [opts, setOpts] = useState<string[]>([])
  useEffect(() => {
    let live = true
    fetch('/photos/cities/places.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((p: Record<string, Record<string, unknown>>) => {
        if (!live) return
        const out: string[] = []
        for (const [st, names] of Object.entries(p))
          for (const n of Object.keys(names)) out.push(`${n.replace(/\b\w/g, (c) => c.toUpperCase())}, ${st}`)
        setOpts(out)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return (
    <datalist id="studio-places">
      {opts.map((o) => (
        <option key={o} value={o} />
      ))}
    </datalist>
  )
}

function PhotoPicker({
  location,
  current,
  onPick,
  onClose,
}: {
  location: string
  current?: string
  onPick: (id: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const near = nearbyCities(location, 12)
  const list = q.trim() ? searchCities(q, 60) : near
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6" onMouseDown={onClose}>
      <div
        className="card w-full sm:w-[760px] max-h-[92vh] flex flex-col bg-surface-1"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Choose a city photo"
      >
        <div className="flex items-center gap-2 p-4 border-b border-line">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">City photo</div>
            <div className="text-[15px] font-extrabold truncate">Photos near {location || 'this job'}</div>
          </div>
          <button className="btn" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="p-4 pb-2">
          <input className="input" autoFocus placeholder="Search any city or state…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="overflow-y-auto p-4 pt-2 grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
          {list.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p.id)}
              className={clsx('text-left rounded-xl overflow-hidden border-2 transition', p.id === current ? 'border-accent' : 'border-transparent hover:border-line-2')}
              title={`${p.credit.author} · ${p.credit.license}`}
            >
              <img src={thumbUrl(p.id)} alt="" loading="lazy" className="w-full aspect-[3/2] object-cover bg-surface-3" />
              <div className="px-1.5 py-1 text-[12px] font-semibold truncate">
                {p.city}, {p.st}
              </div>
            </button>
          ))}
          {!list.length && <div className="col-span-full text-sm text-ink-3 py-8 text-center">No photos found.</div>}
        </div>
      </div>
    </div>,
    document.body,
  )
}


// ── batch ───────────────────────────────────────────────────

function BatchMode({
  template,
  sizes,
  gif,
  onPick,
}: {
  template: TemplateDef
  sizes: string[]
  gif: boolean
  onPick: (fields: Record<string, string>) => void
}) {
  const toast = useToast()
  const [raw, setRaw] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const parsed = useMemo(() => parseJobs(raw, template.fieldDefs), [raw, template])
  const base = Object.fromEntries(template.fieldDefs.map((f) => [f.key, f.example]))
  const jobs = parsed.jobs.map((j) => {
    const out: Record<string, string> = { ...base, ...j }
    for (const k of Object.keys(j)) out[k] = tidyField(k, out[k])
    if (out.location) out.location = formatLocation(out.location)
    return out
  })

  const run = async () => {
    setBusy('Starting…')
    try {
      const all: { name: string; data: Blob | Uint8Array }[] = []
      for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i]
        const folder = `${String(i + 1).padStart(2, '0')}-${slug(`${j.job_title}-${j.location}`)}/`
        const files = await buildKitFiles(template, j, sizes, gif, folder, (m) => setBusy(`Job ${i + 1} of ${jobs.length}: ${m}…`))
        all.push(...files)
      }
      const { makeZip } = await import('../export/zip')
      const { downloadBlob } = await import('../export/raster')
      downloadBlob(await makeZip(all), `job-posts-${jobs.length}.zip`)
      toast(`${jobs.length} kits downloaded`)
    } catch (e) {
      toast('Batch failed', e instanceof Error ? e.message : undefined, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-4 px-4 md:px-6 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <section className="card card-accent p-4 min-w-0">
        <div className="eyebrow mb-1">Paste jobs</div>
        <p className="text-[12.5px] text-ink-2 mb-2">
          Copy rows from Excel or Google Sheets <b>including the header row</b> and paste below. Columns are matched
          automatically (Title, City, Weekly pay, Shift…). Anything missing uses the template’s example.
        </p>
        <textarea
          className="input h-64 py-2 font-mono text-[12px] leading-relaxed resize-y"
          placeholder={'Job Title\tLocation\tWeekly Pay\tShift\tDuration\nPharmacist\tFishersville, VA\t3227-3547\t5x8 days\t13\nCT Tech\tBoise, ID\t2400-2650\t3x12 nights\t13'}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
        {parsed.headers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {parsed.headers.map((h, i) => (
              <span key={i} className={clsx('chip', parsed.mapping[i] ? 'chip-on' : 'opacity-60 line-through')}>
                {h || '(blank)'} {parsed.mapping[i] && <>→ {template.fieldDefs.find((f) => f.key === parsed.mapping[i])?.label}</>}
              </span>
            ))}
          </div>
        )}
      </section>
      <section className="min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="eyebrow">{jobs.length ? `${jobs.length} job${jobs.length === 1 ? '' : 's'} ready` : 'Preview'}</div>
          <div className="flex-1" />
          {busy && <span className="text-[12px] text-ink-3 truncate">{busy}</span>}
          <button className="btn btn-primary" disabled={!jobs.length || !!busy || !sizes.length} onClick={() => void run()}>
            <Layers size={15} /> Make {jobs.length || ''} kits
          </button>
        </div>
        {!jobs.length ? (
          <div className="card p-8 text-center">
            <Sparkles className="mx-auto text-accent mb-2" size={22} />
            <div className="font-bold text-[14px]">One paste, every post</div>
            <div className="text-[12.5px] text-ink-3 mt-1">Each row becomes a full kit — all sizes, GIF and caption — in one ZIP.</div>
          </div>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr))]">
            {jobs.map((j, i) => (
              <button key={i} className="card p-2 text-left min-w-0 hover:ring-2 hover:ring-accent/40 transition" onClick={() => onPick(j)}>
                <DesignCanvas design={instantiate(template, 'square', j)} width={200} className="rounded-lg w-full !h-auto" />
                <div className="text-[12.5px] font-bold mt-1.5 truncate">{j.job_title}</div>
                <div className="text-[11.5px] text-ink-3 truncate">{j.location}</div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
