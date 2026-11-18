// {{field}} markers — resolved at render time from design.fields.

const MARKER = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi

/** replace markers; unknown/empty fields render as "" (or the key, for the editor) */
export function resolveText(text: string, fields: Record<string, string>, showMissing = false): string {
  if (!text.includes('{{')) return text
  return text.replace(MARKER, (_m, key: string) => {
    const v = fields[key.toLowerCase()]
    if (v !== undefined && v !== '') return v
    return showMissing ? `‹${key}›` : ''
  })
}

/** every marker key used in a string */
export function markerKeys(text: string): string[] {
  return [...text.matchAll(MARKER)].map((m) => m[1].toLowerCase())
}

/** markers that have no value — the linter reports these before export */
export function missingKeys(text: string, fields: Record<string, string>): string[] {
  return markerKeys(text).filter((k) => !fields[k]?.trim())
}
