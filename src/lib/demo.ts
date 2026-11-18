// HUB SHIM — the hub's demo switch. VITE_HUB_DEMO=true runs on in-memory data.
import type { HubUser } from './types'

export const DEMO: boolean = import.meta.env.VITE_HUB_DEMO === 'true' || !import.meta.env.VITE_FIREBASE_API_KEY

export const DEMO_USER: HubUser = {
  uid: 'demo-bj',
  name: 'Demo Manager',
  email: 'demo@gqrgm.com',
  role: 'manager',
  status: 'active',
}
