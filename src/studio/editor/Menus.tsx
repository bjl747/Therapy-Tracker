// Right-click context menu + Ctrl/Cmd+K command palette (both portaled).

import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  ArrowDownToLine,
  ArrowUpToLine,
  BringToFront,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Group,
  Lock,
  Scissors,
  Search,
  SendToBack,
  Trash2,
  Ungroup,
  Unlock,
} from 'lucide-react'
import { lockedFor, selectedEls, useEditor } from './store'
import { stageApi, useUi, type LeftTab } from './uiStore'
import { addShape, addText, autoAnimate, copySelection, cutSelection, markSystemClipboard, pasteClip } from './actions'
import { MenuList, MOD, Popover, Portal, useLayer, type MenuItem } from './ui'

export function ContextMenu() {
  const menu = useUi((s) => s.menu)
  const clip = useUi((s) => s.clip)
  const close = () => useUi.getState().setMenu(null)
  const st = useEditor.getState()
  const els = menu ? selectedEls(st) : []
  const has = els.length > 0
  const ro = st.readOnly
  const lockedOut = ro || els.some((e) => lockedFor(e, st.canEditLocked))
  const grouped = els.some((e) => e.groupId)
  const allLocked = has && els.every((e) => e.locked)
  const items: MenuItem[] = [
    { label: 'Cut', icon: <Scissors size={14} />, hint: `${MOD}X`, disabled: !has || lockedOut, onClick: () => cutSelection() && markSystemClipboard() },
    { label: 'Copy', icon: <Copy size={14} />, hint: `${MOD}C`, disabled: !has, onClick: () => copySelection() && markSystemClipboard() },
    { label: 'Paste', icon: <ClipboardPaste size={14} />, hint: `${MOD}V`, disabled: !clip || ro, onClick: () => pasteClip(menu?.page ?? undefined) },
    { label: 'Duplicate', icon: <CopyPlus size={14} />, hint: `${MOD}D`, disabled: !has || ro, onClick: () => st.duplicateSelected() },
    { label: 'Delete', icon: <Trash2 size={14} />, hint: 'Del', danger: true, disabled: !has || lockedOut, onClick: () => st.deleteSelected() },
    { sep: true, label: 'Bring to front', icon: <BringToFront size={14} />, hint: `${MOD}]`, disabled: !has || lockedOut, onClick: () => st.order('front') },
    { label: 'Bring forward', icon: <ArrowUpToLine size={14} />, hint: ']', disabled: !has || lockedOut, onClick: () => st.order('forward') },
    { label: 'Send backward', icon: <ArrowDownToLine size={14} />, hint: '[', disabled: !has || lockedOut, onClick: () => st.order('backward') },
    { label: 'Send to back', icon: <SendToBack size={14} />, hint: `${MOD}[`, disabled: !has || lockedOut, onClick: () => st.order('back') },
    grouped
      ? { sep: true, label: 'Ungroup', icon: <Ungroup size={14} />, hint: `${MOD}Shift+G`, disabled: lockedOut, onClick: () => st.ungroup() }
      : { sep: true, label: 'Group', icon: <Group size={14} />, hint: `${MOD}G`, disabled: els.length < 2 || lockedOut, onClick: () => st.group() },
    ...(st.canEditLocked
      ? [{ label: allLocked ? 'Unlock' : 'Lock for recruiters', icon: allLocked ? <Unlock size={14} /> : <Lock size={14} />, disabled: !has || ro, onClick: () => st.toggleLock() }]
      : []),
    { sep: true, label: 'Centre on page — horizontally', icon: <AlignCenterVertical size={14} />, disabled: !has || lockedOut, onClick: () => st.align('hcenter') },
    { label: 'Centre on page — vertically', icon: <AlignCenterHorizontal size={14} />, disabled: !has || lockedOut, onClick: () => st.align('vcenter') },
  ]
  // single elements align to the page; a multi-selection aligns to itself, so only offer "page" wording for one
  const shown = els.length > 1 ? items.map((i) => ({ ...i, label: i.label.replace('Centre on page', 'Centre selection') })) : items
  return (
    <Popover open={!!menu} onClose={close} anchor={menu ? { x: menu.x, y: menu.y } : null} className="!rounded-xl">
      <MenuList items={shown} close={close} />
    </Popover>
  )
}

// ── command palette ─────────────────────────────────────────

interface Cmd {
  label: string
  hint?: string
  group: string
  run: () => void
}

