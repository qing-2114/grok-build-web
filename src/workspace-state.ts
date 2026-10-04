// 工作台状态：类型、纯函数 helper 和 reducer。这里不碰网络和 React，
// 方便 `npm test` 直接在 Node 里跑；副作用都在 workspace.tsx 的 provider 里。
import { SEED_PROJECTS } from './data/seed'
import type { AgentModel, RemoteSession, StreamEvent } from './lib/agent'
import { isWebUrl, samePath, resolveOpenPath, pathResolvesTo } from './lib/paths'
import {
  RIGHT_RAIL_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_DEFAULT,
  storedWidth,
} from './lib/layout'
import { DEFAULT_MODEL, loadState } from './lib/storage'
import { firstPromptTitle, isPlaceholderTitle, titleFrom } from './lib/title'
import { uid } from './lib/uid'

import { MODELS } from './types'
import type {
  ChatImage,
  ConnectionStatus,
  ContextUsage,
  EffortLevel,
  Message,
  PermissionMode,
  PlanEntry,
  PermissionRequest,
  Profile,
  Project,
  QueuedPrompt,
  RightPanel,
  RightTab,
  Session,
} from './types'
export const DEFAULT_PROFILE: Profile = { name: 'local', avatar: null }

export type SettingsPage = 'general' | 'deploy' | 'mcp' | 'usage' | 'profile'

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
  unreadIds: string[]
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
  contextUsage: ContextUsage | null
  rightRailOpen: boolean
  rightTabs: RightTab[]
  activeRightTabId: string | null
  terminalShellId: string
  sidebarWidth: number
  rightRailWidth: number
  /** 「编辑后重发」把文字塞回输入框；nonce 让同一段文字也能再塞一次 */
  composerSeed: { text: string; images: ChatImage[]; nonce: number } | null
  /** 后台回合完成 / 等待批准时发系统通知 */
  notifyDone: boolean
  paletteOpen: boolean
  /** 打开设置时先停在哪一页 */
  settingsPage: SettingsPage
}

export type Action =
  | { type: 'new-chat'; projectId?: string | null }
  | { type: 'select-project'; id: string }
  | { type: 'select-session'; id: string }
  | { type: 'add-project'; project: Project }
  | { type: 'delete-session'; id: string }
  | { type: 'rename-session'; id: string; title: string }
  | { type: 'send'; text: string; images?: ChatImage[]; sessionId?: string }
  | {
      type: 'bind-remote'
      localId: string
      sessionId: string
      cwd: string
      projectId: string | null
    }
  | {
      type: 'hydrate-session'
      sessionId: string
      messages: Message[]
      title?: string
      plan?: PlanEntry[]
    }
  | { type: 'set-session-title'; id: string; title: string }
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
  | { type: 'delete-project'; id: string; deleteChats: boolean }
  | { type: 'set-branch'; branch: string }
  | { type: 'set-context-usage'; usage: ContextUsage | null }
  | { type: 'patch-context-used'; sessionId: string; used: number }
  | { type: 'set-settings'; open: boolean; page?: SettingsPage }
  | { type: 'set-profile'; profile: Profile }
  | { type: 'toast'; toast: WorkspaceState['toast'] }
  | { type: 'enqueue'; item: QueuedPrompt }
  | { type: 'dequeue'; id: string }
  | { type: 'remap-queue'; from: string; to: string }
  | { type: 'toggle-right-rail' }
  | { type: 'open-right-panel'; panel: RightPanel }
  | { type: 'set-right-panel'; panel: RightPanel }
  | { type: 'set-right-rail'; open: boolean }
  | { type: 'open-file'; path: string }
  | { type: 'set-preview-path'; path: string | null }
  | { type: 'select-right-tab'; id: string }
  | { type: 'close-right-tab'; id: string }
  | { type: 'add-right-tab' }
  | { type: 'set-terminal-shell'; id: string }
  | { type: 'set-sidebar-width'; width: number }
  | { type: 'set-right-rail-width'; width: number }
  | { type: 'seed-composer'; text: string; images?: ChatImage[] }
  | { type: 'set-notify-done'; on: boolean }
  | { type: 'set-palette'; open: boolean }

