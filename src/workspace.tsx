import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import { SEED_PROJECTS } from './data/seed'
import {
  answerPermission,
  cancelSession,
  checkoutGit,
  createRemoteSession,
  deleteRemoteSession,
  fetchGit,
  fetchSessions,
  fetchStatus,
  filesToPrompt,
  isGrokSessionId,
  loadRemoteSession,
  promptSession,
  setRemoteConfig,
  type AgentModel,
  type RemoteSession,
  type StreamEvent,
} from './lib/agent'
import { loadState, saveState } from './lib/storage'
import { firstPromptTitle, titleFrom } from './lib/title'
import { uid } from './lib/uid'
import { MODELS } from './types'
import type {
  ConnectionStatus,
  EffortLevel,
  Message,
  PermissionMode,
  PermissionRequest,
  Profile,
  Project,
  QueuedPrompt,
  Session,
} from './types'

export const DEFAULT_PROFILE: Profile = { name: 'local', avatar: null }

export type WorkspaceState = {
  projects: Project[]
  sessions: Session[]
  activeProjectId: string | null
  activeSessionId: string | null
  permissionMode: PermissionMode
  model: string
  effort: EffortLevel
  search: string
  sidebarCollapsed: boolean
  mobileNavOpen: boolean
  projectDialogOpen: boolean
  editingProjectId: string | null
  expandedProjectId: string | null
  settingsOpen: boolean
  profile: Profile
  thinkingIds: string[]
  toast: { id: string; text: string; kind: 'info' | 'success' | 'error' } | null
  connection: ConnectionStatus
  connectionError: string | null
  agentVersion: string
  homeDir: string
  agentModels: AgentModel[]
  hydratingId: string | null
  permissionRequest: PermissionRequest | null
  titleOverrides: Record<string, string>
  outgoingQueue: QueuedPrompt[]
}

type Action =
  | { type: 'new-chat'; projectId?: string | null }
  | { type: 'select-project'; id: string }
  | { type: 'select-session'; id: string }
  | { type: 'add-project'; project: Project }
  | { type: 'delete-session'; id: string }
  | { type: 'rename-session'; id: string; title: string }
  | { type: 'send'; text: string }
  | { type: 'adopt-session'; localId: string | null; session: Session; text: string }
  | { type: 'hydrate-session'; sessionId: string; messages: Message[]; title?: string }
  | { type: 'merge-remote'; sessions: RemoteSession[] }
  | { type: 'stream'; sessionId: string; event: StreamEvent }
  | { type: 'thinking'; sessionId: string; on: boolean }
  | { type: 'set-hydrating'; id: string | null }
  | { type: 'set-connection'; connection: ConnectionStatus; error?: string | null; version?: string; home?: string }
  | { type: 'set-agent-models'; models: AgentModel[]; currentModelId?: string }
  | { type: 'set-project-git'; id: string; branch: string; branches: string[] }
  | { type: 'set-permission'; request: PermissionRequest | null }
  | { type: 'set-search'; search: string }
  | { type: 'set-mode'; mode: PermissionMode }
  | { type: 'set-model'; model: string }
  | { type: 'set-effort'; effort: EffortLevel }
  | { type: 'toggle-sidebar' }
  | { type: 'set-mobile-nav'; open: boolean }
  | { type: 'set-project-dialog'; open: boolean; editId?: string | null }
  | { type: 'set-workspace-project'; id: string | null }
  | { type: 'update-project'; id: string; name: string; path: string }
  | { type: 'delete-project-chats'; id: string }
  | { type: 'set-branch'; branch: string }
  | { type: 'set-settings'; open: boolean }
  | { type: 'set-profile'; profile: Profile }
  | { type: 'toast'; toast: WorkspaceState['toast'] }
  | { type: 'enqueue'; item: QueuedPrompt }
  | { type: 'dequeue'; id: string }
  | { type: 'remap-queue'; from: string; to: string }

