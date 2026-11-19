// Studio home: Create · My designs · Brand.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import {
  Briefcase, Copy, FileStack, ImagePlus, LayoutTemplate, Plus, Rows3, Search, Trash2, Upload, Wand2,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { design, SIZES, type SizeKey } from '../engine/model'
import { BUILT_IN_TEMPLATES, type TemplateDef } from '../templates'
import { instantiate } from '../templates/instantiate'
import { localLeftovers, moveLocalToHub, repo, type BrandAsset, type DesignSummary } from '../data'
import { DesignCanvas } from '../ui/DesignCanvas'
import { useToast } from '../ui/toast'
import { TemplatesAdmin } from '../admin/TemplatesAdmin'
import { useTemplates } from '../templates/store'

type Tab = 'create' | 'designs' | 'brand' | 'templates'

export function StudioHome({ tab }: { tab: Tab }) {
  const nav = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const tabs: { id: Tab; label: string; to: string }[] = [
    { id: 'create', label: 'Create', to: '/studio' },
    { id: 'designs', label: 'My designs', to: '/studio/designs' },
    { id: 'brand', label: 'Brand', to: '/studio/brand' },
    ...(isAdmin ? [{ id: 'templates' as Tab, label: 'Templates (admin)', to: '/studio/templates' }] : []),
  ]
  return (
    <div className="px-4 md:px-6 py-5 min-w-0">
      <div className="eyebrow">Resources</div>
      <h1 className="text-[26px] font-extrabold tracking-tight leading-tight">Studio</h1>
      <p className="text-[13px] text-ink-3 mt-0.5">Job posts, GIFs and PDFs — on brand, in seconds.</p>
      <nav className="flex gap-1 mt-4 mb-5 border-b border-line overflow-x-auto" aria-label="Studio sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => nav(t.to)}
            className={clsx(
              'h-9 px-3 text-[13px] font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors',
              tab === t.id ? 'border-accent text-accent' : 'border-transparent text-ink-3 hover:text-ink',
            )}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'create' && <CreateTab />}
      {tab === 'designs' && <DesignsTab />}
      {tab === 'brand' && <BrandTab canEdit={isAdmin} />}
      {tab === 'templates' && <TemplatesAdmin />}
    </div>
  )
}

// ── Create ──────────────────────────────────────────────────

