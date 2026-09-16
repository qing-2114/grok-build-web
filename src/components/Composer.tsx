import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
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
import { uid } from '../lib/uid'
import { EFFORTS, MODELS, PERMISSION_MODES } from '../types'
import { useWorkspace } from '../workspace'
import { Popover } from './Popover'

type Attachment = {
  id: string
  file: File
  preview: string | null
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
    activeProject,
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
    setWorkspaceProject,
    setBranch,
    setProjectDialog,
    models,
  } = useWorkspace()

  const [draft, setDraft] = useState('')
  const [projectQuery, setProjectQuery] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef(files)
  filesRef.current = files
  const formId = useId()

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

  function pickFiles(accept: string) {
    const el = fileRef.current
    if (!el) return
    el.accept = accept
    el.value = ''
    el.click()
  }

  function onFilesPicked(list: FileList | null) {
    if (!list?.length) return
    const next: Attachment[] = []
    for (const file of Array.from(list)) {
      const dup = files.some((f) => f.file.name === file.name && f.file.size === file.size)
      if (dup) continue
      const image = file.type.startsWith('image/')
      next.push({
        id: uid('file'),
        file,
        preview: image ? URL.createObjectURL(file) : null,
      })
    }
    if (next.length) setFiles((prev) => [...prev, ...next])
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
    requestAnimationFrame(() => areaRef.current?.focus())
  }

  function submit() {
    const names = files.map((f) => f.file.name)
    const text = draft.trim()
    const payload =
      text || (names.length ? `请查看附件：${names.join('、')}` : '')
    if (!payload) {
      if (isThinking) stopGeneration()
      return
    }
    if (isThinking) {
      enqueue(payload)
      clearDraft()
      return
    }
    send(
      payload,
      files.map((f) => f.file),
    )
    clearDraft()
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
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
  const branches = activeProject?.branches ?? []
  const showBranch =
    Boolean(activeProject?.branch) && branches.length > 0

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
      <div className="composer-box">
        <div className="composer-meta">
          <Popover
            align="up-left"
            menuClassName="chip-menu project-menu"
            trigger={({ open, toggle }) => (
              <div className={open ? 'chip is-open' : 'chip'}>
                {activeProject ? (
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
                  {activeProject ? null : <IconFolder />}
                  <span>{activeProject?.name ?? '选择项目'}</span>
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
                        p.id === activeProject?.id
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
                      {p.id === activeProject?.id ? (
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

          {showBranch && activeProject ? (
            <Popover
              align="up-left"
              menuClassName="chip-menu branch-menu"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  className="chip"
                  onClick={toggle}
                  aria-expanded={open}
                  title={`${activeProject.path} · ${activeProject.branch}`}
                >
                  <IconGitBranch />
                  <span>{activeProject.branch}</span>
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
                        b === activeProject.branch
                          ? 'project-row is-active'
                          : 'project-row'
                      }
                      onClick={() => {
                        if (b !== activeProject.branch) {
                          setBranch(b)
                        }
                        close()
                      }}
                    >
                      <IconGitBranch />
                      <span>{b}</span>
                      {b === activeProject.branch ? (
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
            onFilesPicked(e.target.files)
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
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
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
  )
}
