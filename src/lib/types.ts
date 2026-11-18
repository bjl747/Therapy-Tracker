// HUB SHIM — the hub's FeatureKey union. Migration: add 'studio' to the real one.
export type FeatureKey = 'hotjobs' | 'payintel' | 'studio'
export type AccessLevel = 'none' | 'view' | 'edit'
export type Role = 'admin' | 'manager' | 'account_manager' | 'recruiter'

export interface HubUser {
  uid: string
  name: string
  email: string
  role: Role
  status: 'active' | 'pending'
  access?: Partial<Record<FeatureKey, AccessLevel>>
}
