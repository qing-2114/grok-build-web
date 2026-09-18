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
  type RemoteSession,
  type StreamEvent,
} from './lib/agent'
import {
  looksLikeHtml,
  isWebUrl,
  samePath,
  resolveOpenPath,
  pathResolvesTo,
} from './lib/paths'
import {
  RIGHT_RAIL_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_DEFAULT,
  storedWidth,
} from './lib/layout'
import { loadState, saveState } from './lib/storage'
import {
  displayTitle,
  firstPromptTitle,
  isPlaceholderTitle,
  titleFrom,
} from './lib/title'
import { uid } from './lib/uid'
import { filesToChatImages, isImageFile } from './lib/images'
import { openExternal, revealInExplorer as revealPath } from './lib/fs'
import { fileManagerName } from './lib/platform'

import { MODELS } from './types'
import type {
  ChatImage,
  ConnectionStatus,
  ContextUsage,
  EffortLevel,
  Message,
  PermissionMode,
  PermissionRequest,
  Profile,
  Project,
  QueuedPrompt,
  RightPanel,
  RightTab,
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
}

type Action =
  | { type: 'new-chat'; projectId?: string | null }
  | { type: 'select-project'; id: string }
  | { type: 'select-session'; id: string }
  | { type: 'add-project'; project: Project }
  | { type: 'delete-session'; id: string }
  | { type: 'rename-session'; id: string; title: string }
  | { type: 'send'; text: string; images?: ChatImage[] }
  | {
      type: 'bind-remote'
      localId: string
      sessionId: string
      cwd: string
      projectId: string | null
    }
  | { type: 'hydrate-session'; sessionId: string; messages: Message[]; title?: string }
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
  | { type: 'set-branch'; branch: string }
  | { type: 'set-context-usage'; usage: ContextUsage | null }
  | { type: 'patch-context-used'; sessionId: string; used: number }
  | { type: 'set-settings'; open: boolean }
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

function pathKey(p: string): string {
  return p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

function matchProjectId(projects: Project[], cwd: string): string | null {
  const needle = pathKey(cwd)
  if (!needle) return null
  const hit = projects.find((p) => pathKey(p.path) === needle)
  return hit?.id ?? null
}

function projectForSession(
  projects: Project[],
  session: Session | null,
): Project | null {
  if (!session) return null
  const id =
    session.projectId ??
    (session.cwd ? matchProjectId(projects, session.cwd) : null)
  return id ? (projects.find((p) => p.id === id) ?? null) : null
}

function sessionOpenContext(state: WorkspaceState): {
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

function resolveFromState(state: WorkspaceState, path: string): string {
  const next = path.trim()
  if (!next || isWebUrl(next)) return next
  const { cwd, hints } = sessionOpenContext(state)
  return resolveOpenPath(next, cwd, hints)
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

function openFileTab(state: WorkspaceState, path: string): WorkspaceState {
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

function applyStream(
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
      if (state.activeSessionId !== action.id) {
        return {
          ...state,
          sessions: remaining,
          titleOverrides: overrides,
          thinkingIds,
          unreadIds,
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
        contextUsage: null,
      }
    }
    case 'send': {
      const text = action.text.trim()
      if (!text && !action.images?.length) return state
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
      return {
        ...state,
        sessions: [next, ...dropEmptyDrafts(without)],
        activeSessionId:
          state.activeSessionId === action.localId
            ? action.sessionId
            : state.activeSessionId,
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
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId
            ? {
                ...s,
                messages: action.messages,
                title:
                  state.titleOverrides[s.id] ||
                  action.title ||
                  (!isPlaceholderTitle(s.title) ? s.title : '') ||
                  firstPromptTitle({ ...s, messages: action.messages }) ||
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

type WorkspaceApi = WorkspaceState & {
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
  refreshAgent: () => Promise<void>
  notify: (message: string, kind?: 'info' | 'success' | 'error') => void
  resolvePermission: (optionId: string | null) => void
  sessionCwd: string
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
      terminalShellId: state.terminalShellId,
      sidebarWidth: state.sidebarWidth,
      rightRailWidth: state.rightRailWidth,
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
    state.terminalShellId,
    state.sidebarWidth,
    state.rightRailWidth,
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
    const timer = thinkingActive
      ? window.setInterval(pull, 1600)
      : 0
    return () => {
      cancelled = true
      if (timer) window.clearInterval(timer)
    }
  }, [activeContextId, activeContextCwd, thinkingActive])

  const send = useCallback(
    (text: string, files?: File[]) => {
      void (async () => {
        const snap = stateRef.current
        if (snap.connection !== 'connected') {
          notify('本机 Grok Build 未连接', 'error')
          return
        }
        const imageFiles = (files ?? []).filter(isImageFile)
        const otherFiles = (files ?? []).filter((f) => !isImageFile(f))
        const images = imageFiles.length
          ? await filesToChatImages(imageFiles)
          : []
        const payload =
          text.trim() ||
          (otherFiles.length
            ? `请查看附件：${otherFiles.map((f) => f.name).join('、')}`
            : '')
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

        dispatch({
          type: 'send',
          text: payload,
          images,
        })
        let sessionId = stateRef.current.activeSessionId
        if (!sessionId) return

        if (!session || session.source !== 'grok') {
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
            return
          }
        }
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
              if (event.type === 'usage') {
                dispatch({
                  type: 'patch-context-used',
                  sessionId,
                  used: event.used,
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
          const sid = sessionId
          const titleCwd = cwd
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
          const timer = window.setTimeout(pullTitle, 1800)
          timers.current.push(timer)
        }
      })()
    },
    [notify],
  )

  const api: WorkspaceApi = {
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
    sessionCwd,
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
