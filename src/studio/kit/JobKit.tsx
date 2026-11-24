// ─────────────────────────────────────────────────────────────
// Job Kit — the fast path. Type a job once (or pick a Hot Job) → every size of
// the post, an animated GIF and a ready caption, with the right city photo.
// Many jobs: the same form for up to five jobs → the roundup post + a kit each.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertTriangle, ArrowLeft, ListChecks, Lock, Send, History, Briefcase, Check, ChevronDown, ChevronUp, ClipboardCopy, Download, Film, ImageDown, Layers, MapPin, Maximize2, PencilLine, Plus, Rows3, Shuffle, Sparkles, Trash2, X,
} from 'lucide-react'
import { SIZES, uid, type Design, type FieldDef } from '../engine/model'
import { instantiate } from '../templates/instantiate'
import type { TemplateDef } from '../templates/types'
import { BUILT_IN_TEMPLATES } from '../templates'
import { useTemplates, kitTemplates, roundupTemplates } from '../templates/store'
import { HOT_JOBS_ROUNDUP, roundupFields } from '../templates/roundup'
import { DesignCanvas, useAssetTick } from '../ui/DesignCanvas'
import { caption } from './captions'
import { tidyField } from './normalize'
import { nearbyCities, resolveLocation, searchCities, thumbUrl, cityIndex, type CityPhoto } from '../photos/cities'
import { formatLocation } from '../photos/location'
import { isPhotoLink, prepareDesign, resolveImage } from '../services'
import { repo, stashPreview } from '../data'
import { useToast } from '../ui/toast'
import { copyPngPromiseToClipboard, exportPng } from '../export/raster'
import { LocationInput } from './LocationInput'
import { HotJobPicker } from './HotJobPicker'
import { PayCalc } from './PayCalc'
import { MAX_JOBS, blankJob, isBlankJob, isReadyJob, openSlots, placeHotJobs, withHotJob } from './many'
import { useAuth } from '@/context/AuthContext'
import { kitWarnings } from './warnings'
import { designThumb } from '../export/thumb'
import { UploadsPick } from './UploadsPick'
import { getKitLink, jobKey, kitPostName, sameSource, setKitLink, type KitSource } from './link'
import { KIT_KEYS, claimKitStorage } from './storage'

const DRAFT_KEY = KIT_KEYS.draft

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

/** the full-size PNG of a design, as a promise (fonts + photo loaded first) */
function pngOf(d: Design): Promise<Blob> {
  return prepareDesign(d).then(() => exportPng(d, 0, { scale: 1, resolveImage }))
}

/** Many jobs' list, kept for this tab only (BJ, 2026-11-19: it starts blank, not from the One job form) so a trip to
 *  the editor and back keeps it */
const MANY_KEY = KIT_KEYS.many
function loadMany(): Record<string, string>[] | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(MANY_KEY) ?? 'null')
    return Array.isArray(v) && v.length ? v.slice(0, 5) : null
  } catch {
    return null
  }
}
function saveMany(list: Record<string, string>[]) {
  try {
    sessionStorage.setItem(MANY_KEY, JSON.stringify(list))
  } catch {
    /* private mode */
  }
}

/** download one design as a PNG or an animated GIF */
async function downloadDesign(d: Design, name: string, kind: 'png' | 'gif') {
  const { exportPng, downloadBlob } = await import('../export/raster')
  await prepareDesign(d)
  if (kind === 'gif') {
    const { exportGif } = await import('../export/animate')
    downloadBlob(await exportGif(forGif(d), 0, { scale: GIF_SCALE, fps: GIF_FPS, hold: 3, resolveImage }), `${name}.gif`)
  } else downloadBlob(await exportPng(d, 0, { scale: 1, resolveImage }), `${name}.png`)
}

const RECENT_KEY = KIT_KEYS.recent
function recentJobs(): Record<string, string>[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.slice(0, 10) : []
  } catch {
    return []
  }
}
/** keep the last 10 distinct jobs this person made posts for (per browser) */
function rememberJob(f: Record<string, string>) {
  if (!f.job_title?.trim()) return
  try {
    const key = (j: Record<string, string>) => `${j.job_title}|${j.location}`.toLowerCase()
    const list = [f, ...recentJobs().filter((j) => key(j) !== key(f))].slice(0, 10)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    /* private mode */
  }
}

/** social sites cap GIFs (LinkedIn ~5 MB); 600px @ 12fps keeps a 5s post well under */
const GIF_SCALE = 600 / 1080
const GIF_FPS = 12

/** GIFs: keep the photo still (a moving photo changes every pixel of every
 *  frame and balloons the file); entrances still animate */
function forGif(d: Design): Design {
  return { ...d, pages: d.pages.map((p) => ({ ...p, elements: p.elements.map((e) => (e.type === 'image' ? { ...e, kenBurns: false } : e)) })) }
}

/** render + encode everything for one job (shared by One job and Many jobs) */
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
      files.push({ name: `${prefix}${size}-animated.gif`, data: await exportGif(forGif(d), 0, { scale: GIF_SCALE, fps: GIF_FPS, hold: 3, resolveImage }) })
    }
  }
  // caption uses the template's locked values (job type, website…)
  files.push({ name: `${prefix}caption.txt`, data: new TextEncoder().encode(caption(instantiate(t, t.defaultSize, fields).fields)) })
  return files
}

/** true when `el` fits inside the scrolling area with room to spare. A side card only sticks while you scroll when all
 *  of it stays on screen; a card taller than the window scrolls with the page instead (its bottom would be cut off). */
function useFits(el: HTMLElement | null, scroller: HTMLElement | null, gap = 32) {
  const [fits, setFits] = useState(false)
  useEffect(() => {
    if (!el || !scroller || typeof ResizeObserver === 'undefined') return setFits(false)
    const check = () => setFits(el.offsetHeight + gap <= scroller.clientHeight)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    ro.observe(scroller)
    check()
    return () => ro.disconnect()
  }, [el, scroller, gap])
  return fits
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72).replace(/-+$/, '') || 'job'

