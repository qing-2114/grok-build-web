import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  IconChevron,
  IconCopy,
  IconDown,
  IconMenu,
  IconPanelRight,
  IconPencil,
  IconRetry,
  IconSidebar,
} from '../icons'
import { formatDuration, formatMarks } from '../lib/format'
import { looksLikeFilePath } from '../lib/paths'
import { stripImageTokens } from '../lib/images'
import { displayTitle } from '../lib/title'
import type { ChatImage, Message, ToolCall, TurnUsage } from '../types'
import { useWorkspace } from '../workspace'
import { Composer } from './Composer'
import { PathLink } from './PathLink'
import { PlanCard } from './PlanCard'
import { RichText } from './RichText'
import { ToolDetailView } from './ToolDetail'

function toolStatusLabel(status: ToolCall['status'] | string | undefined): string {
  if (status === 'failed') return '失败'
  if (status === 'success' || status === 'done') return '成功'
  return '进行中'
}

type ChangeCardProps = {
  tools: Message[]
  sessionId: string
  cwd: string
  onOpenFile: (path: string) => void
  onOpenUrl: (url: string) => void
  onReveal: (path: string) => void
}

// tools 每次渲染都是新数组，但里面已结束的工具消息对象不变：逐项比较，
// 只有包含正在更新的那张卡片会重渲染。
function sameChangeCard(a: ChangeCardProps, b: ChangeCardProps): boolean {
  return (
    a.sessionId === b.sessionId &&
    a.cwd === b.cwd &&
    a.onOpenFile === b.onOpenFile &&
    a.onOpenUrl === b.onOpenUrl &&
    a.onReveal === b.onReveal &&
    a.tools.length === b.tools.length &&
    a.tools.every((t, i) => t === b.tools[i])
  )
}

