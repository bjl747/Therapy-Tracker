// HUB SHIM — the hub's AuthContext. Studio uses only: user, can(), isManager.
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { AccessLevel, FeatureKey, HubUser, Role } from '@/lib/types'
import { ROLE_DEFAULTS } from '@/lib/access'
import { DEMO_USER } from '@/lib/demo'

interface AuthValue {
  user: HubUser | null // the hub's type: null before sign-in (Studio only renders after it)
  can: (f: FeatureKey) => AccessLevel
  isManager: boolean
  /** SHIM ONLY (demo): preview the app as another role */
  setDemoRole?: (r: Role) => void
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>(() => {
    try {
      return (localStorage.getItem('demo.role') as Role) || DEMO_USER.role
    } catch {
      return DEMO_USER.role
    }
  })
  const user: HubUser = { ...DEMO_USER, role }
  const value: AuthValue = {
    user,
    can: (f) => {
      // SHIM ONLY: preview Studio at View access (localStorage demo.studioLevel = 'view'), as an admin may grant it
      if (f === 'studio') {
        try {
          const o = localStorage.getItem('demo.studioLevel')
          if (o === 'view' || o === 'edit') return o
        } catch {
          /* ignore */
        }
      }
      return user.role === 'admin' ? 'edit' : user.access?.[f] ?? ROLE_DEFAULTS[user.role][f]
    },
    isManager: user.role === 'admin' || user.role === 'manager',
    setDemoRole: (r) => {
      setRole(r)
      try {
        localStorage.setItem('demo.role', r)
      } catch {
        /* ignore */
      }
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
