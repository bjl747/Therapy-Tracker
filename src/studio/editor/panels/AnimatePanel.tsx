// Animate: entrance animation per element, page length, auto-animate.

import { ArrowLeft, ArrowRight, ArrowUp, Ban, Maximize2, Play, Sparkles, Wand2, Zap } from 'lucide-react'
import clsx from 'clsx'
import type { Anim, El } from '../../engine/model'
import { currentPage, useEditor } from '../store'
import { useSelected } from '../hooks'
import { useUi } from '../uiStore'
import { autoAnimate, clearAnimations } from '../actions'
import { Row, Section, SliderNum, Toggle } from '../ui'

const KINDS: { kind: Anim['kind']; label: string; icon: React.ReactNode }[] = [
  { kind: 'none', label: 'None', icon: <Ban size={16} /> },
  { kind: 'fade', label: 'Fade', icon: <Sparkles size={16} /> },
  { kind: 'rise', label: 'Rise', icon: <ArrowUp size={16} /> },
  { kind: 'slide-left', label: 'From left', icon: <ArrowRight size={16} /> },
  { kind: 'slide-right', label: 'From right', icon: <ArrowLeft size={16} /> },
  { kind: 'zoom', label: 'Zoom', icon: <Maximize2 size={16} /> },
  { kind: 'pop', label: 'Pop', icon: <Zap size={16} /> },
]

export function AnimatePanel() {
  const page = useEditor((s) => currentPage(s))
  const els = useSelected()
  const readOnly = useEditor((s) => s.readOnly)
  if (!page) return null
  const first = els[0]
  const anim: Anim = first?.anim ?? { kind: 'none', delay: 0, duration: 0.6 }
  const sameKind = els.every((e) => (e.anim?.kind ?? 'none') === anim.kind)
  const animated = page.elements.filter((e) => (e.anim && e.anim.kind !== 'none') || (e.type === 'image' && e.kenBurns)).length
  const images = els.filter((e) => e.type === 'image')

  const setAnim = (patch: Partial<Anim>) => {
    const st = useEditor.getState()
    st.updateEls(Object.fromEntries(els.map((e) => [e.id, { anim: { ...(e.anim ?? { kind: 'none', delay: 0, duration: 0.6 }), ...patch } } as Partial<El>])))
  }

  return (
    <div>
      <Section title="This page">
        <button type="button" className="btn btn-primary w-full" disabled={readOnly || !page.elements.length} onClick={autoAnimate}>
          <Wand2 size={14} /> Auto-animate page
        </button>
        <div className="flex gap-2">
          <button type="button" className="btn min-w-0 flex-1" disabled={!page.elements.length} onClick={() => useUi.getState().setPreview(true)}>
            <Play size={14} /> Preview
          </button>
          <button type="button" className="btn min-w-0 flex-1" disabled={readOnly || !animated} onClick={clearAnimations}>
            Remove all
          </button>
        </div>
        <Row label="Length">
          <SliderNum title="Page length in seconds" min={1} max={20} step={0.5} precision={1} suffix="s" value={page.duration ?? 4} onChange={(v) => useEditor.getState().setPageDuration(v)} />
        </Row>
        <div className="text-[12px] text-ink-3">
          {animated ? `${animated} animated element${animated > 1 ? 's' : ''} — download as a GIF from the Download menu.` : 'Nothing is animated yet. Auto-animate staggers every element in for you.'}
        </div>
      </Section>
      <Section title={els.length ? (els.length === 1 ? 'Selected element' : `${els.length} selected elements`) : 'Element entrance'}>
        {!els.length ? (
          <div className="text-[12.5px] text-ink-3">Select something on the page to choose how it enters.</div>
        ) : (
          <>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))' }}>
              {KINDS.map((k) => {
                const on = sameKind && anim.kind === k.kind
                return (
                  <button
                    key={k.kind}
                    type="button"
                    disabled={readOnly}
                    aria-pressed={on}
                    onClick={() => setAnim({ kind: k.kind })}
                    className={clsx(
                      'flex h-[58px] flex-col items-center justify-center gap-1 whitespace-nowrap rounded-lg border text-[11.5px] font-semibold',
                      on ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface-1 text-ink-2 hover:border-accent/50',
                    )}
                  >
                    {k.icon}
                    {k.label}
                  </button>
                )
              })}
            </div>
            {anim.kind !== 'none' && (
              <>
                <Row label="Starts at">
                  <SliderNum title="Delay in seconds" min={0} max={Math.max(4, page.duration ?? 4)} step={0.05} precision={2} suffix="s" value={anim.delay} onChange={(v) => setAnim({ delay: v })} />
                </Row>
                <Row label="Takes">
                  <SliderNum title="Duration in seconds" min={0.1} max={3} step={0.05} precision={2} suffix="s" value={anim.duration} onChange={(v) => setAnim({ duration: v })} />
                </Row>
              </>
            )}
            {images.length > 0 && (
              <Row label="Ken Burns">
                <Toggle
                  label="Slow zoom on the photo"
                  checked={images.every((e) => e.type === 'image' && e.kenBurns)}
                  onChange={(v) => useEditor.getState().updateEls(Object.fromEntries(images.map((e) => [e.id, { kenBurns: v } as Partial<El>])))}
                />
                <span className="truncate text-[12px] text-ink-3">Slow zoom on the photo</span>
              </Row>
            )}
          </>
        )}
      </Section>
    </div>
  )
}
