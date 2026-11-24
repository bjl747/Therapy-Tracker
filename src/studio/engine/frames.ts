// Photo frame shapes (BJ, 2026-11-19: "Let's do 6 shape adds"; he picked Circle, Arch, Pill, Hexagon, Heart and Blob).
// A frame is an image element whose picture is clipped to the shape. One outline per shape, built from straight lines
// and curves only, so the same outline clips the canvas (every export) and draws the editor's SVG outline.

import type { FrameShape } from './model'

export const FRAME_SHAPES: { id: FrameShape; label: string }[] = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'circle', label: 'Circle' },
  { id: 'arch', label: 'Arch' },
  { id: 'pill', label: 'Pill' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'heart', label: 'Heart' },
  { id: 'blob', label: 'Blob' },
]

type Cmd = ['M', number, number] | ['L', number, number] | ['C', number, number, number, number, number, number] | ['Z']

/** quarter-ellipse bezier constant */
const K = 0.5522847498

function roundRectCmds(w: number, h: number, r: number): Cmd[] {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  if (!rr)
    return [
      ['M', 0, 0],
      ['L', w, 0],
      ['L', w, h],
      ['L', 0, h],
      ['Z'],
    ]
  const k = rr * (1 - K)
  return [
    ['M', rr, 0],
    ['L', w - rr, 0],
    ['C', w - k, 0, w, k, w, rr],
    ['L', w, h - rr],
    ['C', w, h - k, w - k, h, w - rr, h],
    ['L', rr, h],
    ['C', k, h, 0, h - k, 0, h - rr],
    ['L', 0, rr],
    ['C', 0, k, k, 0, rr, 0],
    ['Z'],
  ]
}

/** a shape drawn in a 100 × 100 box, stretched to w × h */
function scaled(cmds: Cmd[], w: number, h: number): Cmd[] {
  const sx = w / 100
  const sy = h / 100
  return cmds.map((c) => {
    if (c[0] === 'Z') return c
    if (c[0] === 'C') return ['C', c[1] * sx, c[2] * sy, c[3] * sx, c[4] * sy, c[5] * sx, c[6] * sy]
    return [c[0], c[1] * sx, c[2] * sy]
  }) as Cmd[]
}

const HEART: Cmd[] = [
  ['M', 50, 100],
  ['C', 14, 76, 0, 58, 0, 31],
  ['C', 0, 13, 13, 0, 29, 0],
  ['C', 39, 0, 46, 6, 50, 14],
  ['C', 54, 6, 61, 0, 71, 0],
  ['C', 87, 0, 100, 13, 100, 31],
  ['C', 100, 58, 86, 76, 50, 100],
  ['Z'],
]

const BLOB: Cmd[] = [
  ['M', 52, 0],
  ['C', 75, 0, 95, 13, 99, 37],
  ['C', 102, 58, 94, 80, 74, 93],
  ['C', 57, 103, 31, 101, 15, 88],
  ['C', 0, 76, -2, 52, 4, 32],
  ['C', 10, 12, 30, 0, 52, 0],
  ['Z'],
]

/** the outline of a frame, in the element's own box (0,0)–(w,h) */
export function frameCmds(shape: FrameShape | undefined, w: number, h: number, radius = 0): Cmd[] {
  switch (shape) {
    case 'circle':
      return scaled(
        [
          ['M', 50, 0],
          ['C', 50 + 50 * K, 0, 100, 50 - 50 * K, 100, 50],
          ['C', 100, 50 + 50 * K, 50 + 50 * K, 100, 50, 100],
          ['C', 50 - 50 * K, 100, 0, 50 + 50 * K, 0, 50],
          ['C', 0, 50 - 50 * K, 50 - 50 * K, 0, 50, 0],
          ['Z'],
        ],
        w,
        h,
      )
    case 'pill':
      return roundRectCmds(w, h, Math.min(w, h) / 2)
    case 'arch': {
      // a round top (a half circle when the frame is tall enough), straight sides, square bottom
      const rx = w / 2
      const ry = Math.min(rx, h)
      return [
        ['M', 0, h],
        ['L', 0, ry],
        ['C', 0, ry - ry * K, rx - rx * K, 0, rx, 0],
        ['C', rx + rx * K, 0, w, ry - ry * K, w, ry],
        ['L', w, h],
        ['Z'],
      ]
    }
    case 'hexagon':
      return scaled(
        [
          ['M', 25, 0],
          ['L', 75, 0],
          ['L', 100, 50],
          ['L', 75, 100],
          ['L', 25, 100],
          ['L', 0, 50],
          ['Z'],
        ],
        w,
        h,
      )
    case 'heart':
      return scaled(HEART, w, h)
    case 'blob':
      return scaled(BLOB, w, h)
    default:
      return roundRectCmds(w, h, radius)
  }
}

/** trace a frame on a canvas (then fill, stroke or clip) */
export function traceFrame(ctx: Pick<CanvasRenderingContext2D, 'beginPath' | 'moveTo' | 'lineTo' | 'bezierCurveTo' | 'closePath'>, cmds: Cmd[]): void {
  ctx.beginPath()
  for (const c of cmds) {
    if (c[0] === 'M') ctx.moveTo(c[1], c[2])
    else if (c[0] === 'L') ctx.lineTo(c[1], c[2])
    else if (c[0] === 'C') ctx.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6])
    else ctx.closePath()
  }
}

/** the same outline as an SVG path, scaled by `z` (screen px per design px) and moved by (ox, oy) */
export function frameD(cmds: Cmd[], z = 1, ox = 0, oy = 0): string {
  const n = (v: number) => Math.round(v * 100) / 100
  const X = (v: number) => n(v * z + ox)
  const Y = (v: number) => n(v * z + oy)
  return cmds
    .map((c) => {
      if (c[0] === 'Z') return 'Z'
      if (c[0] === 'C') return `C${X(c[1])} ${Y(c[2])} ${X(c[3])} ${Y(c[4])} ${X(c[5])} ${Y(c[6])}`
      return `${c[0]}${X(c[1])} ${Y(c[2])}`
    })
    .join(' ')
}