export function visibleSessions(sessions: Session[]): Session[] {
  return sessions
    .filter(
      (s) =>
        s.source === 'grok' || s.messages.some((m) => m.role === 'user'),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function dropEmptyDrafts(sessions: Session[], keepId?: string | null): Session[] {
  return sessions.filter(
    (s) =>
      s.source === 'grok' ||
      s.messages.length > 0 ||
      (keepId != null && s.id === keepId),
  )
}

export function makeDraft(projectId: string | null, cwd?: string): Session {
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

export function clampEffort(modelId: string, effort: EffortLevel, models: AgentModel[]): EffortLevel {
  const list = models.length ? models : MODELS
  const model = list.find((m) => m.id === modelId)
  if (!model) return 'high'
  if (model.efforts.includes(effort)) return effort
  return model.efforts.includes('high') ? 'high' : model.efforts[0]
}

export function pathKey(p: string | null | undefined): string {
  return (p ?? '')
    .replace(/\//g, '\\')
    .replace(/\\+$/, '')
    .toLowerCase()
}

// Only a real AbortError counts as a user cancel. Server error text that
// happens to contain "abort" / "cancel" must still reach the transcript.
export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === 'AbortError'
  return err instanceof Error && err.name === 'AbortError'
}

export const SAVE_DEBOUNCE_MS = 300

export function matchProjectId(projects: Project[], cwd: string): string | null {
  const needle = pathKey(cwd)
  if (!needle) return null
  const hit = projects.find((p) => pathKey(p.path) === needle)
  return hit?.id ?? null
}

export function projectForSession(
  projects: Project[],
  session: Session | null,
): Project | null {
  if (!session) return null
  const id =
    session.projectId ??
    (session.cwd ? matchProjectId(projects, session.cwd) : null)
  return id ? (projects.find((p) => p.id === id) ?? null) : null
}

export function sessionOpenContext(state: WorkspaceState): {
  cwd: string
  hints: string[]
} {
  const session = state.sessions.find((s) => s.id === state.activeSessionId)
  const project = projectForSession(state.projects, session ?? null)
  const cwd = session?.cwd || project?.path || state.homeDir || ''
  const hints: string[] = []
  for (const m of session?.messages ?? []) {
    if (m.tool?.target) hints.push(m.tool.target)
  }
  return { cwd, hints }
}

export function resolveFromState(state: WorkspaceState, path: string): string {
  const next = path.trim()
  if (!next || isWebUrl(next)) return next
  const { cwd, hints } = sessionOpenContext(state)
  return resolveOpenPath(next, cwd, hints)
}

export function initialState(): WorkspaceState {
  const stored = loadState()
  const draft = makeDraft(stored?.activeProjectId ?? SEED_PROJECTS[0]?.id ?? null)
  const projects = stored?.projects.length ? stored.projects : SEED_PROJECTS
  return {
    sessions: [draft],
    activeProjectId: stored?.activeProjectId ?? SEED_PROJECTS[0]?.id ?? null,
    activeSessionId: draft.id,
    permissionMode: stored?.permissionMode ?? 'ask',
    model: stored?.model ?? DEFAULT_MODEL,
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
    unreadIds: [],
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
    contextUsage: null,
    rightRailOpen: false,
    rightTabs: [],
    activeRightTabId: null,
    terminalShellId: stored?.terminalShellId || '',
    composerSeed: null,
    notifyDone: stored?.notifyDone ?? true,
    paletteOpen: false,
    settingsPage: 'general',
    sidebarWidth: storedWidth(stored?.sidebarWidth, SIDEBAR_WIDTH_DEFAULT),
    rightRailWidth: storedWidth(
      stored?.rightRailWidth,
      RIGHT_RAIL_WIDTH_DEFAULT,
    ),
  }
}

function makeTab(
  kind: RightTab['kind'],
  path: string | null = null,
): RightTab {
  return { id: uid('tab'), kind, path }
}

function dropFileTabs(state: WorkspaceState): {
  rightTabs: RightTab[]
  activeRightTabId: string | null
} {
  const rightTabs = state.rightTabs.filter((t) => t.kind !== 'file')
  const keep = rightTabs.some((t) => t.id === state.activeRightTabId)
  return {
    rightTabs,
    activeRightTabId: keep
      ? state.activeRightTabId
      : (rightTabs[rightTabs.length - 1]?.id ?? null),
  }
}

function focusOrAddKind(
  state: WorkspaceState,
  kind: RightTab['kind'],
  toggleIfActive: boolean,
): WorkspaceState {
  const match = state.rightTabs.find((t) => t.kind === kind)
  if (match) {
    if (
      toggleIfActive &&
      state.rightRailOpen &&
      state.activeRightTabId === match.id
    ) {
      return { ...state, rightRailOpen: false }
    }
    return {
      ...state,
      rightRailOpen: true,
      activeRightTabId: match.id,
    }
  }
  const tab = makeTab(kind)
  return {
    ...state,
    rightRailOpen: true,
    rightTabs: [...state.rightTabs, tab],
    activeRightTabId: tab.id,
  }
}

export function openFileTab(state: WorkspaceState, path: string): WorkspaceState {
  const existing = state.rightTabs.find(
    (t) => t.kind === 'file' && t.path && samePath(t.path, path),
  )
  if (existing) {
    return {
      ...state,
      rightRailOpen: true,
      activeRightTabId: existing.id,
    }
  }
  const active = state.rightTabs.find((t) => t.id === state.activeRightTabId)
  if (active?.kind === 'file' && !active.path) {
    return {
      ...state,
      rightRailOpen: true,
      rightTabs: state.rightTabs.map((t) =>
        t.id === active.id ? { ...t, path } : t,
      ),
    }
  }
  if (
    active?.kind === 'file' &&
    active.path &&
    pathResolvesTo(active.path, path)
  ) {
    return {
      ...state,
      rightRailOpen: true,
      rightTabs: state.rightTabs.map((t) =>
        t.id === active.id ? { ...t, path } : t,
      ),
    }
  }
  const tab = makeTab('file', path)
  return {
    ...state,
    rightRailOpen: true,
    rightTabs: [...state.rightTabs, tab],
    activeRightTabId: tab.id,
  }
}

export function applyStream(
  session: Session,
  event: StreamEvent,
): Session {
  const now = Date.now()
  if (event.type === 'title' && event.title) {
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
  if (event.type === 'plan') {
    return { ...session, plan: event.entries, updatedAt: now }
  }
  if (event.type === 'turn') {
    // 只挂到本轮（最后一条用户消息之后）的最后一段助手回复上。
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const m = session.messages[i]
      if (m.role === 'user') break
      if (m.role === 'assistant') {
        const messages = [...session.messages]
        messages[i] = { ...m, usage: event.usage }
        return { ...session, messages }
      }
    }
    return session
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

export function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'new-chat': {
      const projectId = action.projectId ?? null
      const project = projectId
        ? state.projects.find((p) => p.id === projectId)
        : undefined
      const draft = makeDraft(
        projectId,
        project?.path ?? (projectId ? undefined : state.homeDir),
      )
      return {
        ...state,
        activeProjectId: projectId,
        expandedProjectId: projectId ?? state.expandedProjectId,
        sessions: [draft, ...dropEmptyDrafts(state.sessions)],
        activeSessionId: draft.id,
        mobileNavOpen: false,
        contextUsage: null,
        ...dropFileTabs(state),
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
      const projectId =
        session.projectId ??
        (session.cwd ? matchProjectId(state.projects, session.cwd) : null)
      return {
        ...state,
        activeSessionId: session.id,
        activeProjectId: projectId,
        expandedProjectId: projectId ?? state.expandedProjectId,
        unreadIds: state.unreadIds.filter((id) => id !== session.id),
        sessions: dropEmptyDrafts(state.sessions, session.id).map((s) =>
          s.id === session.id && projectId && !s.projectId
            ? { ...s, projectId }
            : s,
        ),
        mobileNavOpen: false,
        contextUsage:
          session.id === state.contextUsage?.sessionId
            ? state.contextUsage
            : null,
        ...dropFileTabs(state),
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
        contextUsage: null,
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
      const thinkingIds = state.thinkingIds.filter((id) => id !== action.id)
      const unreadIds = state.unreadIds.filter((id) => id !== action.id)
      const outgoingQueue = state.outgoingQueue.filter(
        (q) => q.sessionId !== action.id,
      )
      const hydratingId =
        state.hydratingId === action.id ? null : state.hydratingId
      if (state.activeSessionId !== action.id) {
        return {
          ...state,
          sessions: remaining,
          titleOverrides: overrides,
          thinkingIds,
          unreadIds,
          outgoingQueue,
          hydratingId,
          contextUsage:
            state.contextUsage?.sessionId === action.id
              ? null
              : state.contextUsage,
        }
      }
      const draft = makeDraft(state.activeProjectId)
      return {
        ...state,
        sessions: [draft, ...dropEmptyDrafts(remaining)],
        activeSessionId: draft.id,
        titleOverrides: overrides,
        thinkingIds,
        unreadIds,
        outgoingQueue,
        hydratingId,
        contextUsage: null,
      }
    }
    case 'send': {
      const text = action.text.trim()
      if (!text && !action.images?.length) return state
      const now = Date.now()
      let sessions = state.sessions
      let sessionId = action.sessionId ?? state.activeSessionId
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
        images: action.images?.length ? action.images : undefined,
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
        thinkingIds:
          sessionId && !state.thinkingIds.includes(sessionId)
            ? [...state.thinkingIds, sessionId]
            : state.thinkingIds,
        unreadIds: sessionId
          ? state.unreadIds.filter((id) => id !== sessionId)
          : state.unreadIds,
      }
    }
    case 'bind-remote': {
      const local = state.sessions.find((s) => s.id === action.localId)
      if (!local) return state
      const next: Session = {
        ...local,
        id: action.sessionId,
        cwd: action.cwd,
        projectId: action.projectId,
        source: 'grok',
        updatedAt: Date.now(),
      }
      const without = state.sessions.filter(
        (s) => s.id !== action.localId && s.id !== action.sessionId,
      )
      // Keep whatever the user is looking at right now: a draft opened while
      // the remote session was being created must survive the bind.
      const sessions = [next, ...dropEmptyDrafts(without, state.activeSessionId)]
      const activeSessionId =
        state.activeSessionId === action.localId
          ? action.sessionId
          : sessions.some((s) => s.id === state.activeSessionId)
            ? state.activeSessionId
            : next.id
      return {
        ...state,
        sessions,
        activeSessionId,
        thinkingIds: state.thinkingIds.map((id) =>
          id === action.localId ? action.sessionId : id,
        ),
        unreadIds: state.unreadIds.map((id) =>
          id === action.localId ? action.sessionId : id,
        ),
        hydratingId:
          state.hydratingId === action.localId
            ? action.sessionId
            : state.hydratingId,
        outgoingQueue: state.outgoingQueue.map((q) =>
          q.sessionId === action.localId
            ? { ...q, sessionId: action.sessionId }
            : q,
        ),
        contextUsage:
          state.contextUsage?.sessionId === action.localId
            ? { ...state.contextUsage, sessionId: action.sessionId }
            : state.contextUsage,
      }
    }
    case 'hydrate-session': {
      return {
        ...state,
        hydratingId:
          state.hydratingId === action.sessionId ? null : state.hydratingId,
        sessions: state.sessions.map((s) => {
          if (s.id !== action.sessionId) return s
          // Anything written while the load was in flight is newer than the
          // payload, so never clobber a session that already has messages.
          if (s.messages.length > 0) return s
          return {
            ...s,
            messages: action.messages,
            plan: action.plan?.length ? action.plan : s.plan,
            title:
              state.titleOverrides[s.id] ||
              action.title ||
              (!isPlaceholderTitle(s.title) ? s.title : '') ||
              firstPromptTitle({ ...s, messages: action.messages }) ||
              s.title,
          }
        }),
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
            r.title ||
            prev?.title ||
            (prev ? firstPromptTitle(prev) : null) ||
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
      if (
        action.event.type === 'title' &&
        state.titleOverrides[action.sessionId]
      ) {
        return state
      }
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId ? applyStream(s, action.event) : s,
        ),
      }
    }
    case 'set-session-title': {
      const title = action.title.replace(/\s+/g, ' ').trim()
      if (!title || state.titleOverrides[action.id]) return state
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.id ? { ...s, title, updatedAt: Date.now() } : s,
        ),
      }
    }
    case 'thinking': {
      const has = state.thinkingIds.includes(action.sessionId)
      if (action.on && has) return state
      if (!action.on && !has) return state
      if (action.on) {
        return {
          ...state,
          thinkingIds: [...state.thinkingIds, action.sessionId],
          unreadIds: state.unreadIds.filter((id) => id !== action.sessionId),
        }
      }
      return {
        ...state,
        thinkingIds: state.thinkingIds.filter((id) => id !== action.sessionId),
        unreadIds:
          action.sessionId !== state.activeSessionId &&
          !state.unreadIds.includes(action.sessionId)
            ? [...state.unreadIds, action.sessionId]
            : state.unreadIds,
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
    case 'delete-project': {
      const id = action.id
      if (!state.projects.some((p) => p.id === id)) return state
      const removedIds = new Set(
        state.sessions.filter((s) => s.projectId === id).map((s) => s.id),
      )
      const overrides = { ...state.titleOverrides }
      let sessions: Session[]
      let thinkingIds = state.thinkingIds
      let unreadIds = state.unreadIds
      let outgoingQueue = state.outgoingQueue
      let contextUsage = state.contextUsage
      let hydratingId = state.hydratingId
      if (action.deleteChats) {
        sessions = state.sessions.filter((s) => !removedIds.has(s.id))
        for (const sid of removedIds) delete overrides[sid]
        thinkingIds = thinkingIds.filter((sid) => !removedIds.has(sid))
        unreadIds = unreadIds.filter((sid) => !removedIds.has(sid))
        outgoingQueue = outgoingQueue.filter((q) => !removedIds.has(q.sessionId))
        if (contextUsage && removedIds.has(contextUsage.sessionId)) {
          contextUsage = null
        }
        if (hydratingId && removedIds.has(hydratingId)) hydratingId = null
      } else {
        sessions = state.sessions
          .filter(
            (s) =>
              s.projectId !== id ||
              s.source === 'grok' ||
              s.messages.length > 0,
          )
          .map((s) => (s.projectId === id ? { ...s, projectId: null } : s))
      }
      const projects = state.projects.filter((p) => p.id !== id)
      const activeProjectId =
        state.activeProjectId === id ? null : state.activeProjectId
      const expandedProjectId =
        state.expandedProjectId === id ? null : state.expandedProjectId
      const editingThis = state.editingProjectId === id
      const keepActive = sessions.some((s) => s.id === state.activeSessionId)
      if (keepActive) {
        return {
          ...state,
          projects,
          sessions,
          titleOverrides: overrides,
          thinkingIds,
          unreadIds,
          outgoingQueue,
          contextUsage,
          hydratingId,
          activeProjectId,
          expandedProjectId,
          editingProjectId: editingThis ? null : state.editingProjectId,
          projectDialogOpen: editingThis ? false : state.projectDialogOpen,
        }
      }
      const draft = makeDraft(null, state.homeDir)
      return {
        ...state,
        projects,
        sessions: [draft, ...dropEmptyDrafts(sessions)],
        activeSessionId: draft.id,
        titleOverrides: overrides,
        thinkingIds,
        unreadIds,
        outgoingQueue,
        contextUsage: null,
        hydratingId,
        activeProjectId: null,
        expandedProjectId,
        editingProjectId: editingThis ? null : state.editingProjectId,
        projectDialogOpen: editingThis ? false : state.projectDialogOpen,
        ...dropFileTabs(state),
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
      return {
        ...state,
        settingsOpen: action.open,
        settingsPage: action.page ?? (action.open ? 'general' : state.settingsPage),
        mobileNavOpen: false,
        paletteOpen: false,
      }
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
    case 'set-context-usage': {
      const next = action.usage
      if (!next) {
        return state.contextUsage == null
          ? state
          : { ...state, contextUsage: null }
      }
      const prev = state.contextUsage
      if (
        prev &&
        prev.sessionId === next.sessionId &&
        next.used === 0 &&
        next.total === 0 &&
        (prev.used > 0 || prev.total > 0)
      ) {
        return state
      }
      if (
        prev &&
        prev.sessionId === next.sessionId &&
        prev.used === next.used &&
        prev.total === next.total &&
        prev.percent === next.percent
      ) {
        return state
      }
      return { ...state, contextUsage: next }
    }
    case 'toggle-right-rail':
      return { ...state, rightRailOpen: !state.rightRailOpen }
    case 'set-right-rail':
      return { ...state, rightRailOpen: action.open }
    case 'open-right-panel': {
      const kind =
        action.panel === 'idle'
          ? null
          : action.panel === 'files'
            ? 'file'
            : action.panel
      if (!kind) return { ...state, rightRailOpen: true, activeRightTabId: null }
      return focusOrAddKind(state, kind, true)
    }
    case 'set-right-panel': {
      const kind =
        action.panel === 'idle'
          ? null
          : action.panel === 'files'
            ? 'file'
            : action.panel
      if (!kind) {
        return { ...state, rightRailOpen: true, activeRightTabId: null }
      }
      return focusOrAddKind(state, kind, false)
    }
    case 'open-file':
      return openFileTab(state, action.path)
    case 'set-preview-path': {
      if (!action.path) {
        const active = state.rightTabs.find(
          (t) => t.id === state.activeRightTabId,
        )
        if (!active || active.kind !== 'file') return state
        return {
          ...state,
          rightTabs: state.rightTabs.map((t) =>
            t.id === active.id ? { ...t, path: null } : t,
          ),
        }
      }
      return openFileTab(state, action.path)
    }
    case 'select-right-tab':
      if (!state.rightTabs.some((t) => t.id === action.id)) return state
      return {
        ...state,
        rightRailOpen: true,
        activeRightTabId: action.id,
      }
    case 'close-right-tab': {
      const i = state.rightTabs.findIndex((t) => t.id === action.id)
      if (i < 0) return state
      const rightTabs = state.rightTabs.filter((t) => t.id !== action.id)
      let activeRightTabId = state.activeRightTabId
      if (activeRightTabId === action.id) {
        activeRightTabId =
          rightTabs[i]?.id ?? rightTabs[i - 1]?.id ?? null
      }
      return { ...state, rightTabs, activeRightTabId }
    }
    case 'add-right-tab': {
      const tab = makeTab('file')
      return {
        ...state,
        rightRailOpen: true,
        rightTabs: [...state.rightTabs, tab],
        activeRightTabId: tab.id,
      }
    }
    case 'seed-composer':
      return {
        ...state,
        composerSeed: {
          text: action.text,
          images: action.images ?? [],
          nonce: (state.composerSeed?.nonce ?? 0) + 1,
        },
      }
    case 'set-notify-done':
      return { ...state, notifyDone: action.on }
    case 'set-palette':
      return { ...state, paletteOpen: action.open }
    case 'set-terminal-shell':
      return { ...state, terminalShellId: action.id }
    case 'set-sidebar-width':
      return action.width === state.sidebarWidth
        ? state
        : { ...state, sidebarWidth: action.width }
    case 'set-right-rail-width':
      return action.width === state.rightRailWidth
        ? state
        : { ...state, rightRailWidth: action.width }
    case 'patch-context-used': {
      if (state.activeSessionId !== action.sessionId) return state
      const prev =
        state.contextUsage?.sessionId === action.sessionId
          ? state.contextUsage
          : null
      const used = action.used
      const total = prev?.total ?? 0
      const percent =
        total > 0 ? Math.min(100, Math.round((used / total) * 100)) : prev?.percent ?? 0
      if (
        prev &&
        prev.used === used &&
        prev.total === total &&
        prev.percent === percent
      ) {
        return state
      }
      return {
        ...state,
        contextUsage: {
          sessionId: action.sessionId,
          used,
          total,
          percent,
        },
      }
    }
    default:
      return state
  }
}
