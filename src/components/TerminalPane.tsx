import { useEffect, useRef, useState, type FormEvent } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { IconTerminal } from '../icons'
import {
  interruptTerminal,
  killTerminal,
  resizeTerminal,
  sendTerminal,
  startTerminal,
  type TerminalMode,
} from '../lib/fs'
import { useWorkspace } from '../workspace'

type StreamMsg =
  | { type: 'history'; text: string; mode?: TerminalMode }
  | { type: 'data'; text: string }
  | { type: 'exit'; code: number }

/**
 * 已经被取代的 effect 里拉起的 shell，先等一小会儿再回收：
 * React 严格模式的双挂载（以及快速切会话）里，新的一轮可能复用同一个 shell。
 */
const SHELL_ORPHAN_GRACE_MS = 1200

const THEME = {
  background: '#0a0a0c',
  foreground: '#f4f1ea',
  cursor: '#f4f1ea',
  cursorAccent: '#0a0a0c',
  selectionBackground: 'rgba(244, 241, 234, 0.24)',
  black: '#1c1c1f',
  brightBlack: '#6f6d67',
  red: '#d97878',
  brightRed: '#e89a9a',
  green: '#9ec9a8',
  brightGreen: '#b8dcc0',
  yellow: '#e8a87c',
  brightYellow: '#f0c39f',
  blue: '#8cb4ff',
  brightBlue: '#adc9ff',
  magenta: '#c5a3e8',
  brightMagenta: '#d8bff0',
  cyan: '#86c9c9',
  brightCyan: '#a9dcdc',
  white: '#d8d5ce',
  brightWhite: '#f4f1ea',
}

