import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  IconClose,
  IconDots,
  IconFolder,
  IconFolderPlus,
  IconNewChat,
  IconPencil,
  IconSearch,
  IconTrash,
} from '../icons'
import { SIDEBAR_WIDTH_DEFAULT } from '../lib/layout'
import { relativeTime } from '../lib/time'
import { displayTitle } from '../lib/title'
import type { Project, Session } from '../types'
import { useWorkspace } from '../workspace'
import { Popover } from './Popover'
import { ResizeHandle } from './ResizeHandle'
import { UserMenu } from './UserMenu'

const PROJECT_SESSION_PREVIEW = 5

function SessionRow({
  session,
  override,
  active,
  thinking,
  unread,
  renaming,
  renameRef,
  onSelect,
  onDelete,
  onRenameStart,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: {
  session: Session
  override?: string
  active: boolean
  thinking: boolean
  unread: boolean
  renaming: { id: string; title: string } | null
  renameRef: RefObject<HTMLInputElement | null>
  onSelect: () => void
  onDelete: () => void
  onRenameStart: () => void
  onRenameChange: (title: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
}) {
  const label = displayTitle(session, override)
  if (renaming?.id === session.id) {
    return (
      <li className="session-row">
        <input
          ref={renameRef}
          className="session-rename"
          value={renaming.title}
          onChange={(e) => onRenameChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit()
            if (e.key === 'Escape') onRenameCancel()
          }}
          onBlur={onRenameCommit}
        />
      </li>
    )
  }
  return (
    <li className={thinking ? 'session-row is-busy' : 'session-row'}>
      <button
        type="button"
        className={
          active ? 'rail-item session-item is-active' : 'rail-item session-item'
        }
        aria-busy={thinking || undefined}
        onClick={onSelect}
        onContextMenu={(e) => {
          e.preventDefault()
          onRenameStart()
        }}
        title={relativeTime(session.updatedAt)}
      >
        <span className="rail-text">{label}</span>
      </button>
      {thinking ? (
        <span className="session-mark" aria-hidden="true">
          <i className="session-spinner" />
        </span>
      ) : unread ? (
        <span className="session-mark" aria-label="有新回复">
          <i className="session-unread" />
        </span>
      ) : null}
      <button
        type="button"
        className="session-delete"
        aria-label={`删除 ${label}`}
        title="删除会话"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        <IconClose />
      </button>
    </li>
  )
}

function ProjectMenu({
  project,
  close,
  onDeleteProject,
}: {
  project: Project
  close: () => void
  onDeleteProject: () => void
}) {
  const { setProjectDialog, deleteProjectChats } = useWorkspace()
  return (
    <>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          close()
          setProjectDialog(true, project.id)
        }}
      >
        <IconPencil />
        <span>编辑项目</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="is-danger"
        onClick={() => {
          close()
          deleteProjectChats(project.id)
        }}
      >
        <IconTrash />
        <span>删除所有聊天</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="is-danger"
        onClick={() => {
          close()
          onDeleteProject()
        }}
      >
        <IconTrash />
        <span>删除项目</span>
      </button>
    </>
  )
}

