// HUB SHIM — stand-in for the hub's sidebar + header shell.
import { NavLink } from 'react-router-dom'
import { Palette, Moon, Sun, Briefcase, Calculator } from 'lucide-react'
import { useState, type ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    document.documentElement.classList.toggle('dark')
    setDark(!dark)
  }
  const item = 'flex items-center gap-2.5 h-9 px-3 rounded-lg text-[13px] font-semibold whitespace-nowrap'
  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden md:flex w-[208px] shrink-0 flex-col gap-1 p-3 border-r border-line/70">
        <div className="px-2 py-3 text-[15px] font-extrabold tracking-tight">GQR Allied Hub</div>
        <div className="eyebrow px-3 mt-2 mb-1">Resources</div>
        <span className={`${item} text-ink-3`}><Briefcase size={15} /> Hot Jobs</span>
        <span className={`${item} text-ink-3`}><Calculator size={15} /> Pay Intel</span>
        <NavLink to="/studio" className={({ isActive }) => `${item} ${isActive ? 'bg-accent/10 text-accent' : 'text-ink-2 hover:bg-surface-2'}`}>
          <Palette size={15} /> Studio
        </NavLink>
        <div className="flex-1" />
        <button className="btn" onClick={toggle} aria-label="Toggle dark mode">
          {dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? 'Light' : 'Dark'}
        </button>
      </aside>
      <main className="flex-1 min-w-0 min-h-0 flex flex-col">{children}</main>
    </div>
  )
}