export function TerminalPane() {
  const { sessionCwd, terminalShellId, notify } = useWorkspace(
    'sessionCwd',
    'terminalShellId',
    'notify',
  )
  const [termId, setTermId] = useState<string | null>(null)
  const [mode, setMode] = useState<TerminalMode>('pty')
  const [cmd, setCmd] = useState('')
  const [running, setRunning] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sourceRef = useRef<EventSource | null>(null)
  // 当前面板实际在用的 shell id；卸载时用它决定要不要回收。
  const ownedIdRef = useRef<string | null>(null)
  const killedRef = useRef(new Set<string>())
  // 键盘输入要按顺序到达 shell：串成一条 promise 链，同一帧里的按键合并发送。
  const live = useRef({ id: null as string | null, mode: 'pty' as TerminalMode, running: false })
  const pending = useRef('')
  const sendChain = useRef<Promise<void>>(Promise.resolve())

  function killShell(id: string) {
    if (killedRef.current.has(id)) return
    killedRef.current.add(id)
    void killTerminal(id).catch(() => undefined)
  }

  // xterm 实例跟着面板走，只建一次。
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const term = new Terminal({
      theme: THEME,
      fontFamily: "'IBM Plex Mono', 'Cascadia Mono', Consolas, 'Microsoft YaHei', monospace",
      fontSize: 12.5,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    xtermRef.current = term
    fitRef.current = fit

    // 有选区时 Ctrl+C 复制而不是发中断；Ctrl+V 交给浏览器粘贴事件。
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const key = e.key.toLowerCase()
      if (e.ctrlKey && key === 'c' && (e.shiftKey || term.hasSelection())) {
        const text = term.getSelection()
        if (text) void navigator.clipboard.writeText(text).catch(() => undefined)
        term.clearSelection()
        return false
      }
      if (e.ctrlKey && key === 'v') return false
      return true
    })
    const sub = term.onData((data) => {
      const id = live.current.id
      if (live.current.mode !== 'pty' || !id || !live.current.running) return
      const flush = !pending.current
      pending.current += data
      if (!flush) return
      queueMicrotask(() => {
        const text = pending.current
        pending.current = ''
        sendChain.current = sendChain.current
          .then(() => sendTerminal(id, text))
          .catch(() => undefined)
      })
    })

    let resizeTimer = 0
    const refit = () => {
      try {
        fit.fit()
      } catch {
        return
      }
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        const id = live.current.id
        if (id && live.current.mode === 'pty' && live.current.running) {
          void resizeTerminal(id, term.cols, term.rows).catch(() => undefined)
        }
      }, 80)
    }
    const ro = new ResizeObserver(refit)
    ro.observe(host)
    // 等字体加载完再量一次字宽，否则列数会算错。
    void document.fonts?.ready.then(refit)
    refit()

    return () => {
      ro.disconnect()
      window.clearTimeout(resizeTimer)
      sub.dispose()
      term.dispose()
      xtermRef.current = null
      fitRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!sessionCwd) return
    let cancelled = false
    let createdId: string | null = null
    const term = xtermRef.current
    term?.reset()
    term?.write('\x1b[2m正在打开终端…\x1b[0m')
    try {
      fitRef.current?.fit()
    } catch {
      // 面板还没布局好
    }
    const size = term ? { cols: term.cols, rows: term.rows } : undefined
    void startTerminal(sessionCwd, terminalShellId, size)
      .then((created) => {
        createdId = created.id
        if (cancelled) {
          // 面板已经切走：这里拉起的 shell 没人接手，晚一点确认后回收，
          // 免得服务端每换一个 (cwd, shell) 就留一个活进程。
          window.setTimeout(() => {
            if (ownedIdRef.current !== created.id) killShell(created.id)
          }, SHELL_ORPHAN_GRACE_MS)
          return
        }
        ownedIdRef.current = created.id
        live.current = { id: created.id, mode: created.mode, running: true }
        setTermId(created.id)
        setMode(created.mode)
        setRunning(true)
        // 复用已有 shell 时尺寸可能是上一个面板的，按当前面板再同步一次。
        if (created.mode === 'pty' && term) {
          void resizeTerminal(created.id, term.cols, term.rows).catch(() => undefined)
        }
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
          const t = xtermRef.current
          if (!t) return
          if (msg.type === 'history') {
            t.reset()
            // 管道模式的输出只有 \n，xterm 需要 \r\n 才回到行首。
            t.write(created.mode === 'pipe' ? msg.text.replace(/\r?\n/g, '\r\n') : msg.text)
            live.current.running = true
            setRunning(true)
          } else if (msg.type === 'data') {
            t.write(created.mode === 'pipe' ? msg.text.replace(/\r?\n/g, '\r\n') : msg.text)
          } else if (msg.type === 'exit') {
            live.current.running = false
            setRunning(false)
            t.write(`\r\n\x1b[2m进程已退出 (${msg.code})\x1b[0m\r\n`)
          }
        }
        es.onerror = () => {
          // EventSource 会自己重连；重连后收到 history 会把 running 打开。
          if (cancelled) return
          live.current.running = false
          setRunning(false)
        }
        if (created.mode === 'pty') term?.focus()
      })
      .catch((err: unknown) => {
        if (cancelled) return
        xtermRef.current?.write(`\r\n\x1b[31m${err instanceof Error ? err.message : '无法打开终端'}\x1b[0m\r\n`)
        notify(err instanceof Error ? err.message : '无法打开终端', 'error')
      })
    return () => {
      cancelled = true
      sourceRef.current?.close()
      sourceRef.current = null
      live.current = { id: null, mode: 'pty', running: false }
      if (createdId && ownedIdRef.current === createdId) {
        ownedIdRef.current = null
        killShell(createdId)
      }
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
            onClick={() => {
              if (!termId) return
              killShell(termId)
              live.current.running = false
              setRunning(false)
            }}
          >
            结束
          </button>
        </div>
      </div>
      <div
        className="term-screen"
        ref={hostRef}
        onClick={() => xtermRef.current?.focus()}
      />
      {mode === 'pipe' ? (
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
            placeholder={running ? '输入命令（简易模式）' : '终端已结束'}
            disabled={!running}
            autoComplete="off"
            spellCheck={false}
          />
        </form>
      ) : null}
    </div>
  )
}
