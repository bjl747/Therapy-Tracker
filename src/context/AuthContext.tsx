// HUB SHIM — the hub's AuthContext. Studio uses only: user, can(), isManager.
import { createContext, useContext, type ReactNode } from 'react'
import type { AccessLevel, FeatureKey, HubUser } from '@/lib/types'
import { ROLE_DEFAULTS } from '@/lib/access'
import { DEMO_USER } from '@/lib/demo'

interface AuthValue {
  user: HubUser
  can: (f: FeatureKey) => AccessLevel
  isManager: boolean
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = DEMO_USER
  const value: AuthValue = {
    user,
    can: (f) => (user.role === 'admin' ? 'edit' : user.access?.[f] ?? ROLE_DEFAULTS[user.role][f]),
    isManager: user.role === 'admin' || user.role === 'manager',
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
