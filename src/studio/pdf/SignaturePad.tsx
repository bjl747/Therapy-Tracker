import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Eraser } from 'lucide-react'
import clsx from 'clsx'
import { Modal } from './Modal'

const INKS = [
  { name: 'Black', value: '#111827' },
  { name: 'Blue', value: '#1d3fd1' },
]

interface Props {
  onClose: () => void
  /** PNG data URL (transparent background, trimmed) and its pixel size. */
  onDone: (dataUrl: string, w: number, h: number) => void
}

export function SignaturePad({ onClose, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [ink, setInk] = useState(INKS[0].value)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const r = c.getBoundingClientRect()
    c.width = Math.round(r.width * dpr)
    c.height = Math.round(r.height * dpr)
  }, [])

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }
  }

  const down = (e: React.PointerEvent) => {
    const c = canvasRef.current
    if (!c) return
    c.setPointerCapture(e.pointerId)
    drawing.current = true
    const p = pos(e)
    last.current = p
    const ctx = c.getContext('2d')!
    ctx.fillStyle = ink
    ctx.beginPath()
    ctx.arc(p.x, p.y, c.width / 300, 0, Math.PI * 2)
    ctx.fill()
    setDirty(true)
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return
    const c = canvasRef.current!
    const ctx = c.getContext('2d')!
    const p = pos(e)
    const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 }
    ctx.strokeStyle = ink
    ctx.lineWidth = c.width / 150
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }
  const up = () => {
    drawing.current = false
    last.current = null
  }

  const clear = () => {
    const c = canvasRef.current
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    setDirty(false)
  }

  const finish = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height)
    let minX = width,
      minY = height,
      maxX = -1,
      maxY = -1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) return
    const pad = 6
    const sx = Math.max(0, minX - pad)
    const sy = Math.max(0, minY - pad)
    const sw = Math.min(width - sx, maxX - minX + 1 + pad * 2)
    const sh = Math.min(height - sy, maxY - minY + 1 + pad * 2)
    const out = document.createElement('canvas')
    out.width = sw
    out.height = sh
    out.getContext('2d')!.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh)
    onDone(out.toDataURL('image/png'), sw, sh)
  }, [onDone])

  return (
    <Modal
      title="Draw your signature"
      eyebrow="Signature"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="btn" onClick={clear} disabled={!dirty}>
            <Eraser size={14} /> Clear
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={finish} disabled={!dirty}>
              <Check size={14} /> Use signature
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">Ink</span>
          {INKS.map((i) => (
            <button
              key={i.value}
              type="button"
              className={clsx('chip', ink === i.value && 'chip-on')}
              onClick={() => setInk(i.value)}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.value }} />
              {i.name}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-dashed border-line bg-white">
          <canvas
            ref={canvasRef}
            className="block h-[200px] w-full cursor-crosshair rounded-xl"
            style={{ touchAction: 'none' }}
            aria-label="Signature drawing area"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
        </div>
        <p className="text-xs text-ink-3">Draw with your mouse, finger or stylus. The background stays transparent.</p>
      </div>
    </Modal>
  )
}
