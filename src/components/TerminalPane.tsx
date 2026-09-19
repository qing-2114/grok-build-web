import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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

/**
 * 服务端回放缓冲是 200 000 字符；本地留一倍，重连后还能往上翻一点，
 * 同时避免整段输出无限增长、每来一块数据就重排整个 <pre>。
 */
const TERM_OUTPUT_MAX = 400_000

/**
 * 已经被取代的 effect 里拉起的 shell，先等一小会儿再回收：
 * React 严格模式的双挂载（以及快速切会话）里，新的一轮可能复用同一个 shell。
 */
const SHELL_ORPHAN_GRACE_MS = 1200

function capOut(text: string): string {
  return text.length > TERM_OUTPUT_MAX
    ? text.slice(-TERM_OUTPUT_MAX)
    : text
}

/** ANSI 转义（颜色、清屏、光标等）会在 <pre> 里显示成 \x1b[…m 乱码，按序列扫掉。 */
const ESC_CHAR = '\u001b'
const BEL_CHAR = '\u0007'
const CSI_FINAL = /[@-~]/

function stripAnsi(text: string): string {
  let i = text.indexOf(ESC_CHAR)
  if (i < 0) return text
  let out = ''
  let start = 0
  while (i >= 0) {
    out += text.slice(start, i)
    i += 1
    const kind = text[i]
    if (kind === '[') {
      i += 1
      while (i < text.length && !CSI_FINAL.test(text[i])) i += 1
      i += 1
    } else if (kind === ']') {
      i += 1
      while (
        i < text.length &&
        text[i] !== BEL_CHAR &&
        !(text[i] === ESC_CHAR && text[i + 1] === '\\')
      ) {
        i += 1
      }
      i += text[i] === BEL_CHAR ? 1 : 2
    } else {
      i += 1
    }
    start = i
    i = text.indexOf(ESC_CHAR, i)
  }
  return out + text.slice(start)
}

export function TerminalPane() {
  const { sessionCwd, terminalShellId, notify } = useWorkspace()
  const [termId, setTermId] = useState<string | null>(null)
  const [out, setOut] = useState('')
  const [cmd, setCmd] = useState('')
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const outRef = useRef<HTMLPreElement>(null)
  const sourceRef = useRef<EventSource | null>(null)
  // 当前面板实际在用的 shell id；卸载时用它决定要不要回收。
  const ownedIdRef = useRef<string | null>(null)
  const killedRef = useRef(new Set<string>())
  const view = useMemo(() => stripAnsi(out), [out])

  function killShell(id: string) {
    if (killedRef.current.has(id)) return
    killedRef.current.add(id)
    void killTerminal(id).catch(() => undefined)
  }

  useEffect(() => {
    if (outRef.current) {
      outRef.current.scrollTop = outRef.current.scrollHeight
    }
  }, [out])

  useEffect(() => {
    if (!sessionCwd) return
    let cancelled = false
    let createdId: string | null = null
    setBusy(true)
    setOut('')
    void startTerminal(sessionCwd, terminalShellId)
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
          if (msg.type === 'history') {
            setOut(capOut(msg.text))
            setRunning(true)
          } else if (msg.type === 'data') {
            setRunning(true)
            setOut((s) => capOut(s + msg.text))
          } else if (msg.type === 'exit') {
            setRunning(false)
            setOut((s) => capOut(s + `\r\n进程已退出 (${msg.code})\r\n`))
          }
        }
        es.onerror = () => {
          // EventSource 会自己重连；这里只是暂时禁用输入，
          // 重连后收到 history / data 会把 running 打开。
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
              setRunning(false)
            }}
          >
            结束
          </button>
        </div>
      </div>
      <pre className="term-out" ref={outRef}>
        {busy && !out ? '正在打开终端…' : view}
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