function DeleteProjectDialog({
  name,
  chatCount,
  onClose,
  onConfirm,
}: {
  name: string
  chatCount: number
  onClose: () => void
  onConfirm: (deleteChats: boolean) => void
}) {
  const [deleteChats, setDeleteChats] = useState(true)
  const cancelRef = useRef<HTMLButtonElement>(null)
  // onClose 是父组件每次渲染新建的箭头函数，放进 ref 让 effect 只跑一次，
  // 否则每次流式输出都会重新抢焦点。
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return createPortal(
    <div className="dialog-root is-confirm" role="presentation">
      <button
        type="button"
        className="scrim"
        aria-label="取消"
        onClick={onClose}
      />
      <div
        className="dialog is-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-project-title"
      >
        <header className="dialog-head">
          <h2 id="delete-project-title">删除项目</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </header>
        <p className="dialog-lead">
          确认删除「{name}」？此操作无法撤销。
        </p>
        <label className="dialog-check">
          <input
            type="checkbox"
            checked={deleteChats}
            onChange={(e) => setDeleteChats(e.target.checked)}
          />
          <span>
            同时删除该项目下所有会话
            {chatCount > 0 ? `（${chatCount}）` : ''}
          </span>
        </label>
        <footer className="dialog-foot">
          <button
            ref={cancelRef}
            type="button"
            className="btn-ghost"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="btn-solid is-danger"
            onClick={() => onConfirm(deleteChats)}
          >
            删除项目
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

export function Sidebar() {
  const {
    filteredProjects,
    filteredHistory,
    activeProjectId,
    activeSessionId,
    expandedProjectId,
    search,
    sidebarCollapsed,
    sidebarWidth,
    mobileNavOpen,
    setSearch,
    newChat,
    selectProject,
    selectSession,
    deleteSession,
    deleteProject,
    renameSession,
    setProjectDialog,
    toggleSidebar,
    setSidebarWidth,
    setMobileNav,
    titleOverrides,
    thinkingIds,
    unreadIds,
  } = useWorkspace()

  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(
    null,
  )
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    name: string
    chatCount: number
  } | null>(null)
  const [sessionMoreByProject, setSessionMoreByProject] = useState<
    Record<string, boolean>
  >({})

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    if (renaming) renameRef.current?.select()
  }, [renaming])

  const collapsed = sidebarCollapsed && !mobileNavOpen
  const q = search.trim()

  function sessionsFor(project: Project): Session[] {
    return filteredHistory.filter((s) => s.projectId === project.id)
  }

  const looseSessions = filteredHistory.filter((s) => !s.projectId)

  function commitRename() {
    if (!renaming) return
    renameSession(renaming.id, renaming.title)
    setRenaming(null)
  }

  return (
    <aside
      className={[
        'sidebar',
        collapsed ? 'is-collapsed' : '',
        mobileNavOpen ? 'is-open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="sidebar-top">
        <div className="brand">
          <div className="brand-btn" title="Grok Build">
            <span className="brand-mark">G</span>
            <span className="brand-name">Grok</span>
          </div>
        </div>
        <div className="sidebar-tools">
          <button
            type="button"
            className={searchOpen ? 'icon-btn is-active' : 'icon-btn'}
            aria-label={searchOpen ? '收起搜索' : '搜索会话'}
            aria-pressed={searchOpen}
            title={searchOpen ? '收起搜索' : '搜索会话'}
            onClick={() => {
              if (searchOpen) {
                setSearch('')
                setSearchOpen(false)
                return
              }
              if (collapsed) toggleSidebar()
              setSearchOpen(true)
            }}
          >
            <IconSearch />
          </button>
          <button
            type="button"
            className="icon-btn mobile-only"
            aria-label="关闭侧栏"
            onClick={() => setMobileNav(false)}
          >
            <IconClose />
          </button>
        </div>
      </div>

      {searchOpen && !collapsed ? (
        <div className="search-wrap">
          <IconSearch />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索项目和会话"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearch('')
                setSearchOpen(false)
              }
            }}
          />
        </div>
      ) : null}

      <nav className="nav-actions">
        <button
          type="button"
          className="nav-item"
          onClick={() => newChat(null)}
          title="新建对话"
        >
          <IconNewChat />
          <span>新建对话</span>
        </button>
        <button
          type="button"
          className="nav-item"
          onClick={() => setProjectDialog(true)}
          title="新建项目"
        >
          <IconFolderPlus />
          <span>新建项目</span>
        </button>
      </nav>

      <div className="sidebar-scroll">
        <section className="rail-section">
          <div className="rail-label">
            <span>项目</span>
            <button
              type="button"
              className="label-plus rail-hint"
              aria-label="新建项目"
              data-hint="新建项目"
              onClick={() => setProjectDialog(true)}
            >
              <IconFolderPlus />
            </button>
          </div>
          <ul className="rail-list">
            {filteredProjects.map((project) => {
              const chats = sessionsFor(project)
              const expanded =
                Boolean(q) || expandedProjectId === project.id
              const searching = Boolean(q)
              const showAllSessions =
                searching || Boolean(sessionMoreByProject[project.id])
              const visibleChats =
                showAllSessions || chats.length <= PROJECT_SESSION_PREVIEW
                  ? chats
                  : chats.slice(0, PROJECT_SESSION_PREVIEW)
              const hiddenCount = chats.length - PROJECT_SESSION_PREVIEW
              return (
                <li
                  key={project.id}
                  className={
                    expanded ? 'project-block is-open' : 'project-block'
                  }
                >
                  <div
                    className={
                      project.id === activeProjectId
                        ? 'project-head is-active'
                        : 'project-head'
                    }
                    onContextMenu={(e) => {
                      e.preventDefault()
                      const btn = e.currentTarget.querySelector<HTMLButtonElement>(
                        'button[aria-label$="更多"]',
                      )
                      if (btn && !btn.classList.contains('is-open')) btn.click()
                    }}
                  >
                    <button
                      type="button"
                      className="rail-item project-toggle"
                      onClick={() => selectProject(project.id)}
                      title={project.path}
                      aria-expanded={expanded}
                    >
                      <IconFolder />
                      <span className="rail-text">{project.name}</span>
                    </button>
                    <div className="project-actions">
                      <Popover
                        align="down-right"
                        portal
                        menuClassName="session-menu"
                        trigger={({ open, toggle }) => (
                          <button
                            type="button"
                            className={
                              open ? 'project-icon-btn is-open' : 'project-icon-btn'
                            }
                            aria-label={`${project.name} 更多`}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggle()
                            }}
                          >
                            <IconDots />
                          </button>
                        )}
                      >
                        {({ close }) => (
                          <ProjectMenu
                            project={project}
                            close={close}
                            onDeleteProject={() =>
                              setPendingDelete({
                                id: project.id,
                                name: project.name,
                                chatCount: chats.length,
                              })
                            }
                          />
                        )}
                      </Popover>
                      <button
                        type="button"
                        className="project-icon-btn rail-hint"
                        aria-label={`在 ${project.name} 新建会话`}
                        data-hint="新建会话"
                        onClick={(e) => {
                          e.stopPropagation()
                          newChat(project.id)
                        }}
                      >
                        <IconNewChat />
                      </button>
                    </div>
                  </div>
                  {expanded ? (
                    <ul className="project-chats">
                      {visibleChats.map((session) => (
                        <SessionRow
                          key={session.id}
                          session={session}
                          override={titleOverrides[session.id]}
                          active={session.id === activeSessionId}
                          thinking={thinkingIds.includes(session.id)}
                          unread={unreadIds.includes(session.id)}
                          renaming={renaming}
                          renameRef={renameRef}
                          onSelect={() => selectSession(session.id)}
                          onDelete={() => deleteSession(session.id)}
                          onRenameStart={() =>
                            setRenaming({
                              id: session.id,
                              title: displayTitle(
                                session,
                                titleOverrides[session.id],
                              ),
                            })
                          }
                          onRenameChange={(title) =>
                            setRenaming({ id: session.id, title })
                          }
                          onRenameCommit={commitRename}
                          onRenameCancel={() => setRenaming(null)}
                        />
                      ))}
                      {chats.length === 0 ? (
                        <li className="rail-empty">还没有会话</li>
                      ) : null}
                      {!searching && hiddenCount > 0 ? (
                        <li>
                          <button
                            type="button"
                            className="session-more"
                            aria-expanded={Boolean(
                              sessionMoreByProject[project.id],
                            )}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSessionMoreByProject((prev) => ({
                                ...prev,
                                [project.id]: !prev[project.id],
                              }))
                            }}
                          >
                            {sessionMoreByProject[project.id]
                              ? '收起'
                              : `显示更多（${hiddenCount}）`}
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </li>
              )
            })}
            {filteredProjects.length === 0 ? (
              <li className="rail-empty">没有匹配的项目</li>
            ) : null}
          </ul>
        </section>

        {looseSessions.length > 0 ? (
          <section className="rail-section">
            <div className="rail-label">
              <span>最近</span>
            </div>
            <ul className="rail-list">
              {looseSessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  override={titleOverrides[session.id]}
                  active={session.id === activeSessionId}
                  thinking={thinkingIds.includes(session.id)}
                  unread={unreadIds.includes(session.id)}
                  renaming={renaming}
                  renameRef={renameRef}
                  onSelect={() => selectSession(session.id)}
                  onDelete={() => deleteSession(session.id)}
                  onRenameStart={() =>
                    setRenaming({
                      id: session.id,
                      title: displayTitle(
                        session,
                        titleOverrides[session.id],
                      ),
                    })
                  }
                  onRenameChange={(title) =>
                    setRenaming({ id: session.id, title })
                  }
                  onRenameCommit={commitRename}
                  onRenameCancel={() => setRenaming(null)}
                />
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <footer className="sidebar-foot">
        <UserMenu />
      </footer>
      {!collapsed ? (
        <ResizeHandle
          label="调整左侧栏宽度"
          value={sidebarWidth}
          fallback={SIDEBAR_WIDTH_DEFAULT}
          onChange={setSidebarWidth}
        />
      ) : null}
      {pendingDelete ? (
        <DeleteProjectDialog
          name={pendingDelete.name}
          chatCount={pendingDelete.chatCount}
          onClose={() => setPendingDelete(null)}
          onConfirm={(deleteChats) => {
            const id = pendingDelete.id
            setPendingDelete(null)
            deleteProject(id, deleteChats)
          }}
        />
      ) : null}
    </aside>
  )
}
