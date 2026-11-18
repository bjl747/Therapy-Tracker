// Location parsing ("Fishersville, VA" / "Fishersville, Virginia" / "VA").

export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
}

/** same normalisation as scripts/city-photos/places.py */
export function normPlace(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bst\.\s*/g, 'saint ')
    .replace(/\bft\.\s*/g, 'fort ')
    .replace(/\bmt\.\s*/g, 'mount ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function toStateCode(s: string): string | null {
  const up = s.trim().toUpperCase().replace(/\./g, '')
  if (STATE_NAMES[up]) return up
  const hit = Object.entries(STATE_NAMES).find(([, name]) => name.toLowerCase() === s.trim().toLowerCase())
  return hit ? hit[0] : null
}

export function parseLocation(input: string): { city: string; st: string } | null {
  const parts = input.split(',').map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return null
  let st = toStateCode(parts[parts.length - 1])
  let cityParts = parts.slice(0, -1)
  if (!st) {
    // "Fishersville VA" (no comma)
    const m = /^(.*\S)\s+([A-Za-z]{2})$/.exec(parts[parts.length - 1])
    if (m && toStateCode(m[2])) {
      st = toStateCode(m[2])
      cityParts = [...parts.slice(0, -1), m[1]]
    }
  }
  if (!st) return null
  return { city: cityParts.join(' '), st }
}

/** "Fishersville, VA" — canonical display form */
export function formatLocation(input: string): string {
  const p = parseLocation(input)
  if (!p) return input.trim()
  return p.city ? `${p.city}, ${p.st}` : STATE_NAMES[p.st]
}
