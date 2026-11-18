// ─────────────────────────────────────────────────────────────
// Studio document model — pure data, JSON-serialisable, no React.
//
// A Design is pages of absolutely positioned elements. Text may contain
// {{field}} markers and images may be bound to a field ("bind"); both are
// resolved at RENDER time from design.fields, so editing a job's details
// updates every page and every size live. Nothing is baked in.
// ─────────────────────────────────────────────────────────────

export type Align = 'left' | 'center' | 'right'
export type VAlign = 'top' | 'middle' | 'bottom'

export interface Shadow {
  color: string
  blur: number
  x: number
  y: number
}

/** entrance animation (GIF export + preview) */
export interface Anim {
  kind: 'none' | 'fade' | 'rise' | 'slide-left' | 'slide-right' | 'zoom' | 'pop'
  /** seconds from page start */
  delay: number
  /** seconds */
  duration: number
}

export interface BaseEl {
  id: string
  name?: string
  x: number
  y: number
  w: number
  h: number
  /** degrees, clockwise, around the element centre */
  rotation: number
  opacity: number
  /** brand lock: recruiters can't move/edit; managers can unlock */
  locked?: boolean
  hidden?: boolean
  /** elements sharing a groupId select and move together */
  groupId?: string
  anim?: Anim
}

export interface TextStyle {
  family: string
  weight: number
  size: number
  italic: boolean
  /** multiple of size */
  lineHeight: number
  /** px */
  letterSpacing: number
  align: Align
  valign: VAlign
  upper: boolean
  underline: boolean
}

export interface TextEl extends BaseEl {
  type: 'text'
  /** may contain {{field}} markers */
  text: string
  style: TextStyle
  color: string
  /** 'shrink' = font shrinks (down to minSize) until the text fits the box;
   *  'fixed' = size never changes (may overflow — the linter flags it) */
  fit: 'shrink' | 'fixed'
  minSize?: number
  /** pill / highlight behind the text box */
  bg?: { color: string; radius: number; padX: number; padY: number } | null
  stroke?: { color: string; width: number } | null
  shadow?: Shadow | null
}

export interface ImageFilters {
  brightness: number // -100..100
  contrast: number // -100..100
  saturation: number // -100..100
  blur: number // px
  /** brand tint: [shadow colour, highlight colour] */
  duotone?: [string, string] | null
  /** colour wash on top */
  overlay?: { color: string; opacity: number } | null
}

export interface ImageEl extends BaseEl {
  type: 'image'
  src: string
  /** field key (e.g. 'location') → src resolved through the photo resolver */
  bind?: string
  /** corner radius px */
  radius: number
  fit: 'cover' | 'contain'
  /** focal point 0..1 — cover-crops keep it in frame */
  focus: { x: number; y: number }
  /** extra zoom inside the frame (1 = cover) */
  zoom: number
  filters: ImageFilters
  /** slow pan/zoom in GIF exports */
  kenBurns?: boolean
  credit?: { author: string; license: string; url: string; provider: string }
  flipX?: boolean
}

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'triangle' | 'star' | 'path'

export interface Gradient {
  type: 'linear' | 'radial'
  /** degrees, linear only */
  angle: number
  stops: { at: number; color: string }[]
}

export interface ShapeEl extends BaseEl {
  type: 'shape'
  shape: ShapeKind
  /** SVG path in a 100×100 box (shape === 'path') */
  path?: string
  fill: string
  gradient?: Gradient | null
  stroke?: { color: string; width: number; dash?: number[] } | null
  radius: number
  points?: number
  shadow?: Shadow | null
}

export type El = TextEl | ImageEl | ShapeEl

export interface PageBg {
  color: string
  gradient?: Gradient | null
}

export interface Page {
  id: string
  bg: PageBg
  elements: El[]
  /** seconds — GIF length for this page */
  duration?: number
}

export interface FieldDef {
  key: string
  label: string
  example: string
  /** 'location' fields drive bound photos */
  kind?: 'text' | 'money' | 'location' | 'long'
  group?: string
}

