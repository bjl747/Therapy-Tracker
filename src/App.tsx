// HUB SHIM — the hub's App.tsx. Migration: only the Studio <Route> line moves.
import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { AppShell } from '@/components/layout/AppShell'

const StudioPage = lazy(() => import('@/studio/StudioPage').then((m) => ({ default: m.StudioPage })))

function AppRoutes() {
  const { can } = useAuth()
  return (
    <Routes>
      {can('studio') !== 'none' && <Route path="/studio/*" element={<StudioPage />} />}
      <Route path="*" element={<Navigate to="/studio" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell>
          <Suspense fallback={<div className="p-6 text-ink-3 text-sm">Loading…</div>}>
            <AppRoutes />
          </Suspense>
        </AppShell>
      </BrowserRouter>
    </AuthProvider>
  )
}
