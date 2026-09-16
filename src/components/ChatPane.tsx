import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  IconChevron,
  IconCopy,
  IconDown,
  IconMenu,
  IconPrompt,
  IconSidebar,
  IconSpark,
} from '../icons'
import { displayTitle } from '../lib/title'
import type { Message, ToolCall } from '../types'
import { useWorkspace } from '../workspace'
import { Composer } from './Composer'
import { RichText } from './RichText'

function toolStatusLabel(status: ToolCall['status'] | string | undefined): string {
  if (status === 'failed') return '失败'
  if (status === 'success' || status === 'done') return '成功'
  return '进行中'
}

function ChangeCard({ tools }: { tools: Message[] }) {
  const [open, setOpen] = useState(false)
  const many = tools.length > 1
  const featured =
    tools.find((t) => t.tool?.status === 'running') ?? tools[tools.length - 1]
  const visible = open || !many ? tools : featured ? [featured] : tools.slice(0, 1)

  return (
    <div className={open || !many ? 'change-card' : 'change-card is-folded'}>
      <button
        type="button"
        className="change-card-head"
        onClick={() => many && setOpen((v) => !v)}
        aria-expanded={many ? open : undefined}
        disabled={!many}
      >
        <span>已调用 {tools.length} 个工具</span>
        {many ? (
          <IconChevron className={open ? 'is-open' : ''} />
        ) : null}
      </button>
      <ul>
        {visible.map((t) => {
          const status = t.tool?.status ?? 'running'
          return (
            <li key={t.id}>
              <span className="change-name">{t.tool?.name}</span>
              <span className="change-target">{t.tool?.target}</span>
              <span className={`change-status is-${status}`}>
                {toolStatusLabel(status)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function StatusPill() {
  const { connection, connectionError, agentVersion } = useWorkspace()
  const label =
    connection === 'connected'
      ? agentVersion
        ? `已连接 · ${agentVersion}`
        : '已连接'
      : connection === 'connecting'
        ? '正在连接'
        : '本机未连接'
  const title =
    connection === 'error'
      ? connectionError || '本机未连接'
      : connection === 'connected'
        ? '已接到本机 Grok Build'
        : '正在连接本机 Grok Build'
  return (
    <span
      className={[
        'status-pill',
        connection === 'connected' ? 'is-on' : '',
        connection === 'connecting' ? 'is-wait' : '',
        connection === 'error' ? 'is-off' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={title}
    >
      <i className="status-dot" />
      {label}
    </span>
  )
}

export function ChatPane() {
  const {
    activeProject,
    activeSession,
    isThinking,
    isHydrating,
    sidebarCollapsed,
    mobileNavOpen,
    toggleSidebar,
    setMobileNav,
    notify,
    connection,
    titleOverrides,
  } = useWorkspace()

  const messages = activeSession?.messages ?? []
  const empty = messages.length === 0 && !isThinking && !isHydrating
  const bottomRef = useRef<HTMLDivElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const prevSession = useRef<string | undefined>(undefined)
  const prevCount = useRef(0)
  const [showJump, setShowJump] = useState(false)

  useEffect(() => {
    const id = activeSession?.id
    if (id !== prevSession.current) {
      prevSession.current = id
      prevCount.current = messages.length
      const el = threadRef.current
      if (el) el.scrollTop = 0
      setShowJump(false)
      return
    }
    if (isThinking || messages.length > prevCount.current) {
      prevCount.current = messages.length
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [activeSession?.id, messages.length, isThinking])

  function onScroll() {
    const el = threadRef.current
    if (!el) return
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowJump(gap > 96)
  }

  function jumpBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      notify('已复制')
    } catch {
      notify('复制失败')
    }
  }

  const copyIds = new Set<string>()
  {
    let lastAssistant: Message | null = null
    for (const m of messages) {
      if (m.role === 'user') {
        if (lastAssistant) copyIds.add(lastAssistant.id)
        lastAssistant = null
      } else if (m.role === 'assistant') {
        lastAssistant = m
      }
    }
    if (lastAssistant && !isThinking) copyIds.add(lastAssistant.id)
  }

  function renderTurns() {
    const nodes: ReactNode[] = []
    let i = 0
    while (i < messages.length) {
      const m = messages[i]
      if (m.role === 'user') {
        nodes.push(
          <div key={m.id} className="follow-prompt">
            {m.content}
          </div>,
        )
        nodes.push(<hr key={`${m.id}-split`} className="turn-split" />)
        i += 1
        continue
      }
      if (m.role === 'tool') {
        const tools: Message[] = []
        while (i < messages.length && messages[i].role === 'tool') {
          tools.push(messages[i])
          i += 1
        }
        nodes.push(<ChangeCard key={tools[0].id} tools={tools} />)
        continue
      }
      nodes.push(
        <article key={m.id} className="doc-turn">
          <RichText text={m.content} />
          {copyIds.has(m.id) ? (
            <div className="doc-actions">
              <button
                type="button"
                className="icon-btn"
                aria-label="复制"
                onClick={() => copyText(m.content)}
              >
                <IconCopy />
              </button>
            </div>
          ) : null}
        </article>,
      )
      i += 1
    }
    return nodes
  }

  return (
    <main className="stage">
      {empty ? (
        <>
          <header className={mobileNavOpen ? 'stage-top is-hidden' : 'stage-top'}>
            <button
              type="button"
              className="icon-btn mobile-only"
              aria-label="打开侧栏"
              onClick={() => setMobileNav(true)}
            >
              <IconMenu />
            </button>
            <button
              type="button"
              className="icon-btn desktop-only"
              aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
              onClick={toggleSidebar}
            >
              <IconSidebar />
            </button>
            <StatusPill />
          </header>
          <div className="empty">
            <div className="empty-glyph">
              <IconPrompt />
            </div>
            <h1 className="empty-title">
              {activeProject ? (
                <>
                  你想让我们在{' '}
                  <span className="project-name">{activeProject.name}</span>{' '}
                  中构建什么？
                </>
              ) : (
                '你想让我们构建什么？'
              )}
            </h1>
            <p className="empty-sub">
              {connection === 'connected'
                ? '本机 Grok Build · 已接通'
                : connection === 'connecting'
                  ? '正在连接本机 Grok Build…'
                  : '本机 Grok Build · 未连接'}
            </p>
          </div>
          <div className="stage-dock">
            <Composer key={activeSession?.id ?? 'none'} />
          </div>
        </>
      ) : (
        <>
          <header className={mobileNavOpen ? 'doc-top is-hidden' : 'doc-top'}>
            <div className="doc-top-left">
              <button
                type="button"
                className="icon-btn mobile-only"
                aria-label="打开侧栏"
                onClick={() => setMobileNav(true)}
              >
                <IconMenu />
              </button>
              <button
                type="button"
                className="icon-btn desktop-only"
                aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
                onClick={toggleSidebar}
              >
                <IconSidebar />
              </button>
              <h1 className="doc-title">
                {activeSession
                  ? displayTitle(
                      activeSession,
                      titleOverrides[activeSession.id],
                    )
                  : ''}
              </h1>
            </div>
            <div className="doc-top-right">
              <StatusPill />
            </div>
          </header>

          <div className="thread" ref={threadRef} onScroll={onScroll}>
            <div className="doc-col">
              {renderTurns()}
              {isHydrating ? (
                <div className="thinking">
                  <span className="who-mark">
                    <IconSpark />
                  </span>
                  <span className="caret" />
                  <span className="thinking-label">正在载入会话</span>
                </div>
              ) : null}
              {isThinking ? (
                <div className="thinking">
                  <span className="who-mark">
                    <IconSpark />
                  </span>
                  <span className="caret" />
                  <span className="thinking-label">正在思考</span>
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
          </div>

          {showJump ? (
            <button
              type="button"
              className="jump-bottom"
              aria-label="跳到最新"
              onClick={jumpBottom}
            >
              <IconDown />
            </button>
          ) : null}

          <div className="stage-dock">
            <Composer key={activeSession?.id ?? 'none'} />
          </div>
        </>
      )}
    </main>
  )
}
