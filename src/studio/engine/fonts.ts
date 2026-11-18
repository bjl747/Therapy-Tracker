// Self-hosted web fonts (Latin subset WOFF2, see public/fonts/LICENSES.md).

export type FontCategory = 'sans' | 'serif' | 'display' | 'script' | 'mono';

export interface FontFile {
  url: string;
  weight: string; // e.g. '400 900' or '600'
  style: 'normal' | 'italic';
}

export interface FontDef {
  family: string;
  category: FontCategory;
  weights: number[];
  italic: boolean;
  files: FontFile[];
  /** Brand this font belongs to, e.g. 'GQR' or 'UnitiMed'. */
  brand?: string;
  /** If set, this bundled font is a free stand-in for the named (licensed) brand font. */
  standInFor?: string;
}

const f = (name: string, weight: string, style: 'normal' | 'italic' = 'normal'): FontFile => ({
  url: `/fonts/${name}.woff2`,
  weight,
  style,
});

export const FONTS: FontDef[] = [
  {
    family: 'Inter', category: 'sans', weights: [400, 500, 600, 700, 800, 900], italic: true,
    files: [f('inter-normal', '400 900'), f('inter-italic', '400 900', 'italic')],
  },
  {
    family: 'Montserrat', category: 'sans', weights: [400, 500, 600, 700, 800, 900], italic: false,
    files: [f('montserrat-normal', '400 900')],
  },
  {
    family: 'Poppins', category: 'sans', weights: [400, 600, 700, 800], italic: false,
    files: [f('poppins-400', '400'), f('poppins-600', '600'), f('poppins-700', '700'), f('poppins-800', '800')],
  },
  {
    family: 'Oswald', category: 'display', weights: [400, 500, 600, 700], italic: false,
    files: [f('oswald-normal', '400 700')],
  },
  {
    family: 'Bebas Neue', category: 'display', weights: [400], italic: false,
    files: [f('bebas-neue-400', '400')],
  },
  {
    family: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700, 800, 900], italic: false,
    files: [f('playfair-display-normal', '400 900')],
  },
  {
    family: 'DM Serif Display', category: 'serif', weights: [400], italic: false,
    files: [f('dm-serif-display-400', '400')],
  },
  {
    family: 'Lora', category: 'serif', weights: [400, 500, 600, 700], italic: false,
    files: [f('lora-normal', '400 700')],
  },
  {
    family: 'Space Grotesk', category: 'sans', weights: [400, 500, 600, 700], italic: false,
    files: [f('space-grotesk-normal', '400 700')],
  },
  {
    family: 'Caveat', category: 'script', weights: [400, 500, 600, 700], italic: false,
    files: [f('caveat-normal', '400 700')],
  },
  {
    family: 'Archivo Black', category: 'display', weights: [400], italic: false,
    files: [f('archivo-black-400', '400')],
  },
  {
    family: 'Barlow Condensed', category: 'display', weights: [500, 700, 800], italic: false,
    files: [f('barlow-condensed-500', '500'), f('barlow-condensed-700', '700'), f('barlow-condensed-800', '800')],
  },
  {
    // Stand-in for UnitiMed's licensed Futura (Futura is commercial, not bundled).
    family: 'Jost', category: 'sans', weights: [400, 500, 600, 700], italic: true,
    files: [f('jost-normal', '300 700'), f('jost-italic', '300 700', 'italic')],
    brand: 'UnitiMed', standInFor: 'Futura',
  },
];

// GQR Healthcare fonts: NOT yet identified (gqr.com blocked automated requests, see docs/studio/BRAND-FONTS.md).
// Add entries with brand: 'GQR' to FONTS once verified; they will sort first here.
export function brandFonts(brand?: string): FontDef[] {
  return brand ? FONTS.filter((x) => x.brand === brand) : FONTS.filter((x) => !!x.brand);
}

export const BRAND_FONTS: FontDef[] = [...brandFonts('GQR'), ...brandFonts('UnitiMed')];

export const FONT_PAIRS: { heading: string; body: string; label: string }[] = [
  { heading: 'Playfair Display', body: 'Lora', label: 'Classic editorial' },
  { heading: 'Montserrat', body: 'Inter', label: 'Clean modern' },
  { heading: 'Oswald', body: 'Lora', label: 'Bold headline' },
  { heading: 'Bebas Neue', body: 'Poppins', label: 'Poster' },
  { heading: 'DM Serif Display', body: 'Inter', label: 'Elegant contrast' },
  { heading: 'Space Grotesk', body: 'Inter', label: 'Techy' },
  { heading: 'Archivo Black', body: 'Barlow Condensed', label: 'Heavy impact' },
  { heading: 'Caveat', body: 'Poppins', label: 'Friendly handwritten' },
  { heading: 'Jost', body: 'Jost', label: 'UnitiMed brand (Futura stand-in)' },
];

const loaded = new Set<string>(); // FontFace keys already registered
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const cb of [...listeners]) {
    try {
      cb();
    } catch (e) {
      console.error('[fonts] listener failed', e);
    }
  }
}

function weightMatches(range: string, weight: number): boolean {
  const [lo, hi] = range.split(/\s+/).map(Number);
  return weight >= lo && weight <= (hi ?? lo);
}

function pickFiles(def: FontDef, weight: number, italic: boolean): FontFile[] {
  const style = italic && def.italic ? 'italic' : 'normal';
  const ofStyle = def.files.filter((x) => x.style === style);
  const exact = ofStyle.filter((x) => weightMatches(x.weight, weight));
  if (exact.length) return exact;
  // Nearest static weight.
  let best: FontFile | undefined;
  let bestDist = Infinity;
  for (const x of ofStyle) {
    const [lo, hi] = x.weight.split(/\s+/).map(Number);
    const d = weight < lo ? lo - weight : weight - (hi ?? lo);
    if (d < bestDist) {
      bestDist = d;
      best = x;
    }
  }
  return best ? [best] : [];
}

export function ensureFont(family: string, weight = 400, italic = false): Promise<void> {
  try {
    if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) {
      return Promise.resolve();
    }
    const def = FONTS.find((x) => x.family === family);
    if (!def) return Promise.resolve(); // system / unknown font
    const files = pickFiles(def, weight, italic);
    return Promise.all(files.map((file) => loadFile(def.family, file))).then(() => undefined);
  } catch (e) {
    console.error('[fonts] ensureFont failed', family, e);
    return Promise.resolve();
  }
}

function loadFile(family: string, file: FontFile): Promise<void> {
  const key = `${family}|${file.url}`;
  if (loaded.has(key)) return Promise.resolve();
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = (async () => {
    try {
      const face = new FontFace(family, `url(${file.url}) format('woff2')`, {
        weight: file.weight,
        style: file.style,
        display: 'swap',
      });
      document.fonts.add(face);
      await face.load();
      loaded.add(key);
      notify();
    } catch (e) {
      console.error('[fonts] failed to load', family, file.url, e);
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export async function ensureFontsFor(families: Iterable<string>): Promise<void> {
  const uniq = new Set(families);
  await Promise.all([...uniq].map((fam) => ensureFont(fam)));
}

export function onFontsReady(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
