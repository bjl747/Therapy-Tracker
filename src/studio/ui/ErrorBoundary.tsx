// Catches a crash inside one Studio screen so the rest of the hub keeps working,
// and offers a way back instead of a blank page.
import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

export class StudioErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error('Studio crashed:', error)
  }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="p-6">
        <div className="card card-accent p-6 max-w-[640px]">
          <div className="flex items-center gap-2 font-extrabold text-[16px]">
            <AlertTriangle size={18} className="text-[rgb(var(--status-bad))]" /> Something went wrong on this screen
          </div>
          <p className="text-[13px] text-ink-2 mt-2">
            Your other designs are safe. Go back to Studio and try again — if it keeps happening, tell an admin what you were doing.
          </p>
          <p className="text-[11.5px] text-ink-3 mt-2 break-words font-mono">{this.state.error.message}</p>
          <div className="flex gap-2 mt-4">
            <a className="btn btn-primary" href="/studio">
              Back to Studio
            </a>
            <button className="btn" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }
}
