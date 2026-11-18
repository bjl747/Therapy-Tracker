import { describe, expect, it } from 'vitest'
import { encodeGif, encodeGifAsync, type GifFrame, type GifWorkerLike } from './gif'

const W = 4
const H = 4
const frames = (): GifFrame[] =>
  [0, 255].map((v) => ({ data: new Uint8ClampedArray(W * H * 4).map((_, i) => (i % 4 === 3 ? 255 : v)), delayMs: 100 }))

type Script = (w: FakeWorker) => void
class FakeWorker implements GifWorkerLike {
  onmessage: GifWorkerLike['onmessage'] = null
  onerror: GifWorkerLike['onerror'] = null
  terminated = false
  received: unknown = null
  constructor(
    private start: Script,
    private onFrames: (w: FakeWorker, msg: { frames: GifFrame[]; width: number; height: number }) => void,
  ) {
    queueMicrotask(() => this.start(this))
  }
  emit(data: unknown) {
    this.onmessage?.({ data })
  }
  fail(message: string) {
    this.onerror?.({ message })
  }
  postMessage(msg: unknown, transfer: Transferable[]) {
    // a real transfer: detaches the sender's buffers
    const copy = structuredClone(msg, { transfer }) as { frames: GifFrame[]; width: number; height: number }
    this.received = copy
    queueMicrotask(() => this.onFrames(this, copy))
  }
  terminate() {
    this.terminated = true
  }
}

const encodeIn = (w: FakeWorker, m: { frames: GifFrame[]; width: number; height: number }) =>
  w.emit({ type: 'done', bytes: encodeGif(m.frames, m.width, m.height) })

describe('encodeGifAsync worker handling', () => {
  const expected = encodeGif(frames(), W, H)

  it('encodes in the worker after it says ready (frames are transferred)', async () => {
    const f = frames()
    let fake: FakeWorker | null = null
    const out = await encodeGifAsync(f, W, H, {}, undefined, () => (fake = new FakeWorker((w) => w.emit({ type: 'ready' }), encodeIn)))
    expect(out).toEqual(expected)
    expect(f[0].data.byteLength).toBe(0) // detached
    expect(fake!.terminated).toBe(true)
  })

  it('falls back to the main thread when the worker fails to start (frames intact)', async () => {
    const f = frames()
    const out = await encodeGifAsync(f, W, H, {}, undefined, () => new FakeWorker((w) => w.fail('Failed to load module script'), encodeIn))
    expect(out).toEqual(expected)
  })

  it('falls back when the worker cannot be constructed', async () => {
    const out = await encodeGifAsync(frames(), W, H, {}, undefined, () => {
      throw new Error('SecurityError')
    })
    expect(out).toEqual(expected)
  })

  it("surfaces the worker's own error after the transfer instead of re-encoding empty buffers", async () => {
    const f = frames()
    const run = encodeGifAsync(f, W, H, {}, undefined, () =>
      new FakeWorker((w) => w.emit({ type: 'ready' }), (w) => w.emit({ type: 'error', message: 'Too many colours for the encoder' })),
    )
    await expect(run).rejects.toThrow('Too many colours for the encoder')
  })

  it('reports a crash after the transfer as a crash', async () => {
    const run = encodeGifAsync(frames(), W, H, {}, undefined, () => new FakeWorker((w) => w.emit({ type: 'ready' }), (w) => w.fail('out of memory')))
    await expect(run).rejects.toThrow(/out of memory/)
  })

  it('passes progress through', async () => {
    const seen: number[] = []
    await encodeGifAsync(frames(), W, H, {}, (p) => seen.push(p), () =>
      new FakeWorker(
        (w) => w.emit({ type: 'ready' }),
        (w, m) => {
          w.emit({ type: 'progress', p: 0.5 })
          encodeIn(w, m)
        },
      ),
    )
    expect(seen).toEqual([0.5])
  })
})
