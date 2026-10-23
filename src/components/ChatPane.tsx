import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  IconChevron,
  IconCopy,
  IconDown,
  IconFile,
  IconMenu,
  IconPanelRight,
  IconPencil,
  IconRetry,
  IconSidebar,
  IconTerminal,
} from '../icons'
import { formatDuration, formatMarks } from '../lib/format'
import { foldBefore } from '../lib/turns'
import { looksLikeFilePath } from '../lib/paths'
import { stripImageTokens } from '../lib/images'
import { displayTitle } from '../lib/title'
import type { ChatImage, Message, ToolCall, TurnUsage } from '../types'
import { useWorkspace } from '../workspace'
import { Composer } from './Composer'
import { GrokCliBanner } from './GrokCliBanner'
import { PathLink } from './PathLink'
import { PlanCard } from './PlanCard'
import { RichText } from './RichText'
import { ToolDetailView } from './ToolDetail'
import { ThemeToggle } from './ThemeToggle'

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

function ToolIcon({ target }: { target?: string }) {
  const isFile =
    looksLikeFilePath(target ?? '') &&
    !/\.(?:py|sh|bash|cmd|ps1|bat|exe)$/i.test(target ?? '')
  if (isFile) return <IconFile />
  return <IconTerminal />
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
      {many ? (
        <button
          type="button"
          className="change-card-head"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <div className="change-head-left">
            <IconTerminal className="change-head-icon" />
            <span>已调用 {tools.length} 个工具</span>
          </div>
          <IconChevron className={open ? 'is-open' : ''} />
        </button>
      ) : null}
      <ul>
        {visible.map((t) => {
          const status = t.tool?.status ?? 'running'
          const showing = detailIds.has(t.id)
          const toolName = t.tool?.name
          const hasCustomName = Boolean(toolName && toolName !== '工具')
          const toggleDetail = () =>
            setDetailIds((prev) => {
              const next = new Set(prev)
              if (next.has(t.id)) next.delete(t.id)
              else next.add(t.id)
              return next
            })
          return (
            <li key={t.id} className={showing ? 'is-open' : undefined}>
              <div className="change-lead">
                <span className="change-icon">
                  <ToolIcon target={t.tool?.target} />
                </span>
                {hasCustomName ? (
                  <span className="change-name-badge">{toolName}</span>
                ) : null}
              </div>
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
                <span className="change-target" title={t.tool?.target}>
                  {t.tool?.target}
                </span>
              )}
              <span className={`change-status is-${status}`}>
                <span className="change-dot" />
                <span>{toolStatusLabel(status)}</span>
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

function ThinkingMark() {
  return (
    <span className="thinking-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 4.2c-1.4-1.2-3.6-.5-3.8 1.4-2.2-.2-3.4 2.3-2.1 4-1.8 1.4-1.3 4.2.8 4.8-.3 2.2 2.1 3.7 4 2.4V4.2Zm0 0c1.4-1.2 3.6-.5 3.8 1.4 2.2-.2 3.4 2.3 2.1 4 1.8 1.4 1.3 4.2-.8 4.8.3 2.2-2.1 3.7-4 2.4V4.2Z" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" />
        <path d="M9 8.2v2m0 2.5v1.1m6-5.6v2m0 2.5v1.1M10.2 11h3.6m-3.1 2.7h2.6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    </span>
  )
}

// AI 回复消息：memo 包裹，流式输出时只有内容变化的那条会重渲染
function sameAssistantTurn(a: AssistantTurnProps, b: AssistantTurnProps): boolean {
  // 消息内容或状态变化才重渲染
  if (a.message !== b.message) return false
  if (a.retryId !== b.retryId) return false
  // copyIds 和 images 是每次新建的 Set/数组，但内容相同时不需要重渲染
  // 用 has() 检查比遍历 Set 更高效
  const aCopy = a.copyIds.has(a.message.id)
  const bCopy = b.copyIds.has(b.message.id)
  if (aCopy !== bCopy) return false
  // images 通常是同一个数组引用（NO_IMAGES）或来自同一条用户消息
  if (a.images !== b.images && a.images.length !== b.images.length) return false
  return true
}

type AssistantTurnProps = {
  message: Message
  images: ChatImage[]
  copyIds: Set<string>
  retryId: string | null
  openLocalFile: (path: string) => void
  openExternalUrl: (url: string) => void
  revealInExplorer: (path: string) => void
  onCopy: (text: string) => void
  onRetry: () => void
}

const AssistantTurn = memo(function AssistantTurn({
  message,
  images,
  copyIds,
  retryId,
  openLocalFile,
  openExternalUrl,
  revealInExplorer,
  onCopy,
  onRetry,
}: AssistantTurnProps) {
  return (
    <article className="doc-turn">
      <RichText
        text={message.content}
        images={images}
        linkInlineFiles={copyIds.has(message.id)}
        onOpenFile={openLocalFile}
        onOpenUrl={openExternalUrl}
        onReveal={revealInExplorer}
      />
      {copyIds.has(message.id) || message.usage ? (
        <div className="doc-actions">
          {copyIds.has(message.id) ? (
            <button
              type="button"
              className="icon-btn"
              aria-label="复制"
              onClick={() => onCopy(message.content)}
            >
              <IconCopy />
            </button>
          ) : null}
          {message.id === retryId ? (
            <button
              type="button"
              className="icon-btn hint-up"
              aria-label="重试"
              data-hint="重新发送上一条消息"
              onClick={onRetry}
            >
              <IconRetry />
            </button>
          ) : null}
          {message.usage ? (
            <span
              className="turn-usage hint-up"
              tabIndex={0}
              data-hint={usageTitle(message.usage)}
            >
              {usageLabel(message.usage)}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}, sameAssistantTurn)

function imagesBefore(messages: Message[], index: number): ChatImage[] {
  for (let i = index; i >= 0; i--) {
    if (messages[i].role !== 'user') continue
    // 只认当前这一轮的用户消息；再往前就是上一轮的图，不能拿来配 [Image #N]。
    return messages[i].images ?? NO_IMAGES
  }
  return NO_IMAGES
}

type UserPromptProps = {
  message: Message
  onEdit: (id: string, text: string) => Promise<boolean>
  onCopy: (text: string) => void
}

function sameUserPrompt(a: UserPromptProps, b: UserPromptProps): boolean {
  return a.message === b.message
}

const UserPrompt = memo(function UserPrompt({
  message,
  onEdit,
  onCopy,
}: UserPromptProps) {
  const images = message.images ?? []
  const attachments = message.attachments ?? []
  const text = images.length
    ? stripImageTokens(message.content)
    : message.content
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    if (!editing) return
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 260)}px`
  }, [editing, draft])

  useEffect(() => {
    if (!editing) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    const end = el.value.length
    el.setSelectionRange(end, end)
  }, [editing])

  function startEdit() {
    setDraft(text)
    setEditing(true)
  }

  function cancelEdit() {
    if (submitting) return
    setEditing(false)
    setDraft(text)
  }

  async function submitEdit() {
    if (submitting) return
    const next = draft.trim()
    if (!next && images.length === 0) return
    setSubmitting(true)
    try {
      const ok = await onEdit(message.id, draft)
      if (ok) setEditing(false)
    } finally {
      setSubmitting(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing || e.key === 'Process') return
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submitEdit()
    }
  }

  const rootClass = [
    'follow-prompt',
    images.length || attachments.length ? 'has-attachments' : '',
    editing ? 'is-editing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClass}>
      {attachments.length > 0 ? (
        <div className="prompt-attachments">
          {attachments.map((file, index) => (
            <div
              key={`${file.name}:${file.size}:${index}`}
              className="prompt-attachment"
            >
              <IconFile />
              <span className="prompt-attachment-name">{file.name}</span>
              <span className="prompt-attachment-size">
                {formatAttachmentSize(file.size)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
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
      {editing ? (
        <div className="follow-prompt-editor">
          <textarea
            ref={inputRef}
            className="follow-prompt-input"
            value={draft}
            rows={1}
            disabled={submitting}
            placeholder="输入消息内容…"
            aria-label="编辑消息内容"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="follow-prompt-edit-foot">
            <span className="follow-prompt-edit-hint">
              Enter 发送 · Shift+Enter 换行 · Esc 取消
            </span>
            <div className="follow-prompt-edit-actions">
              <button
                type="button"
                className="prompt-edit-btn is-cancel"
                disabled={submitting}
                onClick={cancelEdit}
              >
                取消
              </button>
              <button
                type="button"
                className="prompt-edit-btn is-submit"
                disabled={submitting || (!draft.trim() && images.length === 0)}
                onClick={() => void submitEdit()}
              >
                发送
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {text ? <div className="follow-prompt-text">{text}</div> : null}
          <div className="prompt-actions">
            <button
              type="button"
              className="icon-btn hint-up"
              aria-label="复制"
              data-hint="复制消息"
              onClick={() => onCopy(text || message.content)}
            >
              <IconCopy />
            </button>
            <button
              type="button"
              className="icon-btn hint-up"
              aria-label="编辑后重发"
              data-hint="原地编辑并重新发送"
              onClick={startEdit}
            >
              <IconPencil />
            </button>
          </div>
        </>
      )}
    </div>
  )
}, sameUserPrompt)

function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, bytes | 0)} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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
  const [openTurns, setOpenTurns] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    const id = activeSession?.id
    if (id !== prevSession.current) {
      prevSession.current = id
      prevCount.current = messages.length
      setOpenTurns(new Set())
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

  function toggleTurn(id: string) {
    setOpenTurns((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderSlice(from: number, to: number, into: ReactNode[]) {
    let i = from
    while (i < to) {
      const m = messages[i]
      if (m.role === 'tool') {
        const tools: Message[] = []
        while (i < to && messages[i].role === 'tool') {
          tools.push(messages[i])
          i += 1
        }
        into.push(
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
      into.push(
        <AssistantTurn
          key={m.id}
          message={m}
          images={imagesBefore(messages, i)}
          copyIds={copyIds}
          retryId={retryId}
          openLocalFile={openLocalFile}
          openExternalUrl={openExternalUrl}
          revealInExplorer={revealInExplorer}
          onCopy={copyText}
          onRetry={retryLast}
        />,
      )
      i += 1
    }
  }

  function renderTurns() {
    const nodes: ReactNode[] = []
    let i = 0
    while (i < messages.length) {
      const m = messages[i]
      if (m.role === 'user') {
        nodes.push(
          <UserPrompt
            key={m.id}
            message={m}
            onEdit={editMessage}
            onCopy={copyText}
          />,
        )
        i += 1
        continue
      }
      const start = i
      let end = i
      while (end < messages.length && messages[end].role !== 'user') end += 1
      const live = isThinking && end === messages.length
      const foldAt = live ? null : foldBefore(messages, start, end)
      if (foldAt != null) {
        const turnId =
          start > 0 && messages[start - 1].role === 'user'
            ? messages[start - 1].id
            : messages[start].id
        const open = openTurns.has(turnId)
        const elapsed = messages[foldAt].usage?.elapsedMs ?? 0
        const label = elapsed ? `用时 ${formatDuration(elapsed)}` : '查看过程'
        nodes.push(
          <button
            key={`${turnId}-fold`}
            type="button"
            className={open ? 'turn-fold is-open' : 'turn-fold'}
            aria-expanded={open}
            onClick={() => toggleTurn(turnId)}
          >
            <span>{label}</span>
            <IconChevron />
          </button>,
        )
        if (open) renderSlice(start, foldAt, nodes)
        renderSlice(foldAt, end, nodes)
      } else {
        renderSlice(start, end, nodes)
      }
      i = end
    }
    return nodes
  }

  return (
    <main className="stage">
      <GrokCliBanner />
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
            <ThemeToggle />
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
              <img src="/grok-icon.png" alt="Grok" />
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
              <ThemeToggle />
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
                  <span className="thinking-label">正在载入会话</span>
                </div>
              ) : null}
              {isThinking ? (
                <div className="thinking">
                  <ThinkingMark />
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
