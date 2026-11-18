// Right inspector — contextual to the selection. Every control writes
// through the store, so sliders / scrubs are single undo steps and brand
// locks are enforced in one place.

import { safeUrl } from '@/lib/utils'
import { useEffect, useRef, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  CaseUpper,
  ChevronDown,
  Crop,
  FlipHorizontal2,
  Italic,
  Lock,
  MapPin,
  Underline,
  Upload,
} from 'lucide-react'
import type { El, Gradient, ImageEl, ImageFilters, Shadow, ShapeEl, TextEl, TextStyle } from '../engine/model'
import type { AlignKind } from '../engine/geometry'
import { ensureFont, ensureFontsFor, FONTS } from '../engine/fonts'
import { repo } from '../data'
import { resolveImage } from '../services'
import { currentPage, useEditor } from './store'
import { useUi } from './uiStore'
import { useSelected } from './hooks'
import { elLabel } from './lint'
import { toast, uploadError } from './actions'
import { parseColor } from './colors'
import { ColorField, IconBtn, NumField, PopButton, Row, Section, Seg, SliderNum, Toggle } from './ui'

type Patch = Partial<El>

function common<T>(els: El[], get: (e: El) => T): T | null {
  const v = get(els[0])
  return els.every((e) => get(e) === v) ? v : null
}

export function Inspector() {
  const design = useEditor((s) => s.design)
  const els = useSelected()
  const readOnly = useEditor((s) => s.readOnly)
  const canEditLocked = useEditor((s) => s.canEditLocked)
  if (!design) return null
  if (!els.length) return <PageInspector />

  const lockedOut = readOnly || (els.some((e) => e.locked) && !canEditLocked)
  const type = common(els, (e) => e.type)
  const patchAll = (fn: (e: El) => Patch | null) => {
    const p: Record<string, Patch> = {}
    for (const e of els) {
      const x = fn(e)
      if (x) p[e.id] = x
    }
    useEditor.getState().updateEls(p)
  }
  const title = els.length === 1 ? elLabel(els[0], design.fields) : `${els.length} elements`
  const typeName = type === 'text' ? 'Text' : type === 'image' ? 'Image' : type === 'shape' ? 'Shape' : 'Mixed'

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-line/60 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{typeName}</div>
          <div className="truncate text-[13px] font-bold text-ink">{title}</div>
        </div>
        {els.some((e) => e.locked) && (
          <span className="chip shrink-0" title={canEditLocked ? 'Brand locked for recruiters' : 'Locked by your brand template'}>
            <Lock size={11} /> Locked
          </span>
        )}
      </div>
      {lockedOut ? (
        <div className="p-4 text-[13px] leading-relaxed text-ink-2">
          {readOnly ? 'You have view-only access to this design.' : 'This element is part of the brand template, so its look can’t be changed. Use the Fields panel to change what it says or shows.'}
        </div>
      ) : (
        <>
          <ArrangeSection els={els} />
          <LayoutSection els={els} patchAll={patchAll} />
          {type === 'text' && <TextSection els={els as TextEl[]} patchAll={patchAll} />}
          {type === 'image' && <ImageSection els={els as ImageEl[]} patchAll={patchAll} />}
          {type === 'shape' && <ShapeSection els={els as ShapeEl[]} patchAll={patchAll} />}
        </>
      )}
    </div>
  )
}

// ── arrange ─────────────────────────────────────────────────

function ArrangeSection({ els }: { els: El[] }) {
  const a = (k: AlignKind) => () => useEditor.getState().align(k)
  const multi = els.length > 1
  return (
    <Section title={multi ? 'Align selection' : 'Align to page'}>
      <div className="flex flex-wrap items-center gap-0.5">
        <IconBtn title="Align left" onClick={a('left')}>
          <AlignStartVertical size={15} />
        </IconBtn>
        <IconBtn title="Align centre" onClick={a('hcenter')}>
          <AlignCenterVertical size={15} />
        </IconBtn>
        <IconBtn title="Align right" onClick={a('right')}>
          <AlignEndVertical size={15} />
        </IconBtn>
        <IconBtn title="Align top" onClick={a('top')}>
          <AlignStartHorizontal size={15} />
        </IconBtn>
        <IconBtn title="Align middle" onClick={a('vcenter')}>
          <AlignCenterHorizontal size={15} />
        </IconBtn>
        <IconBtn title="Align bottom" onClick={a('bottom')}>
          <AlignEndHorizontal size={15} />
        </IconBtn>
        {els.length > 2 && (
          <>
            <span className="mx-1 h-5 w-px bg-line" />
            <IconBtn title="Distribute horizontally" onClick={() => useEditor.getState().distribute('x')}>
              <AlignHorizontalDistributeCenter size={15} />
            </IconBtn>
            <IconBtn title="Distribute vertically" onClick={() => useEditor.getState().distribute('y')}>
              <AlignVerticalDistributeCenter size={15} />
            </IconBtn>
          </>
        )}
      </div>
    </Section>
  )
}

