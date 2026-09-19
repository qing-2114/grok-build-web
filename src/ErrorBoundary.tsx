import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

const BTN = {
  font: 'inherit',
  fontSize: 13,
  padding: '6px 14px',
  borderRadius: 8,
  border: '1px solid #3a3a3e',
  background: 'transparent',
  color: '#f4f1ea',
  cursor: 'pointer',
} as const

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100%',
            padding: 32,
            color: '#f4f1ea',
            background: '#070708',
            fontFamily: 'Segoe UI, sans-serif',
          }}
        >
          <h1 style={{ fontSize: 18 }}>界面出错</h1>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#e07a7a' }}>
            {this.state.error.message}
          </pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              type="button"
              style={{ ...BTN, background: '#f4f1ea', color: '#111112' }}
              onClick={() => this.setState({ error: null })}
            >
              重试
            </button>
            <button
              type="button"
              style={BTN}
              onClick={() => window.location.reload()}
            >
              重新载入
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
