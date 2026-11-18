import { useCallback, useState } from 'react'
import { type PageItem, baseName, sanitizeFileName, splitBySource, splitEveryN } from './lib'
import { buildPdf, downloadBlob, pageToPng } from './export'
import { usePdfStudio } from './store'

export interface Busy {
  label: string
  done: number
  total: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Download actions. All work happens in the browser. */
export function useExporter() {
  const [busy, setBusy] = useState<Busy | null>(null)

  const run = useCallback(async (label: string, parts: { name: string; pages: PageItem[] }[]) => {
    const st = usePdfStudio.getState()
    if (!parts.length || parts.every((p) => !p.pages.length)) return
    try {
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        setBusy({ label: parts.length > 1 ? `${label} (${i + 1}/${parts.length})` : label, done: 0, total: part.pages.length })
        const s = usePdfStudio.getState()
        const res = await buildPdf(part.pages, {
          sources: s.sources,
          formValues: s.formValues,
          flatten: s.flatten,
          compressQuality: s.compress.on ? s.compress.quality : null,
          onProgress: (done, total) => setBusy({ label: parts.length > 1 ? `${label} (${i + 1}/${parts.length})` : label, done, total }),
        })
        res.warnings.forEach((w) => st.notify('info', w))
        downloadBlob(res.bytes, `${part.name}.pdf`, 'application/pdf')
        if (i < parts.length - 1) await sleep(400)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      st.notify('error', `Export failed. ${msg}`)
    } finally {
      setBusy(null)
    }
  }, [])

  const byIds = (ids: string[]) => {
    const set = new Set(ids)
    return usePdfStudio.getState().pages.filter((p) => set.has(p.id))
  }
  const base = () => sanitizeFileName(usePdfStudio.getState().fileName)

  const exportAll = useCallback(() => run('Building PDF', [{ name: base(), pages: usePdfStudio.getState().pages }]), [run])

  const exportSelection = useCallback(
    () => run('Extracting pages', [{ name: `${base()}-extract`, pages: byIds(usePdfStudio.getState().sel.ids) }]),
    [run],
  )

  const splitN = useCallback(
    (n: number) => {
      const pages = usePdfStudio.getState().pages
      const parts = splitEveryN(pages, n).map((p) => ({ name: `${base()}-${p.label}`, pages: byIds(p.ids) }))
      return run('Splitting', parts)
    },
    [run],
  )

  const splitSources = useCallback(() => {
    const s = usePdfStudio.getState()
    const used = new Set<string>()
    const parts = splitBySource(s.pages).map((g, i) => {
      let name = sanitizeFileName(g.sourceId ? baseName(s.sources[g.sourceId]?.name ?? '') : '', `part-${i + 1}`)
      while (used.has(name)) name += '-2'
      used.add(name)
      return { name, pages: byIds(g.ids) }
    })
    return run('Splitting by file', parts)
  }, [run])

  const exportPngs = useCallback(async () => {
    const s = usePdfStudio.getState()
    const ids = s.sel.ids.length ? s.sel.ids : s.pages.slice(0, 1).map((p) => p.id)
    try {
      for (const id of ids) {
        const i = s.pages.findIndex((p) => p.id === id)
        if (i < 0) continue
        setBusy({ label: 'Rendering PNG', done: 0, total: 1 })
        const blob = await pageToPng(s.pages[i])
        downloadBlob(blob, `${base()}-page-${i + 1}.png`, 'image/png')
        if (ids.length > 1) await sleep(300)
      }
    } catch {
      s.notify('error', 'Could not render that page as an image.')
    } finally {
      setBusy(null)
    }
  }, [])

  return { busy, exportAll, exportSelection, splitN, splitSources, exportPngs }
}