export function JobKit() {
  const nav = useNavigate()
  const toast = useToast()
  // View access: make and download posts; saving designs / the editor needs Edit (the rules say the same)
  const auth = useAuth()
  const canEdit = auth.can('studio') === 'edit'
  // the draft, Recent jobs and Many jobs belong to whoever typed them: another person's are cleared before they're read
  claimKitStorage(auth.user?.uid ?? '')
  const { templates } = useTemplates()
  const choices = kitTemplates(templates)
  const [templateId, setTemplateId] = useState(() => {
    try {
      return localStorage.getItem('studio.kit.template') ?? ''
    } catch {
      return ''
    }
  })
  const template = choices.find((t) => t.id === templateId) ?? choices[0] ?? BUILT_IN_TEMPLATES[0]
  const pickTemplate = (id: string) => {
    setTemplateId(id)
    try {
      localStorage.setItem('studio.kit.template', id)
    } catch {
      /* private mode */
    }
  }
  // One job's form (kept as a draft in this browser)
  const [oneFields, setOneFields] = useState<Record<string, string>>(
    () => loadDraft() ?? Object.fromEntries(template.fieldDefs.map((f) => [f.key, f.example])),
  )
  const [params, setParams] = useSearchParams()
  const [mode, setModeState] = useState<'one' | 'many'>(params.get('mode') === 'many' ? 'many' : 'one')
  // Many jobs (BJ, 2026-11-19): up to five job forms, starting with a blank one (not the One job form's job). Kept for
  // this tab only, so a trip to the editor and back keeps them.
  const [many, setMany] = useState<Record<string, string>[]>(() => loadMany() ?? [blankJob(template)])
  const [openIdx, setOpenIdx] = useState(() => many.length - 1)
  /** a Many jobs job opened in the full one-job view (all sizes, caption, its own kit). Coming back from one of its
   *  posts (`?mode=many&job=n`, kit/link.ts) opens the same job again. */
  const [focus, setFocus] = useState<number | null>(() => {
    const j = Number(params.get('job') ?? NaN)
    return params.get('mode') === 'many' && Number.isInteger(j) && j >= 0 && j < many.length ? j : null
  })
  const [sizes, setSizes] = useState<string[]>(['square', 'story', 'landscape'])
  const [gif, setGif] = useState(true)
  const [variant, setVariant] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  /** From Hot Jobs: fill one job (`index` = a Many jobs job, null = the form on screen), or tick several (Many jobs) */
  const [hot, setHot] = useState<{ kind: 'fill'; index: number | null } | { kind: 'many' } | null>(null)
  const previewsRef = useRef<HTMLElement>(null)
  // the page scrolls inside this box, above the action bar (which is a footer, not an overlay)
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const [detailsEl, setDetailsEl] = useState<HTMLElement | null>(null)
  const [captionEl, setCaptionEl] = useState<HTMLElement | null>(null)
  const detailsFit = useFits(detailsEl, scroller)
  const captionFit = useFits(captionEl, scroller)
  useAssetTick()

  const setMode = (v: 'one' | 'many') => {
    setFocus(null)
    setModeState(v)
    setParams(v === 'many' ? { mode: 'many' } : {}, { replace: true })
  }

  // the job number is only for the trip back from a post: drop it from the address once it's read
  useEffect(() => {
    if (params.has('job')) setParams(mode === 'many' ? { mode: 'many' } : {}, { replace: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // the one-job view edits the One job form, or the Many jobs job that was opened
  const inFocus = mode === 'many' && focus !== null && !!many[focus]
  /** which job the posts on screen belong to (a post opened from here writes its form back to it, kit/link.ts) */
  const source: KitSource = inFocus ? { mode: 'many', index: focus! } : { mode: 'one' }
  const fields = inFocus ? many[focus!] : oneFields
  const setFields = useCallback(
    (u: SetStateAction<Record<string, string>>) => {
      if (inFocus) setMany((list) => list.map((j, i) => (i === focus ? (typeof u === 'function' ? u(j) : u) : j)))
      else setOneFields(u)
    },
    [inFocus, focus],
  )

  useEffect(() => {
    const t = setTimeout(() => saveDraft(oneFields), 400)
    return () => clearTimeout(t)
  }, [oneFields])
  useEffect(() => {
    const t = setTimeout(() => saveMany(many), 400)
    return () => clearTimeout(t)
  }, [many])
  // opening a job (or going back to all jobs / switching mode) starts at the top
  useEffect(() => {
    scroller?.scrollTo({ top: 0 })
  }, [focus, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // keep the size picks to sizes this template actually has
  const layoutKeys = Object.keys(template.layouts).join(',')
  useEffect(() => {
    setSizes((prev) => {
      const ok = prev.filter((s) => template.layouts[s])
      if (ok.length === prev.length && ok.length) return prev // unchanged → no re-render
      return ok.length ? ok : [template.defaultSize]
    })
  }, [template.id, layoutKeys]) // eslint-disable-line react-hooks/exhaustive-deps

  // locked template values always win over anything stored in drafts/recent jobs
  const effective = useMemo(
    () => ({ ...fields, ...Object.fromEntries(template.fieldDefs.filter((f) => f.locked).map((f) => [f.key, f.example])) }),
    [fields, template],
  )

  const designs = useMemo(
    () => Object.fromEntries(Object.keys(template.layouts).map((s) => [s, instantiate(template, s, fields)])) as Record<string, Design>,
    [template, fields],
  )
  const text = useMemo(() => caption(effective, variant), [effective, variant])

  const downloadKit = async () => {
    setBusy('Preparing…')
    try {
      const files = await buildKitFiles(template, fields, sizes, gif, '', (m) => setBusy(`Rendering ${m}…`))
      const { makeZip } = await import('../export/zip')
      const { downloadBlob } = await import('../export/raster')
      downloadBlob(await makeZip(files), `${slug(`${fields.job_title}-${fields.location}`)}-kit.zip`)
      toast('Kit downloaded', `${files.length} files`)
      rememberJob(fields)
    } catch (e) {
      toast('Could not build the kit', e instanceof Error ? e.message : undefined, 'error')
    } finally {
      setBusy(null)
    }
  }

  /** Many jobs: a kit per job (every job with a title) in one ZIP */
  const ready = many.filter(isReadyJob)
  const downloadAll = async () => {
    setBusy('Starting…')
    try {
      const all: { name: string; data: Blob | Uint8Array }[] = []
      let done = 0
      for (let i = 0; i < many.length; i++) {
        const j = many[i]
        if (!isReadyJob(j)) continue // blank jobs are skipped; folders keep the form's job number (Job 5 → 05-…)
        done++
        const folder = `${String(i + 1).padStart(2, '0')}-${slug(`${j.job_title}-${j.location}`)}/`
        const files = await buildKitFiles(template, j, sizes, gif, folder, (m) => setBusy(`Job ${i + 1} (${done} of ${ready.length}): ${m}…`))
        all.push(...files)
      }
      const { makeZip } = await import('../export/zip')
      const { downloadBlob } = await import('../export/raster')
      downloadBlob(await makeZip(all), `job-posts-${ready.length}.zip`)
      ready.forEach(rememberJob)
      toast(`${ready.length} kit${ready.length === 1 ? '' : 's'} downloaded`)
    } catch (e) {
      toast('Could not build the kits', e instanceof Error ? e.message : undefined, 'error')
    } finally {
      setBusy(null)
    }
  }

  const copyImage = async (size: string) => {
    try {
      // the clipboard write starts synchronously in the click (Safari requires it)
      await copyPngPromiseToClipboard(pngOf(designs[size]))
      toast('Image copied', 'Paste it straight into LinkedIn, Facebook or Teams.')
      rememberJob(fields)
    } catch (e) {
      toast('Copy failed', e instanceof Error ? e.message : undefined, 'error')
    }
  }

  /** copy the post image, then open LinkedIn with the caption already typed —
   *  the recruiter just pastes (Ctrl+V) the image and presses Post */
  const postLinkedIn = async () => {
    const size = sizes.includes('square') ? 'square' : sizes.includes('landscape') ? 'landscape' : sizes[0] ?? 'square'
    // copy FIRST: the clipboard only works while this tab has focus. Browsers
    // still allow the new tab for a few seconds after the click.
    let copied = false
    try {
      await copyPngPromiseToClipboard(pngOf(designs[size]))
      copied = true
    } catch {
      /* fall through — caption is still pre-filled */
    }
    const url = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`
    // ('noopener' would make window.open return null even on success)
    const w = window.open(url, '_blank')
    if (w) w.opener = null
    if (!w) toast('Allow pop-ups to open LinkedIn', 'Or copy the caption and image with the buttons.', 'error')
    else if (copied) toast('Image copied — press Ctrl+V in the LinkedIn post to attach it')
    else toast('Couldn’t copy the image', 'The caption is filled in — attach the PNG instead.', 'error')
    rememberJob(fields)
  }

  const downloadOne = async (size: string, kind: 'png' | 'gif') => {
    if (busy) return
    setBusy(kind === 'gif' ? 'Making GIF…' : 'Rendering…')
    try {
      await downloadDesign(designs[size], slug(`${fields.job_title}-${fields.location}-${size}`), kind)
    } catch (e) {
      toast('Download failed', e instanceof Error ? e.message : undefined, 'error')
    } finally {
      setBusy(null)
    }
  }

  /** save every chosen size as a design (one kit) and open the one clicked. Opening a post of the same job again
   *  (back and forth with the post screen, BJ 2026-11-19) brings those designs up to date with the form instead of
   *  saving a new set each time; canvas changes made on them are kept. */
  const opening = useRef(false)
  const openInEditor = async (size: string) => {
    if (opening.current) return // a double-click must not make two kits
    opening.current = true
    try {
      const prev = getKitLink()
      const reuse =
        prev?.kitId && prev.ids && prev.templateId === template.id && sameSource(prev.source, source) && prev.job === jobKey(fields) ? prev : null
      const kitId = reuse?.kitId ?? uid('k')
      const ids: Record<string, string> = { ...(reuse?.ids ?? {}) }
      let openId = ''
      for (const s of sizes.includes(size) ? sizes : [...sizes, size]) {
        const fresh = instantiate(template, s, fields, {
          kitId,
          name: kitPostName(fields, s),
        })
        const old = ids[s] ? await repo.getDesign(ids[s]).catch(() => null) : null
        const d = old ? { ...old, name: fresh.name, fields: fresh.fields, updatedAt: Date.now() } : fresh
        await repo.saveDesign(d, await designThumb(d))
        ids[s] = d.id
        if (s === size) openId = d.id
      }
      setKitLink({ source, templateId: template.id, kitId, ids, job: jobKey(fields) })
      rememberJob(fields)
      nav(`/studio/design/${openId}`)
    } catch (e) {
      toast('Couldn’t open the editor', e instanceof Error ? e.message : undefined, 'error')
    } finally {
      opening.current = false
    }
  }

  /** View access: open a size full-size in the editor, read-only. Nothing is saved (the design is kept in this tab only). */
  const openPreview = (size: string) => {
    const d = instantiate(template, size, fields, {
      name: kitPostName(fields, size),
    })
    stashPreview(d)
    setKitLink({ source, templateId: template.id, previewId: d.id })
    rememberJob(fields)
    nav(`/studio/design/${d.id}`)
  }

  const slots = openSlots(many, template)
  const manyList = mode === 'many' && !inFocus
  const fileCount = sizes.length + (gif && sizes.includes('square') ? 1 : 0) + 1

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div ref={setScroller} className="flex-1 min-h-0 overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2 px-4 md:px-6 pt-4 pb-3">
        {inFocus ? (
          <button className="btn" onClick={() => setFocus(null)} aria-label="Back to all jobs" title="Back to all jobs">
            <ArrowLeft size={15} />
          </button>
        ) : (
          <button className="btn" onClick={() => nav('/studio')} aria-label="Back to Studio">
            <ArrowLeft size={15} />
          </button>
        )}
        <div className="min-w-0">
          <div className="eyebrow">Studio · Job Kit{inFocus ? ` · Job ${focus! + 1} of ${many.length}` : ''}</div>
          {choices.length > 1 ? (
            <select
              className="text-[19px] font-extrabold leading-tight bg-transparent outline-none max-w-full truncate cursor-pointer"
              value={template.id}
              onChange={(e) => pickTemplate(e.target.value)}
              aria-label="Template"
            >
              {choices.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : (
            <h1 className="text-[19px] font-extrabold leading-tight truncate">{template.name}</h1>
          )}
        </div>
        <div className="flex-1" />
        {inFocus && (
          <button className="btn" onClick={() => setFocus(null)}>
            <Rows3 size={15} /> All jobs
          </button>
        )}
        <button
          className="btn"
          onClick={() => setHot(manyList ? { kind: 'many' } : { kind: 'fill', index: null })}
          disabled={manyList && slots === 0}
          title={manyList ? (slots ? `Pick up to ${slots} Hot Job${slots === 1 ? '' : 's'}` : `${MAX_JOBS} jobs is the most: remove one to add another`) : undefined}
        >
          <Briefcase size={15} /> From Hot Jobs
        </button>
        <Seg
          value={mode}
          onChange={(v) => setMode(v as 'one' | 'many')}
          options={[
            { value: 'one', label: 'One job', icon: <PencilLine size={14} /> },
            { value: 'many', label: 'Many jobs', icon: <Rows3 size={14} /> },
          ]}
        />
      </div>

      {manyList ? (
        <ManyJobs
          template={template}
          jobs={many}
          setJobs={setMany}
          openIdx={openIdx}
          setOpenIdx={setOpenIdx}
          onOpenJob={setFocus}
          onHot={(i) => setHot({ kind: 'fill', index: i })}
          sizes={sizes}
          setSizes={setSizes}
          gif={gif}
          setGif={setGif}
          canEdit={canEdit}
          busy={busy}
          setBusy={setBusy}
        />
      ) : (
        <div className="grid gap-4 px-4 md:px-6 pb-6 min-h-0 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)_380px]">
          {/* phone: the form and its mini preview share one box, so the preview follows only while the form is on screen
              (on wide screens the box disappears and the form is a grid column as before) */}
          <div className="flex flex-col gap-4 min-w-0 lg:contents">
          {/* ── phone: live mini preview that follows you while you type ── */}
          {sizes[0] && (
            <button
              className="lg:hidden sticky top-0 z-10 card bg-surface-1/95 p-2 flex items-center gap-3 text-left"
              onClick={() => previewsRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              <span className="shrink-0 rounded-md overflow-hidden ring-1 ring-black/5">
                <DesignCanvas design={designs[sizes[0]]} width={64} />
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-bold truncate">Live preview</span>
                <span className="block text-[11.5px] text-ink-3 truncate">Updates as you type · tap to see all {sizes.length} sizes</span>
              </span>
            </button>
          )}

          {/* ── job details ── */}
          <section ref={setDetailsEl} className={clsx('card card-accent p-4 min-w-0 self-start', detailsFit && 'lg:sticky lg:top-4')}>
            <div className="flex items-center justify-between mb-2">
              <div className="eyebrow">{inFocus ? `Job ${focus! + 1} details` : 'Job details'}</div>
              <button
                className="text-[11.5px] font-semibold text-ink-3 hover:text-accent whitespace-nowrap"
                onClick={() => setFields(blankJob(template))}
              >
                Clear all
              </button>
            </div>
            <JobForm template={template} fields={fields} setFields={setFields} />
          </section>
          </div>

          {/* ── previews ── */}
          <section className="min-w-0 scroll-mt-20" ref={previewsRef}>
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="eyebrow mr-1">Sizes</span>
              <SizeChips template={template} sizes={sizes} setSizes={setSizes} gif={gif} setGif={setGif} />
            </div>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
              {sizes.filter((s) => designs[s]).map((s) => (
                <PreviewCard
                  key={s}
                  design={designs[s]}
                  label={SIZES[s as keyof typeof SIZES].label}
                  hint={SIZES[s as keyof typeof SIZES].hint}
                  onCopy={() => void copyImage(s)}
                  onPng={() => void downloadOne(s, 'png')}
                  onGif={gif ? () => void downloadOne(s, 'gif') : undefined}
                  onEdit={canEdit ? () => void openInEditor(s) : undefined}
                  onOpen={canEdit ? undefined : () => openPreview(s)}
                />
              ))}
              {sizes.length === 0 && (
                <div className="card p-8 text-center text-ink-3 text-sm">Pick at least one size above.</div>
              )}
            </div>
          </section>

          {/* ── caption ── */}
          <section ref={setCaptionEl} className={clsx('card p-4 min-w-0 self-start lg:col-start-2 2xl:col-start-auto', captionFit && '2xl:sticky 2xl:top-4')}>
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
            <button className="btn btn-primary w-full mb-3" onClick={() => void postLinkedIn()} disabled={!sizes.length}>
              <Send size={15} /> Post on LinkedIn
            </button>
            <pre className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-ink-2 font-sans">{text}</pre>
          </section>
        </div>
      )}
      </div>

      {/* action bar: a footer under the scrolling area, so it stays at the bottom of the window and never covers the page */}
      <div className="shrink-0 px-4 md:px-6 py-3 bg-surface-0/85 backdrop-blur border-t border-line flex items-center gap-2 justify-end">
        {busy && <span className="text-[12px] text-ink-3 truncate min-w-0">{busy}</span>}
        {manyList ? (
          <button
            className="btn btn-primary h-10 px-4"
            onClick={() => void downloadAll()}
            disabled={!!busy || !sizes.length || !ready.length}
            title={!ready.length ? 'Give at least one job a title' : 'A kit for every job, in one ZIP'}
          >
            <Layers size={16} /> Download {ready.length || ''} kit{ready.length === 1 ? '' : 's'}
            <span className="opacity-80 font-normal tabular-nums">({ready.length * fileCount} files)</span>
          </button>
        ) : (
          <>
            <button className="btn h-10 px-4" onClick={() => void postLinkedIn()} disabled={!!busy || !sizes.length} title="Copies the image and opens LinkedIn with the caption filled in">
              <Send size={15} /> <span className="hidden sm:inline">Post on</span> LinkedIn
            </button>
            <button className="btn btn-primary h-10 px-4" onClick={() => void downloadKit()} disabled={!!busy || !sizes.length}>
              <Download size={16} /> Download kit
              <span className="opacity-80 font-normal tabular-nums">({fileCount} files)</span>
            </button>
          </>
        )}
      </div>

      {hot && (
        <HotJobPicker
          onClose={() => setHot(null)}
          multi={hot.kind === 'many' ? slots : undefined}
          onPickMany={
            hot.kind === 'many'
              ? (picks) => {
                  const r = placeHotJobs(many, picks, template)
                  setMany(r.jobs)
                  if (r.last >= 0) setOpenIdx(r.last)
                  setHot(null)
                }
              : undefined
          }
          onPick={(f) => {
            // same fill in both modes: the post's own numbers, pay started clean (`withHotJob`, BJ 2026-11-18)
            if (hot.kind === 'fill' && hot.index !== null) {
              const i = hot.index
              setMany((list) => list.map((j, k) => (k === i ? withHotJob(j, f) : j)))
            } else setFields((cur) => withHotJob(cur, f))
            setHot(null)
          }}
        />
      )}
    </div>
  )
}

function SizeChips({
  template,
  sizes,
  setSizes,
  gif,
  setGif,
}: {
  template: TemplateDef
  sizes: string[]
  setSizes: (fn: (v: string[]) => string[]) => void
  gif: boolean
  setGif: (v: boolean) => void
}) {
  return (
    <>
      {Object.keys(template.layouts).map((s) => (
        <button
          key={s}
          className={clsx('chip', sizes.includes(s) && 'chip-on')}
          onClick={() => setSizes((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]))}
          aria-pressed={sizes.includes(s)}
        >
          {sizes.includes(s) && <Check size={12} />} {SIZES[s as keyof typeof SIZES]?.label ?? s}
        </button>
      ))}
      <button className={clsx('chip', gif && 'chip-on')} onClick={() => setGif(!gif)} aria-pressed={gif}>
        <Film size={12} /> Animated GIF
      </button>
    </>
  )
}

/** The job form (Recent jobs, every editable field with the pay strip, the city photo), shared by One job and each
 *  Many jobs job. */
function JobForm({
  template,
  fields,
  setFields,
  showLocked = true,
}: {
  template: TemplateDef
  fields: Record<string, string>
  setFields: (u: SetStateAction<Record<string, string>>) => void
  showLocked?: boolean
}) {
  const [photoPicker, setPhotoPicker] = useState(false)
  const match = fields.location ? resolveLocation(fields.location) : null
  const pinned = fields['location__photo'] ? cityIndex().find((c) => c.id === fields['location__photo']) : undefined
  // one of the person's uploads used as the post's photo (BJ, 2026-11-19): its link is pinned instead of a city id
  const pinnedUpload = isPhotoLink(fields['location__photo']) ? fields['location__photo'] : undefined
  const set = (k: string, v: string) => setFields((f) => ({ ...f, [k]: v }))
  const tidy = (k: string) => setFields((f) => ({ ...f, [k]: tidyField(k, f[k] ?? '') }))
  const groups = useMemo(() => {
    const g = new Map<string, FieldDef[]>()
    // template-locked fields (job type, benefits, footer) aren't editable here
    for (const f of template.fieldDefs.filter((x) => !x.locked)) g.set(f.group ?? 'Details', [...(g.get(f.group ?? 'Details') ?? []), f])
    return [...g.entries()]
  }, [template])
  return (
    <>
      <RecentJobs onPick={(f) => setFields({ ...f })} />
      {groups.map(([g, defs]) => (
        <fieldset key={g} className="mb-3">
          <legend className="text-[11px] font-bold text-ink-2 mb-1.5">{g}</legend>
          <div className="grid grid-cols-2 gap-2">
            {/* the hub's pay calculator, above the pay fields it fills (hidden without the hub) */}
            {defs.some((f) => f.key === 'weekly_pay') && <PayCalc fields={fields} setFields={setFields} />}
            {defs.map((f) => (
              <label
                key={f.key}
                className={clsx('min-w-0', (f.key === 'job_title' || f.key === 'location' || f.key === 'benefits' || f.key === 'weekly_pay') && 'col-span-2')}
              >
                <span className="block text-[11px] font-semibold text-ink-3 mb-1 truncate">{f.label}</span>
                {f.kind === 'location' ? (
                  <LocationInput
                    value={fields[f.key] ?? ''}
                    placeholder={f.example}
                    onChange={(v) => set(f.key, v)}
                    onCommit={(v) => set(f.key, formatLocation(v))}
                  />
                ) : (
                  <input
                    className="input"
                    value={fields[f.key] ?? ''}
                    placeholder={f.example}
                    onChange={(e) => set(f.key, e.target.value)}
                    onBlur={() => tidy(f.key)}
                  />
                )}
                {f.kind === 'location' && (
                  <LocationHint
                    match={match}
                    pinned={pinned}
                    upload={pinnedUpload}
                    onChange={() => setPhotoPicker(true)}
                    onUnpin={() => set('location__photo', '')}
                  />
                )}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {showLocked && <LockedSummary defs={template.fieldDefs} />}
      {photoPicker && (
        <PhotoPicker
          location={fields.location ?? ''}
          current={pinnedUpload ?? pinned?.id ?? match?.photo.id}
          onPick={(id) => {
            set('location__photo', id)
            setPhotoPicker(false)
          }}
          onClose={() => setPhotoPicker(false)}
        />
      )}
    </>
  )
}

// ── pieces ──────────────────────────────────────────────────

function LockedSummary({ defs }: { defs: FieldDef[] }) {
  const locked = defs.filter((f) => f.locked)
  if (!locked.length) return null
  return (
    <div className="mt-1 rounded-xl bg-surface-2/70 border border-line px-3 py-2.5">
      <div className="text-[11px] font-bold text-ink-2 mb-1 flex items-center gap-1">
        <Lock size={11} /> Set by the template
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[11.5px]">
        {locked.map((f) => (
          <div key={f.key} className="contents">
            <dt className="text-ink-3 whitespace-nowrap">{f.label}</dt>
            <dd className="text-ink-2 truncate" title={f.example}>
              {f.example}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function RecentJobs({ onPick }: { onPick: (f: Record<string, string>) => void }) {
  const [list] = useState(recentJobs)
  if (!list.length) return null
  return (
    <div className="mb-3">
      <div className="text-[11px] font-bold text-ink-2 mb-1.5 flex items-center gap-1">
        <History size={12} /> Recent jobs
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {list.map((j, i) => (
          <button key={i} className="chip shrink-0 max-w-[220px]" onClick={() => onPick(j)} title={`${j.job_title} — ${j.location}`}>
            <span className="truncate">
              {j.job_title} · {j.location}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

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
  onOpen,
}: {
  design: Design
  label: string
  hint: string
  onCopy: () => void
  onPng: () => void
  onGif?: () => void
  /** absent for View access (opening the editor saves the kit as designs) */
  onEdit?: () => void
  /** View access: open the post full-size, read-only, without saving */
  onOpen?: () => void
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
  const tick = useAssetTick()
  const warnings = useMemo(() => kitWarnings(design), [design, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  // tall formats shouldn't dominate the grid; big screens get big previews
  const maxH = Math.max(420, Math.min(900, (typeof window !== 'undefined' ? window.innerHeight : 900) - 300))
  const width = Math.min(w, (maxH * design.w) / design.h)
  return (
    <div className="card p-3 min-w-0 flex flex-col">
      <div className="flex items-baseline justify-between gap-2 mb-2 min-w-0">
        <div className="text-[13px] font-bold whitespace-nowrap">{label}</div>
        <div className="text-[11px] text-ink-3 truncate tabular-nums" title={`${design.w}×${design.h} · ${hint}`}>
          {design.w}×{design.h} · {hint}
        </div>
      </div>
      <div ref={box} className="flex-1 flex items-center justify-center rounded-xl bg-surface-2/70 p-2 min-h-[120px]">
        {onEdit || onOpen ? (
          <button
            onClick={onEdit ?? onOpen}
            className="rounded-lg overflow-hidden shadow-md ring-1 ring-black/5 hover:ring-accent/60 transition"
            aria-label={onEdit ? `Edit ${label}` : `Open ${label} full size`}
            title={onEdit ? undefined : 'Open full size'}
          >
            <DesignCanvas design={design} width={Math.max(60, width - 16)} />
          </button>
        ) : (
          <div className="rounded-lg overflow-hidden shadow-md ring-1 ring-black/5">
            <DesignCanvas design={design} width={Math.max(60, width - 16)} />
          </div>
        )}
      </div>
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {warnings.slice(0, 3).map((w, i) => (
            <li
              key={i}
              className={clsx(
                'text-[11.5px] font-semibold flex items-center gap-1.5 min-w-0',
                w.level === 'error' ? 'text-[rgb(var(--status-bad))]' : 'text-[rgb(var(--status-warn))]',
              )}
            >
              <AlertTriangle size={12} className="shrink-0" /> <span className="truncate">{w.text}</span>
            </li>
          ))}
        </ul>
      )}
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
        {onEdit && (
          <button className="btn h-8 px-2.5 flex-1" onClick={onEdit}>
            <PencilLine size={14} /> Edit
          </button>
        )}
        {!onEdit && onOpen && (
          <button className="btn h-8 px-2.5 flex-1" onClick={onOpen} title="Open full size (view only)">
            <Maximize2 size={14} /> Open
          </button>
        )}
      </div>
    </div>
  )
}

function LocationHint({
  match,
  pinned,
  upload,
  onChange,
  onUnpin,
}: {
  match: ReturnType<typeof resolveLocation>
  pinned?: CityPhoto
  /** link of the person's own photo, when they picked one of their uploads */
  upload?: string
  onChange: () => void
  onUnpin: () => void
}) {
  if (upload)
    return (
      <span className="flex items-center gap-2 mt-1.5 min-w-0">
        <img src={upload} alt="" className="w-10 h-7 rounded object-cover shrink-0" />
        <span className="text-[11.5px] text-ink-2 truncate min-w-0">
          Your photo <span className="text-ink-3">· from your uploads</span>
        </span>
        <button type="button" className="text-[11.5px] font-semibold text-accent whitespace-nowrap" onClick={onChange}>
          Change
        </button>
        <button type="button" className="text-ink-3" onClick={onUnpin} aria-label="Use the city photo">
          <X size={12} />
        </button>
      </span>
    )
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
        ? `nearest photo · ${Math.round((match.distanceKm ?? 0) * 0.621)} mi`
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
  // City photos or the person's own uploads (BJ, 2026-11-19)
  const [tab, setTab] = useState<'city' | 'uploads'>(isPhotoLink(current) ? 'uploads' : 'city')
  const near = nearbyCities(location, 12)
  const list = q.trim() ? searchCities(q, 60) : near
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    // studio-root: Studio's button / input sizing reaches this pop-up on <body> too
    <div className="studio-root contents">
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6" onMouseDown={onClose}>
      <div
        className="card w-full sm:w-[760px] max-h-[92vh] flex flex-col bg-surface-1"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Choose the post's photo"
      >
        <div className="flex items-center gap-2 p-4 border-b border-line">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Post photo</div>
            <div className="text-[15px] font-extrabold truncate">{tab === 'city' ? `Photos near ${location || 'this job'}` : 'Your uploads'}</div>
          </div>
          <button className="btn" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="px-4 pt-3">
          <Seg
            value={tab}
            onChange={(v) => setTab(v === 'uploads' ? 'uploads' : 'city')}
            options={[
              { value: 'city', label: 'City photos' },
              { value: 'uploads', label: 'Your uploads' },
            ]}
          />
        </div>
        {tab === 'uploads' ? (
          <UploadsPick current={current} onPick={onPick} />
        ) : (
        <>
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
        </>
        )}
      </div>
    </div>
    </div>,
    document.body,
  )
}

// ── many jobs ───────────────────────────────────────────────

/** the job's number, in a small accent circle */
function JobNum({ n }: { n: number }) {
  return (
    <span className="shrink-0 w-6 h-6 rounded-full bg-accent/[0.12] text-accent text-[11.5px] font-extrabold tabular-nums flex items-center justify-center">
      {n}
    </span>
  )
}

/** a post as wide as its box (up to `max`), so a small tile never lets it spill into the next one */
function FitCanvas({ design, max }: { design: Design; max: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={box} className="w-full">
      {w > 0 && <DesignCanvas design={design} width={Math.min(w, max)} className="rounded-lg mx-auto" />}
    </div>
  )
}

/** "CT Tech · Boise, ID · $2,410 – $2,655" without the parts that are blank */
const jobLine = (j: Record<string, string>) => [j.location, j.weekly_pay].map((x) => x?.trim()).filter(Boolean).join(' · ')

/** Many jobs (BJ, 2026-11-19): the job form repeated for up to five jobs. One job is open at a time; the others are a
 *  one-line bar. Beside them, the live "Hot Jobs This Week" roundup post, and a small post per job that opens it. */
function ManyJobs({
  template,
  jobs,
  setJobs,
  openIdx,
  setOpenIdx,
  onOpenJob,
  onHot,
  sizes,
  setSizes,
  gif,
  setGif,
  canEdit,
  busy,
  setBusy,
}: {
  template: TemplateDef
  jobs: Record<string, string>[]
  setJobs: (u: SetStateAction<Record<string, string>[]>) => void
  openIdx: number
  setOpenIdx: (i: number) => void
  /** open one job in the full one-job view */
  onOpenJob: (i: number) => void
  /** fill job i from Hot Jobs */
  onHot: (i: number) => void
  sizes: string[]
  setSizes: (fn: (v: string[]) => string[]) => void
  gif: boolean
  setGif: (v: boolean) => void
  canEdit: boolean
  busy: string | null
  setBusy: (v: string | null) => void
}) {
  const toast = useToast()
  const nav = useNavigate()
  const { templates } = useTemplates()
  const rt = roundupTemplates(templates)[0] ?? HOT_JOBS_ROUNDUP
  const [rSize, setRSize] = useState(rt.defaultSize)
  const size = rt.layouts[rSize] ? rSize : rt.defaultSize
  const ready = jobs.filter(isReadyJob)
  const roundup = useMemo(() => {
    const d = instantiate(rt, size, roundupFields(ready), { name: `Hot jobs roundup — ${ready.length} job${ready.length === 1 ? '' : 's'}` })
    // the post's rows close up over blank jobs (row 3 can be Job 5): its warnings use the form's job numbers
    // ("Job 5 weekly pay is empty"), the same as the bars, the small previews and the ZIP folders
    const num = jobs.flatMap((j, i) => (isReadyJob(j) ? [i + 1] : []))
    return { ...d, fieldDefs: d.fieldDefs?.map((f) => ({ ...f, label: f.label.replace(/^Job (\d+)\b/, (m, r) => (num[Number(r) - 1] ? `Job ${num[Number(r) - 1]}` : m)) })) }
  }, [rt, size, jobs]) // eslint-disable-line react-hooks/exhaustive-deps
  const thumbs = useMemo(() => jobs.map((j) => (isReadyJob(j) ? instantiate(template, 'square', j) : null)), [jobs, template])

  const setJob = (i: number) => (u: SetStateAction<Record<string, string>>) =>
    setJobs((list) => list.map((j, k) => (k === i ? (typeof u === 'function' ? u(j) : u) : j)))
  const add = () => {
    if (jobs.length >= MAX_JOBS) return
    setJobs((list) => [...list, blankJob(template)])
    setOpenIdx(jobs.length)
  }
  const remove = (i: number) => {
    const before = jobs
    const was = openIdx
    const next = jobs.filter((_, k) => k !== i)
    setJobs(next.length ? next : [blankJob(template)])
    setOpenIdx(!next.length ? 0 : i === was ? -1 : i < was ? was - 1 : was)
    if (!isBlankJob(jobs[i], template))
      toast(`Job ${i + 1} removed`, jobs[i].job_title || undefined, 'ok', {
        label: 'Undo',
        run: () => {
          setJobs(before)
          setOpenIdx(was)
        },
      })
  }

  const downloadRoundup = async (kind: 'png' | 'gif') => {
    if (busy) return
    setBusy(kind === 'gif' ? 'Making GIF…' : 'Rendering…')
    try {
      await downloadDesign(roundup, `hot-jobs-this-week-${size}`, kind)
    } catch (e) {
      toast('Download failed', e instanceof Error ? e.message : undefined, 'error')
    } finally {
      setBusy(null)
    }
  }
  const copyRoundup = async () => {
    try {
      await copyPngPromiseToClipboard(pngOf(roundup))
      toast('Image copied', 'Paste it straight into LinkedIn, Facebook or Teams.')
    } catch (e) {
      toast('Copy failed', e instanceof Error ? e.message : undefined, 'error')
    }
  }
  /** Edit access: save the roundup as a design and open it in the editor */
  const opening = useRef(false)
  const editRoundup = async () => {
    if (opening.current) return
    opening.current = true
    try {
      const d = instantiate(rt, size, roundupFields(ready), { name: roundup.name })
      await repo.saveDesign(d, await designThumb(d))
      nav(`/studio/design/${d.id}`)
    } catch (e) {
      toast('Couldn’t open the editor', e instanceof Error ? e.message : undefined, 'error')
    } finally {
      opening.current = false
    }
  }
  /** View access: open it full size, read-only, without saving */
  const openRoundup = () => {
    const d = instantiate(rt, size, roundupFields(ready), { name: roundup.name })
    stashPreview(d)
    nav(`/studio/design/${d.id}`)
  }

  return (
    <div className="grid gap-4 px-4 md:px-6 pb-6 min-h-0 lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]">
      {/* ── the jobs ── */}
      <section className="min-w-0 flex flex-col gap-2.5 self-start">
        {jobs.map((j, i) =>
          i === openIdx ? (
            <div key={i} className="card card-accent p-4 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <JobNum n={i + 1} />
                {/* the number badge already says which job: the label goes on a phone so the buttons stay on one line */}
                <div className="eyebrow flex-1 min-w-0 truncate max-sm:invisible max-sm:w-0">Job {i + 1}</div>
                <button className="btn h-8 px-2.5" onClick={() => onHot(i)} aria-label={`Fill job ${i + 1} from Hot Jobs`}>
                  <Briefcase size={14} /> <span><span className="max-sm:hidden">From </span>Hot Jobs</span>
                </button>
                <button
                  className="text-[11.5px] font-semibold text-ink-3 hover:text-accent whitespace-nowrap px-1"
                  onClick={() => setJob(i)(blankJob(template))}
                >
                  Clear
                </button>
                {jobs.length > 1 && (
                  <button className="btn h-8 w-8 px-0" onClick={() => remove(i)} aria-label={`Remove job ${i + 1}`} title="Remove this job">
                    <Trash2 size={14} />
                  </button>
                )}
                <button className="btn h-8 w-8 px-0" onClick={() => setOpenIdx(-1)} aria-label={`Collapse job ${i + 1}`} title="Collapse">
                  <ChevronUp size={15} />
                </button>
              </div>
              <JobForm template={template} fields={j} setFields={setJob(i)} showLocked={false} />
            </div>
          ) : (
            <div key={i} className="card flex items-center gap-1.5 p-1.5 min-w-0">
              <button
                className="flex-1 min-w-0 flex items-center gap-2.5 text-left px-1.5 py-1 rounded-lg hover:bg-surface-2"
                onClick={() => setOpenIdx(i)}
                aria-expanded={false}
                title={[j.job_title, jobLine(j)].filter(Boolean).join(' · ') || 'Not filled in yet'}
              >
                <JobNum n={i + 1} />
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  <b className={clsx(!j.job_title?.trim() && 'text-ink-3 font-semibold')}>{j.job_title?.trim() || 'Not filled in yet'}</b>
                  {jobLine(j) && <span className="text-ink-3"> · {jobLine(j)}</span>}
                </span>
                <ChevronDown size={15} className="shrink-0 text-ink-3" />
              </button>
              <button className="btn h-8 w-8 px-0 shrink-0" onClick={() => remove(i)} aria-label={`Remove job ${i + 1}`} title="Remove this job">
                <Trash2 size={14} />
              </button>
            </div>
          ),
        )}
        <button
          className="btn h-10 w-full border-dashed"
          onClick={add}
          disabled={jobs.length >= MAX_JOBS}
          title={jobs.length >= MAX_JOBS ? 'The roundup post fits five jobs' : undefined}
        >
          {jobs.length >= MAX_JOBS ? (
            <>{MAX_JOBS} jobs is the most</>
          ) : (
            <>
              <Plus size={15} /> Add another job <span className="text-ink-3 font-normal tabular-nums">({jobs.length} of {MAX_JOBS})</span>
            </>
          )}
        </button>
        <LockedSummary defs={template.fieldDefs} />
      </section>

      {/* ── the roundup post, then a small post per job ── */}
      <section className="min-w-0 flex flex-col gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="eyebrow mr-1 flex items-center gap-1">
              <ListChecks size={12} /> Roundup post
            </span>
            {Object.keys(rt.layouts).map((s) => (
              <button key={s} className={clsx('chip', size === s && 'chip-on')} onClick={() => setRSize(s)} aria-pressed={size === s}>
                {size === s && <Check size={12} />} {SIZES[s as keyof typeof SIZES]?.label ?? s}
              </button>
            ))}
          </div>
          {ready.length ? (
            <PreviewCard
              design={roundup}
              label="Hot Jobs This Week"
              hint={`${ready.length} job${ready.length === 1 ? '' : 's'}`}
              onCopy={() => void copyRoundup()}
              onPng={() => void downloadRoundup('png')}
              onGif={() => void downloadRoundup('gif')}
              onEdit={canEdit ? () => void editRoundup() : undefined}
              onOpen={canEdit ? undefined : openRoundup}
            />
          ) : (
            <div className="card p-8 text-center">
              <Sparkles className="mx-auto text-accent mb-2" size={22} />
              <div className="font-bold text-[14px]">Your Hot Jobs This Week post</div>
              <div className="text-[12.5px] text-ink-3 mt-1">Give a job a title (or pick from Hot Jobs) and it shows up here, one row per job.</div>
            </div>
          )}
        </div>

        {ready.length > 0 && (
          <div>
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="eyebrow mr-1">Each job’s kit</span>
              <SizeChips template={template} sizes={sizes} setSizes={setSizes} gif={gif} setGif={setGif} />
            </div>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr))]">
              {jobs.map((j, i) =>
                thumbs[i] ? (
                  <button
                    key={i}
                    className="card p-2 text-left min-w-0 hover:ring-2 hover:ring-accent/40 transition"
                    onClick={() => onOpenJob(i)}
                    title={`Open job ${i + 1}: every size and the caption`}
                  >
                    <FitCanvas design={thumbs[i]!} max={240} />
                    <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
                      <JobNum n={i + 1} />
                      <span className="text-[12.5px] font-bold truncate" title={j.job_title}>{j.job_title}</span>
                    </div>
                    {jobLine(j) && <div className="text-[11.5px] text-ink-3 truncate mt-0.5" title={jobLine(j)}>{jobLine(j)}</div>}
                  </button>
                ) : null,
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
