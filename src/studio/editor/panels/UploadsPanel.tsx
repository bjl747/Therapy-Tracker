// Uploads (BJ, 2026-11-19: "an uploads button added under the photos button on the menu ... similarly to canva").
// Each person's own photos: Upload files, a grid of them at their own shape, click to add one to the page or drag it
// onto the page. Managers and admins can switch to Team to use anyone's (BJ, 2026-11-19); only the uploader removes one.
// Saved in hub_studio/uploads + Storage studio/{uid}/uploads/ (images only, under 15 MB).

import { useEffect, useMemo, useRef, useState } from 'react'
import { CloudUpload, Search, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/context/AuthContext'
import { repo, type BrandAsset } from '../../data'
import { useEditor } from '../store'
import { addOrFill, toast, uploadError } from '../actions'
import { assetDragProps } from '../assetDrag'
import { Seg, Skeleton } from '../ui'

type Scope = 'mine' | 'team'
const MAX_AT_ONCE = 12

const cleanName = (n: string) => n.replace(/\.[a-z0-9]+$/i, '')

export function UploadsPanel() {
  const viewOnly = useEditor((s) => s.readOnly)
  // A Job Kit post opened with View (2026-11-19: a recruiter found Upload greyed out there): uploads work, and a photo
  // becomes the post's photo through the job's form (`location__photo`, like the Job Kit's "Your uploads"), so it
  // also carries back to the Job Kit. Nothing else on the post can be changed.
  const formOnly = useEditor((s) => s.readOnly && s.editFields)
  const photoField = useEditor((s) => {
    const el = s.design?.pages.flatMap((p) => p.elements).find((e) => e.type === 'image' && e.bind)
    return el && el.type === 'image' && el.bind ? `${el.bind}__photo` : null
  })
  const usePhoto = formOnly && !!photoField
  const readOnly = viewOnly && !usePhoto
  const pin = (url: string) => {
    if (photoField) useEditor.getState().setFields({ [photoField]: url })
  }
  const { user, isManager } = useAuth()
  const [scope, setScope] = useState<Scope>('mine')
  const [list, setList] = useState<BrandAsset[] | null>(null)
  const [adding, setAdding] = useState(0)
  const [q, setQ] = useState('')
  const [over, setOver] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const team = isManager && scope === 'team'

  const refresh = (t = team) =>
    repo
      .listUploads(t ? { team: true } : undefined)
      .then((l) => setList([...l].sort((a, b) => b.createdAt - a.createdAt)))
      .catch(() => setList([]))
  useEffect(() => {
    setList(null)
    void refresh(team)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team])

  const upload = async (files: FileList | File[] | null) => {
    const imgs = [...(files ?? [])].filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return toast('Only image files can be uploaded')
    if (imgs.length > MAX_AT_ONCE) toast(`Adding the first ${MAX_AT_ONCE}; upload the rest after`)
    const batch = imgs.slice(0, MAX_AT_ONCE)
    setAdding(batch.length)
    for (const f of batch) {
      try {
        const a = await repo.uploadImage(f)
        // on a View user's post, one photo uploaded goes straight onto the post
        if (usePhoto && batch.length === 1) pin(a.url)
      } catch (e) {
        toast(`“${f.name}”: ${uploadError(e)}`)
      }
      setAdding((n) => Math.max(0, n - 1))
      void refresh()
    }
  }

  const mine = (a: BrandAsset) => !a.ownerUid || a.ownerUid === 'local' || a.ownerUid === user?.uid
  const remove = (a: BrandAsset) =>
    void repo.deleteUpload(a.id).then(
      () => refresh(),
      () => toast('That couldn’t be removed'),
    )

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (list ?? []).filter((a) => !t || a.name.toLowerCase().includes(t) || (a.ownerName ?? '').toLowerCase().includes(t))
  }, [list, q])

  return (
    <div
      className={clsx('flex min-h-full flex-col', over && 'bg-accent/[0.06]')}
      onDragOver={(e) => {
        if (readOnly || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        if (readOnly || !e.dataTransfer.files.length) return
        e.preventDefault()
        setOver(false)
        void upload(e.dataTransfer.files)
      }}
    >
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-line/60 p-3" style={{ background: 'rgb(var(--surface-1))' }}>
        <button type="button" className="btn btn-primary h-10 w-full justify-center text-[13px]" disabled={readOnly || adding > 0} onClick={() => file.current?.click()}>
          <CloudUpload size={16} /> {adding ? `Uploading ${adding}…` : 'Upload files'}
        </button>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          multiple
          hidden
          onChange={(e) => {
            void upload(e.target.files)
            e.target.value = ''
          }}
        />
        {isManager && (
          <Seg<Scope>
            value={scope}
            onChange={setScope}
            className="w-full"
            options={[
              { value: 'mine', label: 'Mine', title: 'Photos you uploaded' },
              { value: 'team', label: 'Team', title: 'Everyone’s uploads (managers and admins)' },
            ]}
          />
        )}
        {(list?.length ?? 0) > 8 && (
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input className="input pl-8" placeholder={team ? 'Search by name or person' : 'Search your uploads'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search uploads" />
          </div>
        )}
      </div>

      <div className="flex-1 p-3">
        {list === null ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/3] w-full" />
            ))}
          </div>
        ) : !shown.length && !adding ? (
          list.length ? (
            <div className="py-8 text-center text-[13px] text-ink-3">No uploads match “{q}”</div>
          ) : (
            <button
              type="button"
              disabled={readOnly}
              onClick={() => file.current?.click()}
              className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-line px-3 py-8 text-center text-[12.5px] text-ink-3 hover:border-accent/60 hover:text-ink-2"
            >
              <CloudUpload size={20} />
              <span className="font-semibold text-ink-2">{team ? 'Nobody has uploaded photos yet' : 'No uploads yet'}</span>
              <span>Upload photos, or drop them here, to use them in your designs.</span>
            </button>
          )
        ) : (
          <>
            {/* two columns, each picture at its own shape (Canva's look); columns keep the order top to bottom */}
            <div className="gap-2 [column-count:2] [column-fill:balance]">
              {Array.from({ length: adding }, (_, i) => (
                <Skeleton key={`up${i}`} className="mb-2 aspect-[4/3] w-full break-inside-avoid" />
              ))}
              {shown.map((a) => {
                const name = cleanName(a.name)
                const own = mine(a)
                const who = team && !own ? a.ownerName || 'Someone' : null
                return (
                  <div key={a.id} className="group relative mb-2 break-inside-avoid">
                    <button
                      type="button"
                      disabled={readOnly}
                      title={`${name}${who ? ` · ${who}` : ''}${readOnly ? '' : usePhoto ? ' (click to use it on this post)' : ' (click to add, or drag onto the page)'}`}
                      className="block w-full touch-pan-y select-none overflow-hidden rounded-lg border border-line bg-surface-3 hover:border-accent disabled:cursor-default"
                      style={{ aspectRatio: `${Math.max(1, a.w)} / ${Math.max(1, a.h)}` }}
                      {...assetDragProps(readOnly || usePhoto ? null : { src: a.url, w: a.w, h: a.h, preview: a.url, opts: { name, fit: 'cover' } }, () =>
                        usePhoto ? pin(a.url) : addOrFill(a.url, { w: a.w, h: a.h }, { fit: 'cover', name }),
                      )}
                    >
                      <img src={a.url} alt={name} loading="lazy" draggable={false} className="h-full w-full object-cover" />
                      {who && (
                        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1 pt-4 text-left text-[11px] font-semibold text-white">
                          {who}
                        </span>
                      )}
                    </button>
                    {own && !readOnly && (
                      <button
                        type="button"
                        title="Remove from uploads (designs that use it keep it)"
                        aria-label={`Remove ${name} from uploads`}
                        className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white hover:bg-red-600 focus-visible:flex group-hover:flex [@media(hover:none)]:flex"
                        onClick={() => remove(a)}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {!readOnly && (
              <p className="mt-1 text-center text-[11.5px] text-ink-3">{usePhoto ? 'Click a photo to use it on this post' : 'Click to add · drag onto the page'}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
