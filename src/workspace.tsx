import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  answerPermission,
  cancelSession,
  checkoutGit,
  createRemoteSession,
  deleteRemoteSession,
  fetchContextUsage,
  fetchGit,
  fetchSessions,
  fetchSessionTitle,
  fetchStatus,
  filesToPrompt,
  isGrokSessionId,
  loadRemoteSession,
  promptSession,
  setRemoteConfig,
  type AgentModel,
  type PromptFile,
} from './lib/agent'
import { looksLikeHtml, isWebUrl } from './lib/paths'
import { loadState, saveState, type Persisted } from './lib/storage'
import { displayTitle } from './lib/title'
import { uid } from './lib/uid'
import {
  chatImagesToFiles,
  filesToChatImages,
  isImageFile,
  stripImageTokens,
} from './lib/images'
import { downloadText, safeFileName, sessionToMarkdown } from './lib/export'
import {
  requestNotifications,
  setTitleBadge,
  showNotification,
} from './lib/notify'
import { openExternal, revealInExplorer as revealPath } from './lib/fs'
import { fileManagerName } from './lib/platform'

import { MODELS } from './types'
import type {
  ChatImage,
  EffortLevel,
  PermissionMode,
  Profile,
  Project,
  RightPanel,
  Session,
} from './types'
import {
  initialState,
  isAbortError,
  projectForSession,
  reducer,
  resolveFromState,
  sessionOpenContext,
  visibleSessions,
  SAVE_DEBOUNCE_MS,
  type SettingsPage,
  type WorkspaceState,
} from './workspace-state'
type WorkspaceDerived = {
  rightPanel: RightPanel
  previewPath: string | null
  activeProject: Project | null
  composerProject: Project | null
  activeSession: Session | null
  history: Session[]
  filteredHistory: Session[]
  filteredProjects: Project[]
  isThinking: boolean
  isHydrating: boolean
  models: AgentModel[]
  sessionCwd: string
}