const ChangeCard = memo(function ChangeCard({
  tools,
  sessionId,
  cwd,
  onOpenFile,
  onOpenUrl,
  onReveal,
}: ChangeCardProps) {
  const [open, setOpen] = useState(false)
  const [detailIds, setDetailIds] = useState<Set<string>>(() => new Set())
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
          const showing = detailIds.has(t.id)
          const toggleDetail = () =>
            setDetailIds((prev) => {
              const next = new Set(prev)
              if (next.has(t.id)) next.delete(t.id)
              else next.add(t.id)
              return next
            })
          return (
            <li key={t.id} className={showing ? 'is-open' : undefined}>
              <span className="change-name">{t.tool?.name}</span>
              {looksLikeFilePath(t.tool?.target ?? '') ? (
                <PathLink
                  href={t.tool?.target ?? ''}
                  className="change-target is-link"
                  onOpenFile={onOpenFile}
                  onOpenUrl={onOpenUrl}
                  onReveal={onReveal}
                >
                  {t.tool?.target}
                </PathLink>
              ) : (
                <span className="change-target">{t.tool?.target}</span>
              )}
              <span className={`change-status is-${status}`}>
                {toolStatusLabel(status)}
              </span>
              <button
                type="button"
                className="change-more"
                aria-label={showing ? '收起详情' : '查看详情'}
                aria-expanded={showing}
                onClick={toggleDetail}
              >
                <IconChevron className={showing ? 'is-open' : ''} />
              </button>
              {showing ? (
                <div className="change-detail">
                  <ToolDetailView
                    sessionId={sessionId}
                    cwd={cwd}
                    toolId={t.id}
                    running={status === 'running'}
                  />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}, sameChangeCard)

function StatusPill() {
  const { connection, connectionError, agentVersion } = useWorkspace(
    'connection',
    'connectionError',
    'agentVersion',
  )
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

// 共用一个空数组，保证 RichText 的 memo 不会因为每次新建 [] 而失效。
const NO_IMAGES: ChatImage[] = []

function imagesBefore(messages: Message[], index: number): ChatImage[] {
  for (let i = index; i >= 0; i--) {
    if (messages[i].role !== 'user') continue
    // 只认当前这一轮的用户消息；再往前就是上一轮的图，不能拿来配 [Image #N]。
    return messages[i].images ?? NO_IMAGES
  }
  return NO_IMAGES
}

const UserPrompt = memo(function UserPrompt({
  message,
  onEdit,
}: {
  message: Message
  onEdit: (id: string) => void
}) {
  const images = message.images ?? []
  const text = images.length
    ? stripImageTokens(message.content)
    : message.content
  return (
    <div className={images.length ? 'follow-prompt has-images' : 'follow-prompt'}>
      {images.length > 0 ? (
        <div className="prompt-images">
          {images.map((img) => (
            <a
              key={img.n}
              className="prompt-image"
              href={img.src}
              target="_blank"
              rel="noreferrer"
            >
              <img src={img.src} alt="" />
            </a>
          ))}
        </div>
      ) : null}
      {text ? <div className="follow-prompt-text">{text}</div> : null}
      <div className="prompt-actions">
        <button
          type="button"
          className="icon-btn hint-up"
          aria-label="编辑后重发"
          data-hint="放回输入框，改完再发（不会撤回已有回复）"
          onClick={() => onEdit(message.id)}
        >
          <IconPencil />
        </button>
      </div>
    </div>
  )
})

function usageLabel(u: TurnUsage): string {
  const parts = [`输入 ${formatMarks(u.input)}`]
  if (u.cached) parts.push(`缓存 ${formatMarks(u.cached)}`)
  parts.push(`输出 ${formatMarks(u.output)}`)
  if (u.elapsedMs) parts.push(formatDuration(u.elapsedMs))
  return parts.join(' · ')
}

function usageTitle(u: TurnUsage): string {
  return [
    `输入 ${u.input.toLocaleString()} 标记（其中缓存 ${u.cached.toLocaleString()}）`,
    `输出 ${u.output.toLocaleString()} 标记（其中推理 ${u.reasoning.toLocaleString()}）`,
    `模型调用 ${u.calls} 次`,
  ].join('\n')
}

export function ChatPane() {
  const {
    activeProject,
    composerProject,
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
    rightRailOpen,
    toggleRightRail,
    openLocalFile,
    openExternalUrl,
    revealInExplorer,
    sessionCwd,
    editMessage,
    retryLast,
  } = useWorkspace(
    'activeProject',
    'composerProject',
    'activeSession',
    'isThinking',
    'isHydrating',
    'sidebarCollapsed',
    'mobileNavOpen',
    'toggleSidebar',
    'setMobileNav',
    'notify',
    'connection',
    'titleOverrides',
    'rightRailOpen',
    'toggleRightRail',
    'openLocalFile',
    'openExternalUrl',
    'revealInExplorer',
    'sessionCwd',
    'editMessage',
    'retryLast',
  )

  const messages = activeSession?.messages ?? []
  const empty = messages.length === 0 && !isThinking && !isHydrating
  const emptyProject = composerProject ?? activeProject
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
  // 只有最后一轮可以重试：最后一条用户消息之后的最后一段助手回复。
  let retryId: string | null = null
  if (!isThinking) {
    for (let k = messages.length - 1; k >= 0; k--) {
      if (messages[k].role === 'user') break
      if (messages[k].role === 'assistant') {
        retryId = messages[k].id
        break
      }
    }
  }

  function renderTurns() {
    const nodes: ReactNode[] = []
    let i = 0
    while (i < messages.length) {
      const m = messages[i]
      if (m.role === 'user') {
        nodes.push(<UserPrompt key={m.id} message={m} onEdit={editMessage} />)
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
        nodes.push(
          <ChangeCard
            key={tools[0].id}
            tools={tools}
            sessionId={activeSession?.id ?? ''}
            cwd={activeSession?.cwd || sessionCwd}
            onOpenFile={openLocalFile}
            onOpenUrl={openExternalUrl}
            onReveal={revealInExplorer}
          />,
        )
        continue
      }
      nodes.push(
        <article key={m.id} className="doc-turn">
          <RichText
            text={m.content}
            images={imagesBefore(messages, i)}
            onOpenFile={openLocalFile}
            onOpenUrl={openExternalUrl}
            onReveal={revealInExplorer}
          />
          {copyIds.has(m.id) || m.usage ? (
            <div className="doc-actions">
              {copyIds.has(m.id) ? (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="复制"
                  onClick={() => copyText(m.content)}
                >
                  <IconCopy />
                </button>
              ) : null}
              {m.id === retryId ? (
                <button
                  type="button"
                  className="icon-btn hint-up"
                  aria-label="重试"
                  data-hint="重新发送上一条消息"
                  onClick={retryLast}
                >
                  <IconRetry />
                </button>
              ) : null}
              {m.usage ? (
                <span
                  className="turn-usage hint-up"
                  tabIndex={0}
                  data-hint={usageTitle(m.usage)}
                >
                  {usageLabel(m.usage)}
                </span>
              ) : null}
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
            <button
              type="button"
              className={rightRailOpen ? 'icon-btn is-active' : 'icon-btn'}
              aria-label={rightRailOpen ? '收起右侧栏' : '打开右侧栏'}
              onClick={toggleRightRail}
            >
              <IconPanelRight />
            </button>
          </header>
          <div className="empty">
            <div className="empty-glyph">
              <img src="/grok-icon.png" alt="" />
            </div>
            <h1 className="empty-title">
              {emptyProject ? (
                <>
                  你想让我们在{' '}
                  <span className="project-name">{emptyProject.name}</span>{' '}
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
              <button
                type="button"
                className={rightRailOpen ? 'icon-btn is-active' : 'icon-btn'}
                aria-label={rightRailOpen ? '收起右侧栏' : '打开右侧栏'}
                onClick={toggleRightRail}
              >
                <IconPanelRight />
              </button>
            </div>
          </header>

          <div className="thread" ref={threadRef} onScroll={onScroll}>
            <div className="doc-col">
              {renderTurns()}
              {activeSession?.plan?.length ? (
                <PlanCard
                  key={activeSession.id}
                  entries={activeSession.plan}
                  live={isThinking}
                />
              ) : null}
              {isHydrating ? (
                <div className="thinking">
                  <span className="who-mark">
                    <img src="/grok-icon.png" alt="" />
                  </span>
                  <span className="caret" />
                  <span className="thinking-label">正在载入会话</span>
                </div>
              ) : null}
              {isThinking ? (
                <div className="thinking">
                  <span className="who-mark">
                    <img src="/grok-icon.png" alt="" />
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
