import type { EffortLevel, PermissionMode, Profile, Project, Session } from '../types'

export const STORAGE_KEY = 'grok-build-web.v5'
const LEGACY_KEYS = ['grok-build-web.v4']

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

export function loadState(): Persisted | null {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean) ??
      null
    if (!raw) return null
    const data = JSON.parse(raw) as Persisted
    if (!Array.isArray(data.projects)) return null
    return data
  } catch {
    return null
  }
}

export function saveState(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // quota / private mode
  }
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY)
}
