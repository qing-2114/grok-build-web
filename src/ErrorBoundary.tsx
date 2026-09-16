import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

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
        </div>
      )
    }
    return this.props.children
  }
}