export interface Design {
  id: string
  name: string
  w: number
  h: number
  pages: Page[]
  /** values for {{markers}} and bound images */
  fields: Record<string, string>
  fieldDefs?: FieldDef[]
  /** which template/size this came from, if any */
  source?: { templateId: string; size: string }
  /** kit: designs made together from one job share a kitId */
  kitId?: string
  ownerUid?: string
  updatedAt?: number
  createdAt?: number
}

// ── factories ───────────────────────────────────────────────

let n = 0
export function uid(prefix = 'e'): string {
  n = (n + 1) % 1e6
  return `${prefix}${Date.now().toString(36)}${n.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

const base = (o: Partial<BaseEl>): BaseEl => ({
  id: uid(),
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  rotation: 0,
  opacity: 1,
  ...o,
})

export const DEFAULT_TEXT_STYLE: TextStyle = {
  family: 'Inter',
  weight: 700,
  size: 48,
  italic: false,
  lineHeight: 1.15,
  letterSpacing: 0,
  align: 'left',
  valign: 'top',
  upper: false,
  underline: false,
}

export function text(o: Partial<Omit<TextEl, 'style'>> & { style?: Partial<TextStyle> }): TextEl {
  const { style, ...rest } = o
  return {
    ...base(rest),
    type: 'text',
    text: 'Text',
    color: '#111827',
    fit: 'shrink',
    ...rest,
    style: { ...DEFAULT_TEXT_STYLE, ...style },
  } as TextEl
}

export const NO_FILTERS: ImageFilters = { brightness: 0, contrast: 0, saturation: 0, blur: 0, duotone: null, overlay: null }

export function image(o: Partial<ImageEl>): ImageEl {
  return {
    ...base(o),
    type: 'image',
    src: '',
    radius: 0,
    fit: 'cover',
    focus: { x: 0.5, y: 0.45 },
    zoom: 1,
    ...o,
    filters: { ...NO_FILTERS, ...o.filters },
  } as ImageEl
}

export function shape(kind: ShapeKind, o: Partial<ShapeEl>): ShapeEl {
  return {
    ...base(o),
    type: 'shape',
    shape: kind,
    fill: '#2940DA',
    radius: 0,
    ...o,
  } as ShapeEl
}

export function page(o: Partial<Page> = {}): Page {
  return { id: uid('p'), bg: { color: '#FFFFFF' }, elements: [], ...o }
}

export function design(o: Partial<Design> & { w: number; h: number }): Design {
  const now = Date.now()
  return {
    id: uid('d'),
    name: 'Untitled design',
    pages: [page()],
    fields: {},
    createdAt: now,
    updatedAt: now,
    ...o,
  }
}

/** deep clone with fresh ids (duplicate page / element / design) */
export function cloneEl<T extends El>(el: T): T {
  return { ...structuredClone(el), id: uid() }
}
export function clonePage(p: Page): Page {
  const groupMap = new Map<string, string>()
  return {
    ...structuredClone(p),
    id: uid('p'),
    elements: p.elements.map((e) => {
      const c = cloneEl(e)
      if (e.groupId) {
        if (!groupMap.has(e.groupId)) groupMap.set(e.groupId, uid('g'))
        c.groupId = groupMap.get(e.groupId)
      }
      return c
    }),
  }
}

// ── standard sizes ──────────────────────────────────────────

export const SIZES = {
  square: { label: 'Square post', w: 1080, h: 1080, hint: 'Instagram, Facebook, LinkedIn' },
  portrait: { label: 'Portrait post', w: 1080, h: 1350, hint: 'Instagram feed 4:5' },
  story: { label: 'Story', w: 1080, h: 1920, hint: 'Instagram / Facebook stories' },
  landscape: { label: 'Landscape', w: 1200, h: 627, hint: 'LinkedIn, Facebook link post' },
  banner: { label: 'LinkedIn banner', w: 1584, h: 396, hint: 'Profile / page banner' },
  letter: { label: 'Letter flyer', w: 816, h: 1056, hint: 'US Letter, print or PDF' },
} as const
export type SizeKey = keyof typeof SIZES