function visibleSessions(sessions: Session[]): Session[] {
  return sessions
    .filter(
      (s) =>
        s.source === 'grok' || s.messages.some((m) => m.role === 'user'),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

function dropEmptyDrafts(sessions: Session[], keepId?: string | null): Session[] {
  return sessions.filter(
    (s) =>
      s.source === 'grok' ||
      s.messages.length > 0 ||
      (keepId != null && s.id === keepId),
  )
}

function makeDraft(projectId: string | null, cwd?: string): Session {
  const now = Date.now()
  return {
    id: uid('ses'),
    title: '新对话',
    projectId,
    cwd,
    createdAt: now,
    updatedAt: now,
    messages: [],
    source: 'local',
  }
}

function clampEffort(modelId: string, effort: EffortLevel, models: AgentModel[]): EffortLevel {
  const list = models.length ? models : MODELS
  const model = list.find((m) => m.id === modelId)
  if (!model) return 'high'
  if (model.efforts.includes(effort)) return effort
  return model.efforts.includes('high') ? 'high' : model.efforts[0]
}

function matchProjectId(projects: Project[], cwd: string): string | null {
  const needle = cwd.replace(/\//g, '\\').toLowerCase()
  const hit = projects.find(
    (p) => p.path.replace(/\//g, '\\').toLowerCase() === needle,
  )
  return hit?.id ?? null
}

function initialState(): WorkspaceState {
  const stored = loadState()
  const draft = makeDraft(stored?.activeProjectId ?? SEED_PROJECTS[0]?.id ?? null)
  const projects = stored?.projects.length ? stored.projects : SEED_PROJECTS
  return {
    sessions: [draft],
    activeProjectId: stored?.activeProjectId ?? SEED_PROJECTS[0]?.id ?? null,
    activeSessionId: draft.id,
    permissionMode: stored?.permissionMode ?? 'ask',
    model: stored?.model ?? 'grok-4.6',
    effort: stored?.effort ?? 'high',
    search: '',
    sidebarCollapsed: false,
    mobileNavOpen: false,
    projectDialogOpen: false,
    editingProjectId: null,
    expandedProjectId: stored?.activeProjectId ?? SEED_PROJECTS[0]?.id ?? null,
    settingsOpen: false,
    profile: {
      name:
        typeof stored?.profile?.name === 'string' && stored.profile.name.trim()
          ? stored.profile.name.trim().slice(0, 24)
          : DEFAULT_PROFILE.name,
      avatar:
        typeof stored?.profile?.avatar === 'string' ? stored.profile.avatar : null,
    },
    projects: projects.map((p) => ({
      ...p,
      branch: p.branch || '',
      branches: Array.isArray(p.branches) ? p.branches : [],
    })),
    thinkingIds: [],
    toast: null,
    connection: 'connecting',
    connectionError: null,
    agentVersion: '',
    homeDir: '',
    agentModels: [],
    hydratingId: null,
    permissionRequest: null,
    titleOverrides: stored?.titleOverrides ?? {},
    outgoingQueue: [],
  }
}

function applyStream(
  session: Session,
  event: StreamEvent,
): Session {
  const now = Date.now()
  if (event.type === 'title' && event.title) {
    if (firstPromptTitle(session)) return session
    return { ...session, title: event.title, updatedAt: now }
  }
  if (event.type === 'text' || event.type === 'user') {
    const role = event.type === 'text' ? 'assistant' : 'user'
    const messages = [...session.messages]
    const last = messages[messages.length - 1]
    if (last && last.role === role && !last.tool) {
      messages[messages.length - 1] = {
        ...last,
        content: last.content + event.text,
      }
    } else if (event.text) {
      messages.push({
        id: uid('msg'),
        role,
        content: event.text,
        createdAt: now,
      })
    }
    return { ...session, messages, updatedAt: now }
  }
  if (event.type === 'tool') {
    const messages = [...session.messages]
    const idx = messages.findIndex((m) => m.id === event.id && m.role === 'tool')
    if (idx >= 0) {
      const prev = messages[idx]
      messages[idx] = {
        ...prev,
        tool: {
          name: event.name || prev.tool?.name || '工具',
          target: event.target || prev.tool?.target || '',
          status: event.status,
        },
      }
    } else {
      messages.push({
        id: event.id,
        role: 'tool',
        content: '',
        createdAt: now,
        tool: {
          name: event.name,
          target: event.target,
          status: event.status,
        },
      })
    }
    return { ...session, messages, updatedAt: now }
  }
  if (event.type === 'error') {
    return {
      ...session,
      updatedAt: now,
      messages: [
        ...session.messages,
        {
          id: uid('msg'),
          role: 'assistant',
          content: event.message,
          createdAt: now,
        },
      ],
    }
  }
  return session
}

function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'new-chat': {
      const projectId =
        action.projectId !== undefined ? action.projectId : state.activeProjectId
      const project = state.projects.find((p) => p.id === projectId)
      const draft = makeDraft(projectId, project?.path)
      return {
        ...state,
        activeProjectId: projectId,
        expandedProjectId: projectId ?? state.expandedProjectId,
        sessions: [draft, ...dropEmptyDrafts(state.sessions)],
        activeSessionId: draft.id,
        mobileNavOpen: false,
      }
    }
    case 'select-project': {
      const collapsing = state.expandedProjectId === action.id
      return {
        ...state,
        activeProjectId: action.id,
        expandedProjectId: collapsing ? null : action.id,
        mobileNavOpen: false,
      }
    }
    case 'select-session': {
      const session = state.sessions.find((s) => s.id === action.id)
      if (!session) return state
      return {
        ...state,
        activeSessionId: session.id,
        activeProjectId: session.projectId ?? state.activeProjectId,
        expandedProjectId: session.projectId ?? state.expandedProjectId,
        sessions: dropEmptyDrafts(state.sessions, session.id),
        mobileNavOpen: false,
      }
    }
    case 'add-project': {
      const draft = makeDraft(action.project.id, action.project.path)
      return {
        ...state,
        projects: [...state.projects, action.project],
        activeProjectId: action.project.id,
        expandedProjectId: action.project.id,
        sessions: [draft, ...dropEmptyDrafts(state.sessions)],
        activeSessionId: draft.id,
        projectDialogOpen: false,
        editingProjectId: null,
        mobileNavOpen: false,
      }
    }
    case 'rename-session': {
      const title = action.title.replace(/\s+/g, ' ').trim()
      if (!title) return state
      return {
        ...state,
        titleOverrides: { ...state.titleOverrides, [action.id]: title },
        sessions: state.sessions.map((s) =>
          s.id === action.id ? { ...s, title, updatedAt: Date.now() } : s,
        ),
      }
    }
    case 'delete-session': {
      const remaining = state.sessions.filter((s) => s.id !== action.id)
      const overrides = { ...state.titleOverrides }
      delete overrides[action.id]
      if (state.activeSessionId !== action.id) {
        return { ...state, sessions: remaining, titleOverrides: overrides }
      }
      const draft = makeDraft(state.activeProjectId)
      return {
        ...state,
        sessions: [draft, ...dropEmptyDrafts(remaining)],
        activeSessionId: draft.id,
        titleOverrides: overrides,
      }
    }
    case 'send': {
      const text = action.text.trim()
      if (!text) return state
      const now = Date.now()
      let sessions = state.sessions
      let sessionId = state.activeSessionId
      let session = sessions.find((s) => s.id === sessionId)
      if (!session) {
        const draft = makeDraft(state.activeProjectId)
        sessions = [draft, ...dropEmptyDrafts(sessions)]
        session = draft
        sessionId = draft.id
      }
      const userMsg: Message = {
        id: uid('msg'),
        role: 'user',
        content: text,
        createdAt: now,
      }
      const titled =
        session.messages.length === 0 ? titleFrom(text) : session.title
      sessions = sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              title: titled,
              updatedAt: now,
              messages: [...s.messages, userMsg],
            }
          : s,
      )
      return {
        ...state,
        sessions,
        activeSessionId: sessionId,
        thinkingIds: sessionId ? [...state.thinkingIds, sessionId] : state.thinkingIds,
      }
    }
    case 'adopt-session': {
      const now = Date.now()
      const userMsg: Message = {
        id: uid('msg'),
        role: 'user',
        content: action.text,
        createdAt: now,
      }
      const next: Session = {
        ...action.session,
        title:
          action.session.title ||
          titleFrom(action.text),
        updatedAt: now,
        messages: [...action.session.messages, userMsg],
        source: 'grok',
      }
      const without = state.sessions.filter(
        (s) => s.id !== action.localId && s.id !== next.id,
      )
      return {
        ...state,
        sessions: [next, ...dropEmptyDrafts(without)],
        activeSessionId: next.id,
        thinkingIds: [...state.thinkingIds.filter((id) => id !== action.localId), next.id],
        outgoingQueue: action.localId
          ? state.outgoingQueue.map((q) =>
              q.sessionId === action.localId
                ? { ...q, sessionId: next.id }
                : q,
            )
          : state.outgoingQueue,
      }
    }
    case 'hydrate-session': {
      return {
        ...state,
        hydratingId:
          state.hydratingId === action.sessionId ? null : state.hydratingId,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId
            ? {
                ...s,
                messages: action.messages,
                title:
                  state.titleOverrides[s.id] ||
                  firstPromptTitle({ ...s, messages: action.messages }) ||
                  action.title ||
                  s.title,
              }
            : s,
        ),
      }
    }
    case 'merge-remote': {
      const byId = new Map(state.sessions.map((s) => [s.id, s]))
      for (const r of action.sessions) {
        const prev = byId.get(r.id)
        byId.set(r.id, {
          id: r.id,
          title:
            state.titleOverrides[r.id] ||
            (prev ? firstPromptTitle(prev) : null) ||
            r.title ||
            prev?.title ||
            '会话',
          projectId:
            matchProjectId(state.projects, r.cwd) ?? prev?.projectId ?? null,
          cwd: r.cwd,
          createdAt: prev?.createdAt ?? r.updatedAt,
          updatedAt: r.updatedAt,
          messages: prev?.messages ?? [],
          source: 'grok',
        })
      }
      return { ...state, sessions: [...byId.values()] }
    }
    case 'stream': {
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId ? applyStream(s, action.event) : s,
        ),
      }
    }
    case 'thinking': {
      const has = state.thinkingIds.includes(action.sessionId)
      if (action.on && has) return state
      if (!action.on && !has) return state
      return {
        ...state,
        thinkingIds: action.on
          ? [...state.thinkingIds, action.sessionId]
          : state.thinkingIds.filter((id) => id !== action.sessionId),
      }
    }
    case 'set-hydrating':
      return { ...state, hydratingId: action.id }
    case 'set-connection':
      return {
        ...state,
        connection: action.connection,
        connectionError: action.error ?? null,
        agentVersion: action.version ?? state.agentVersion,
        homeDir: action.home ?? state.homeDir,
      }
    case 'set-agent-models': {
      const models = action.models
      let model = state.model
      if (models.length && !models.some((m) => m.id === model)) {
        model = action.currentModelId || models[0].id
      } else if (action.currentModelId && model === 'grok-4.6') {
        model = action.currentModelId
      }
      return {
        ...state,
        agentModels: models,
        model,
        effort: clampEffort(model, state.effort, models),
      }
    }
    case 'set-project-git':
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.id
            ? { ...p, branch: action.branch, branches: action.branches }
            : p,
        ),
      }
    case 'set-permission':
      return { ...state, permissionRequest: action.request }
    case 'set-search':
      return { ...state, search: action.search }
    case 'set-mode':
      return { ...state, permissionMode: action.mode }
    case 'set-model':
      return {
        ...state,
        model: action.model,
        effort: clampEffort(action.model, state.effort, state.agentModels),
      }
    case 'set-effort':
      return {
        ...state,
        effort: clampEffort(state.model, action.effort, state.agentModels),
      }
    case 'toggle-sidebar':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed }
    case 'set-mobile-nav':
      return { ...state, mobileNavOpen: action.open }
    case 'set-project-dialog':
      return {
        ...state,
        projectDialogOpen: action.open,
        editingProjectId: action.open ? (action.editId ?? null) : null,
      }
    case 'update-project': {
      const name = action.name.replace(/\s+/g, ' ').trim()
      const path = action.path.trim()
      if (!name) return state
      return {
        ...state,
        projectDialogOpen: false,
        editingProjectId: null,
        projects: state.projects.map((p) =>
          p.id === action.id ? { ...p, name, path } : p,
        ),
        sessions: state.sessions.map((s) =>
          s.projectId === action.id ? { ...s, cwd: path || s.cwd } : s,
        ),
      }
    }
    case 'delete-project-chats': {
      const remaining = state.sessions.filter((s) => s.projectId !== action.id)
      const overrides = { ...state.titleOverrides }
      for (const s of state.sessions) {
        if (s.projectId === action.id) delete overrides[s.id]
      }
      if (remaining.some((s) => s.id === state.activeSessionId)) {
        return { ...state, sessions: remaining, titleOverrides: overrides }
      }
      const draft = makeDraft(
        action.id,
        state.projects.find((p) => p.id === action.id)?.path,
      )
      return {
        ...state,
        sessions: [draft, ...dropEmptyDrafts(remaining)],
        activeSessionId: draft.id,
        titleOverrides: overrides,
      }
    }
    case 'set-workspace-project': {
      const id = action.id
      const project = state.projects.find((p) => p.id === id)
      const cwd = id == null ? state.homeDir : (project?.path ?? '')
      return {
        ...state,
        activeProjectId: id,
        expandedProjectId: id ?? state.expandedProjectId,
        sessions: state.sessions.map((s) =>
          s.id === state.activeSessionId
            ? { ...s, projectId: id, cwd }
            : s,
        ),
      }
    }
    case 'set-settings':
      return { ...state, settingsOpen: action.open, mobileNavOpen: false }
    case 'set-profile':
      return { ...state, profile: action.profile }
    case 'set-branch': {
      if (!state.activeProjectId) return state
      const project = state.projects.find((p) => p.id === state.activeProjectId)
      if (!project || project.branch === action.branch) return state
      if (!project.branches.includes(action.branch)) return state
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === state.activeProjectId ? { ...p, branch: action.branch } : p,
        ),
      }
    }
    case 'toast':
      return { ...state, toast: action.toast }
    case 'enqueue':
      return {
        ...state,
        outgoingQueue: [...state.outgoingQueue, action.item],
      }
    case 'dequeue':
      return {
        ...state,
        outgoingQueue: state.outgoingQueue.filter((q) => q.id !== action.id),
      }
    case 'remap-queue':
      return {
        ...state,
        outgoingQueue: state.outgoingQueue.map((q) =>
          q.sessionId === action.from ? { ...q, sessionId: action.to } : q,
        ),
      }
    default:
      return state
  }
}

