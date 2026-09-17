import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import {
  IconCheck,
  IconChevron,
  IconClose,
  IconFile,
  IconFolder,
  IconGitBranch,
  IconPlus,
  IconSearch,
  IconSend,
  IconShield,
  IconStop,
} from '../icons'
import {
  filesFromClipboard,
  filesFromDrop,
  hasFilePayload,
  isImageFile,
  partitionAttach,
} from '../lib/attach'
import {
  acceptSlashPick,
  flattenSlash,
  menuGroupsForPhase,
  resolveSlash,
  slashMenuPhase,
  type SlashCommand,
  type SlashContext,
  type SlashOutcome,
} from '../lib/slash'
import { uid } from '../lib/uid'
import { EFFORTS, MODELS, PERMISSION_MODES } from '../types'
import type { ContextUsage } from '../types'
import { useWorkspace } from '../workspace'
import { Popover } from './Popover'
import { SlashMenu } from './SlashMenu'

type Attachment = {
  id: string
  file: File
  preview: string | null
}

function formatMarks(n: number): string {
  if (n < 1000) return String(Math.max(0, Math.round(n)))
  if (n < 10_000) {
    const k = n / 1000
    const t = k.toFixed(1)
    return `${t.endsWith('.0') ? t.slice(0, -2) : t}k`
  }
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  const m = n / 1_000_000
  const t = m >= 10 ? String(Math.round(m)) : m.toFixed(1)
  return `${t.endsWith('.0') ? t.slice(0, -2) : t}m`
}

