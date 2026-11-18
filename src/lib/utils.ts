// HUB SHIM: same contract as the hub's src/lib/utils.ts safeUrl (http(s) only, else undefined).
export function safeUrl(s: string | null | undefined): string | undefined {
  const v = (s || '').trim()
  if (!v) return undefined
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined
  } catch {
    return undefined
  }
}
