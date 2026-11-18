// Web Worker entry for the GIF encoder (see encodeGifAsync in gif.ts).
import { encodeGif, type GifFrame, type GifOptions } from './gif'

interface Req {
  frames: GifFrame[]
  width: number
  height: number
  opts: GifOptions
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Req>) => void) | null
  postMessage(msg: unknown, transfer?: Transferable[]): void
}

scope.onmessage = (e) => {
  const { frames, width, height, opts } = e.data
  try {
    let last = 0
    const bytes = encodeGif(frames, width, height, {
      ...opts,
      onProgress: (p) => {
        const now = Date.now()
        if (p === 1 || now - last > 50) {
          last = now
          scope.postMessage({ type: 'progress', p })
        }
      },
    })
    scope.postMessage({ type: 'done', bytes }, [bytes.buffer])
  } catch (err) {
    scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
