// Layers: top of the list = front of the page. Drag the grip to reorder.

import { useRef, useState } from 'react'
import clsx from 'clsx'
import { Eye, EyeOff, GripVertical, Image as ImageIcon, Lock, Shapes, Sparkles, Type, Unlock } from 'lucide-react'
import { isDrawn, type El } from '../../engine/model'
import { currentPage, lockedFor, useEditor } from '../store'
import { elLabel } from '../lint'
import { patchElRaw, reorderEl } from '../actions'

const ROW = 38

export function LayersPanel() {
  const page = useEditor((s) => currentPage(s))
  const fields = useEditor((s) => s.design?.fields)
  const fieldDefs = useEditor((s) => s.design?.fieldDefs)
  const selection = useEditor((s) => s.selection)
  const canEditLocked = useEditor((s) => s.canEditLocked)
  const readOnly = useEditor((s) => s.readOnly)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; slot: number } | null>(null)
  const list = useRef<HTMLDivElement>(null)
  if (!page) return null
  const rows = [...page.elements].reverse()
  const n = rows.length

  const slotAt = (clientY: number) => {
    const r = list.current!.getBoundingClientRect()
    return Math.max(0, Math.min(n, Math.round((clientY - r.top) / ROW)))
  }
  const drop = (id: string, slot: number) => {
    const from = rows.findIndex((e) => e.id === id)
    const visual = slot > from ? slot - 1 : slot
    if (visual !== from) reorderEl(id, n - 1 - visual)
  }

  if (!n) return <div className="p-4 text-[13px] text-ink-3">Nothing on this page yet. Add text, photos or shapes from the rail.</div>

  return (
    <div className="p-2">
      <div ref={list} className="relative" style={{ height: n * ROW }}>
        {rows.map((el, i) => {
          const selected = selection.includes(el.id)
          const lockedOut = readOnly || lockedFor(el, canEditLocked)
          const Icon = el.type === 'text' ? Type : el.type === 'image' ? ImageIcon : el.type === 'effect' ? Sparkles : Shapes
          // conditional row (roundup) switched off: listed, but dimmed and explained
          const waiting = !el.hidden && !!el.showIf && !isDrawn(el, fields ?? {})
          const waitingNote = waiting ? `Shown when ${fieldDefs?.find((f) => f.key === el.showIf)?.label ?? el.showIf} is filled` : undefined
          return (
            <div
              key={el.id}
              className={clsx(
                'absolute inset-x-0 flex items-center gap-1 rounded-lg pr-1 text-[12.5px]',
                selected ? 'bg-accent/10 text-ink' : 'text-ink-2 hover:bg-surface-2',
                drag?.id === el.id && 'opacity-50',
                (el.hidden || waiting) && 'opacity-60',
              )}
              title={waitingNote}
              style={{ top: i * ROW, height: ROW - 2 }}
              onClick={(e) => useEditor.getState().select([el.id], e.shiftKey || e.metaKey || e.ctrlKey ? 'toggle' : 'replace')}
              onDoubleClick={() => !lockedOut && setRenaming(el.id)}
            >
              <span
                className={clsx('flex h-full w-6 shrink-0 items-center justify-center text-ink-3', lockedOut ? 'opacity-30' : 'cursor-grab active:cursor-grabbing')}
                style={{ touchAction: 'none' }}
                title="Drag to reorder"
                onPointerDown={(e) => {
                  if (lockedOut) return
                  e.stopPropagation()
                  e.currentTarget.setPointerCapture(e.pointerId)
                  setDrag({ id: el.id, slot: i })
                }}
                onPointerMove={(e) => drag && setDrag({ id: drag.id, slot: slotAt(e.clientY) })}
                onPointerUp={() => {
                  if (drag) drop(drag.id, drag.slot)
                  setDrag(null)
                }}
                onPointerCancel={() => setDrag(null)}
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical size={14} />
              </span>
              <Icon size={14} className={clsx('shrink-0', selected ? 'text-accent' : 'text-ink-3')} />
              {renaming === el.id ? (
                <input
                  autoFocus
                  className="input h-7 min-w-0 flex-1 px-1.5 text-[12.5px]"
                  defaultValue={el.name ?? elLabel(el, fields)}
                  aria-label="Layer name"
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    const v = e.target.value.trim().slice(0, 60)
                    if (v !== (el.name ?? '')) patchElRaw(el.id, { name: v || undefined })
                    setRenaming(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setRenaming(null)
                    }
                  }}
                />
              ) : (
                <span className="flex min-w-0 flex-1 flex-col pl-1 leading-tight" title={waitingNote ?? 'Double-click to rename'}>
                  <span className="truncate">{elLabel(el, fields)}</span>
                  {waitingNote && <span className="truncate text-[10.5px] italic text-ink-3">{waitingNote.replace(/^S/, 's')}</span>}
                </span>
              )}
              <LayerBtn
                title={el.hidden ? 'Show' : 'Hide'}
                disabled={lockedOut}
                dim={!el.hidden}
                onClick={() => patchElRaw(el.id, { hidden: !el.hidden } as Partial<El>)}
              >
                {el.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
              </LayerBtn>
              {canEditLocked ? (
                <LayerBtn title={el.locked ? 'Unlock' : 'Lock for recruiters (brand lock)'} dim={!el.locked} disabled={readOnly} onClick={() => patchElRaw(el.id, { locked: !el.locked })}>
                  {el.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </LayerBtn>
              ) : (
                el.locked && (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center text-ink-3" title="Locked by your brand template">
                    <Lock size={13} />
                  </span>
                )
              )}
            </div>
          )
        })}
        {drag && <div className="pointer-events-none absolute inset-x-1 h-0.5 rounded bg-accent" style={{ top: drag.slot * ROW - 2 }} />}
      </div>
    </div>
  )
}

function LayerBtn({ title, onClick, children, dim, disabled }: { title: string; onClick: () => void; children: React.ReactNode; dim?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-surface-3 disabled:opacity-30', dim ? 'text-ink-3' : 'text-ink')}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}