function LayoutSection({ els, patchAll }: { els: El[]; patchAll: (fn: (e: El) => Patch | null) => void }) {
  const num = (k: 'x' | 'y' | 'w' | 'h' | 'rotation') => common(els, (e) => Math.round(e[k] * 10) / 10)
  const isLine = els.every((e) => e.type === 'shape' && e.shape === 'line')
  return (
    <Section title="Layout">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <NumField label="X" title="X position" value={num('x')} onChange={(v) => patchAll(() => ({ x: v }))} />
        <NumField label="Y" title="Y position" value={num('y')} onChange={(v) => patchAll(() => ({ y: v }))} />
        <NumField label="W" title="Width" min={1} value={num('w')} onChange={(v) => patchAll(() => ({ w: v }))} />
        <NumField label="H" title={isLine ? 'Thickness' : 'Height'} min={1} value={num('h')} onChange={(v) => patchAll(() => ({ h: v }))} />
        <NumField label="∠" title="Rotation" min={-180} max={180} suffix="°" value={num('rotation')} onChange={(v) => patchAll(() => ({ rotation: v }))} />
        <NumField
          label="◐"
          title="Opacity"
          min={0}
          max={100}
          suffix="%"
          value={common(els, (e) => Math.round(e.opacity * 100))}
          onChange={(v) => patchAll(() => ({ opacity: v / 100 }))}
        />
      </div>
    </Section>
  )
}

// ── shared sub-editors ──────────────────────────────────────

function ShadowEditor({ value, onChange }: { value: Shadow | null | undefined; onChange: (s: Shadow | null) => void }) {
  const on = !!value
  return (
    <>
      <Row label="Shadow">
        <Toggle label="Shadow" checked={on} onChange={(v) => onChange(v ? { color: 'rgba(8, 13, 36, 0.35)', blur: 18, x: 0, y: 8 } : null)} />
        {value && <ColorField compact title="Shadow colour" value={value.color} onChange={(c) => onChange({ ...value, color: c ?? '#000000' })} />}
      </Row>
      {value && (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <NumField label="Blur" title="Shadow blur" min={0} max={200} value={value.blur} onChange={(v) => onChange({ ...value, blur: v })} />
          <NumField label="X" title="Shadow offset X" value={value.x} onChange={(v) => onChange({ ...value, x: v })} />
          <NumField label="Y" title="Shadow offset Y" value={value.y} onChange={(v) => onChange({ ...value, y: v })} />
        </div>
      )}
    </>
  )
}

function GradientEditor({ value, base, onChange }: { value: Gradient | null | undefined; base: string; onChange: (g: Gradient | null) => void }) {
  const start = parseColor(base)?.a ? base : '#2940DA'
  return (
    <>
      <Row label="Gradient">
        <Toggle
          label="Gradient"
          checked={!!value}
          onChange={(v) => onChange(v ? { type: 'linear', angle: 135, stops: [{ at: 0, color: start }, { at: 1, color: start.toUpperCase() === '#12C4D1' ? '#2940DA' : '#12C4D1' }] } : null)}
        />
        {value && (
          <>
            <ColorField compact title="Gradient start" value={value.stops[0]?.color ?? start} onChange={(c) => onChange({ ...value, stops: value.stops.map((s, i) => (i === 0 ? { ...s, color: c ?? start } : s)) })} />
            <ColorField
              compact
              title="Gradient end"
              value={value.stops[value.stops.length - 1]?.color ?? start}
              onChange={(c) => onChange({ ...value, stops: value.stops.map((s, i) => (i === value.stops.length - 1 ? { ...s, color: c ?? start } : s)) })}
            />
          </>
        )}
      </Row>
      {value && (
        <Row label="Direction">
          <Seg
            value={value.type}
            onChange={(t) => onChange({ ...value, type: t })}
            options={[
              { value: 'linear', label: 'Linear', title: 'Linear gradient' },
              { value: 'radial', label: 'Radial', title: 'Radial gradient' },
            ]}
          />
          {value.type === 'linear' && <NumField label="∠" title="Gradient angle" min={0} max={360} step={5} suffix="°" value={value.angle} onChange={(v) => onChange({ ...value, angle: v })} className="w-[76px] shrink-0" />}
        </Row>
      )}
    </>
  )
}

