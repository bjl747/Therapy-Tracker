// More shapes for the Elements panel (BJ, 2026-11-18): ribbons, banners, badges, arrows, dividers, speech bubbles, blobs.
// Each is one SVG path in the engine's 100 × 100 box (ShapeEl `shape: 'path'`), so it recolours, stretches, takes a
// gradient, an outline and a shadow like every other shape. `ratio` is the width ÷ height it is added at; `line` marks a
// shape that is drawn as a stroke (no fill) with that thickness.

export interface LibraryShape {
  name: string
  path: string
  /** width ÷ height when added (default 1) */
  ratio?: number
  /** drawn as an outline of this thickness instead of a fill (dividers, doodles) */
  line?: number
  tags?: string
}
export interface ShapeGroup {
  group: string
  items: LibraryShape[]
}

export const SHAPE_LIBRARY: ShapeGroup[] = [
  {
    group: 'Banners & ribbons',
    items: [
      { name: 'Ribbon', path: 'M0 0 H100 L88 50 L100 100 H0 L12 50 Z', ratio: 4, tags: 'banner label' },
      { name: 'Ribbon, one end', path: 'M0 0 H100 L86 50 L100 100 H0 Z', ratio: 3.4, tags: 'banner label flag' },
      { name: 'Label arrow', path: 'M0 0 H74 L100 50 L74 100 H0 Z', ratio: 2.6, tags: 'tag pointer' },
      { name: 'Chevron', path: 'M0 0 H62 L100 50 L62 100 H0 L38 50 Z', ratio: 1.8, tags: 'step arrow' },
      { name: 'Bookmark', path: 'M0 0 H100 V100 L50 76 L0 100 Z', ratio: 0.66, tags: 'ribbon tag' },
      { name: 'Pennant', path: 'M0 0 L100 50 L0 100 Z', ratio: 1.6, tags: 'flag' },
      { name: 'Wave band', path: 'M0 30 C17 10 33 10 50 30 C67 50 83 50 100 30 V70 C83 90 67 90 50 70 C33 50 17 50 0 70 Z', ratio: 3, tags: 'ribbon wave' },
      { name: 'Slanted bar', path: 'M14 0 H100 L86 100 H0 Z', ratio: 4, tags: 'parallelogram banner' },
    ],
  },
  {
    group: 'Badges',
    items: [
      { name: 'Shield', path: 'M50 0 L95 14 V48 C95 76 74 92 50 100 C26 92 5 76 5 48 V14 Z', ratio: 0.86, tags: 'badge award crest' },
      { name: 'Hexagon', path: 'M25 2 H75 L100 50 L75 98 H25 L0 50 Z', ratio: 1.12, tags: 'badge' },
      { name: 'Octagon', path: 'M29 0 H71 L100 29 V71 L71 100 H29 L0 71 V29 Z', tags: 'badge stop' },
      { name: 'Pentagon', path: 'M50 0 L100 38 L81 100 H19 L0 38 Z', tags: 'badge' },
      { name: 'Diamond', path: 'M50 0 L100 50 L50 100 L0 50 Z', tags: 'rhombus' },
      { name: 'Ring', path: 'M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z M50 20 A30 30 0 1 0 50 80 A30 30 0 1 0 50 20 Z', tags: 'circle donut outline' },
      { name: 'Medical cross', path: 'M35 0 H65 V35 H100 V65 H65 V100 H35 V65 H0 V35 H35 Z', tags: 'plus health hospital' },
      { name: 'Heart', path: 'M50 94 C20 72 2 53 2 31 C2 14 15 4 28 4 C38 4 46 9 50 18 C54 9 62 4 72 4 C85 4 98 14 98 31 C98 53 80 72 50 94 Z', ratio: 1.06, tags: 'love care' },
      { name: 'Check', path: 'M5 55 L21 38 L40 57 L79 13 L96 29 L40 91 Z', tags: 'tick done yes' },
    ],
  },
  {
    group: 'Arrows',
    items: [
      { name: 'Arrow', path: 'M0 34 H58 V8 L100 50 L58 92 V66 H0 Z', ratio: 1.6, tags: 'right pointer' },
      { name: 'Arrow, thin', path: 'M0 43 H70 V22 L100 50 L70 78 V57 H0 Z', ratio: 2.4, tags: 'right pointer' },
      { name: 'Arrow, both ways', path: 'M0 50 L26 12 V36 H74 V12 L100 50 L74 88 V64 H26 V88 Z', ratio: 2.2, tags: 'double' },
      { name: 'Arrow head', path: 'M0 0 L100 50 L0 100 L24 50 Z', ratio: 1, tags: 'pointer play' },
      { name: 'Turn arrow', path: 'M0 100 V52 C0 30 16 16 38 16 H64 V0 L100 30 L64 60 V44 H38 C32 44 28 48 28 54 V100 Z', ratio: 1, tags: 'corner up right' },
    ],
  },
  {
    group: 'Speech & frames',
    items: [
      { name: 'Speech bubble', path: 'M12 4 H88 C94.6 4 100 9.4 100 16 V62 C100 68.6 94.6 74 88 74 H46 L24 96 V74 H12 C5.4 74 0 68.6 0 62 V16 C0 9.4 5.4 4 12 4 Z', ratio: 1.3, tags: 'quote talk callout' },
      { name: 'Speech bubble, round', path: 'M50 4 C78 4 100 20 100 41 C100 62 78 78 50 78 C44 78 38 77 33 76 L12 96 L18 68 C7 61 0 52 0 41 C0 20 22 4 50 4 Z', ratio: 1.2, tags: 'quote talk callout' },
      { name: 'Arch', path: 'M0 100 V50 A50 50 0 0 1 100 50 V100 Z', ratio: 0.8, tags: 'door window frame' },
      { name: 'Half circle', path: 'M0 100 A50 100 0 0 1 100 100 Z', ratio: 2, tags: 'semicircle dome' },
      { name: 'Quarter circle', path: 'M0 100 V0 A100 100 0 0 1 100 100 Z', tags: 'corner' },
      { name: 'Corner', path: 'M0 0 H100 V22 H22 V100 H0 Z', tags: 'bracket frame' },
    ],
  },
  {
    group: 'Blobs',
    items: [
      { name: 'Blob', path: 'M71 6 C90 13 100 34 97 55 C94 76 78 95 56 98 C34 101 12 90 5 69 C-2 48 6 23 24 11 C38 2 56 0 71 6 Z', tags: 'organic' },
      { name: 'Blob, tall', path: 'M58 3 C77 0 96 14 99 34 C102 54 88 66 84 80 C80 94 62 101 44 98 C26 95 6 84 2 63 C-2 42 10 24 26 14 C36 8 46 5 58 3 Z', ratio: 0.9, tags: 'organic' },
      { name: 'Blob, wide', path: 'M30 8 C48 -2 74 2 88 16 C102 30 102 56 92 72 C82 88 60 98 40 96 C20 94 4 82 1 62 C-2 42 12 18 30 8 Z', ratio: 1.3, tags: 'organic' },
      { name: 'Pebble', path: 'M20 22 C36 4 70 0 88 18 C104 34 102 66 84 82 C66 98 34 100 16 84 C-2 68 4 40 20 22 Z', ratio: 1.15, tags: 'organic' },
    ],
  },
  {
    group: 'Dividers & doodles',
    items: [
      { name: 'Wave line', path: 'M0 50 C8 20 17 20 25 50 C33 80 42 80 50 50 C58 20 67 20 75 50 C83 80 92 80 100 50', ratio: 8, line: 6, tags: 'divider squiggle' },
      { name: 'Zigzag line', path: 'M0 75 L12.5 25 L25 75 L37.5 25 L50 75 L62.5 25 L75 75 L87.5 25 L100 75', ratio: 8, line: 6, tags: 'divider' },
      { name: 'Swoosh underline', path: 'M2 62 C24 30 58 82 98 36', ratio: 6, line: 7, tags: 'underline hand drawn' },
      { name: 'Hand-drawn circle', path: 'M52 6 C82 4 98 26 96 52 C94 80 68 96 44 94 C20 92 4 72 6 46 C8 22 30 6 60 10', ratio: 1.5, line: 5, tags: 'highlight ring scribble' },
      { name: 'Bracket', path: 'M30 2 H6 V98 H30', ratio: 0.3, line: 6, tags: 'frame' },
    ],
  },
]

export const SHAPE_LIBRARY_COUNT = SHAPE_LIBRARY.reduce((n, g) => n + g.items.length, 0)
