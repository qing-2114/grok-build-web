import { useEffect, useRef, useState, type FormEvent } from 'react'
import { IconTerminal } from '../icons'
import {
  interruptTerminal,
  killTerminal,
  sendTerminal,
  startTerminal,
} from '../lib/fs'
import { useWorkspace } from '../workspace'

type StreamMsg =
  | { type: 'history'; text: string }
  | { type: 'data'; text: string }
  | { type: 'exit'; code: number }

export function TerminalPane() {
  const { sessionCwd, terminalShellId, notify } = useWorkspace()
  const [termId, setTermId] = useState<string | null>(null)
  const [out, setOut] = useState('')
  const [cmd, setCmd] = useState('')
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const outRef = useRef<HTMLPreElement>(null)
  const sourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (outRef.current) {
      outRef.current.scrollTop = outRef.current.scrollHeight
    }
  }, [out])

  useEffect(() => {
    if (!sessionCwd) return
    let cancelled = false
    setBusy(true)
    setOut('')
    void startTerminal(sessionCwd, terminalShellId)
      .then((created) => {
        if (cancelled) return
        setTermId(created.id)
        setRunning(true)
        const es = new EventSource(
          `/api/terminal/${encodeURIComponent(created.id)}/stream`,
        )
        sourceRef.current = es
        es.onmessage = (ev) => {
          let msg: StreamMsg
          try {
            msg = JSON.parse(ev.data) as StreamMsg
          } catch {
            return
          }
          if (msg.type === 'history') setOut(msg.text)
          else if (msg.type === 'data') setOut((s) => s + msg.text)
          else if (msg.type === 'exit') {
            setRunning(false)
            setOut((s) => s + `\r\n进程已退出 (${msg.code})\r\n`)
          }
        }
        es.onerror = () => {
          if (!cancelled) setRunning(false)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        notify(err instanceof Error ? err.message : '无法打开终端', 'error')
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
      sourceRef.current?.close()
      sourceRef.current = null
    }
  }, [sessionCwd, terminalShellId, notify])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!termId || !running) return
    const text = cmd
    setCmd('')
    try {
      await sendTerminal(termId, `${text}\n`)
    } catch (err) {
      notify(err instanceof Error ? err.message : '发送失败', 'error')
    }
  }

  if (!sessionCwd) {
    return (
      <div className="files-empty">
        <IconTerminal />
        <h2>没有工作目录</h2>
        <p>先选择项目或发出一条会话</p>
      </div>
    )
  }

  return (
    <div className="term-pane">
      <div className="term-bar">
        <span>{sessionCwd}</span>
        <div className="term-bar-actions">
          <button
            type="button"
            className="text-btn"
            disabled={!termId || !running}
            onClick={() => termId && void interruptTerminal(termId)}
          >
            Ctrl+C
          </button>
          <button
            type="button"
            className="text-btn"
            disabled={!termId}
            onClick={() => termId && void killTerminal(termId)}
          >
            结束
          </button>
        </div>
      </div>
      <pre className="term-out" ref={outRef}>
        {busy && !out ? '正在打开终端…' : out}
      </pre>
      <form className="term-in" onSubmit={(e) => void onSubmit(e)}>
        <span>{running ? '>' : '#'}</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'c' && e.ctrlKey && termId) {
              e.preventDefault()
              void interruptTerminal(termId)
            }
          }}
          placeholder={running ? '输入命令' : '终端已结束'}
          disabled={!running}
          autoComplete="off"
          spellCheck={false}
        />
      </form>
    </div>
  )
}
