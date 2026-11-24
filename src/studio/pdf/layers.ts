/** Overlay stack: Esc goes to the topmost layer only. */
interface Layer {
  close: () => void
  /** Optional first say on Esc (leave text editing, drop a selection). Return true when it handled the key. */
  escape?: () => boolean
}
const stack: Layer[] = []
let installed = false

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || !stack.length) return
  e.preventDefault()
  e.stopPropagation()
  const top = stack[stack.length - 1]
  if (top.escape?.()) return
  top.close()
}

export function pushLayer(close: () => void, escape?: () => boolean): () => void {
  if (!installed) {
    window.addEventListener('keydown', onKey, true)
    installed = true
  }
  const layer: Layer = { close, escape }
  stack.push(layer)
  return () => {
    const i = stack.indexOf(layer)
    if (i >= 0) stack.splice(i, 1)
  }
}

export function layerCount(): number {
  return stack.length
}
