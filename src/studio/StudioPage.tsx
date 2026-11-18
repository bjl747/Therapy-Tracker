// ─────────────────────────────────────────────────────────────
// Studio — the hub tab. Routes (mounted at /studio/*):
//   /studio            home (Create · My designs · Brand · Templates[admin])
//   /studio/templates  admin: template settings (locked values, fields, sizes, new)
//   /studio/kit        Job Kit (one job → every size + GIF + caption)
//   /studio/design/:id editor
//   /studio/pdf        PDF tools
// ─────────────────────────────────────────────────────────────

import { lazy, Suspense, useEffect, useState } from 'react'
import { Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { StudioErrorBoundary } from './ui/ErrorBoundary'
import { LayoutTemplate, Save, X } from 'lucide-react'
import { repo } from './data'
import { useEditor } from './editor/store'
import { useTemplateLib, effectiveTemplates } from './templates/store'
import { applyDesignToTemplate } from './templates/admin'
import { toast } from './ui/toast'
import type { Design } from './engine/model'
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
  const { can, user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [meta, setMeta] = useState<Design['source'] | null>(null)
  useEffect(() => {
    void repo.getDesign(id).then((d) => setMeta(d?.source ?? null))
  }, [id])
  const editingTemplate = !!meta?.templateEdit && isAdmin
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {editingTemplate && meta && <TemplateEditBar templateId={meta.templateId} size={meta.size} designId={id} />}
      <div className="flex flex-col flex-1 min-h-0">
        <Editor
          key={id}
          designId={id}
          onExit={() => nav(editingTemplate ? `/studio/templates?t=${meta!.templateId}` : '/studio/designs')}
          // only admins can move/edit brand-locked pieces and locked fields
          canEditLocked={isAdmin}
          readOnly={can('studio') !== 'edit'}
        />
      </div>
    </div>
  )
}

/** shown above the editor while an admin edits a template's design */
function TemplateEditBar({ templateId, size, designId }: { templateId: string; size: string; designId: string }) {
  const nav = useNavigate()
  const lib = useTemplateLib()
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!lib.loaded) void lib.load()
  }, [lib])
  const t = effectiveTemplates(lib.saved).find((x) => x.id === templateId)
  const save = async () => {
    const d = useEditor.getState().design
    if (!t || !d) return
    setBusy(true)
    try {
      await lib.save(applyDesignToTemplate(t, d, size))
      useEditor.getState().markSaved()
      toast('Saved to template', `Recruiters now get the new ${size} design of “${t.name}”.`)
      await repo.deleteDesign(designId)
      nav(`/studio/templates?t=${templateId}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mx-2 sm:mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 bg-[rgb(var(--series-3)/0.12)] border border-[rgb(var(--series-3)/0.35)]">
      <LayoutTemplate size={15} className="text-[rgb(var(--series-3))] shrink-0" />
      <div className="text-[12.5px] min-w-0 flex-1">
        <b>Editing a template</b> — {t?.name ?? templateId} · {size}. Everything is unlocked for you; changes reach recruiters when you save.
      </div>
      <button
        className="btn h-8 px-2.5"
        onClick={() => void repo.deleteDesign(designId).then(() => nav(`/studio/templates?t=${templateId}`))}
      >
        <X size={14} /> Discard
      </button>
      <button className="btn btn-primary h-8 px-3" disabled={busy || !t} onClick={() => void save()}>
        <Save size={14} /> Save to template
      </button>
    </div>
  )
}

export function StudioPage() {
  const { pathname } = useLocation()
  return (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-auto">
      <StudioErrorBoundary resetKey={pathname}>
      <Suspense fallback={<Skeleton />}>
        <Routes>
          <Route index element={<StudioHome tab="create" />} />
          <Route path="designs" element={<StudioHome tab="designs" />} />
          <Route path="brand" element={<StudioHome tab="brand" />} />
          <Route path="templates" element={<StudioHome tab="templates" />} />
          <Route path="kit" element={<JobKit />} />
          <Route path="design/:id" element={<EditorRoute />} />
          <Route path="pdf" element={<PdfRoute />} />
        </Routes>
      </Suspense>
      </StudioErrorBoundary>
      <Toaster />
    </div>
  )
}