// ── text ────────────────────────────────────────────────────

function FontPicker({ value, onChange }: { value: string | null; onChange: (family: string) => void }) {
  return (
    <PopButton
      title="Font family"
      placement="bottom-end"
      panelClass="w-[236px]"
      className="flex h-8 w-full min-w-0 items-center gap-2 rounded-[10px] border border-line bg-surface-1 px-2.5 text-left hover:border-accent/50"
      label={
        <>
          <span className="min-w-0 flex-1 truncate text-[13px] text-ink" style={{ fontFamily: value ? `"${value}", Inter, sans-serif` : undefined }}>
            {value ?? 'Mixed fonts'}
          </span>
          <ChevronDown size={14} className="shrink-0 text-ink-3" />
        </>
      }
    >
      {(close) => <FontList value={value} pick={(f) => (onChange(f), close())} />}
    </PopButton>
  )
}

function FontList({ value, pick }: { value: string | null; pick: (f: string) => void }) {
  useEffect(() => {
    void ensureFontsFor(FONTS.map((f) => f.family))
  }, [])
  return (
    <div className="flex flex-col p-1" role="listbox">
      {FONTS.map((f) => (
        <button
          key={f.family}
          type="button"
          role="option"
          aria-selected={f.family === value}
          onClick={() => pick(f.family)}
          className={clsx('flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 text-left text-[15px]', f.family === value ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-surface-2')}
          style={{ fontFamily: `"${f.family}", Inter, sans-serif` }}
        >
          <span className="min-w-0 flex-1 truncate">{f.family}</span>
          <span className="shrink-0 font-sans text-[10.5px] uppercase tracking-wider text-ink-3">{f.category}</span>
        </button>
      ))}
    </div>
  )
}

const WEIGHT_NAMES: Record<number, string> = { 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' }

function TextSection({ els, patchAll }: { els: TextEl[]; patchAll: (fn: (e: El) => Patch | null) => void }) {
  const el = els[0]
  const text = (fn: (e: TextEl) => Partial<TextEl>) => patchAll((e) => (e.type === 'text' ? (fn(e) as Patch) : null))
  const style = (s: Partial<TextStyle>) => text((e) => ({ style: { ...e.style, ...s } }))
  const cs = <K extends keyof TextStyle>(k: K): TextStyle[K] | null => common(els, (e) => (e as TextEl).style[k])
  const family = cs('family')
  const def = FONTS.find((f) => f.family === (family ?? el.style.family))
  const weights = def?.weights ?? [400, 500, 600, 700, 800, 900]
  const setFamily = (f: string) => {
    const d = FONTS.find((x) => x.family === f)
    text((e) => {
      const ws = d?.weights ?? [e.style.weight]
      const weight = ws.reduce((best, w) => (Math.abs(w - e.style.weight) < Math.abs(best - e.style.weight) ? w : best), ws[0])
      void ensureFont(f, weight, e.style.italic)
      return { style: { ...e.style, family: f, weight, italic: e.style.italic && !!d?.italic } }
    })
  }
  const bg = el.bg ?? null
  const stroke = el.stroke ?? null
  return (
    <>
      <Section title="Text">
        <FontPicker value={family} onChange={setFamily} />
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)' }}>
          <select
            className="input h-8 px-2 text-[12.5px]"
            aria-label="Font weight"
            value={cs('weight') ?? ''}
            onChange={(e) => {
              const w = Number(e.target.value)
              void ensureFont(el.style.family, w, el.style.italic)
              style({ weight: w })
            }}
          >
            {cs('weight') === null && <option value="">Mixed</option>}
            {weights.map((w) => (
              <option key={w} value={w}>
                {WEIGHT_NAMES[w] ?? w}
              </option>
            ))}
          </select>
          <NumField label="Size" title="Font size" min={4} max={1000} value={cs('size')} onChange={(v) => style({ size: v })} />
        </div>
        <Row label="Auto-fit">
          <Toggle label="Shrink text to fit its box" checked={common(els, (e) => (e as TextEl).fit) === 'shrink'} onChange={(v) => text(() => ({ fit: v ? 'shrink' : 'fixed' }))} />
          <span className="truncate text-[12px] text-ink-3">Shrink to fit the box</span>
        </Row>
        <div className="flex flex-wrap items-center gap-1.5">
          <Seg
            value={cs('align')}
            onChange={(v) => style({ align: v })}
            options={[
              { value: 'left', label: <AlignLeft size={14} />, title: 'Align left' },
              { value: 'center', label: <AlignCenter size={14} />, title: 'Align centre' },
              { value: 'right', label: <AlignRight size={14} />, title: 'Align right' },
            ]}
          />
          <Seg
            value={cs('valign')}
            onChange={(v) => style({ valign: v })}
            options={[
              { value: 'top', label: <AlignVerticalJustifyStart size={14} />, title: 'Top of box' },
              { value: 'middle', label: <AlignVerticalJustifyCenter size={14} />, title: 'Middle of box' },
              { value: 'bottom', label: <AlignVerticalJustifyEnd size={14} />, title: 'Bottom of box' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-0.5">
          <IconBtn title="Uppercase" active={!!cs('upper')} onClick={() => style({ upper: !cs('upper') })}>
            <CaseUpper size={16} />
          </IconBtn>
          <IconBtn title="Underline" active={!!cs('underline')} onClick={() => style({ underline: !cs('underline') })}>
            <Underline size={15} />
          </IconBtn>
          <IconBtn
            title={def?.italic === false ? 'This font has no italic' : 'Italic'}
            disabled={def?.italic === false}
            active={!!cs('italic')}
            onClick={() => {
              void ensureFont(el.style.family, el.style.weight, !cs('italic'))
              style({ italic: !cs('italic') })
            }}
          >
            <Italic size={15} />
          </IconBtn>
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <NumField label="Line" title="Line height" min={0.6} max={3} step={0.05} precision={2} value={cs('lineHeight')} onChange={(v) => style({ lineHeight: v })} />
          <NumField label="Space" title="Letter spacing" min={-20} max={100} step={0.5} precision={1} value={cs('letterSpacing')} onChange={(v) => style({ letterSpacing: v })} />
        </div>
        <Row label="Colour">
          <ColorField title="Text colour" value={common(els, (e) => (e as TextEl).color)} onChange={(c) => text(() => ({ color: c ?? '#000000' }))} />
        </Row>
      </Section>
      <Section title="Effects">
        <Row label="Highlight">
          <Toggle
            label="Pill behind the text"
            checked={!!bg}
            onChange={(v) => text((e) => ({ bg: v ? { color: '#E74599', radius: Math.round(e.h / 2 + 12), padX: Math.round(e.style.size * 0.6), padY: Math.round(e.style.size * 0.3) } : null }))}
          />
          {bg && <ColorField compact title="Highlight colour" value={bg.color} onChange={(c) => text((e) => (e.bg ? { bg: { ...e.bg, color: c ?? '#E74599' } } : {}))} />}
        </Row>
        {bg && (
          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <NumField label="R" title="Highlight corner radius" min={0} max={999} value={bg.radius} onChange={(v) => text((e) => (e.bg ? { bg: { ...e.bg, radius: v } } : {}))} />
            <NumField label="↔" title="Highlight padding, sides" min={0} max={400} value={bg.padX} onChange={(v) => text((e) => (e.bg ? { bg: { ...e.bg, padX: v } } : {}))} />
            <NumField label="↕" title="Highlight padding, top and bottom" min={0} max={400} value={bg.padY} onChange={(v) => text((e) => (e.bg ? { bg: { ...e.bg, padY: v } } : {}))} />
          </div>
        )}
        <Row label="Outline">
          <Toggle label="Outline around letters" checked={!!stroke} onChange={(v) => text(() => ({ stroke: v ? { color: '#0C184D', width: 3 } : null }))} />
          {stroke && (
            <>
              <ColorField compact title="Outline colour" value={stroke.color} onChange={(c) => text((e) => (e.stroke ? { stroke: { ...e.stroke, color: c ?? '#000000' } } : {}))} />
              <NumField label="W" title="Outline width" min={0.5} max={60} step={0.5} precision={1} value={stroke.width} onChange={(v) => text((e) => (e.stroke ? { stroke: { ...e.stroke, width: v } } : {}))} />
            </>
          )}
        </Row>
        <ShadowEditor value={el.shadow} onChange={(s) => text(() => ({ shadow: s }))} />
      </Section>
    </>
  )
}

// ── image ───────────────────────────────────────────────────

const DUOTONES: { name: string; pair: [string, string] | null }[] = [
  { name: 'Original', pair: null },
  { name: 'Navy → Teal', pair: ['#0C184D', '#12C4D1'] },
  { name: 'Navy → Pink', pair: ['#0C184D', '#E74599'] },
  { name: 'Blue → White', pair: ['#2940DA', '#FFFFFF'] },
  { name: 'Navy → White', pair: ['#0C184D', '#FFFFFF'] },
  { name: 'Black & white', pair: ['#000000', '#FFFFFF'] },
]

function ImageSection({ els, patchAll }: { els: ImageEl[]; patchAll: (fn: (e: El) => Patch | null) => void }) {
  const el = els[0]
  const fields = useEditor((s) => s.design?.fields)
  const file = useRef<HTMLInputElement>(null)
  const img = (fn: (e: ImageEl) => Partial<ImageEl>) => patchAll((e) => (e.type === 'image' ? (fn(e) as Patch) : null))
  const filt = (f: Partial<ImageFilters>) => img((e) => ({ filters: { ...e.filters, ...f } }))
  const f = el.filters
  const bound = el.bind && fields ? resolveImage(el, fields) : null
  const credit = bound?.credit ?? el.credit
  const replace = async (fl: File | undefined) => {
    if (!fl) return
    try {
      const a = await repo.uploadImage(fl)
      img(() => ({ src: a.url, bind: undefined, credit: undefined, focus: { x: 0.5, y: 0.5 }, zoom: 1 }))
    } catch (e) {
      toast(uploadError(e))
    }
  }
  const sameDuo = (p: [string, string] | null) => (p === null ? !f.duotone : !!f.duotone && f.duotone[0] === p[0] && f.duotone[1] === p[1])
  return (
    <>
      <Section title="Photo">
        {el.bind && (
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-2.5 py-2 text-left text-[12px] text-ink-2 hover:border-accent/50"
            onClick={() => useUi.getState().focusFieldKey(el.bind!)}
          >
            <MapPin size={13} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate">Follows the “{el.bind.replace(/_/g, ' ')}” field</span>
          </button>
        )}
        <div className="flex gap-1.5">
          <button type="button" className="btn h-8 min-w-0 flex-1 px-2 text-[12.5px]" onClick={() => file.current?.click()}>
            <Upload size={13} /> Replace
          </button>
          {els.length === 1 && (
            <button type="button" className="btn h-8 min-w-0 flex-1 px-2 text-[12.5px]" onClick={() => useUi.getState().setCrop(el.id)}>
              <Crop size={13} /> Adjust
            </button>
          )}
          <IconBtn title="Flip horizontally" active={!!el.flipX} onClick={() => img((e) => ({ flipX: !e.flipX }))}>
            <FlipHorizontal2 size={15} />
          </IconBtn>
        </div>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void replace(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <Row label="Fit">
          <Seg
            value={common(els, (e) => (e as ImageEl).fit)}
            onChange={(v) => img(() => ({ fit: v }))}
            options={[
              { value: 'cover', label: 'Fill', title: 'Fill the frame (crops)' },
              { value: 'contain', label: 'Fit', title: 'Show the whole image' },
            ]}
          />
        </Row>
        {el.fit === 'cover' && (
          <Row label="Zoom">
            <SliderNum title="Photo zoom" min={1} max={3} step={0.01} precision={2} suffix="×" value={el.zoom} onChange={(v) => img(() => ({ zoom: v }))} />
          </Row>
        )}
        <Row label="Corners">
          <SliderNum title="Corner radius" min={0} max={Math.round(Math.min(el.w, el.h) / 2)} value={Math.min(el.radius, Math.round(Math.min(el.w, el.h) / 2))} onChange={(v) => img(() => ({ radius: v }))} />
        </Row>
        <Row label="Ken Burns">
          <Toggle label="Slow zoom in GIFs" checked={!!el.kenBurns} onChange={(v) => img(() => ({ kenBurns: v }))} />
          <span className="truncate text-[12px] text-ink-3">Slow zoom in GIFs</span>
        </Row>
      </Section>
      <Section
        title="Adjust"
        right={
          !!(f.brightness || f.contrast || f.saturation || f.blur) && (
            <button type="button" className="text-[11.5px] font-semibold text-accent" onClick={() => filt({ brightness: 0, contrast: 0, saturation: 0, blur: 0 })}>
              Reset
            </button>
          )
        }
      >
        <Row label="Brightness">
          <SliderNum title="Brightness" min={-100} max={100} value={f.brightness} onChange={(v) => filt({ brightness: v })} />
        </Row>
        <Row label="Contrast">
          <SliderNum title="Contrast" min={-100} max={100} value={f.contrast} onChange={(v) => filt({ contrast: v })} />
        </Row>
        <Row label="Saturation">
          <SliderNum title="Saturation" min={-100} max={100} value={f.saturation} onChange={(v) => filt({ saturation: v })} />
        </Row>
        <Row label="Blur">
          <SliderNum title="Blur" min={0} max={40} value={f.blur} onChange={(v) => filt({ blur: v })} />
        </Row>
      </Section>
      <Section title="Brand tint">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(34px, 1fr))' }}>
          {DUOTONES.map((d) => (
            <button
              key={d.name}
              type="button"
              title={d.name}
              aria-label={d.name}
              aria-pressed={sameDuo(d.pair)}
              onClick={() => filt({ duotone: d.pair })}
              className={clsx('h-8 rounded-lg border', sameDuo(d.pair) ? 'border-accent ring-2 ring-accent/40' : 'border-line')}
              style={{ background: d.pair ? `linear-gradient(135deg, ${d.pair[0]}, ${d.pair[1]})` : 'linear-gradient(135deg,#f6c177,#7fb4e6 55%,#3f7d4f)' }}
            />
          ))}
        </div>
        <Row label="Colour wash">
          <Toggle label="Colour wash over the photo" checked={!!f.overlay} onChange={(v) => filt({ overlay: v ? { color: '#0C184D', opacity: 0.45 } : null })} />
          {f.overlay && <ColorField compact title="Wash colour" value={f.overlay.color} onChange={(c) => filt({ overlay: { ...f.overlay!, color: c ?? '#0C184D' } })} />}
        </Row>
        {f.overlay && (
          <Row label="Strength">
            <SliderNum title="Wash strength" min={0} max={100} suffix="%" value={Math.round(f.overlay.opacity * 100)} onChange={(v) => filt({ overlay: { ...f.overlay!, opacity: v / 100 } })} />
          </Row>
        )}
      </Section>
      {credit && (
        <Section title="Photo credit">
          <div className="text-[12px] leading-relaxed text-ink-2">
            {credit.author} · {credit.license}
            {safeUrl(credit.url) && (
              <>
                <br />
                <a href={safeUrl(credit.url)!} target="_blank" rel="noreferrer noopener" className="font-semibold text-accent hover:underline">
                  View on {credit.provider}
                </a>
              </>
            )}
          </div>
        </Section>
      )}
    </>
  )
}

// ── shape ───────────────────────────────────────────────────

function ShapeSection({ els, patchAll }: { els: ShapeEl[]; patchAll: (fn: (e: El) => Patch | null) => void }) {
  const el = els[0]
  const shp = (fn: (e: ShapeEl) => Partial<ShapeEl>) => patchAll((e) => (e.type === 'shape' ? (fn(e) as Patch) : null))
  const isLine = el.shape === 'line'
  const stroke = el.stroke ?? null
  return (
    <>
      <Section title={isLine ? 'Line' : 'Fill'}>
        <Row label="Colour">
          <ColorField
            title="Fill colour"
            allowNone={!isLine}
            value={common(els, (e) => (e as ShapeEl).fill)}
            onChange={(c) => shp((e) => ({ fill: c ?? 'transparent', ...(isLine && e.stroke ? { stroke: { ...e.stroke, color: c ?? e.stroke.color } } : {}) }))}
          />
        </Row>
        {!isLine && <GradientEditor value={el.gradient} base={el.fill} onChange={(g) => shp(() => ({ gradient: g }))} />}
        {el.shape === 'rect' && (
          <Row label="Corners">
            <SliderNum title="Corner radius" min={0} max={Math.round(Math.min(el.w, el.h) / 2)} value={Math.min(el.radius, Math.round(Math.min(el.w, el.h) / 2))} onChange={(v) => shp(() => ({ radius: v }))} />
          </Row>
        )}
        {el.shape === 'star' && (
          <Row label="Points">
            <SliderNum title="Number of points" min={3} max={24} value={el.points ?? 5} onChange={(v) => shp(() => ({ points: v }))} />
          </Row>
        )}
        {isLine && (
          <Row label="Dashed">
            <Toggle
              label="Dashed line"
              checked={!!stroke?.dash}
              onChange={(v) => shp((e) => ({ stroke: v ? { color: e.stroke?.color ?? e.fill, width: e.stroke?.width ?? Math.max(1, e.h), dash: [Math.max(2, e.h) * 3, Math.max(2, e.h) * 2.5] } : null }))}
            />
          </Row>
        )}
      </Section>
      {!isLine && (
        <Section title="Effects">
          <Row label="Border">
            <Toggle label="Border" checked={!!stroke} onChange={(v) => shp(() => ({ stroke: v ? { color: '#0C184D', width: 4 } : null }))} />
            {stroke && (
              <>
                <ColorField compact title="Border colour" value={stroke.color} onChange={(c) => shp((e) => (e.stroke ? { stroke: { ...e.stroke, color: c ?? '#000000' } } : {}))} />
                <NumField label="W" title="Border width" min={0.5} max={120} step={0.5} precision={1} value={stroke.width} onChange={(v) => shp((e) => (e.stroke ? { stroke: { ...e.stroke, width: v } } : {}))} />
              </>
            )}
          </Row>
          {stroke && (
            <Row label="Dashed">
              <Toggle label="Dashed border" checked={!!stroke.dash} onChange={(v) => shp((e) => (e.stroke ? { stroke: { ...e.stroke, dash: v ? [e.stroke.width * 3, e.stroke.width * 2] : undefined } } : {}))} />
            </Row>
          )}
          <ShadowEditor value={el.shadow} onChange={(s) => shp(() => ({ shadow: s }))} />
        </Section>
      )}
    </>
  )
}

// ── page (nothing selected) ─────────────────────────────────

function PageInspector() {
  const design = useEditor((s) => s.design)!
  const page = useEditor((s) => currentPage(s))
  const pageIndex = useEditor((s) => s.pageIndex)
  const readOnly = useEditor((s) => s.readOnly)
  if (!page) return null
  const setBg = useEditor.getState().setBg
  const info = (label: string, value: ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <span className="whitespace-nowrap text-ink-3">{label}</span>
      <span className="min-w-0 truncate whitespace-nowrap font-semibold tabular-nums text-ink">{value}</span>
    </div>
  )
  return (
    <div>
      <div className="border-b border-line/60 px-3 py-2.5">
        <div className="eyebrow">Page {pageIndex + 1} of {design.pages.length}</div>
        <div className="truncate text-[13px] font-bold text-ink">Nothing selected</div>
      </div>
      <Section title="Background">
        {readOnly ? (
          <div className="text-[12.5px] text-ink-3">View only</div>
        ) : (
          <>
            <Row label="Colour">
              <ColorField title="Page background colour" value={page.bg.color} onChange={(c) => setBg({ color: c ?? '#FFFFFF' })} />
            </Row>
            <GradientEditor value={page.bg.gradient} base={page.bg.color} onChange={(g) => setBg({ gradient: g })} />
          </>
        )}
      </Section>
      <Section title="Design">
        {info('Size', `${design.w} × ${design.h} px`)}
        {info('Pages', design.pages.length)}
        {info('Elements on this page', page.elements.length)}
        {info('Animation length', `${page.duration ?? 4}s`)}
      </Section>
      <div className="px-3 py-3 text-[12px] leading-relaxed text-ink-3">Click anything on the page to edit it. Double-click text to type, double-click a photo to re-frame it.</div>
    </div>
  )
}