type WorkspaceActions = {
  newChat: (projectId?: string | null) => void
  selectProject: (id: string) => void
  selectSession: (id: string) => void
  addProject: (input: { name: string; path: string; branch?: string }) => void
  updateProject: (input: { id: string; name: string; path: string }) => void
  deleteProjectChats: (id: string) => void
  deleteProject: (id: string, deleteChats?: boolean) => void
  setWorkspaceProject: (id: string | null) => void
  setBranch: (branch: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  send: (
    text: string,
    files?: File[],
    targetSessionId?: string,
  ) => Promise<boolean>
  enqueue: (text: string, files?: File[]) => void
  dropQueued: (id: string) => void
  sendQueued: (id: string) => void
  stopGeneration: () => void
  setSearch: (search: string) => void
  setMode: (mode: PermissionMode) => void
  setModel: (model: string) => void
  setEffort: (effort: EffortLevel) => void
  toggleSidebar: () => void
  setMobileNav: (open: boolean) => void
  setProjectDialog: (open: boolean, editId?: string | null) => void
  setSettingsOpen: (open: boolean, page?: SettingsPage) => void
  setProfile: (profile: Profile) => void
  refreshAgent: () => Promise<void>
  notify: (message: string, kind?: 'info' | 'success' | 'error') => void
  resolvePermission: (optionId: string | null) => void
  toggleRightRail: () => void
  openRightPanel: (panel: RightPanel) => void
  setRightPanel: (panel: RightPanel) => void
  closeRightRail: () => void
  openLocalFile: (path: string) => void
  openExternalUrl: (url: string) => void
  revealInExplorer: (path: string) => void
  setPreviewPath: (path: string | null) => void
  selectRightTab: (id: string) => void
  closeRightTab: (id: string) => void
  addRightTab: () => void
  setTerminalShell: (id: string) => void
  setSidebarWidth: (width: number) => void
  setRightRailWidth: (width: number) => void
  /** 把这条用户消息（文字 + 图片）放回输入框 */
  editMessage: (messageId: string) => void
  /** 重新发送当前会话最后一条用户消息 */
  retryLast: () => void
  exportSession: (id?: string) => void
  setNotifyDone: (on: boolean) => void
  setPaletteOpen: (open: boolean) => void
}

export type WorkspaceApi = WorkspaceState & WorkspaceDerived & WorkspaceActions

// 上下文里放的是一个不变的 store，而不是整份 api：流式输出时每个 token 都会让
// api 换新，如果直接塞进 context，所有 useWorkspace() 的组件都会跟着重渲染。
// 组件用 useWorkspace('a', 'b') 只订阅自己读的字段，字段没变就不会重渲染。
type WorkspaceStore = {
  current: WorkspaceApi
  listeners: Set<() => void>
  subscribe: (fn: () => void) => () => void
}

const WorkspaceContext = createContext<WorkspaceStore | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const stateRef = useRef(state)
  stateRef.current = state
  const timers = useRef<number[]>([])
  const toastTimer = useRef(0)
  const loadGen = useRef(0)
  const promptAbort = useRef(new Map<string, AbortController>())
  const userAbort = useRef(new Set<string>())
  const pendingSave = useRef<Persisted | null>(null)
  const saveTimer = useRef(0)
  const queuedSending = useRef(new Set<string>())

  useEffect(() => {
    pendingSave.current = {
      projects: state.projects,
      activeProjectId: state.activeProjectId,
      activeSessionId: isGrokSessionId(state.activeSessionId ?? '')
        ? state.activeSessionId
        : null,
      permissionMode: state.permissionMode,
      model: state.model,
      effort: state.effort,
      profile: state.profile,
      titleOverrides: state.titleOverrides,
      terminalShellId: state.terminalShellId,
      sidebarWidth: state.sidebarWidth,
      rightRailWidth: state.rightRailWidth,
      notifyDone: state.notifyDone,
    }
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const next = pendingSave.current
      pendingSave.current = null
      if (next) saveState(next)
    }, SAVE_DEBOUNCE_MS)
  }, [
    state.projects,
    state.activeProjectId,
    state.activeSessionId,
    state.permissionMode,
    state.model,
    state.effort,
    state.profile,
    state.titleOverrides,
    state.terminalShellId,
    state.sidebarWidth,
    state.rightRailWidth,
    state.notifyDone,
  ])

  const notify = useCallback(
    (message: string, kind: 'info' | 'success' | 'error' = 'info') => {
      window.clearTimeout(toastTimer.current)
      dispatch({
        type: 'toast',
        toast: { id: uid('toast'), text: message, kind },
      })
      toastTimer.current = window.setTimeout(
        () => dispatch({ type: 'toast', toast: null }),
        3200,
      )
    },
    [],
  )

  // 不在前台时累计的提醒数，切回前台清零；和未读会话、待批准一起显示在标题角标上。
  const attention = useRef(0)
  const selectRef = useRef<(id: string) => void>(() => undefined)
  const updateBadge = useCallback(() => {
    const snap = stateRef.current
    setTitleBadge(
      snap.unreadIds.length + (snap.permissionRequest ? 1 : 0) + attention.current,
    )
  }, [])

  useEffect(() => {
    updateBadge()
  }, [state.unreadIds, state.permissionRequest, updateBadge])

  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return
      attention.current = 0
      updateBadge()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [updateBadge])

  const alertUser = useCallback(
    (kind: 'done' | 'error' | 'permission', sid: string, detail?: string) => {
      const snap = stateRef.current
      const away = document.hidden || snap.activeSessionId !== sid
      if (!away) return
      if (document.hidden) {
        attention.current += 1
        updateBadge()
      }
      if (!snap.notifyDone) return
      const session = snap.sessions.find((s) => s.id === sid)
      const title = session
        ? displayTitle(session, snap.titleOverrides[sid])
        : 'Grok Build'
      const body =
        kind === 'permission'
          ? `等待批准：${detail || '工具调用'}`
          : kind === 'error'
            ? '这一轮出错了'
            : '回复已完成'
      showNotification(title, body, `${sid}:${kind}`, () => selectRef.current(sid))
    },
    [updateBadge],
  )

  const refreshGit = useCallback(async (projects: Project[]) => {
    await Promise.all(
      projects.map(async (p) => {
        if (!p.path) return
        try {
          const info = await fetchGit(p.path)
          dispatch({
            type: 'set-project-git',
            id: p.id,
            branch: info.isRepo ? info.branch : '',
            branches: info.isRepo ? info.branches : [],
          })
        } catch {
          dispatch({
            type: 'set-project-git',
            id: p.id,
            branch: '',
            branches: [],
          })
        }
      }),
    )
  }, [])

  const hydrate = useCallback(async (session: Session) => {
    if (session.source !== 'grok' || session.messages.length > 0) return
    const gen = ++loadGen.current
    dispatch({ type: 'set-hydrating', id: session.id })
    try {
      const loaded = await loadRemoteSession(session.id, session.cwd || '')
      if (gen !== loadGen.current) return
      dispatch({
        type: 'hydrate-session',
        sessionId: session.id,
        messages: loaded.messages,
        title: loaded.title,
        plan: loaded.plan,
      })
    } catch (err) {
      if (gen !== loadGen.current) return
      dispatch({ type: 'set-hydrating', id: null })
      notify(err instanceof Error ? err.message : '载入会话失败', 'error')
    }
  }, [notify])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const status = await fetchStatus()
        if (cancelled) return
        if (!status.connected) {
          dispatch({
            type: 'set-connection',
            connection: 'error',
            error: status.error || '本机 Grok Build 未连接',
            version: status.version,
            home: status.home,
          })
          return
        }
        dispatch({
          type: 'set-connection',
          connection: 'connected',
          error: null,
          version: status.version,
          home: status.home,
        })
        dispatch({
          type: 'set-agent-models',
          models: status.models,
          currentModelId: status.currentModelId,
        })
        const remote = await fetchSessions()
        if (cancelled) return
        dispatch({ type: 'merge-remote', sessions: remote })
        const storedId = loadState()?.activeSessionId
        if (storedId && remote.some((s) => s.id === storedId)) {
          const hit = remote.find((s) => s.id === storedId)
          dispatch({ type: 'select-session', id: storedId })
          if (hit) {
            void hydrate({
              id: hit.id,
              title: hit.title,
              projectId: null,
              cwd: hit.cwd,
              createdAt: hit.updatedAt,
              updatedAt: hit.updatedAt,
              messages: [],
              source: 'grok',
            })
          }
        }
        await refreshGit(stateRef.current.projects)
      } catch (err) {
        if (cancelled) return
        dispatch({
          type: 'set-connection',
          connection: 'error',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hydrate, refreshGit])

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t))
      window.clearTimeout(saveTimer.current)
      const next = pendingSave.current
      pendingSave.current = null
      if (next) saveState(next)
    }
  }, [])

  const activeProject =
    state.projects.find((p) => p.id === state.activeProjectId) ?? null
  const activeSession =
    state.sessions.find((s) => s.id === state.activeSessionId) ?? null
  const composerProject = projectForSession(state.projects, activeSession)
  const sessionCwd =
    activeSession?.cwd || composerProject?.path || state.homeDir || ''
  const activeRightTab =
    state.rightTabs.find((t) => t.id === state.activeRightTabId) ?? null
  const previewPath =
    activeRightTab?.kind === 'file' ? activeRightTab.path : null
  const rightPanel: RightPanel = !state.rightRailOpen
    ? 'idle'
    : !activeRightTab
      ? 'idle'
      : activeRightTab.kind === 'file'
        ? 'files'
        : activeRightTab.kind

  useEffect(() => {
    const session = stateRef.current.sessions.find(
      (s) => s.id === state.activeSessionId,
    )
    if (!session) return
    const project = projectForSession(stateRef.current.projects, session)
    if (project?.path) void refreshGit([project])
  }, [state.activeSessionId, refreshGit])
  const history = useMemo(
    () => visibleSessions(state.sessions),
    [state.sessions],
  )

  const q = state.search.trim().toLowerCase()
  const filteredHistory = useMemo(() => {
    if (!q) return history
    return history.filter((s) => {
      const project = state.projects.find((p) => p.id === s.projectId)
      const title = displayTitle(s, state.titleOverrides[s.id])
      return (
        title.toLowerCase().includes(q) ||
        (project?.name.toLowerCase().includes(q) ?? false)
      )
    })
  }, [history, q, state.projects, state.titleOverrides])

  const filteredProjects = useMemo(() => {
    if (!q) return state.projects
    return state.projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
    )
  }, [q, state.projects])

  const models = state.agentModels.length ? state.agentModels : MODELS

  const thinkingActive = Boolean(
    state.activeSessionId &&
      state.thinkingIds.includes(state.activeSessionId),
  )
  const activeContextId = state.activeSessionId
  const activeContextCwd = activeSession?.cwd ?? ''

  useEffect(() => {
    if (!activeContextId || !isGrokSessionId(activeContextId)) {
      dispatch({ type: 'set-context-usage', usage: null })
      return
    }
    const sessionId = activeContextId
    const cwd = activeContextCwd
    let cancelled = false
    const pull = () => {
      void fetchContextUsage(sessionId, cwd)
        .then((usage) => {
          if (cancelled) return
          dispatch({
            type: 'set-context-usage',
            usage: { sessionId, ...usage },
          })
        })
        .catch(() => undefined)
    }
    pull()
    // 标签页在后台时不读 signals.json；切回前台立刻补一次。
    const timer = thinkingActive
      ? window.setInterval(() => {
          if (!document.hidden) pull()
        }, 1600)
      : 0
    const onVisible = () => {
      if (!document.hidden) pull()
    }
    if (thinkingActive) document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      if (timer) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [activeContextId, activeContextCwd, thinkingActive])

  const send = useCallback(
    async (
      text: string,
      files?: File[],
      targetSessionId?: string,
    ): Promise<boolean> => {
      const snap = stateRef.current
      if (snap.connection !== 'connected') {
        notify('本机 Grok Build 未连接', 'error')
        return false
      }
      const target = targetSessionId ?? snap.activeSessionId
      const session = target
        ? (snap.sessions.find((s) => s.id === target) ?? null)
        : null
      if (!session) {
        notify('会话已失效，请重新选择', 'error')
        return false
      }
      if (snap.hydratingId === session.id) {
        notify('会话正在载入，请稍候', 'error')
        return false
      }
      // 发送是用户手势，借这个时机申请一次通知权限（只在还没决定时弹）。
      if (snap.notifyDone) void requestNotifications()
      const imageFiles = (files ?? []).filter(isImageFile)
      const otherFiles = (files ?? []).filter((f) => !isImageFile(f))
      let images: ChatImage[] = []
      if (imageFiles.length) {
        try {
          images = await filesToChatImages(imageFiles)
        } catch (err) {
          notify(err instanceof Error ? err.message : '读取图片失败', 'error')
          return false
        }
      }
      const payload =
        text.trim() ||
        (otherFiles.length
          ? `请查看附件：${otherFiles.map((f) => f.name).join('、')}`
          : '')
      if (!payload && !files?.length) return false

      const projectId = session.projectId ?? snap.activeProjectId
      const project = projectId
        ? (snap.projects.find((p) => p.id === projectId) ?? null)
        : null
      const cwd =
        session.source === 'grok'
          ? session.cwd || project?.path || snap.homeDir
          : project?.path || snap.homeDir
      if (!cwd) {
        notify('请先选择项目文件夹', 'error')
        return false
      }

      let sessionId = session.id
      dispatch({ type: 'send', text: payload, images, sessionId })
      if (session.source !== 'grok') {
        try {
          const created = await createRemoteSession({
            cwd,
            permissionMode: snap.permissionMode,
            model: snap.model,
            effort: snap.effort,
          })
          dispatch({
            type: 'bind-remote',
            localId: sessionId,
            sessionId: created.sessionId,
            cwd,
            projectId: project?.id ?? null,
          })
          sessionId = created.sessionId
        } catch (err) {
          dispatch({ type: 'thinking', sessionId, on: false })
          notify(err instanceof Error ? err.message : '无法创建会话', 'error')
          return false
        }
      }
      const ac = new AbortController()
      promptAbort.current.get(sessionId)?.abort()
      promptAbort.current.set(sessionId, ac)
      let promptFiles: PromptFile[] = []
      try {
        promptFiles = files?.length ? await filesToPrompt(files) : []
      } catch (err) {
        if (promptAbort.current.get(sessionId) === ac) {
          promptAbort.current.delete(sessionId)
        }
        dispatch({ type: 'thinking', sessionId, on: false })
        notify(err instanceof Error ? err.message : '读取附件失败', 'error')
        return false
      }
      const titleCwd = cwd
      let streamError = false
      void promptSession(
        sessionId,
        { text: payload, files: promptFiles },
        (event) => {
          if (event.type === 'permission') {
            dispatch({
              type: 'set-permission',
              request: {
                requestId: event.requestId,
                title: event.title,
                options: event.options,
              },
            })
            alertUser('permission', sessionId, event.title)
            return
          }
          if (event.type === 'usage') {
            dispatch({
              type: 'patch-context-used',
              sessionId,
              used: event.used,
            })
            return
          }
          if (event.type === 'thought') return
          if (event.type === 'error') streamError = true
          dispatch({ type: 'stream', sessionId, event })
        },
        ac.signal,
      )
        .then(() => {
          if (!userAbort.current.has(sessionId)) {
            alertUser(streamError ? 'error' : 'done', sessionId)
          }
        })
        .catch((err: unknown) => {
          const aborted = userAbort.current.has(sessionId) || isAbortError(err)
          if (!aborted) {
            alertUser('error', sessionId)
            dispatch({
              type: 'stream',
              sessionId,
              event: {
                type: 'error',
                message: err instanceof Error ? err.message : String(err),
              },
            })
          }
        })
        .finally(() => {
          userAbort.current.delete(sessionId)
          if (promptAbort.current.get(sessionId) === ac) {
            promptAbort.current.delete(sessionId)
          }
          dispatch({ type: 'thinking', sessionId, on: false })
          dispatch({ type: 'set-permission', request: null })
          const sid = sessionId
          const pullTitle = () => {
            if (stateRef.current.titleOverrides[sid]) return
            void fetchSessionTitle(sid, titleCwd)
              .then((title) => {
                if (!title || stateRef.current.titleOverrides[sid]) return
                dispatch({ type: 'set-session-title', id: sid, title })
              })
              .catch(() => undefined)
          }
          pullTitle()
          const timer = window.setTimeout(() => {
            timers.current = timers.current.filter((t) => t !== timer)
            pullTitle()
          }, 1800)
          timers.current.push(timer)
        })
      return true
    },
    [notify, alertUser],
  )

  const actions = useMemo<WorkspaceActions>(() => ({
    newChat: (projectId) => dispatch({ type: 'new-chat', projectId }),
    selectProject: (id) => {
      const expanding = stateRef.current.expandedProjectId !== id
      dispatch({ type: 'select-project', id })
      if (!expanding) return
      const project = stateRef.current.projects.find((p) => p.id === id)
      if (project) {
        void refreshGit([project])
        if (project.path) {
          void fetchSessions(project.path)
            .then((sessions) =>
              dispatch({ type: 'merge-remote', sessions }),
            )
            .catch(() => undefined)
        }
      }
    },
    selectSession: (id) => {
      dispatch({ type: 'select-session', id })
      const session = stateRef.current.sessions.find((s) => s.id === id)
      if (!session) return
      void hydrate(session)
      const project = projectForSession(stateRef.current.projects, session)
      if (project) void refreshGit([project])
    },
    addProject: ({ name, path, branch }) => {
      const nextBranch = branch?.trim() ?? ''
      const project: Project = {
        id: uid('proj'),
        name: name.trim(),
        path: path.trim(),
        branch: nextBranch,
        branches: nextBranch ? [nextBranch] : [],
      }
      dispatch({ type: 'add-project', project })
      void refreshGit([project])
    },
    updateProject: ({ id, name, path }) => {
      dispatch({ type: 'update-project', id, name, path })
      const next = {
        ...(stateRef.current.projects.find((p) => p.id === id) ?? {
          id,
          branch: '',
          branches: [] as string[],
        }),
        name: name.trim(),
        path: path.trim(),
      }
      void refreshGit([next])
    },
    deleteProjectChats: (id) => {
      void (async () => {
        const targets = stateRef.current.sessions.filter((s) => s.projectId === id)
        await Promise.all(
          targets.map(async (s) => {
            if (!isGrokSessionId(s.id)) return
            try {
              await deleteRemoteSession(s.id)
            } catch {
              // keep going so the rest of the project can be cleared
            }
          }),
        )
        dispatch({ type: 'delete-project-chats', id })
        notify('已删除该项目下的会话', 'success')
      })()
    },
    deleteProject: (id, deleteChats = true) => {
      void (async () => {
        if (deleteChats) {
          const targets = stateRef.current.sessions.filter(
            (s) => s.projectId === id,
          )
          await Promise.all(
            targets.map(async (s) => {
              if (!isGrokSessionId(s.id)) return
              try {
                await deleteRemoteSession(s.id)
              } catch {
                // keep going so the project can still be removed
              }
            }),
          )
        }
        dispatch({ type: 'delete-project', id, deleteChats })
        notify(
          deleteChats ? '已删除项目及其会话' : '已删除项目',
          'success',
        )
      })()
    },
    setWorkspaceProject: (id) => dispatch({ type: 'set-workspace-project', id }),
    setBranch: (branch) => {
      void (async () => {
        const project = stateRef.current.projects.find(
          (p) => p.id === stateRef.current.activeProjectId,
        )
        if (!project) return
        try {
          const info = await checkoutGit(project.path, branch)
          dispatch({
            type: 'set-project-git',
            id: project.id,
            branch: info.branch,
            branches: info.branches,
          })
          notify(`已切换到 ${info.branch}`)
        } catch (err) {
          notify(err instanceof Error ? err.message : '切换分支失败', 'error')
        }
      })()
    },
    deleteSession: (id) => {
      void (async () => {
        if (isGrokSessionId(id)) {
          try {
            await deleteRemoteSession(id)
          } catch (err) {
            notify(err instanceof Error ? err.message : '删除失败', 'error')
            return
          }
        }
        dispatch({ type: 'delete-session', id })
        notify('已删除会话', 'success')
      })()
    },
    renameSession: (id, title) => dispatch({ type: 'rename-session', id, title }),
    send,
    enqueue: (text, files) => {
      const sessionId = stateRef.current.activeSessionId
      const payload = text.trim()
      const attach = files?.length ? files : undefined
      if (!sessionId || (!payload && !attach)) return
      dispatch({
        type: 'enqueue',
        item: {
          id: uid('wait'),
          sessionId,
          text: payload,
          files: attach,
        },
      })
    },
    dropQueued: (id) => dispatch({ type: 'dequeue', id }),
    sendQueued: (id) => {
      if (queuedSending.current.has(id)) return
      const item = stateRef.current.outgoingQueue.find((q) => q.id === id)
      if (!item) return
      queuedSending.current.add(id)
      void (async () => {
        try {
          const sid = item.sessionId
          if (!stateRef.current.sessions.some((s) => s.id === sid)) {
            dispatch({ type: 'dequeue', id })
            notify('会话已删除，无法发送', 'error')
            return
          }
          if (stateRef.current.thinkingIds.includes(sid)) {
            // Wait for the running turn instead of killing it.
            const start = Date.now()
            while (
              stateRef.current.thinkingIds.includes(sid) &&
              Date.now() - start < 8000
            ) {
              await new Promise((r) => window.setTimeout(r, 50))
            }
            if (stateRef.current.thinkingIds.includes(sid)) {
              notify('仍在生成中，稍后再试', 'error')
              return
            }
          }
          const ok = await send(item.text, item.files, sid)
          if (ok) dispatch({ type: 'dequeue', id })
        } finally {
          queuedSending.current.delete(id)
        }
      })()
    },
    stopGeneration: () => {
      const sid = stateRef.current.activeSessionId
      if (!sid || !stateRef.current.thinkingIds.includes(sid)) return
      const ac = promptAbort.current.get(sid)
      if (ac) {
        userAbort.current.add(sid)
        ac.abort()
      }
      if (isGrokSessionId(sid)) {
        void cancelSession(sid).catch(() => undefined)
      }
      dispatch({ type: 'thinking', sessionId: sid, on: false })
    },
    setSearch: (search) => dispatch({ type: 'set-search', search }),
    setMode: (mode) => dispatch({ type: 'set-mode', mode }),
    setModel: (model) => {
      dispatch({ type: 'set-model', model })
      const session = stateRef.current.sessions.find(
        (s) => s.id === stateRef.current.activeSessionId,
      )
      if (session?.source === 'grok') {
        void setRemoteConfig(session.id, { model }).catch((err: unknown) => {
          notify(err instanceof Error ? err.message : '切换模型失败', 'error')
        })
      }
    },
    setEffort: (effort) => {
      dispatch({ type: 'set-effort', effort })
      const session = stateRef.current.sessions.find(
        (s) => s.id === stateRef.current.activeSessionId,
      )
      if (session?.source === 'grok') {
        void setRemoteConfig(session.id, { effort }).catch((err: unknown) => {
          notify(err instanceof Error ? err.message : '切换思考强度失败', 'error')
        })
      }
    },
    toggleSidebar: () => dispatch({ type: 'toggle-sidebar' }),
    setMobileNav: (open) => dispatch({ type: 'set-mobile-nav', open }),
    setProjectDialog: (open, editId) =>
      dispatch({ type: 'set-project-dialog', open, editId }),
    setSettingsOpen: (open, page) => dispatch({ type: 'set-settings', open, page }),
    setProfile: (profile) => dispatch({ type: 'set-profile', profile }),
    refreshAgent: async () => {
      try {
        const status = await fetchStatus()
        if (!status.connected) {
          dispatch({
            type: 'set-connection',
            connection: 'error',
            error: status.error || '本机 Grok Build 未连接',
            version: status.version,
            home: status.home,
          })
        } else {
          dispatch({
            type: 'set-connection',
            connection: 'connected',
            error: null,
            version: status.version,
            home: status.home,
          })
        }
        dispatch({
          type: 'set-agent-models',
          models: status.models,
          currentModelId: status.currentModelId,
        })
      } catch (err) {
        dispatch({
          type: 'set-connection',
          connection: 'error',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
    notify,
    toggleRightRail: () => dispatch({ type: 'toggle-right-rail' }),
    openRightPanel: (panel) => dispatch({ type: 'open-right-panel', panel }),
    setRightPanel: (panel) => dispatch({ type: 'set-right-panel', panel }),
    closeRightRail: () => dispatch({ type: 'set-right-rail', open: false }),
    openLocalFile: (path) => {
      const next = path.trim()
      if (!next) return
      if (isWebUrl(next)) return
      dispatch({
        type: 'open-file',
        path: resolveFromState(stateRef.current, next),
      })
    },
    openExternalUrl: (url) => {
      const target = url.trim()
      if (!target) return
      if (isWebUrl(target)) {
        void openExternal(target).catch((err: unknown) => {
          notify(err instanceof Error ? err.message : '无法打开', 'error')
        })
        return
      }
      if (!looksLikeHtml(target)) return
      const snap = stateRef.current
      const abs = resolveFromState(snap, target)
      void openExternal(abs, sessionOpenContext(snap).cwd).catch(
        (err: unknown) => {
          notify(err instanceof Error ? err.message : '无法打开', 'error')
        },
      )
    },
    revealInExplorer: (path) => {
      const next = path.trim()
      if (!next || isWebUrl(next)) return
      const snap = stateRef.current
      const abs = resolveFromState(snap, next)
      void revealPath(abs, sessionOpenContext(snap).cwd).catch(
        (err: unknown) => {
          notify(
            err instanceof Error ? err.message : `无法打开${fileManagerName()}`,
            'error',
          )
        },
      )
    },
    setPreviewPath: (path) => dispatch({ type: 'set-preview-path', path }),
    selectRightTab: (id) => dispatch({ type: 'select-right-tab', id }),
    closeRightTab: (id) => dispatch({ type: 'close-right-tab', id }),
    addRightTab: () => dispatch({ type: 'add-right-tab' }),
    setTerminalShell: (id) => dispatch({ type: 'set-terminal-shell', id }),
    setSidebarWidth: (width) =>
      dispatch({ type: 'set-sidebar-width', width }),
    setRightRailWidth: (width) =>
      dispatch({ type: 'set-right-rail-width', width }),
    editMessage: (messageId) => {
      const snap = stateRef.current
      const session = snap.sessions.find((s) => s.id === snap.activeSessionId)
      const m = session?.messages.find((x) => x.id === messageId)
      if (!m || m.role !== 'user') return
      dispatch({
        type: 'seed-composer',
        text: m.images?.length ? stripImageTokens(m.content) : m.content,
        images: m.images,
      })
    },
    retryLast: () => {
      const snap = stateRef.current
      const sid = snap.activeSessionId
      const session = snap.sessions.find((s) => s.id === sid)
      if (!session || !sid || snap.thinkingIds.includes(sid)) return
      const lastUser = [...session.messages].reverse().find((m) => m.role === 'user')
      if (!lastUser) return
      void (async () => {
        let files: File[] = []
        try {
          files = await chatImagesToFiles(lastUser.images)
        } catch {
          notify('图片读取失败，只重发文字', 'error')
        }
        const text = lastUser.images?.length
          ? stripImageTokens(lastUser.content)
          : lastUser.content
        await send(text, files, sid)
      })()
    },
    exportSession: (id) => {
      void (async () => {
        const snap = stateRef.current
        const session = snap.sessions.find((s) => s.id === (id ?? snap.activeSessionId))
        if (!session) return
        let messages = session.messages
        if (!messages.length && session.source === 'grok') {
          try {
            messages = (await loadRemoteSession(session.id, session.cwd || '')).messages
          } catch (err) {
            notify(err instanceof Error ? err.message : '载入会话失败', 'error')
            return
          }
        }
        if (!messages.length) {
          notify('这个会话还没有内容', 'error')
          return
        }
        const title = displayTitle(session, snap.titleOverrides[session.id])
        downloadText(
          `${safeFileName(title)}.md`,
          sessionToMarkdown({ ...session, messages }, title),
        )
        notify('已导出 Markdown', 'success')
      })()
    },
    setNotifyDone: (on) => {
      dispatch({ type: 'set-notify-done', on })
      if (on) {
        void requestNotifications().then((perm) => {
          if (perm === 'denied') notify('浏览器已拒绝通知，可在地址栏左侧的网站设置里开启', 'error')
          if (perm === 'unsupported') notify('这个浏览器不支持系统通知', 'error')
        })
      }
    },
    setPaletteOpen: (open) => dispatch({ type: 'set-palette', open }),
    resolvePermission: (optionId) => {
      const req = stateRef.current.permissionRequest
      if (!req) return
      void answerPermission(req.requestId, optionId).catch((err: unknown) => {
        notify(err instanceof Error ? err.message : '权限响应失败', 'error')
      })
      dispatch({ type: 'set-permission', request: null })
    },
  }), [hydrate, notify, refreshGit, send])

  useEffect(() => {
    selectRef.current = actions.selectSession
  }, [actions])

  const isHydrating = state.hydratingId === state.activeSessionId
  const api = useMemo<WorkspaceApi>(
    () => ({
      ...state,
      rightPanel,
      previewPath,
      activeProject,
      composerProject,
      activeSession,
      history,
      filteredHistory,
      filteredProjects,
      models,
      sessionCwd,
      isThinking: thinkingActive,
      isHydrating,
      ...actions,
    }),
    [
      state,
      rightPanel,
      previewPath,
      activeProject,
      composerProject,
      activeSession,
      history,
      filteredHistory,
      filteredProjects,
      models,
      sessionCwd,
      thinkingActive,
      isHydrating,
      actions,
    ],
  )

  const [store] = useState<WorkspaceStore>(() => {
    const listeners = new Set<() => void>()
    return {
      current: api,
      listeners,
      subscribe: (fn) => {
        listeners.add(fn)
        return () => {
          listeners.delete(fn)
        }
      },
    }
  })
  useLayoutEffect(() => {
    if (store.current === api) return
    store.current = api
    store.listeners.forEach((fn) => fn())
  }, [store, api])

  return (
    <WorkspaceContext.Provider value={store}>{children}</WorkspaceContext.Provider>
  )
}

type Picked = { api: WorkspaceApi; sig: string; value: Partial<WorkspaceApi> }

/**
 * 不带参数：订阅整份 api（任何变化都重渲染）。
 * 带字段名：只在这些字段的引用变化时重渲染，例如 `useWorkspace('toast', 'notify')`。
 * 动作函数引用稳定，可以放心列出。
 */
export function useWorkspace(): WorkspaceApi
export function useWorkspace<K extends keyof WorkspaceApi>(
  ...keys: [K, ...K[]]
): Pick<WorkspaceApi, K>
export function useWorkspace(
  ...keys: (keyof WorkspaceApi)[]
): Partial<WorkspaceApi> {
  const store = useContext(WorkspaceContext)
  if (!store) throw new Error('useWorkspace must be used within WorkspaceProvider')
  const cache = useRef<Picked | null>(null)
  const sig = keys.join('|')
  const getSnapshot = (): Partial<WorkspaceApi> => {
    const api = store.current
    if (!keys.length) return api
    const prev = cache.current
    if (prev && prev.sig === sig) {
      if (prev.api === api) return prev.value
      if (keys.every((k) => prev.value[k] === api[k])) {
        cache.current = { api, sig, value: prev.value }
        return prev.value
      }
    }
    const value: Partial<WorkspaceApi> = {}
    for (const k of keys) (value as Record<string, unknown>)[k] = api[k]
    cache.current = { api, sig, value }
    return value
  }
  return useSyncExternalStore(store.subscribe, getSnapshot)
}