function commands(): Cmd[] {
  const st = useEditor.getState()
  const ui = useUi.getState()
  const tab = (t: LeftTab, label: string): Cmd => ({ label: `Open ${label}`, group: 'Panels', run: () => ui.setLeftTab(t) })
  const sel = st.selection.length > 0
  const out: Cmd[] = [
    { label: 'Add heading', hint: 'T', group: 'Add', run: () => addText('heading') },
    { label: 'Add subheading', group: 'Add', run: () => addText('sub') },
    { label: 'Add body text', group: 'Add', run: () => addText('body') },
    { label: 'Add rectangle', group: 'Add', run: () => addShape('rect') },
    { label: 'Add circle', group: 'Add', run: () => addShape('ellipse') },
    { label: 'Add line', group: 'Add', run: () => addShape('line', { h: 6 }) },
    { label: 'Add page', group: 'Pages', run: () => st.addPage() },
    { label: 'Duplicate page', group: 'Pages', run: () => st.duplicatePage() },
    { label: 'Auto-animate page', group: 'Animate', run: autoAnimate },
    { label: 'Preview animation', group: 'Animate', run: () => ui.setPreview(true) },
    { label: 'Zoom to fit', hint: `${MOD}0`, group: 'View', run: () => stageApi.zoomTo(null) },
    { label: 'Zoom to 100%', hint: `${MOD}1`, group: 'View', run: () => stageApi.zoomTo(1) },
    { label: 'Zoom in', hint: `${MOD}+`, group: 'View', run: () => stageApi.zoomStep(1) },
    { label: 'Zoom out', hint: `${MOD}−`, group: 'View', run: () => stageApi.zoomStep(-1) },
    { label: 'Undo', hint: `${MOD}Z`, group: 'Edit', run: () => st.undo() },
    { label: 'Redo', hint: `${MOD}Shift+Z`, group: 'Edit', run: () => st.redo() },
    { label: 'Select all', hint: `${MOD}A`, group: 'Edit', run: () => st.selectAll() },
    tab('fields', 'Fields'),
    tab('text', 'Text'),
    tab('photos', 'Photos'),
    tab('brand', 'Brand'),
    tab('elements', 'Elements'),
    tab('layers', 'Layers'),
    tab('animate', 'Animate'),
  ]
  if (sel)
    out.unshift(
      { label: 'Duplicate selection', hint: `${MOD}D`, group: 'Selection', run: () => st.duplicateSelected() },
      { label: 'Delete selection', hint: 'Del', group: 'Selection', run: () => st.deleteSelected() },
      { label: 'Group', hint: `${MOD}G`, group: 'Selection', run: () => st.group() },
      { label: 'Ungroup', hint: `${MOD}Shift+G`, group: 'Selection', run: () => st.ungroup() },
      { label: 'Bring to front', hint: `${MOD}]`, group: 'Selection', run: () => st.order('front') },
      { label: 'Send to back', hint: `${MOD}[`, group: 'Selection', run: () => st.order('back') },
      { label: 'Align left', group: 'Selection', run: () => st.align('left') },
      { label: 'Align centre', group: 'Selection', run: () => st.align('hcenter') },
      { label: 'Align right', group: 'Selection', run: () => st.align('right') },
      { label: 'Align top', group: 'Selection', run: () => st.align('top') },
      { label: 'Align middle', group: 'Selection', run: () => st.align('vcenter') },
      { label: 'Align bottom', group: 'Selection', run: () => st.align('bottom') },
    )
  return st.readOnly ? out.filter((c) => c.group === 'View' || c.group === 'Panels' || c.label === 'Preview animation') : out
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  const close = () => useUi.getState().setPalette(false)
  const id = useLayer(open, close)
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const all = useMemo(() => (open ? commands() : []), [open])
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return all.filter((c) => words.every((w) => `${c.label} ${c.group}`.toLowerCase().includes(w)))
  }, [all, q])
  useEffect(() => {
    if (open) {
      setQ('')
      setAt(0)
    }
  }, [open])
  useEffect(() => {
    list.current?.querySelector('[data-on="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [at])
  if (!open) return null
  const run = (c: Cmd | undefined) => {
    if (!c) return
    close()
    c.run()
  }
  return (
    <Portal>
      <div
        data-layer={id}
        className="fixed inset-0 z-[1000] flex items-start justify-center px-3 pt-[12vh]"
        style={{ background: 'rgb(4 8 26 / .35)' }}
        onPointerDown={(e) => e.target === e.currentTarget && close()}
      >
        <div role="dialog" aria-label="Command palette" className="card flex max-h-[62vh] w-full min-w-0 flex-col overflow-hidden sm:w-[520px]" style={{ background: 'rgb(var(--surface-1))' }}>
          <div className="relative border-b border-line/70">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              autoFocus
              className="h-12 w-full bg-transparent pl-10 pr-3 text-[14px] text-ink outline-none"
              placeholder="Type a command…"
              aria-label="Search commands"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setAt(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setAt((i) => Math.min(shown.length - 1, i + 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setAt((i) => Math.max(0, i - 1))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  run(shown[at])
                }
              }}
            />
          </div>
          <div ref={list} className="min-h-0 flex-1 overflow-auto p-1">
            {shown.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-ink-3">No commands match “{q}”</div>}
            {shown.map((c, i) => (
              <button
                key={`${c.group}-${c.label}`}
                type="button"
                data-on={i === at}
                onPointerMove={() => i !== at && setAt(i)}
                onClick={() => run(c)}
                className={clsx('flex h-9 w-full items-center gap-3 whitespace-nowrap rounded-lg px-3 text-left text-[13px]', i === at ? 'bg-accent/10 text-accent' : 'text-ink')}
              >
                <span className="w-[70px] shrink-0 truncate text-[10.5px] font-bold uppercase tracking-wider text-ink-3">{c.group}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                {c.hint && <span className="shrink-0 text-[11px] tabular-nums text-ink-3">{c.hint}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Portal>
  )
}