function ContextRing({ usage }: { usage: ContextUsage | null }) {
  const used = usage?.used ?? 0
  const total = usage?.total ?? 0
  const percent = Math.min(100, Math.max(0, usage?.percent ?? 0))
  const r = 6.25
  const c = 2 * Math.PI * r
  const dash = (percent / 100) * c
  const tone =
    percent >= 95 ? 'is-danger' : percent >= 80 ? 'is-warn' : ''
  const detail =
    total > 0
      ? `已用 ${formatMarks(used)} 标记，共 ${formatMarks(total)}`
      : used > 0
        ? `已用 ${formatMarks(used)} 标记`
        : '尚无占用数据'
  const label = `上下文窗口 ${percent}% 已用`

  return (
    <span
      className={tone ? `ctx-ring ${tone}` : 'ctx-ring'}
      tabIndex={0}
      aria-label={label}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle className="ctx-ring-track" cx="8" cy="8" r={r} />
        {percent > 0.4 ? (
          <circle
            className="ctx-ring-fill"
            cx="8"
            cy="8"
            r={r}
            strokeDasharray={`${dash} ${c}`}
          />
        ) : null}
      </svg>
      <span className="ctx-tip" role="tooltip" aria-hidden="true">
        <span className="ctx-tip-kicker">上下文窗口</span>
        <span className="ctx-tip-pct">{percent}% 已用</span>
        <span className="ctx-tip-detail">{detail}</span>
      </span>
    </span>
  )
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

function ModelMenu({ close }: { close: () => void }) {
  const { model, effort, setModel, setEffort, models } = useWorkspace()
  const [effortOpen, setEffortOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const modelMeta = models.find((m) => m.id === model) ?? models[0]
  const effortOptions = EFFORTS.filter((e) =>
    (modelMeta?.efforts ?? []).includes(e.id),
  )

  useLayoutEffect(() => {
    const flyout = flyoutRef.current
    const menu = menuRef.current
    if (!effortOpen || !flyout || !menu) return

    flyout.classList.remove('is-left')
    flyout.style.top = 'auto'
    flyout.style.bottom = '0px'

    const pad = 12
    const vw = window.innerWidth
    const vh = window.innerHeight
    const menuRect = menu.getBoundingClientRect()
    const fw = flyout.offsetWidth

    if (menuRect.right + 6 + fw > vw - pad) {
      flyout.classList.add('is-left')
    }

    const next = flyout.getBoundingClientRect()
    if (next.top < pad) {
      flyout.style.bottom = 'auto'
      flyout.style.top = `${pad - menuRect.top}px`
    } else if (next.bottom > vh - pad) {
      const overflow = next.bottom - (vh - pad)
      flyout.style.bottom = `${overflow}px`
    }
  }, [effortOpen, model, effort])

  return (
    <div className="model-picker" ref={menuRef}>
      <div className="model-list">
        {models.map((m) => {
          const current = m.id === model
          return (
            <button
              key={m.id}
              type="button"
              role="menuitem"
              className={current ? 'project-row is-active' : 'project-row'}
              onClick={() => {
                if (current) {
                  setEffortOpen((v) => !v)
                  return
                }
                setModel(m.id)
                setEffortOpen(false)
              }}
            >
              <span>{m.label}</span>
              {current ? <IconCheck className="row-check" /> : null}
              {current ? <IconChevron className="sub-caret" /> : null}
            </button>
          )
        })}
      </div>
      {effortOpen ? (
        <div className="effort-flyout" ref={flyoutRef} role="menu">
          <div className="menu-section">思考强度</div>
          {effortOptions.map((e) => (
            <button
              key={e.id}
              type="button"
              role="menuitem"
              className={e.id === effort ? 'is-active' : ''}
              onClick={() => {
                setEffort(e.id)
                close()
              }}
            >
              <strong>{e.label}</strong>
              <em>{e.hint}</em>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function extTone(ext: string): string {
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'green'
  if (['md', 'markdown'].includes(ext)) return 'red'
  if (['json', 'yml', 'yaml', 'toml'].includes(ext)) return 'amber'
  if (['ts', 'tsx', 'js', 'jsx', 'css'].includes(ext)) return 'blue'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'violet'
  return 'mute'
}

export function Composer() {
  const {
    composerProject,
    projects,
    permissionMode,
    model,
    effort,
    isThinking,
    send,
    enqueue,
    dropQueued,
    sendQueued,
    stopGeneration,
    outgoingQueue,
    activeSession,
    setMode,
    setModel,
    setEffort,
    setWorkspaceProject,
    setBranch,
    setProjectDialog,
    setSettingsOpen,
    newChat,
    deleteSession,
    renameSession,
    notify,
    models,
    contextUsage,
  } = useWorkspace()

  const [draft, setDraft] = useState('')
  const [projectQuery, setProjectQuery] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [dragging, setDragging] = useState(false)
  const [slashNav, setSlashNav] = useState({ key: '', index: 0 })
  const [slashDismissed, setSlashDismissed] = useState<string | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef(files)
  filesRef.current = files
  const formId = useId()

  const menuPhase = useMemo(() => slashMenuPhase(draft), [draft])
  const slashGroups = useMemo(
    () => (menuPhase ? menuGroupsForPhase(menuPhase, { model, models }) : []),
    [menuPhase, model, models],
  )
  const slashFlat = useMemo(() => flattenSlash(slashGroups), [slashGroups])
  const menuKey = menuPhase?.key ?? ''
  const slashIndex = (() => {
    if (slashNav.key === menuKey) return slashNav.index
    if (menuPhase?.phase !== 'args') return 0
    const current =
      menuPhase.cmd.complete === 'models'
        ? model
        : menuPhase.cmd.complete === 'efforts'
          ? effort
          : null
    if (!current) return 0
    const i = slashFlat.findIndex((c) => c.name === current)
    return i >= 0 ? i : 0
  })()
  const slashOpen = menuPhase !== null && slashDismissed !== menuPhase.key
  const activeSlash =
    slashFlat[
      slashFlat.length
        ? Math.min(slashIndex, slashFlat.length - 1)
        : 0
    ] ?? null

  function setSlashIndex(index: number) {
    setSlashNav({ key: menuKey, index })
  }

  useEffect(() => {
    if (!slashOpen || !activeSlash) return
    const el = document.getElementById(`slash-${activeSlash.id}`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [slashOpen, activeSlash])

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [draft])

  useEffect(() => {
    return () => {
      filesRef.current.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview)
      })
    }
  }, [])

  useEffect(() => {
    const over = (e: globalThis.DragEvent) => {
      if (hasFilePayload(e.dataTransfer)) e.preventDefault()
    }
    const drop = (e: globalThis.DragEvent) => {
      if (hasFilePayload(e.dataTransfer)) e.preventDefault()
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])

  const slashCtx: SlashContext = {
    activeProjectId: composerProject?.id ?? null,
    activeSession,
    permissionMode,
    model,
    models,
    newChat,
    setMode,
    setModel,
    setEffort,
    setSettingsOpen,
    deleteSession,
    renameSession,
    notify,
    copyLastReply() {
      const messages = activeSession?.messages ?? []
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        if (m.role === 'assistant' && !m.tool && m.content.trim()) {
          void navigator.clipboard.writeText(m.content).then(
            () => notify('已复制', 'success'),
            () => notify('复制失败', 'error'),
          )
          return true
        }
      }
      return false
    },
  }

  function pickFiles(accept: string) {
    const el = fileRef.current
    if (!el) return
    el.accept = accept
    el.value = ''
    el.click()
  }

  function addFiles(list: File[]) {
    if (!list.length) return
    const { ok, oversized } = partitionAttach(list)
    if (oversized) {
      notify(
        oversized === 1
          ? '有 1 个文件超过 10 MB，未添加'
          : `有 ${oversized} 个文件超过 10 MB，未添加`,
        'error',
      )
    }
    if (!ok.length) return
    setFiles((prev) => {
      const next: Attachment[] = []
      for (const file of ok) {
        const dup = prev.some(
          (f) => f.file.name === file.name && f.file.size === file.size,
        ) || next.some(
          (f) => f.file.name === file.name && f.file.size === file.size,
        )
        if (dup) continue
        next.push({
          id: uid('file'),
          file,
          preview: isImageFile(file) ? URL.createObjectURL(file) : null,
        })
      }
      return next.length ? [...prev, ...next] : prev
    })
  }

  function removeFile(id: string) {
    setFiles((prev) => {
      const hit = prev.find((f) => f.id === id)
      if (hit?.preview) URL.revokeObjectURL(hit.preview)
      return prev.filter((f) => f.id !== id)
    })
  }

  function clearDraft() {
    setDraft('')
    files.forEach((f) => {
      if (f.preview) URL.revokeObjectURL(f.preview)
    })
    setFiles([])
    setSlashDismissed(null)
    requestAnimationFrame(() => areaRef.current?.focus())
  }

  function applySlash(out: SlashOutcome, attach: File[]) {
    if (out.kind === 'none') return false
    if (out.kind === 'insert') {
      setDraft(out.text)
      setSlashDismissed(null)
      requestAnimationFrame(() => {
        const el = areaRef.current
        if (!el) return
        el.focus()
        const n = out.text.length
        el.setSelectionRange(n, n)
      })
      return true
    }
    if (out.kind === 'handled') {
      clearDraft()
      return true
    }
    if (isThinking) {
      enqueue(out.text)
      clearDraft()
      return true
    }
    send(out.text, attach)
    clearDraft()
    return true
  }

  function acceptSlash(cmd: SlashCommand) {
    if (!menuPhase) return
    applySlash(acceptSlashPick(cmd, menuPhase, slashCtx), files.map((f) => f.file))
  }

  function submit() {
    if (slashOpen && activeSlash) {
      acceptSlash(activeSlash)
      return
    }
    const names = files.map((f) => f.file.name)
    const attach = files.map((f) => f.file)
    const text = draft.trim()
    const slashOut = text.startsWith('/') ? resolveSlash(text, slashCtx) : { kind: 'none' as const }
    if (slashOut.kind !== 'none') {
      applySlash(slashOut, attach)
      return
    }
    const onlyImages = attach.length > 0 && attach.every(isImageFile)
    const payload =
      text || (names.length && !onlyImages ? `请查看附件：${names.join('、')}` : '')
    if (!payload && !attach.length) {
      if (isThinking) stopGeneration()
      return
    }
    if (isThinking) {
      if (!payload) return
      enqueue(payload)
      clearDraft()
      return
    }
    send(payload, attach)
    clearDraft()
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing || e.key === 'Process') return
    if (slashOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (!slashFlat.length) return
        setSlashIndex((slashIndex + 1) % slashFlat.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (!slashFlat.length) return
        setSlashIndex((slashIndex - 1 + slashFlat.length) % slashFlat.length)
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        if (activeSlash) acceptSlash(activeSlash)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashDismissed(menuPhase?.key ?? null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const incoming = filesFromClipboard(e.clipboardData)
    if (!incoming.length) return
    addFiles(incoming)
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (!text.trim()) e.preventDefault()
  }

  function onDragEnter(e: DragEvent<HTMLDivElement>) {
    if (!hasFilePayload(e.dataTransfer)) return
    e.preventDefault()
    setDragging(true)
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (!hasFilePayload(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    setDragging(false)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    if (!hasFilePayload(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    addFiles(filesFromDrop(e.dataTransfer))
  }

  const modeMeta =
    PERMISSION_MODES.find((m) => m.id === permissionMode) ?? PERMISSION_MODES[0]
  const modelMeta = models.find((m) => m.id === model) ?? models[0] ?? MODELS[0]
  const effortMeta = EFFORTS.find((e) => e.id === effort) ?? EFFORTS[2]
  const hasDraft = Boolean(draft.trim()) || files.length > 0
  const showStop = isThinking && !hasDraft
  const canClick = hasDraft || isThinking
  const waiting = outgoingQueue.filter(
    (q) => q.sessionId === (activeSession?.id ?? ''),
  )
  const q = projectQuery.trim().toLowerCase()
  const listed = q
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
      )
    : projects
  const branches = composerProject?.branches ?? []
  const showBranch =
    Boolean(composerProject?.branch) && branches.length > 0

  return (
    <div className="composer">
      {waiting.length > 0 ? (
        <div className="wait-list">
          <div className="wait-list-label">等候发送 · {waiting.length}</div>
          {waiting.map((item) => (
            <div key={item.id} className="wait-item">
              <p className="wait-text">{item.text}</p>
              <div className="wait-actions">
                <button
                  type="button"
                  onClick={() => sendQueued(item.id)}
                >
                  立即发送
                </button>
                <button
                  type="button"
                  onClick={() => {
                    dropQueued(item.id)
                    setDraft(item.text)
                    requestAnimationFrame(() => areaRef.current?.focus())
                  }}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => dropQueued(item.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="composer-stack">
        {slashOpen ? (
          <SlashMenu
            groups={slashGroups}
            activeId={activeSlash?.id ?? null}
            heads={menuPhase?.phase === 'args' || slashGroups.length > 1}
            empty={
              menuPhase?.phase === 'args' && menuPhase.cmd.complete === 'models'
                ? 'No matching models'
                : menuPhase?.phase === 'args' &&
                    menuPhase.cmd.complete === 'efforts'
                  ? 'No matching effort levels'
                  : 'No matching commands'
            }
            onHover={(id) => {
              const i = slashFlat.findIndex((c) => c.id === id)
              if (i >= 0) setSlashIndex(i)
            }}
            onPick={acceptSlash}
          />
        ) : null}
        <div
          className={dragging ? 'composer-box is-drop' : 'composer-box'}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onPaste={onPaste}
        >
          {dragging ? (
            <div className="composer-drop" aria-hidden="true">
              松开以添加文件
            </div>
          ) : null}
        <div className="composer-meta">
          <Popover
            align="up-left"
            menuClassName="chip-menu project-menu"
            trigger={({ open, toggle }) => (
              <div className={open ? 'chip is-open' : 'chip'}>
                {composerProject ? (
                  <button
                    type="button"
                    className="chip-lead"
                    aria-label="不在项目中工作"
                    title="不在项目中工作"
                    onClick={(e) => {
                      e.stopPropagation()
                      setWorkspaceProject(null)
                    }}
                  >
                    <IconFolder className="chip-lead-folder" />
                    <IconClose className="chip-lead-close" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="chip-main"
                  onClick={toggle}
                  aria-expanded={open}
                >
                  {composerProject ? null : <IconFolder />}
                  <span>{composerProject?.name ?? '选择项目'}</span>
                  <IconChevron />
                </button>
              </div>
            )}
          >
            {({ close }) => (
              <>
                <label className="project-search">
                  <IconSearch />
                  <input
                    value={projectQuery}
                    onChange={(e) => setProjectQuery(e.target.value)}
                    placeholder="搜索项目"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </label>
                <div className="project-list">
                  {listed.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="menuitem"
                      className={
                        p.id === composerProject?.id
                          ? 'project-row is-active'
                          : 'project-row'
                      }
                      onClick={() => {
                        setWorkspaceProject(p.id)
                        setProjectQuery('')
                        close()
                      }}
                    >
                      <IconFolder />
                      <span>{p.name}</span>
                      {p.id === composerProject?.id ? (
                        <IconCheck className="row-check" />
                      ) : null}
                    </button>
                  ))}
                  {listed.length === 0 ? (
                    <div className="project-empty">没有匹配的项目</div>
                  ) : null}
                </div>
                <div className="project-foot">
                  <button
                    type="button"
                    role="menuitem"
                    className="project-row"
                    onClick={() => {
                      setProjectQuery('')
                      close()
                      setProjectDialog(true)
                    }}
                  >
                    <IconPlus />
                    <span>新建项目</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="project-row"
                    onClick={() => {
                      setWorkspaceProject(null)
                      setProjectQuery('')
                      close()
                    }}
                  >
                    <IconClose />
                    <span>不在项目中工作</span>
                  </button>
                </div>
              </>
            )}
          </Popover>

          {showBranch && composerProject ? (
            <Popover
              align="up-left"
              menuClassName="chip-menu branch-menu"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  className="chip"
                  onClick={toggle}
                  aria-expanded={open}
                  title={`${composerProject.path} · ${composerProject.branch}`}
                >
                  <IconGitBranch />
                  <span>{composerProject.branch}</span>
                  <IconChevron />
                </button>
              )}
            >
              {({ close }) => (
                <>
                  <div className="branch-hint">当前仓库分支</div>
                  {branches.map((b) => (
                    <button
                      key={b}
                      type="button"
                      role="menuitem"
                      className={
                        b === composerProject.branch
                          ? 'project-row is-active'
                          : 'project-row'
                      }
                      onClick={() => {
                        if (b !== composerProject.branch) {
                          setBranch(b)
                        }
                        close()
                      }}
                    >
                      <IconGitBranch />
                      <span>{b}</span>
                      {b === composerProject.branch ? (
                        <IconCheck className="row-check" />
                      ) : null}
                    </button>
                  ))}
                </>
              )}
            </Popover>
          ) : null}
        </div>

        {files.length > 0 ? (
          <div className="attach-row">
            {files.map((item) => {
              const ext = extOf(item.file.name)
              return (
                <div key={item.id} className="attach-card">
                  <button
                    type="button"
                    className="attach-remove"
                    aria-label={`移除 ${item.file.name}`}
                    onClick={() => removeFile(item.id)}
                  >
                    <IconClose />
                  </button>
                  <div className="attach-preview">
                    {item.preview ? (
                      <img src={item.preview} alt="" />
                    ) : (
                      <IconFile />
                    )}
                  </div>
                  <div className="attach-name">
                    <span className={`attach-ext tone-${extTone(ext)}`}>
                      {ext.slice(0, 3) || 'file'}
                    </span>
                    <span className="attach-label">{item.file.name}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}

        <input
          ref={fileRef}
          className="sr-only"
          type="file"
          multiple
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />

        <label className="sr-only" htmlFor={formId}>
          给 Grok 的指令
        </label>
        <textarea
          id={formId}
          ref={areaRef}
          rows={1}
          value={draft}
          placeholder="随心输入"
          onChange={(e) => {
            setDraft(e.target.value)
            setSlashDismissed(null)
          }}
          onKeyDown={onKey}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={slashOpen}
          aria-controls="slash-menu"
          aria-activedescendant={
            slashOpen && activeSlash ? `slash-${activeSlash.id}` : undefined
          }
        />
        <div className="composer-bar">
          <div className="bar-left">
            <Popover
              trigger={({ toggle }) => (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="添加附件"
                  onClick={toggle}
                >
                  <IconPlus />
                </button>
              )}
            >
              {({ close }) => (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close()
                      pickFiles('*/*')
                    }}
                  >
                    添加文件
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close()
                      pickFiles('image/*')
                    }}
                  >
                    添加图片
                  </button>
                </>
              )}
            </Popover>

            <Popover
              menuClassName="mode-menu"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  className={
                    permissionMode === 'always-approve'
                      ? 'mode-chip is-danger'
                      : 'mode-chip'
                  }
                  onClick={toggle}
                  aria-expanded={open}
                >
                  <IconShield />
                  {modeMeta.label}
                </button>
              )}
            >
              {({ close }) => (
                <>
                  {PERMISSION_MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="menuitem"
                      className={m.id === permissionMode ? 'is-active' : ''}
                      onClick={() => {
                        setMode(m.id)
                        close()
                      }}
                    >
                      <strong>{m.label}</strong>
                      <em>{m.hint}</em>
                    </button>
                  ))}
                </>
              )}
            </Popover>
          </div>

          <div className="bar-right">
            <div className="model-cluster">
              <ContextRing usage={contextUsage} />
              <Popover
                menuClassName="model-menu"
                trigger={({ open, toggle }) => (
                  <button
                    type="button"
                    className="model-chip"
                    onClick={toggle}
                    aria-expanded={open}
                  >
                    {modelMeta.label}
                    <span className="effort-tag">{effortMeta.label}</span>
                    <IconChevron />
                  </button>
                )}
              >
                {({ close }) => (
                  <ModelMenu close={close} />
                )}
              </Popover>
            </div>
            <button
              type="button"
              className={showStop ? 'send-btn is-stop' : 'send-btn'}
              aria-label={showStop ? '暂停' : isThinking ? '加入等候' : '发送'}
              disabled={!canClick}
              onClick={submit}
            >
              {showStop ? <IconStop /> : <IconSend />}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
