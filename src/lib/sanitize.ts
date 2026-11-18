// HUB SHIM — the hub has sanitizeRich / safeUrl in src/lib/. Same contract.
export function safeUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    const u = new URL(url, 'https://x.invalid')
    return u.protocol === 'http:' || u.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** plain-text clean (Studio never renders stored HTML) */
export function sanitizeText(s: unknown, max = 2000): string {
  return typeof s === 'string' ? s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max) : ''
}
