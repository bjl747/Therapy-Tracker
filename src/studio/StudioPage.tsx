// ─────────────────────────────────────────────────────────────
// Studio — the hub tab. Routes (mounted at /studio/*):
//   /studio            home (Create · My designs · Brand)
//   /studio/kit        Job Kit (one job → every size + GIF + caption)
//   /studio/design/:id editor
//   /studio/pdf        PDF tools
// ─────────────────────────────────────────────────────────────

import { lazy, Suspense } from 'react'
import { Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { StudioHome } from './home/StudioHome'
import { JobKit } from './kit/JobKit'
import { Toaster } from './ui/toast'

const Editor = lazy(() => import('./editor/Editor').then((m) => ({ default: m.Editor })))
const PdfStudio = lazy(() => import('./pdf/PdfStudio').then((m) => ({ default: m.PdfStudio })))

function Skeleton() {
  return (
    <div className="p-6 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card h-48 animate-pulse" />
      ))}
    </div>
  )
}

function PdfRoute() {
  const nav = useNavigate()
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PdfStudio onBack={() => nav('/studio')} />
    </div>
  )
}

function EditorRoute() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { can, isManager } = useAuth()
  return <Editor key={id} designId={id} onExit={() => nav('/studio/designs')} canEditLocked={isManager} readOnly={can('studio') !== 'edit'} />
}

export function StudioPage() {
  return (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-auto">
      <Suspense fallback={<Skeleton />}>
        <Routes>
          <Route index element={<StudioHome tab="create" />} />
          <Route path="designs" element={<StudioHome tab="designs" />} />
          <Route path="brand" element={<StudioHome tab="brand" />} />
          <Route path="kit" element={<JobKit />} />
          <Route path="design/:id" element={<EditorRoute />} />
          <Route path="pdf" element={<PdfRoute />} />
        </Routes>
      </Suspense>
      <Toaster />
    </div>
  )
}