type WorkspaceApi = WorkspaceState & {
  activeProject: Project | null
  activeSession: Session | null
  history: Session[]
  filteredHistory: Session[]
  filteredProjects: Project[]
  isThinking: boolean
  isHydrating: boolean
  models: AgentModel[]
  newChat: (projectId?: string | null) => void
  selectProject: (id: string) => void
  selectSession: (id: string) => void
  addProject: (input: { name: string; path: string; branch?: string }) => void
  updateProject: (input: { id: string; name: string; path: string }) => void
  deleteProjectChats: (id: string) => void
  setWorkspaceProject: (id: string | null) => void
  setBranch: (branch: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  send: (text: string, files?: File[]) => void
  enqueue: (text: string) => void
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
  setSettingsOpen: (open: boolean) => void
  setProfile: (profile: Profile) => void
  notify: (message: string, kind?: 'info' | 'success' | 'error') => void
  resolvePermission: (optionId: string | null) => void
}

const WorkspaceContext = createContext<WorkspaceApi | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const stateRef = useRef(state)
  stateRef.current = state
  const timers = useRef<number[]>([])
  const toastTimer = useRef(0)
  const loadGen = useRef(0)
  const promptAbort = useRef(new Map<string, AbortController>())
  const userAbort = useRef(new Set<string>())

  useEffect(() => {
    saveState({
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
    })
  }, [
    state.projects,
    state.activeProjectId,
    state.activeSessionId,
    state.permissionMode,
    state.model,
    state.effort,
    state.profile,
    state.titleOverrides,
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
    }
  }, [])

  const activeProject =
    state.projects.find((p) => p.id === state.activeProjectId) ?? null
  const activeSession =
    state.sessions.find((s) => s.id === state.activeSessionId) ?? null
  const history = useMemo(
    () => visibleSessions(state.sessions),
    [state.sessions],
  )

  const q = state.search.trim().toLowerCase()
  const filteredHistory = useMemo(() => {
    if (!q) return history
    return history.filter((s) => {
      const project = state.projects.find((p) => p.id === s.projectId)
      const title =
        state.titleOverrides[s.id] || firstPromptTitle(s) || s.title
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

  const send = useCallback(
    (text: string, files?: File[]) => {
      void (async () => {
        const snap = stateRef.current
        if (snap.connection !== 'connected') {
          notify('本机 Grok Build 未连接', 'error')
          return
        }
        const payload = text.trim()
        if (!payload && !files?.length) return

        let session =
          snap.sessions.find((s) => s.id === snap.activeSessionId) ?? null
        const projectId = session ? session.projectId : snap.activeProjectId
        const project = projectId
          ? (snap.projects.find((p) => p.id === projectId) ?? null)
          : null
        const cwd =
          session?.source === 'grok'
            ? session.cwd || project?.path || snap.homeDir
            : project?.path || snap.homeDir
        if (!cwd) {
          notify('请先选择项目文件夹', 'error')
          return
        }

        let sessionId = session?.id ?? null
        if (!session || session.source !== 'grok') {
          try {
            const created = await createRemoteSession({
              cwd,
              permissionMode: snap.permissionMode,
              model: snap.model,
              effort: snap.effort,
            })
            const grokSession: Session = {
              id: created.sessionId,
              title: titleFrom(payload),
              projectId: project?.id ?? null,
              cwd,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              messages: [],
              source: 'grok',
            }
            dispatch({
              type: 'adopt-session',
              localId: session?.id ?? null,
              session: grokSession,
              text: payload || `请查看附件：${files?.map((f) => f.name).join('、')}`,
            })
            sessionId = created.sessionId
          } catch (err) {
            notify(err instanceof Error ? err.message : '无法创建会话', 'error')
            return
          }
        } else {
          dispatch({
            type: 'send',
            text: payload || `请查看附件：${files?.map((f) => f.name).join('、')}`,
          })
          sessionId = session.id
        }

        if (!sessionId) return
        const ac = new AbortController()
        promptAbort.current.get(sessionId)?.abort()
        promptAbort.current.set(sessionId, ac)
        try {
          const promptFiles = files?.length ? await filesToPrompt(files) : []
          await promptSession(
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
                return
              }
              if (event.type === 'thought') return
              dispatch({ type: 'stream', sessionId, event })
            },
            ac.signal,
          )
        } catch (err) {
          const aborted =
            userAbort.current.has(sessionId) ||
            (err instanceof DOMException && err.name === 'AbortError') ||
            (err instanceof Error && /abort|cancel/i.test(err.message))
          userAbort.current.delete(sessionId)
          if (!aborted) {
            dispatch({
              type: 'stream',
              sessionId,
              event: {
                type: 'error',
                message: err instanceof Error ? err.message : String(err),
              },
            })
          }
        } finally {
          if (promptAbort.current.get(sessionId) === ac) {
            promptAbort.current.delete(sessionId)
          }
          dispatch({ type: 'thinking', sessionId, on: false })
          dispatch({ type: 'set-permission', request: null })
        }
      })()
    },
    [notify],
  )

  const api: WorkspaceApi = {
    ...state,
    activeProject,
    activeSession,
    history,
    filteredHistory,
    filteredProjects,
    models,
    isThinking: Boolean(
      state.activeSessionId &&
        state.thinkingIds.includes(state.activeSessionId),
    ),
    isHydrating: state.hydratingId === state.activeSessionId,
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
      if (session) void hydrate(session)
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
    enqueue: (text) => {
      const sessionId = stateRef.current.activeSessionId
      const payload = text.trim()
      if (!sessionId || !payload) return
      dispatch({
        type: 'enqueue',
        item: {
          id: uid('wait'),
          sessionId,
          text: payload,
        },
      })
    },
    dropQueued: (id) => dispatch({ type: 'dequeue', id }),
    sendQueued: (id) => {
      const item = stateRef.current.outgoingQueue.find((q) => q.id === id)
      if (!item) return
      dispatch({ type: 'dequeue', id })
      void (async () => {
        const sid = item.sessionId
        if (stateRef.current.thinkingIds.includes(sid)) {
          userAbort.current.add(sid)
          promptAbort.current.get(sid)?.abort()
          if (isGrokSessionId(sid)) {
            await cancelSession(sid).catch(() => undefined)
          }
          const start = Date.now()
          while (
            stateRef.current.thinkingIds.includes(sid) &&
            Date.now() - start < 8000
          ) {
            await new Promise((r) => window.setTimeout(r, 50))
          }
        }
        send(item.text)
      })()
    },
    stopGeneration: () => {
      const sid = stateRef.current.activeSessionId
      if (!sid || !stateRef.current.thinkingIds.includes(sid)) return
      userAbort.current.add(sid)
      promptAbort.current.get(sid)?.abort()
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
    setSettingsOpen: (open) => dispatch({ type: 'set-settings', open }),
    setProfile: (profile) => dispatch({ type: 'set-profile', profile }),
    notify,
    resolvePermission: (optionId) => {
      const req = stateRef.current.permissionRequest
      if (!req) return
      void answerPermission(req.requestId, optionId).catch((err: unknown) => {
        notify(err instanceof Error ? err.message : '权限响应失败', 'error')
      })
      dispatch({ type: 'set-permission', request: null })
    },
  }

  return (
    <WorkspaceContext.Provider value={api}>{children}</WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceApi {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
