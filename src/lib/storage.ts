import type {
  EffortLevel,
  PermissionMode,
  Profile,
  Project,
  Session,
} from '../types'
import { uid } from './uid'

export const STORAGE_KEY = 'grok-build-web.v5'
const LEGACY_KEYS = ['grok-build-web.v4']

const PERMISSION_MODES: PermissionMode[] = [
  'ask',
  'plan',
  'auto',
  'always-approve',
]
const EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh']
const DEFAULT_MODEL = 'grok-4.6'
const DEFAULT_SHELL = 'powershell'

export type Persisted = {
  projects: Project[]
  sessions?: Session[]
  activeProjectId: string | null
  activeSessionId: string | null
  permissionMode: PermissionMode
  model: string
  effort: EffortLevel
  profile: Profile
  titleOverrides?: Record<string, string>
  terminalShellId?: string
  sidebarWidth?: number
  rightRailWidth?: number
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asId(value: unknown): string | null {
  const id = asText(value).trim()
  return id || null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normaliseProject(value: unknown): Project | null {
  if (!isRecord(value)) return null
  const path = asText(value.path).trim()
  if (!path) return null
  const name = asText(value.name).replace(/\s+/g, ' ').trim()
  const tail = path.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).pop()
  return {
    id: asId(value.id) ?? uid('proj'),
    name: name || tail || '项目',
    path,
    branch: asText(value.branch),
    branches: Array.isArray(value.branches)
      ? value.branches.filter((b): b is string => typeof b === 'string')
      : [],
  }
}

function normaliseProfile(value: unknown): Profile {
  if (!isRecord(value)) return { name: '', avatar: null }
  const name = asText(value.name).replace(/\s+/g, ' ').trim()
  return {
    name: name.slice(0, 24),
    avatar: typeof value.avatar === 'string' ? value.avatar : null,
  }
}

function normaliseTitleOverrides(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    const title = asText(raw).replace(/\s+/g, ' ').trim()
    if (key && title) out[key] = title
  }
  return out
}

function normaliseWidth(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

function normaliseMode(value: unknown): PermissionMode {
  const mode = asText(value)
  return PERMISSION_MODES.includes(mode as PermissionMode)
    ? (mode as PermissionMode)
    : 'ask'
}

function normaliseEffort(value: unknown): EffortLevel {
  const effort = asText(value)
  return EFFORT_LEVELS.includes(effort as EffortLevel)
    ? (effort as EffortLevel)
    : 'high'
}

export function loadState(): Persisted | null {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean) ??
      null
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    if (!Array.isArray(parsed.projects)) return null
    const projects: Project[] = []
    for (const entry of parsed.projects as unknown[]) {
      const project = normaliseProject(entry)
      if (project) projects.push(project)
    }
    return {
      projects,
      activeProjectId: asId(parsed.activeProjectId),
      activeSessionId: asId(parsed.activeSessionId),
      permissionMode: normaliseMode(parsed.permissionMode),
      model: asText(parsed.model).trim() || DEFAULT_MODEL,
      effort: normaliseEffort(parsed.effort),
      profile: normaliseProfile(parsed.profile),
      titleOverrides: normaliseTitleOverrides(parsed.titleOverrides),
      terminalShellId: asText(parsed.terminalShellId).trim() || DEFAULT_SHELL,
      sidebarWidth: normaliseWidth(parsed.sidebarWidth),
      rightRailWidth: normaliseWidth(parsed.rightRailWidth),
    }
  } catch {
    return null
  }
}

let lastSerialised = ''

export function saveState(state: Persisted): void {
  try {
    const raw = JSON.stringify(state)
    if (raw === lastSerialised) return
    localStorage.setItem(STORAGE_KEY, raw)
    lastSerialised = raw
  } catch {
    // quota / private mode
  }
}

export function clearState(): void {
  lastSerialised = ''
  localStorage.removeItem(STORAGE_KEY)
}
