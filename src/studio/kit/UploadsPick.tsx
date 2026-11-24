// "Your uploads" inside the Job Kit's photo picker (BJ, 2026-11-19: people with Studio View get uploads, used as the
// job post's photo). Upload photos here, pick one, and it becomes the post's photo in every size (it is pinned in the
// job's `location__photo` field as the upload's link; services.ts → resolveImage draws it). Nothing else is saved.

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { CloudUpload } from 'lucide-react'
import { repo, type BrandAsset } from '../data'
import { useToast } from '../ui/toast'

const MAX_AT_ONCE = 12

export function UploadsPick({ current, onPick }: { current?: string; onPick: (url: string) => void }) {
  const toast = useToast()
  const [list, setList] = useState<BrandAsset[] | null>(null)
  const [adding, setAdding] = useState(0)
  const file = useRef<HTMLInputElement>(null)
  const refresh = () =>
    repo.listUploads().then(
      (l) => setList([...l].sort((a, b) => b.createdAt - a.createdAt)),
      () => setList([]),
    )
  useEffect(() => {
    void refresh()
  }, [])

  const upload = async (files: FileList | null) => {
    const imgs = [...(files ?? [])].filter((f) => f.type.startsWith('image/')).slice(0, MAX_AT_ONCE)
    if (!imgs.length) return
    setAdding(imgs.length)
    let last: BrandAsset | null = null
    for (const f of imgs) {
      try {
        last = await repo.uploadImage(f)
      } catch (e) {
        const code = (e as { code?: string })?.code ?? ''
        toast('Couldn’t upload a photo', `${f.name}: ${/unauthorized|permission/.test(code) ? 'you don’t have permission to upload' : 'it could not be read'}.`, 'error')
      }
      setAdding((n) => Math.max(0, n - 1))
    }
    await refresh()
    // one photo uploaded: use it straight away
    if (last && imgs.length === 1) onPick(last.url)
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
        <button type="button" className="btn btn-primary" disabled={adding > 0} onClick={() => file.current?.click()}>
          <CloudUpload size={15} /> {adding ? `Uploading ${adding}…` : 'Upload photos'}
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
      </div>
      <div className="overflow-y-auto p-4 pt-2 grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
        {list === null &&
          Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton w-full aspect-[3/2] rounded-xl" />)}
        {Array.from({ length: adding }, (_, i) => (
          <div key={`a${i}`} className="skeleton w-full aspect-[3/2] rounded-xl" />
        ))}
        {list?.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onPick(a.url)}
            className={clsx('text-left rounded-xl overflow-hidden border-2 transition', a.url === current ? 'border-accent' : 'border-transparent hover:border-line-2')}
            title={a.name}
          >
            <img src={a.url} alt="" loading="lazy" className="w-full aspect-[3/2] object-cover bg-surface-3" />
            <div className="px-1.5 py-1 text-[12px] font-semibold truncate">{a.name.replace(/\.[a-z0-9]+$/i, '')}</div>
          </button>
        ))}
        {list && !list.length && !adding && (
          <button
            type="button"
            onClick={() => file.current?.click()}
            className="col-span-full flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-line px-3 py-8 text-center text-[12.5px] text-ink-3 hover:border-accent/60 hover:text-ink-2"
          >
            <CloudUpload size={20} />
            <span className="font-semibold text-ink-2">No uploads yet</span>
            <span>Upload a photo to use it on this job post instead of the city photo.</span>
          </button>
        )}
      </div>
    </div>
  )
}
