// ─────────────────────────────────────────────────────────────
// Admin → Templates. Admins change everything about a template: the values
// the template locks (job type, benefits, call to action, website…), the
// fields recruiters fill in, every size's design (opens in the editor), and
// they create / copy / delete templates. Recruiters only ever use them.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  Copy, Lock, LockOpen, PencilRuler, Plus, RotateCcw, Save, ShieldAlert, Trash2, Unlock,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { SIZES, type FieldDef, type SizeKey } from '../engine/model'
import { useTemplateLib, useTemplates, isBuiltInId, originalOf } from '../templates/store'
import type { TemplateDef } from '../templates/types'
import { blankLayout, designForTemplateEdit, newTemplate, slugKey, templateProblems } from '../templates/admin'
import { instantiate } from '../templates/instantiate'
import { DesignCanvas } from '../ui/DesignCanvas'
import { repo } from '../data'
import { toast } from '../ui/toast'

const KINDS: { value: NonNullable<FieldDef['kind']>; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'money', label: 'Money' },
  { value: 'location', label: 'Location (picks the city photo)' },
  { value: 'long', label: 'Long text' },
]

export function TemplatesAdmin() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const { templates, loaded } = useTemplates()
  const lib = useTemplateLib()
  const selectedId = params.get('t') ?? templates[0]?.id
  const current = templates.find((t) => t.id === selectedId)
  const [draft, setDraft] = useState<TemplateDef | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => setDraft(current ? structuredClone(current) : null), [current?.id, current?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  if (user.role !== 'admin')
    return (
      <div className="card p-8 text-center">
        <ShieldAlert className="mx-auto text-ink-3 mb-2" />
        <div className="font-bold">Admins only</div>
        <div className="text-[12.5px] text-ink-3 mt-1">Ask an admin to change templates or their locked values.</div>
      </div>
    )

  const dirty = !!draft && !!current && JSON.stringify(draft) !== JSON.stringify(current)
  const problems = draft ? templateProblems(draft) : []
  const select = (id: string) => setParams({ t: id })
  const update = (patch: Partial<TemplateDef>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  const save = async () => {
    if (!draft || problems.length) return
    await lib.save(draft)
    toast('Template saved', `Everyone now gets the updated “${draft.name}”.`)
  }
  const editSize = async (size: string) => {
    if (!draft) return
    if (dirty) await save()
    const d = designForTemplateEdit(draft, size)
    await repo.saveDesign(d)
    nav(`/studio/design/${d.id}`)
  }

  return (
    <div className="grid gap-4 min-w-0 xl:grid-cols-[320px_minmax(0,1fr)]">
      {/* ── list ── */}
      <section className="card p-3 min-w-0 self-start">
        <div className="flex items-center gap-2 px-1 mb-2">
          <div className="text-[15px] font-extrabold flex-1">Templates</div>
          <button className="btn btn-primary h-8 px-2.5" onClick={() => setCreating(true)}>
            <Plus size={14} /> New
          </button>
        </div>
        {!loaded ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 m-1 rounded-xl bg-surface-2 animate-pulse" />)
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
            {templates.map((t) => {
              const thumb = instantiate(t, t.defaultSize)
              return (
                <li key={t.id}>
                  <button
                    onClick={() => select(t.id)}
                    className={clsx('w-full flex items-center gap-3 p-2 rounded-xl text-left border transition', t.id === selectedId ? 'border-accent/50 bg-accent/10' : 'border-transparent hover:bg-surface-2')}
                  >
                    <span className="shrink-0 rounded-md overflow-hidden ring-1 ring-black/5">
                      <DesignCanvas design={thumb} width={56} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold truncate">{t.name}</span>
                      <span className="flex gap-1 mt-0.5">
                        <span className="chip !h-5 !text-[10.5px]">{Object.keys(t.layouts).length} sizes</span>
                        {t.overridesBuiltIn ? (
                          <span className="chip !h-5 !text-[10.5px] chip-on">Changed</span>
                        ) : isBuiltInId(t.id) ? (
                          <span className="chip !h-5 !text-[10.5px]">Built-in</span>
                        ) : (
                          <span className="chip !h-5 !text-[10.5px]">Custom</span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ── detail ── */}
      {draft && current ? (
        <div className="grid gap-4 min-w-0">
          <section className="card card-accent p-4 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="min-w-0 flex-1">
                <div className="eyebrow">Template</div>
                <input
                  className="input !h-10 !text-[18px] font-extrabold mt-1"
                  value={draft.name}
                  onChange={(e) => update({ name: e.target.value })}
                  aria-label="Template name"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 self-end">
                <button className="btn" onClick={() => void lib.save(newTemplate(`${draft.name} (copy)`, draft)).then(() => toast('Copied'))}>
                  <Copy size={14} /> Duplicate
                </button>
                {current.overridesBuiltIn && (
                  <button
                    className="btn"
                    onClick={() =>
                      void lib.remove(current.id).then(() => toast('Back to the original', originalOf(current.id)?.name))
                    }
                  >
                    <RotateCcw size={14} /> Reset to original
                  </button>
                )}
                {!isBuiltInId(current.id) && (
                  <button
                    className="btn hover:!text-[rgb(var(--status-bad))]"
                    onClick={() => {
                      const copy = structuredClone(current)
                      void lib.remove(current.id).then(() => {
                        setParams({})
                        toast('Template deleted', copy.name, 'ok', { label: 'Undo', run: () => void lib.save(copy) })
                      })
                    }}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                )}
                <button className="btn btn-primary" disabled={!dirty || problems.length > 0} onClick={() => void save()}>
                  <Save size={14} /> {dirty ? 'Save changes' : 'Saved'}
                </button>
              </div>
            </div>
            {problems.length > 0 && (
              <ul className="mb-3 text-[12px] text-[rgb(var(--status-bad))] font-semibold list-disc pl-5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="min-w-0 sm:col-span-2">
                <span className="block text-[11px] font-semibold text-ink-3 mb-1">Description (shown to recruiters)</span>
                <input className="input" value={draft.description ?? ''} onChange={(e) => update({ description: e.target.value })} />
              </label>
              <label className="min-w-0">
                <span className="block text-[11px] font-semibold text-ink-3 mb-1">Used for</span>
                <select
                  className="input"
                  value={draft.kitMode === 'roundup' ? 'roundup' : draft.category}
                  onChange={(e) =>
                    e.target.value === 'roundup'
                      ? update({ category: 'job-post', kitMode: 'roundup' })
                      : update({ category: e.target.value as TemplateDef['category'], kitMode: 'job' })
                  }
                >
                  <option value="job-post">One job (Job Kit)</option>
                  <option value="roundup">Several jobs (Roundup)</option>
                  <option value="social">Social post</option>
                  <option value="flyer">Flyer</option>
                  <option value="general">Other</option>
                </select>
              </label>
              <label className="min-w-0">
                <span className="block text-[11px] font-semibold text-ink-3 mb-1">Default size</span>
                <select className="input" value={draft.defaultSize} onChange={(e) => update({ defaultSize: e.target.value })}>
                  {Object.keys(draft.layouts).map((k) => (
                    <option key={k} value={k}>
                      {SIZES[k as SizeKey]?.label ?? k}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <LockedValues draft={draft} onChange={(fieldDefs) => update({ fieldDefs })} />
          <FieldsEditor draft={draft} onChange={(fieldDefs) => update({ fieldDefs })} />
          <SizesEditor draft={draft} onEdit={(s) => void editSize(s)} onChange={(layouts, defaultSize) => update({ layouts, defaultSize })} />
        </div>
      ) : (
        <div className="card p-8 text-center text-ink-3 text-sm">Pick a template on the left, or create a new one.</div>
      )}

      {creating && (
        <NewTemplateDialog
          templates={templates}
          onClose={() => setCreating(false)}
          onCreate={async (t) => {
            await lib.save(t)
            setCreating(false)
            select(t.id)
            toast('Template created', 'Now design each size with “Edit design”.')
          }}
        />
      )}
    </div>
  )
}

// ── locked values ("settings") ──────────────────────────────

function LockedValues({ draft, onChange }: { draft: TemplateDef; onChange: (d: FieldDef[]) => void }) {
  const locked = draft.fieldDefs.filter((f) => f.locked)
  return (
    <section className="card p-4 min-w-0" style={{ borderLeft: '3px solid rgb(var(--series-3))' }}>
      <div className="flex items-center gap-2 mb-1">
        <Lock size={15} className="text-[rgb(var(--series-3))]" />
        <div className="text-[15px] font-extrabold">Locked values</div>
      </div>
      <p className="text-[12.5px] text-ink-3 mb-3">
        Set here for everyone. Recruiters see these on every post but can’t change them. Lock or unlock any field below.
      </p>
      {!locked.length ? (
        <div className="text-[12.5px] text-ink-3">No locked fields. Use the lock button on a field to lock it.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {locked.map((f) => (
            <label key={f.key} className={clsx('min-w-0', (f.kind === 'long' || f.example.length > 40) && 'sm:col-span-2')}>
              <span className="block text-[11px] font-semibold text-ink-3 mb-1">{f.label}</span>
              <input
                className="input"
                value={f.example}
                onChange={(e) => onChange(draft.fieldDefs.map((x) => (x.key === f.key ? { ...x, example: e.target.value } : x)))}
              />
            </label>
          ))}
        </div>
      )}
    </section>
  )
}

// ── fields ──────────────────────────────────────────────────

function FieldsEditor({ draft, onChange }: { draft: TemplateDef; onChange: (d: FieldDef[]) => void }) {
  const set = (key: string, patch: Partial<FieldDef>) => onChange(draft.fieldDefs.map((f) => (f.key === key ? { ...f, ...patch } : f)))
  const add = () => {
    let key = 'new_field'
    for (let i = 2; draft.fieldDefs.some((f) => f.key === key); i++) key = `new_field_${i}`
    onChange([...draft.fieldDefs, { key, label: 'New field', example: '', kind: 'text', group: 'Details' }])
  }
  const move = (i: number, d: number) => {
    const a = [...draft.fieldDefs]
    const j = i + d
    if (j < 0 || j >= a.length) return
    ;[a[i], a[j]] = [a[j], a[i]]
    onChange(a)
  }
  return (
    <section className="card p-4 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-[15px] font-extrabold flex-1">Fields</div>
        <button className="btn h-8 px-2.5" onClick={add}>
          <Plus size={14} /> Add field
        </button>
      </div>
      <p className="text-[12.5px] text-ink-3 mb-3">
        What recruiters fill in. Put a field on the design with the editor’s Text panel (“Field text”), or type{' '}
        <code className="bg-surface-2 rounded px-1">{'{{key}}'}</code> in any text.
      </p>
      <div className="grid gap-2">
        {draft.fieldDefs.map((f, i) => (
          <div key={f.key} className="rounded-xl border border-line p-2.5 grid gap-2 min-w-0 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto]">
            <label className="min-w-0">
              <span className="block text-[10.5px] font-semibold text-ink-3 mb-0.5">Label · key <code>{f.key}</code></span>
              <input
                className="input"
                value={f.label}
                onChange={(e) => set(f.key, { label: e.target.value })}
                onBlur={(e) => {
                  // brand-new fields take their key from the label
                  if (f.key.startsWith('new_field') && e.target.value.trim()) {
                    const k = slugKey(e.target.value)
                    if (!draft.fieldDefs.some((x) => x.key === k)) set(f.key, { key: k })
                  }
                }}
              />
            </label>
            <label className="min-w-0">
              <span className="block text-[10.5px] font-semibold text-ink-3 mb-0.5">{f.locked ? 'Locked value' : 'Example / default'}</span>
              <input className="input" value={f.example} onChange={(e) => set(f.key, { example: e.target.value })} />
            </label>
            <label className="min-w-0">
              <span className="block text-[10.5px] font-semibold text-ink-3 mb-0.5">Type</span>
              <select className="input" value={f.kind ?? 'text'} onChange={(e) => set(f.key, { kind: e.target.value as FieldDef['kind'] })}>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0">
              <span className="block text-[10.5px] font-semibold text-ink-3 mb-0.5">Group</span>
              <input className="input" value={f.group ?? ''} onChange={(e) => set(f.key, { group: e.target.value })} />
            </label>
            <div className="flex items-end gap-1">
              <button
                className={clsx('btn h-[34px] px-2', f.locked && 'chip-on')}
                onClick={() => set(f.key, { locked: !f.locked })}
                aria-label={f.locked ? `Unlock ${f.label}` : `Lock ${f.label}`}
                title={f.locked ? 'Locked — recruiters can’t change it' : 'Recruiters fill this in'}
              >
                {f.locked ? <Lock size={14} /> : <LockOpen size={14} />}
              </button>
              <button className="btn h-[34px] px-2" onClick={() => move(i, -1)} aria-label="Move up" disabled={i === 0}>
                ↑
              </button>
              <button className="btn h-[34px] px-2" onClick={() => move(i, 1)} aria-label="Move down" disabled={i === draft.fieldDefs.length - 1}>
                ↓
              </button>
              <button
                className="btn h-[34px] px-2 hover:!text-[rgb(var(--status-bad))]"
                onClick={() => onChange(draft.fieldDefs.filter((x) => x.key !== f.key))}
                aria-label={`Remove ${f.label}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── sizes ───────────────────────────────────────────────────

function SizesEditor({
  draft,
  onEdit,
  onChange,
}: {
  draft: TemplateDef
  onEdit: (size: string) => void
  onChange: (layouts: TemplateDef['layouts'], defaultSize: string) => void
}) {
  const missing = (Object.keys(SIZES) as SizeKey[]).filter((k) => !draft.layouts[k])
  const [adding, setAdding] = useState<string>('')
  const bg = draft.layouts[draft.defaultSize]?.pages[0]?.bg.color ?? '#0C184D'
  return (
    <section className="card p-4 min-w-0">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="text-[15px] font-extrabold flex-1">Sizes & design</div>
        {missing.length > 0 && (
          <div className="flex gap-1.5">
            <select className="input w-auto" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Size to add">
              <option value="">Add a size…</option>
              {missing.map((k) => (
                <option key={k} value={k}>
                  {SIZES[k].label} ({SIZES[k].w}×{SIZES[k].h})
                </option>
              ))}
            </select>
            <button
              className="btn"
              disabled={!adding}
              onClick={() => {
                onChange({ ...draft.layouts, [adding]: blankLayout(adding, bg) }, draft.defaultSize)
                setAdding('')
              }}
            >
              <Plus size={14} /> Add
            </button>
          </div>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {Object.keys(draft.layouts).map((size) => {
          const d = instantiate(draft, size)
          const h = 220
          return (
            <div key={size} className="shrink-0">
              <button onClick={() => onEdit(size)} className="block rounded-lg overflow-hidden ring-1 ring-black/5 shadow-sm hover:ring-accent/60 transition" aria-label={`Edit ${size} design`}>
                <DesignCanvas design={d} width={Math.round((h * d.w) / d.h)} />
              </button>
              <div className="flex items-center gap-1 mt-1.5">
                <span className="text-[12px] font-semibold text-ink-2 flex-1 truncate">
                  {SIZES[size as SizeKey]?.label ?? size}
                  {size === draft.defaultSize && <span className="text-ink-3"> · default</span>}
                </span>
              </div>
              <div className="flex gap-1 mt-1">
                <button className="btn h-8 px-2.5" onClick={() => onEdit(size)}>
                  <PencilRuler size={14} /> Edit design
                </button>
                {Object.keys(draft.layouts).length > 1 && (
                  <button
                    className="btn h-8 px-2 hover:!text-[rgb(var(--status-bad))]"
                    aria-label={`Remove ${size}`}
                    onClick={() => {
                      const { [size]: _gone, ...rest } = draft.layouts
                      void _gone
                      onChange(rest, size === draft.defaultSize ? Object.keys(rest)[0] : draft.defaultSize)
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[12px] text-ink-3 mt-3 flex items-center gap-1.5">
        <Unlock size={12} /> In the editor you can move, restyle, lock or unlock anything — then press “Save to template”.
      </p>
    </section>
  )
}

// ── new template ────────────────────────────────────────────

function NewTemplateDialog({
  templates,
  onClose,
  onCreate,
}: {
  templates: TemplateDef[]
  onClose: () => void
  onCreate: (t: TemplateDef) => void
}) {
  const [name, setName] = useState('')
  const [from, setFrom] = useState<string>(templates[0]?.id ?? '')
  const source = useMemo(() => templates.find((t) => t.id === from), [templates, from])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-6" onMouseDown={onClose}>
      <div className="card bg-surface-1 w-full sm:w-[480px] max-h-[92vh] overflow-auto p-5" role="dialog" aria-label="New template" onMouseDown={(e) => e.stopPropagation()}>
        <div className="eyebrow">New template</div>
        <div className="text-[17px] font-extrabold mb-3">Start a template</div>
        <label className="block mb-3">
          <span className="block text-[11px] font-semibold text-ink-3 mb-1">Name</span>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Per Diem Job Post" />
        </label>
        <label className="block mb-4">
          <span className="block text-[11px] font-semibold text-ink-3 mb-1">Start from</span>
          <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Blank (navy square)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                Copy of {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!name.trim()} onClick={() => onCreate(newTemplate(name.trim(), source))}>
            <Plus size={14} /> Create
          </button>
        </div>
      </div>
    </div>
  )
}