function CreateTab() {
  const nav = useNavigate()
  // View access makes and downloads job posts; starting a design saves it, which needs Edit
  const canEdit = useAuth().can('studio') === 'edit'
  const { templates } = useTemplates()
  const t = templates[0] ?? BUILT_IN_TEMPLATES[0]
  const sample = useMemo(() => instantiate(t, 'square'), [t])
  const newBlank = async (k: SizeKey) => {
    const s = SIZES[k]
    const d = design({ w: s.w, h: s.h, name: `Untitled ${s.label.toLowerCase()}` })
    await repo.saveDesign(d)
    nav(`/studio/design/${d.id}`)
  }
  const fromTemplate = async (tpl: TemplateDef, size: string) => {
    const d = instantiate(tpl, size)
    await repo.saveDesign(d)
    nav(`/studio/design/${d.id}`)
  }
  return (
    <div className="grid gap-4 min-w-0">
      {/* hero actions */}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        <button onClick={() => nav('/studio/kit')} className="card card-accent p-4 text-left flex gap-4 items-center min-w-0 hover:shadow-lg transition">
          <div className="shrink-0 rounded-xl overflow-hidden shadow ring-1 ring-black/5">
            <DesignCanvas design={sample} width={112} />
          </div>
          <div className="min-w-0">
            <div className="eyebrow flex items-center gap-1">
              <Wand2 size={12} /> Fastest
            </div>
            <div className="text-[17px] font-extrabold">Make a job post</div>
            <div className="text-[12.5px] text-ink-3 mt-0.5">Type the job once → square, story, LinkedIn, GIF and caption, with the right city photo.</div>
          </div>
        </button>
        <button onClick={() => nav('/studio/kit?mode=many')} className="card p-4 text-left flex gap-4 items-center min-w-0 hover:shadow-lg transition" style={{ borderLeft: '3px solid rgb(var(--series-3))' }}>
          <Rows3 size={34} className="shrink-0 text-[rgb(var(--series-3))]" />
          <div className="min-w-0">
            <div className="eyebrow">Batch</div>
            <div className="text-[17px] font-extrabold">Many jobs at once</div>
            <div className="text-[12.5px] text-ink-3 mt-0.5">Paste rows from Excel or Sheets → a full kit for every job in one ZIP.</div>
          </div>
        </button>
        <button onClick={() => nav('/studio/pdf')} className="card p-4 text-left flex gap-4 items-center min-w-0 hover:shadow-lg transition" style={{ borderLeft: '3px solid rgb(var(--series-2))' }}>
          <FileStack size={34} className="shrink-0 text-[rgb(var(--series-2))]" />
          <div className="min-w-0">
            <div className="eyebrow">PDF tools</div>
            <div className="text-[17px] font-extrabold">Combine & edit PDFs</div>
            <div className="text-[12.5px] text-ink-3 mt-0.5">Merge files, reorder pages, sign, redact, fill forms.</div>
          </div>
        </button>
      </div>

      {!canEdit && (
        <div className="card p-4 text-[12.5px] text-ink-2">
          <b>You have View access.</b> Make job posts and download them, and use the PDF tools. Saving and editing designs
          needs Studio <b>Edit</b>: ask an admin.
        </div>
      )}
      {canEdit && <>
      {/* templates */}
      <section className="card p-4 min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <LayoutTemplate size={15} className="text-accent" />
          <div className="text-[15px] font-extrabold">Templates</div>
          <span className="chip">{templates.length}</span>
        </div>
        {templates.map((tpl) => (
          <div key={tpl.id} className="min-w-0 mb-4 last:mb-0">
            <div className="flex items-baseline gap-2 mb-2 min-w-0">
              <div className="text-[13.5px] font-bold whitespace-nowrap">{tpl.name}</div>
              <div className="text-[12px] text-ink-3 truncate" title={tpl.description}>{tpl.description}</div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {Object.keys(tpl.layouts).map((size) => {
                const d = instantiate(tpl, size)
                const h = 170
                return (
                  <button key={size} onClick={() => void fromTemplate(tpl, size)} className="shrink-0 text-left group">
                    <div className="rounded-lg overflow-hidden ring-1 ring-black/5 shadow-sm group-hover:ring-accent/60 transition">
                      <DesignCanvas design={d} width={Math.round((h * d.w) / d.h)} />
                    </div>
                    <div className="text-[11.5px] font-semibold text-ink-2 mt-1 truncate" title={SIZES[size as SizeKey]?.label ?? size}>{SIZES[size as SizeKey]?.label ?? size}</div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </section>

      {/* blank */}
      <section className="card p-4 min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <Plus size={15} className="text-accent" />
          <div className="text-[15px] font-extrabold">Start blank</div>
        </div>
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
          {(Object.keys(SIZES) as SizeKey[]).map((k) => {
            const s = SIZES[k]
            const r = s.w / s.h
            return (
              <button key={k} onClick={() => void newBlank(k)} className="rounded-xl border border-line bg-surface-1 hover:border-accent/60 p-3 text-left flex items-center gap-3 min-w-0">
                <span className="shrink-0 w-10 h-10 flex items-center justify-center">
                  <span className="block bg-accent/15 border border-accent/40 rounded-[3px]" style={{ width: r >= 1 ? 40 : 40 * r, height: r >= 1 ? 40 / r : 40 }} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-bold truncate" title={s.label}>{s.label}</span>
                  <span className="block text-[11px] text-ink-3 tabular-nums">{s.w}×{s.h}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>
      </>}
    </div>
  )
}

// ── My designs ──────────────────────────────────────────────

function DesignsTab() {
  const nav = useNavigate()
  const toast = useToast()
  const { user, isManager, can } = useAuth()
  const canEdit = can('studio') === 'edit' // duplicate and delete save to the hub: Edit only
  const [list, setList] = useState<DesignSummary[] | null>(null)
  const [q, setQ] = useState('')
  const [leftovers, setLeftovers] = useState(0)
  const [moving, setMoving] = useState(false)
  const load = () =>
    void repo.listDesigns().then(setList, () => {
      setList([])
      toast('Couldn’t load designs', 'Check the connection and reload the page.', 'error')
    })
  useEffect(load, [])
  // designs made before Studio saved to the hub are still in this browser: offer to move them in
  useEffect(() => void localLeftovers().then((l) => setLeftovers(l.length)), [])
  const moveIn = async () => {
    setMoving(true)
    const r = await moveLocalToHub({ isAdmin: user?.role === 'admin' }).catch(() => ({ moved: 0, failed: leftovers }))
    setMoving(false)
    setLeftovers(r.failed)
    load()
    toast(r.failed ? 'Some designs didn’t move' : 'Designs moved into the hub', r.failed ? `${r.moved} moved, ${r.failed} still in this browser.` : `${r.moved} design${r.moved === 1 ? '' : 's'} now saved to the hub.`, r.failed ? 'error' : 'ok')
  }
  const mine = (d: DesignSummary) => !d.ownerUid || d.ownerUid === user?.uid
  // owners and managers / admins can delete (the rules say the same); AMs can open everyone's but not delete them
  const canDelete = (d: DesignSummary) => canEdit && (mine(d) || isManager || user?.role === 'admin')
  // template drafts being edited by an admin aren't personal designs
  const shown = (list ?? []).filter((d) => !d.id.startsWith('tpl_') && d.name.toLowerCase().includes(q.trim().toLowerCase()))

  const remove = async (d: DesignSummary) => {
    try {
      const full = await repo.getDesign(d.id)
      await repo.deleteDesign(d.id)
      load()
      toast('Design deleted', d.name, 'ok', full ? { label: 'Undo', run: () => void repo.saveDesign(full, d.thumb).then(load) } : undefined)
    } catch {
      toast('Couldn’t delete it', d.name, 'error')
    }
  }
  const duplicate = async (d: DesignSummary) => {
    try {
      const full = await repo.getDesign(d.id)
      if (!full) return
      // the copy is the duplicator's own design, whoever owned the original
      const copy = { ...structuredClone(full), id: `d${Date.now().toString(36)}`, name: `${full.name} (copy)`, kitId: undefined, ownerUid: undefined }
      await repo.saveDesign(copy, d.thumb)
      load()
    } catch {
      toast('Couldn’t duplicate it', d.name, 'error')
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-3 max-w-full">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="input pl-8" placeholder="Search designs" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {canEdit && leftovers > 0 && (
        <div className="card card-accent p-3 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 text-[12.5px]">
            <b>{leftovers} design{leftovers === 1 ? '' : 's'} saved only in this browser</b>
            <span className="text-ink-3"> from before Studio saved to the hub. Move them in so they’re safe and open anywhere.</span>
          </div>
          <button className="btn btn-primary" disabled={moving} onClick={() => void moveIn()}>
            {moving ? 'Moving…' : 'Move into the hub'}
          </button>
        </div>
      )}
      {list === null ? (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card h-56 animate-pulse" />
          ))}
        </div>
      ) : !shown.length ? (
        <div className="card p-10 text-center">
          <Briefcase className="mx-auto text-accent mb-2" />
          <div className="font-bold">{list.length ? 'No designs match' : 'No designs yet'}</div>
          <div className="text-[12.5px] text-ink-3 mt-1">Make a job post or start a blank design — it’ll show up here.</div>
          <button className="btn btn-primary mt-4" onClick={() => nav('/studio/kit')}>
            <Wand2 size={15} /> Make a job post
          </button>
        </div>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
          {shown.map((d) => (
            <div key={d.id} className="card p-2.5 min-w-0 group">
              <button className="block w-full rounded-lg overflow-hidden bg-surface-2 aspect-square flex items-center justify-center" onClick={() => nav(`/studio/design/${d.id}`)}>
                {d.thumb ? (
                  <img src={d.thumb} alt="" className="max-w-full max-h-full object-contain" />
                ) : (
                  <ImagePlus className="text-ink-3" />
                )}
              </button>
              <div className="flex items-start gap-1 mt-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-bold truncate" title={d.name}>
                    {d.name}
                  </div>
                  <div className="text-[11px] text-ink-3 tabular-nums whitespace-nowrap">
                    {d.w}×{d.h} · {formatDistanceToNow(d.updatedAt, { addSuffix: true })}
                  </div>
                  {!mine(d) && d.ownerName && (
                    <div className="text-[11px] text-ink-3 truncate" title={`Made by ${d.ownerName}`}>
                      by {d.ownerName}
                    </div>
                  )}
                </div>
                {canEdit && (
                  <button className="p-1 text-ink-3 hover:text-ink" onClick={() => void duplicate(d)} aria-label="Duplicate">
                    <Copy size={14} />
                  </button>
                )}
                {canDelete(d) && (
                  <button className="p-1 text-ink-3 hover:text-[rgb(var(--status-bad))]" onClick={() => void remove(d)} aria-label="Delete">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Brand ───────────────────────────────────────────────────

function BrandTab({ canEdit }: { canEdit: boolean }) {
  const toast = useToast()
  const [assets, setAssets] = useState<BrandAsset[] | null>(null)
  const [kind, setKind] = useState<BrandAsset['kind']>('logo')
  const input = useRef<HTMLInputElement>(null)
  const load = () =>
    void repo
      .listAssets()
      .then(setAssets)
      .catch(() => setAssets((cur) => cur ?? []))
  useEffect(load, [])
  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    // copy first: resetting the <input> (so the same file can be picked again) empties the live FileList
    const list = Array.from(files)
    if (input.current) input.current.value = ''
    try {
      for (const f of list) {
        if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(f.type)) {
          toast('Skipped a file', `${f.name} isn’t a PNG, JPG, WebP or SVG.`, 'error')
          continue
        }
        if (f.size > 15 * 1024 * 1024) {
          toast('Skipped a file', `${f.name} is over 15 MB.`, 'error')
          continue
        }
        // one bad file must not stop the rest
        try {
          await repo.uploadAsset(f, kind)
        } catch (e) {
          toast('Couldn’t upload a file', `${f.name}: ${e instanceof Error ? e.message : 'it could not be read'}.`, 'error')
        }
      }
    } finally {
      load()
    }
  }
  const builtIn = [
    { name: 'GQR Healthcare logo', url: '/brand/gqr-healthcare-white.png' },
    { name: 'UnitiMed logo', url: '/brand/unitimed-white.png' },
    { name: 'BluePipes 2026 badge', url: '/brand/bluepipes-2026-badge-clear.png' },
  ]
  const palette = ['#0C184D', '#18255E', '#2940DA', '#12C4D1', '#2BBACC', '#E74599', '#9A9FC4', '#FFFFFF']
  return (
    <div className="grid gap-4 min-w-0 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="card p-4 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="text-[15px] font-extrabold">Logos & photos</div>
          <div className="flex-1" />
          {canEdit && (
            <>
              <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value as BrandAsset['kind'])} aria-label="Asset type">
                <option value="logo">Logo</option>
                <option value="badge">Badge</option>
                <option value="photo">Photo</option>
                <option value="other">Other</option>
              </select>
              <button className="btn btn-primary" onClick={() => input.current?.click()}>
                <Upload size={15} /> Upload
              </button>
              <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple hidden onChange={(e) => void upload(e.target.files)} />
            </>
          )}
        </div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
          {builtIn.map((a) => (
            <div key={a.url} className="rounded-xl border border-line p-2 min-w-0">
              <div className="aspect-[3/2] rounded-lg bg-[#0C184D] flex items-center justify-center p-2">
                <img src={a.url} alt="" className="max-w-full max-h-full object-contain" />
              </div>
              <div className="text-[12px] font-semibold mt-1.5 truncate">{a.name}</div>
              <div className="text-[11px] text-ink-3">Built in · official, transparent</div>
            </div>
          ))}
          {(assets ?? []).map((a) => (
            <div key={a.id} className="rounded-xl border border-line p-2 min-w-0">
              <div className="aspect-[3/2] rounded-lg bg-surface-2 flex items-center justify-center p-2 [background-image:linear-gradient(45deg,rgb(var(--surface-3))_25%,transparent_25%,transparent_75%,rgb(var(--surface-3))_75%),linear-gradient(45deg,rgb(var(--surface-3))_25%,transparent_25%,transparent_75%,rgb(var(--surface-3))_75%)] [background-size:16px_16px] [background-position:0_0,8px_8px]">
                <img src={a.url} alt="" className="max-w-full max-h-full object-contain" />
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold truncate">{a.name}</div>
                  <div className="text-[11px] text-ink-3 capitalize">{a.kind}</div>
                </div>
                {canEdit && (
                  <button
                    className="p-1 text-ink-3 hover:text-[rgb(var(--status-bad))]"
                    aria-label={`Delete ${a.name}`}
                    onClick={() => void repo.deleteAsset(a.id).then(load)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {!canEdit && <p className="text-[12px] text-ink-3 mt-3">Admins can upload logos and photos here.</p>}
      </section>
      <section className="card p-4 min-w-0 self-start">
        <div className="text-[15px] font-extrabold mb-3">Brand colours</div>
        <div className="grid grid-cols-4 gap-2">
          {palette.map((c) => (
            <button
              key={c}
              className="rounded-lg border border-line overflow-hidden text-left"
              onClick={() => void navigator.clipboard.writeText(c).then(() => toast('Copied', c))}
            >
              <span className="block h-10" style={{ background: c }} />
              <span className="block text-[10.5px] font-semibold px-1.5 py-1 tabular-nums">{c}</span>
            </button>
          ))}
        </div>
        <p className="text-[12px] text-ink-3 mt-3">Fonts: Inter (headings and body). Templates lock logos and brand bars so posts stay consistent.</p>
      </section>
    </div>
  )
}
