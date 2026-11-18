/** Overlay stack: Esc closes only the topmost layer. */
interface Layer {
  close: () => void
}
const stack: Layer[] = []
let installed = false

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || !stack.length) return
  e.preventDefault()
  e.stopPropagation()
  stack[stack.length - 1].close()
}

export function pushLayer(close: () => void): () => void {
  if (!installed) {
    window.addEventListener('keydown', onKey, true)
    installed = true
  }
  const layer: Layer = { close }
  stack.push(layer)
  return () => {
    const i = stack.indexOf(layer)
    if (i >= 0) stack.splice(i, 1)
  }
}

export function layerCount(): number {
  return stack.length
}
