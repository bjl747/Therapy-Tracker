// Fields: the job's details. Typing here updates every {{marker}} and bound
// photo on every page live.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageOff, Lock, MapPin, RefreshCw } from 'lucide-react'
import type { FieldDef } from '../../engine/model'
import { fieldValue, markerKeys } from '../../engine/fields'
import { cityIndex, nearbyCities, resolveLocation, thumbUrl, type CityPhoto } from '../../photos/cities'
import { isPhotoLink } from '../../services'
import { useEditor } from '../store'
import { useUi } from '../uiStore'
import { useCityData } from '../hooks'
import { Section, Skeleton } from '../ui'

const titleCase = (k: string) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export function FieldsPanel() {
  const design = useEditor((s) => s.design)!
  // read-only designs normally lock the form too; a Job Kit post opened with View keeps it open (store.editFields)
  const readOnly = useEditor((s) => !s.editFields)
  const canEditLocked = useEditor((s) => s.canEditLocked)
  const focus = useUi((s) => s.focusField)
  const inputs = useRef(new Map<string, HTMLInputElement | HTMLTextAreaElement>())

  // declared fields + any marker / binding used in the design that isn't declared
  const defs = useMemo(() => {
    const out: FieldDef[] = [...(design.fieldDefs ?? [])]
    const have = new Set(out.map((f) => f.key))
    for (const p of design.pages)
      for (const el of p.elements) {
        const keys = el.type === 'text' ? markerKeys(el.text) : el.type === 'image' && el.bind ? [el.bind] : []
        for (const k of keys)
          if (!have.has(k)) {
            have.add(k)
            out.push({ key: k, label: titleCase(k), example: '', kind: el.type === 'image' ? 'location' : 'text' })
          }
      }
    return out
  }, [design.fieldDefs, design.pages])

  const groups = useMemo(() => {
    const m = new Map<string, FieldDef[]>()
    for (const f of defs) {
      const g = f.group ?? 'Details'
      m.set(g, [...(m.get(g) ?? []), f])
    }
    return [...m.entries()]
  }, [defs])

  useEffect(() => {
    if (!focus) return
    const el = inputs.current.get(focus.key)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.focus({ preventScroll: true })
    el.select()
  }, [focus])

  if (!defs.length)
    return (
      <div className="p-4 text-[13px] leading-relaxed text-ink-2">
        This design has no fields yet. Fields let you type a job once and have every page update — add text like{' '}
        <code className="rounded bg-surface-2 px-1 text-[12px]">{'{{job_title}}'}</code> to create one.
      </div>
    )

  const set = (key: string, v: string) => useEditor.getState().setFields({ [key]: v })
  // one undo step per field visit, not per keystroke ('edit': autosave doesn't wait for blur)
  const begin = () => useEditor.getState().beginGesture('edit')
  const end = () => useEditor.getState().endGesture()

  return (
    <div>
      {groups.map(([g, fs]) => (
        <Section key={g} title={g}>
          {fs.map((f) => {
            const value = fieldValue(design.fields, f.key) ?? ''
            const lockedOut = !!f.locked && !canEditLocked
            const common = {
              className: 'input',
              value,
              placeholder: f.example,
              disabled: readOnly || lockedOut,
              title: f.locked ? (lockedOut ? 'Set by the template' : 'Template value — only managers can change this') : undefined,
              onFocus: begin,
              onBlur: end,
              'aria-label': f.label,
            }
            return (
              <div key={f.key} className="flex min-w-0 flex-col gap-1">
                <label className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-2" htmlFor={`fld-${f.key}`}>
                  {f.kind === 'location' && <MapPin size={12} className="shrink-0 text-ink-3" />}
                  <span className="truncate">{f.label}</span>
                  {f.locked && <Lock size={11} className="shrink-0 text-ink-3" aria-label="Set by the template" />}
                </label>
                {f.kind === 'long' ? (
                  <textarea
                    {...common}
                    id={`fld-${f.key}`}
                    ref={(n) => void (n ? inputs.current.set(f.key, n) : inputs.current.delete(f.key))}
                    rows={3}
                    className="input h-auto resize-y py-2 leading-snug"
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                ) : (
                  <input
                    {...common}
                    id={`fld-${f.key}`}
                    ref={(n) => void (n ? inputs.current.set(f.key, n) : inputs.current.delete(f.key))}
                    inputMode={f.kind === 'money' ? 'decimal' : undefined}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
                {f.kind === 'location' && <LocationPhoto field={f.key} value={value} pinned={fieldValue(design.fields, `${f.key}__photo`)} disabled={readOnly} />}
              </div>
            )
          })}
        </Section>
      ))}
    </div>
  )
}

function LocationPhoto({ field, value, pinned, disabled }: { field: string; value: string; pinned?: string; disabled: boolean }) {
  const state = useCityData()
  const [open, setOpen] = useState(false)
  const pin = (id: string) => useEditor.getState().setFields({ [`${field}__photo`]: id })

  if (state === 'loading') return <Skeleton className="h-[52px] w-full" />
  if (state === 'empty')
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-line px-2.5 py-2 text-[12px] text-ink-3">
        <ImageOff size={14} className="shrink-0" /> City photos are still being added
      </div>
    )

  const match = value.trim() ? resolveLocation(value) : null
  // one of the person's uploads chosen in the Job Kit
  if (isPhotoLink(pinned))
    return (
      <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface-2/60 p-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src={pinned} alt="" className="h-11 w-16 shrink-0 rounded-md object-cover" loading="lazy" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-ink">Your photo</div>
            <div className="truncate text-[11px] text-ink-3">From your uploads</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="chip" disabled={disabled} onClick={() => pin('')}>
            Use the city photo
          </button>
        </div>
      </div>
    )
  const pinnedPhoto: CityPhoto | undefined = pinned ? cityIndex().find((c) => c.id === pinned) : undefined
  const photo = pinnedPhoto ?? match?.photo
  const options = open ? nearbyCities(value, 8) : []
  const note = pinnedPhoto
    ? 'Chosen by you'
    : match?.kind === 'exact'
      ? 'Matched to this city'
      : match?.kind === 'nearby'
        ? `Nearest city with a photo${match.distanceKm !== undefined ? ` · ${Math.round(match.distanceKm * 0.621)} mi` : ''}`
        : match?.kind === 'state'
          ? 'Largest city in the state'
          : ''

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface-2/60 p-2">
      {photo ? (
        <div className="flex min-w-0 items-center gap-2.5">
          <img src={thumbUrl(photo.id)} alt="" className="h-11 w-16 shrink-0 rounded-md object-cover" loading="lazy" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-ink">
              {photo.city}, {photo.st}
            </div>
            <div className="truncate text-[11px] text-ink-3">{note}</div>
          </div>
        </div>
      ) : (
        <div className="text-[12px] text-ink-3">{value.trim() ? 'No photo found for this place yet' : 'Type a city and state to get its photo'}</div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={`chip ${open ? 'chip-on' : ''}`} disabled={disabled || !value.trim()} onClick={() => setOpen((o) => !o)}>
          <RefreshCw size={11} /> Change photo
        </button>
        {pinnedPhoto && (
          <button type="button" className="chip" disabled={disabled} onClick={() => pin('')}>
            Use automatic
          </button>
        )}
      </div>
      {open &&
        (options.length ? (
          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' }}>
            {options.map((c) => (
              <button
                key={c.id}
                type="button"
                title={`${c.city}, ${c.st} — photo: ${c.credit.author} (${c.credit.license})`}
                disabled={disabled}
                onClick={() => pin(c.id)}
                className={`group relative overflow-hidden rounded-md border ${photo?.id === c.id ? 'border-accent ring-2 ring-accent/40' : 'border-line'}`}
              >
                <img src={thumbUrl(c.id)} alt={`${c.city}, ${c.st}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-left text-[10px] font-semibold text-white">{c.city}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-ink-3">No other photos near here yet</div>
        ))}
    </div>
  )
}
