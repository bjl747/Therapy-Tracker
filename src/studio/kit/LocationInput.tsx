// Location box with instant suggestions from every US town.
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { MapPin } from 'lucide-react'
import { loadPlaces, suggestPlaces } from '../photos/places'

export function LocationInput({
  value,
  onChange,
  onCommit,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onCommit: (v: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [, setReady] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const list = open ? suggestPlaces(value) : []

  useEffect(() => {
    if (open) void loadPlaces().then(() => setReady(true))
  }, [open])

  const pick = (v: string) => {
    onChange(v)
    onCommit(v)
    setOpen(false)
  }

  return (
    <div ref={box} className="relative">
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open && list.length > 0}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        // commit right away: a delayed commit would overwrite "Clear all" / Recent / Hot Job
        // picks clicked just after leaving the box (options use mousedown + preventDefault)
        onBlur={() => {
          setOpen(false)
          onCommit(value)
        }}
        onKeyDown={(e) => {
          if (!list.length) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => (a + 1) % list.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => (a - 1 + list.length) % list.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(list[active])
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      />
      {open && list.length > 0 && (
        <ul role="listbox" className="absolute z-30 left-0 right-0 mt-1 card bg-surface-1 py-1 shadow-lg max-h-72 overflow-auto">
          {list.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(s)
              }}
              onMouseEnter={() => setActive(i)}
              className={clsx('px-3 h-8 flex items-center gap-2 text-[13px] cursor-pointer', i === active ? 'bg-accent/10 text-accent' : 'text-ink')}
            >
              <MapPin size={13} className="shrink-0 opacity-70" /> <span className="truncate">{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
