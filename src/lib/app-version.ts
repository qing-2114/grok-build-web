export type AppCommit = {
  sha: string
  date: string
  subject: string
}

export type AppVersionInfo = {
  repoUrl: string
  trackBranch: string
  localVersion: string
  remoteVersion: string
  local: AppCommit | null
  remote: AppCommit | null
  isRepo: boolean
  dirty: boolean
  behind: number
  ahead: number
  canUpdate: boolean
  error: string | null
  checkedAt: string
}

export type AppUpdateResult = {
  ok: true
  localVersion: string
  remoteVersion: string
  npmInstall: boolean
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

export async function fetchAppVersion(): Promise<AppVersionInfo> {
  const res = await fetch('/api/app/version')
  return parseJson<AppVersionInfo>(res)
}

export async function updateApp(): Promise<AppUpdateResult> {
  const res = await fetch('/api/app/update', { method: 'POST' })
  return parseJson<AppUpdateResult>(res)
}

function parseVer(v: string): [number, number, number] | null {
  const m = v.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

export function cmpVersion(local: string, remote: string): number {
  const a = parseVer(local)
  const b = parseVer(remote)
  if (!a || !b) return 0
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  }
  return 0
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

export function formatCommitDate(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleDateString('zh-CN')
}

export type VersionStatusKind = 'ok' | 'update' | 'warn' | 'error'

export function versionStatus(info: AppVersionInfo): {
  text: string
  kind: VersionStatusKind
} {
  const ver = cmpVersion(info.localVersion, info.remoteVersion)
  const newerRemote = ver < 0 || info.behind > 0

  if (!info.isRepo) {
    return {
      text: '当前目录不是 git 仓库，只能查看版本号，无法自动更新',
      kind: 'warn',
    }
  }
  if (info.error && info.behind === 0) {
    if (ver < 0 && info.remoteVersion) {
      return {
        text: `有新版本 ${info.remoteVersion}，但${info.error}`,
        kind: 'error',
      }
    }
    return { text: info.error, kind: 'error' }
  }
  if (info.ahead > 0 && info.behind > 0) {
    return { text: '本地与远端分叉，无法自动更新', kind: 'warn' }
  }
  if (info.ahead > 0 && info.behind === 0) {
    return { text: '本地提交尚未推送，无法自动更新', kind: 'warn' }
  }
  if (info.dirty && newerRemote) {
    return {
      text: '有新版本，但工作区有未提交改动，无法自动更新',
      kind: 'warn',
    }
  }
  if (info.behind > 0 && ver === 0) {
    return {
      text: '版本号相同，远端还有未计入版本的提交',
      kind: 'update',
    }
  }
  if (newerRemote) {
    return {
      text: info.remoteVersion ? `有新版本 ${info.remoteVersion}` : '远端有新提交',
      kind: 'update',
    }
  }
  if (ver > 0) {
    return { text: '本地版本号新于 GitHub', kind: 'warn' }
  }
  if (info.error) {
    return { text: info.error, kind: 'error' }
  }
  return { text: '已是最新', kind: 'ok' }
}
