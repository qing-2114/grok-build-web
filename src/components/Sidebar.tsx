import { useEffect, useRef, useState, type RefObject } from 'react'
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
import { relativeTime } from '../lib/time'
import { displayTitle } from '../lib/title'
import type { Project, Session } from '../types'
import { useWorkspace } from '../workspace'
import { Popover } from './Popover'
import { UserMenu } from './UserMenu'

function SessionRow({
  session,
  override,
  active,
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
    <li className="session-row">
      <button
        type="button"
        className={
          active ? 'rail-item session-item is-active' : 'rail-item session-item'
        }
        onClick={onSelect}
        onContextMenu={(e) => {
          e.preventDefault()
          onRenameStart()
        }}
        title={relativeTime(session.updatedAt)}
      >
        <span className="rail-text">{label}</span>
      </button>
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

export function Sidebar() {
  const {
    filteredProjects,
    filteredHistory,
    activeProjectId,
    activeSessionId,
    expandedProjectId,
    search,
    sidebarCollapsed,
    mobileNavOpen,
    setSearch,
    newChat,
    selectProject,
    selectSession,
    deleteSession,
    deleteProjectChats,
    renameSession,
    setProjectDialog,
    toggleSidebar,
    setMobileNav,
    titleOverrides,
  } = useWorkspace()

  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(
    null,
  )

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
          onClick={() => newChat()}
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
                              编辑项目
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
                              删除所有聊天
                            </button>
                          </>
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
                      {chats.map((session) => (
                        <SessionRow
                          key={session.id}
                          session={session}
                          override={titleOverrides[session.id]}
                          active={session.id === activeSessionId}
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
    </aside>
  )
}
