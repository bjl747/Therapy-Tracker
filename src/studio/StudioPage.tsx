// ─────────────────────────────────────────────────────────────
// Studio — the hub tab. Routes (mounted at /studio/*):
//   /studio            home (Create · My designs · Brand · Templates[admin])
//   /studio/templates  admin: template settings (locked values, fields, sizes, new)
//   /studio/kit        Job Kit (one job → every size + GIF + caption)
//   /studio/design/:id editor
//   /studio/pdf        PDF tools
// ─────────────────────────────────────────────────────────────

import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { StudioErrorBoundary } from './ui/ErrorBoundary'
import { LayoutTemplate, Save, X } from 'lucide-react'
import { configureRepo, isPreview, repo } from './data'
import { useEditor } from './editor/store'
import { useTemplateLib, effectiveTemplates } from './templates/store'
import { applyDesignToTemplate } from './templates/admin'
import { toast } from './ui/toast'
import type { Design } from './engine/model'
import { useAuth } from '@/context/AuthContext'
import { StudioHome } from './home/StudioHome'
import { JobKit } from './kit/JobKit'
import { kitBackPath, linkFor, useKitWriteBack, type KitLink } from './kit/link'
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
  // PDF Studio keeps its document while you move around the hub; it belongs to the signed-in person and is cleared
  // when someone else (or nobody) opens it
  const { user, can } = useAuth()
  // PDF Studio has its own access switch (BJ, 2026-11-19); with PDF Studio alone there is no Studio home to go back to
  if (can('studio_pdf') === 'none') return <Navigate to="/studio" replace />
  const hasStudio = can('studio') !== 'none'
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PdfStudio onBack={hasStudio ? () => nav('/studio') : undefined} owner={user?.uid ?? ''} />
    </div>
  )
}

function EditorRoute() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { can, user, isManager } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [meta, setMeta] = useState<Design['source'] | null>(null)
  // opened from the Job Kit: the form carries back to that job, and Back returns to it (kit/link.ts)
  const [link, setLink] = useState<KitLink | null>(null)
  useKitWriteBack(id)
  const [owner, setOwner] = useState<string | undefined>()
  useEffect(() => {
    void repo.getDesign(id).then(
      (d) => {
        setMeta(d?.source ?? null)
        setOwner(d?.ownerUid)
        setLink(linkFor(d))
      },
      () => setMeta(null),
    )
  }, [id])
  // AMs can open everyone's designs but only owners and managers / admins change them (the rules say the same)
  const othersDesign = !!owner && owner !== user?.uid && !isManager && !isAdmin
  const editingTemplate = !!meta?.templateEdit && isAdmin
  // a Job Kit post opened just to look at (View access): never saved, and Back returns to the Job Kit
  const preview = isPreview(id)
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {editingTemplate && meta && <TemplateEditBar templateId={meta.templateId} size={meta.size} designId={id} />}
      <div className="flex flex-col flex-1 min-h-0">
        <Editor
          key={id}
          designId={id}
          onExit={() => nav(link ? kitBackPath(link) : preview ? '/studio/kit' : editingTemplate ? `/studio/templates?t=${meta!.templateId}` : '/studio/designs')}
          // only admins can move/edit brand-locked pieces and locked fields
          canEditLocked={isAdmin}
          readOnly={can('studio') !== 'edit' || othersDesign || preview}
          // a Job Kit post opened with View: the picture stays as it is, but the job details can still be changed
          editFields={preview}
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
  const { user, isManager, can } = useAuth()
  // PDF Studio alone (no Studio access): every Studio page leads to the PDF tools
  const hasStudio = can('studio') !== 'none'
  // before any child loads: the hub's database for a signed-in person (browser storage in demo mode). Managers, AMs and
  // admins list everyone's designs, recruiters their own (BJ, 2026-11-18: like candidates).
  configureRepo({ uid: user?.uid, seeAll: !!user && (isManager || user.role === 'account_manager' || user.role === 'admin') })
  return (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-auto">
      <StudioErrorBoundary resetKey={pathname}>
      <Suspense fallback={<Skeleton />}>
        {!hasStudio ? (
          <Routes>
            <Route path="pdf" element={<PdfRoute />} />
            <Route path="*" element={<Navigate to="/studio/pdf" replace />} />
          </Routes>
        ) : (
        <Routes>
          <Route index element={<StudioHome tab="create" />} />
          <Route path="designs" element={<StudioHome tab="designs" />} />
          <Route path="brand" element={<StudioHome tab="brand" />} />
          <Route path="templates" element={<StudioHome tab="templates" />} />
          <Route path="kit" element={<JobKit />} />
          <Route path="design/:id" element={<EditorRoute />} />
          <Route path="pdf" element={<PdfRoute />} />
        </Routes>
        )}
      </Suspense>
      </StudioErrorBoundary>
      <Toaster />
    </div>
  )
}
