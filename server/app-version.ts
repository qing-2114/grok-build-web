import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PUBLIC_REPO_URL = 'https://github.com/qing-2114/grok-build-web'
export const PUBLIC_REPO_GIT = `${PUBLIC_REPO_URL}.git`
export const TRACK_BRANCH = 'main'
const UPSTREAM_REF = 'refs/gbw-upstream/main'

export const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

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

let updateLock: Promise<AppUpdateResult> | null = null

function run(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'echo',
      },
    })
    let out = ''
    let err = ''
    let done = false
    const finish = (code: number, extraErr?: string) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({
        code,
        out,
        err: extraErr ? [err, extraErr].filter(Boolean).join('\n') : err,
      })
    }
    const timer = setTimeout(() => {
      proc.kill()
      finish(1, '超时')
    }, timeoutMs)
    proc.stdout?.setEncoding('utf8')
    proc.stderr?.setEncoding('utf8')
    proc.stdout?.on('data', (c: string) => {
      out += c
    })
    proc.stderr?.on('data', (c: string) => {
      err += c
    })
    proc.on('error', (e) => {
      finish(1, e.message)
    })
    proc.on('close', (code) => {
      finish(code ?? 1)
    })
  })
}

function git(args: string[], timeoutMs = 12_000) {
  return run('git', args, APP_ROOT, timeoutMs)
}

function readPackageVersion(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { version?: unknown }
    return typeof parsed.version === 'string' ? parsed.version.trim() : ''
  } catch {
    return ''
  }
}

function localPackageVersion(): string {
  try {
    return readPackageVersion(readFileSync(join(APP_ROOT, 'package.json'), 'utf8'))
  } catch {
    return ''
  }
}

function parseCommit(out: string): AppCommit | null {
  const line = out.replace(/\r/g, '').trim()
  if (!line) return null
  const [sha, date, ...rest] = line.split('\t')
  if (!sha) return null
  return {
    sha: sha.trim(),
    date: (date ?? '').trim(),
    subject: rest.join('\t').trim(),
  }
}

function countFrom(out: string): number {
  const n = Number.parseInt(out.trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

async function isGitRepo(): Promise<boolean> {
  const result = await git(['rev-parse', '--is-inside-work-tree'], 4000)
  return result.code === 0 && result.out.trim() === 'true'
}

async function localCommit(): Promise<AppCommit | null> {
  const result = await git(['log', '-1', '--format=%H%x09%cI%x09%s', 'HEAD'], 4000)
  if (result.code !== 0) return null
  return parseCommit(result.out)
}

async function refCommit(ref: string): Promise<AppCommit | null> {
  const result = await git(['log', '-1', '--format=%H%x09%cI%x09%s', ref], 4000)
  if (result.code !== 0) return null
  return parseCommit(result.out)
}

async function isDirty(): Promise<boolean> {
  const result = await git(['status', '--porcelain'], 8000)
  return result.code === 0 && result.out.trim().length > 0
}

async function fetchUpstream(): Promise<string | null> {
  const result = await git(
    [
      'fetch',
      '--no-tags',
      PUBLIC_REPO_GIT,
      `+refs/heads/${TRACK_BRANCH}:${UPSTREAM_REF}`,
    ],
    20_000,
  )
  if (result.code !== 0) {
    const msg = (result.err || result.out).trim().split(/\r?\n/)[0] || '无法连接 GitHub'
    return msg
  }
  return null
}

async function remotePackageVersion(): Promise<string> {
  const result = await git(['show', `${UPSTREAM_REF}:package.json`], 4000)
  if (result.code !== 0) return ''
  return readPackageVersion(result.out)
}

async function revCount(range: string): Promise<number> {
  const result = await git(['rev-list', '--count', range], 8000)
  if (result.code !== 0) return 0
  return countFrom(result.out)
}

async function fetchRemoteHttp(): Promise<{
  version: string
  commit: AppCommit | null
  error: string | null
}> {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'grok-build-web',
  }
  try {
    const pkgRes = await fetch(
      `https://raw.githubusercontent.com/qing-2114/grok-build-web/${TRACK_BRANCH}/package.json`,
      { headers, signal: AbortSignal.timeout(12_000) },
    )
    if (!pkgRes.ok) {
      return {
        version: '',
        commit: null,
        error: `GitHub 返回 ${pkgRes.status}`,
      }
    }
    const version = readPackageVersion(await pkgRes.text())
    let commit: AppCommit | null = null
    try {
      const commitRes = await fetch(
        `https://api.github.com/repos/qing-2114/grok-build-web/commits/${TRACK_BRANCH}`,
        { headers, signal: AbortSignal.timeout(12_000) },
      )
      if (commitRes.ok) {
        const data = (await commitRes.json()) as {
          sha?: string
          commit?: { committer?: { date?: string }; message?: string }
        }
        const sha = data.sha?.trim() ?? ''
        if (sha) {
          commit = {
            sha,
            date: data.commit?.committer?.date ?? '',
            subject: (data.commit?.message ?? '').split(/\r?\n/)[0] ?? '',
          }
        }
      }
    } catch {
      // version is enough to show
    }
    return { version, commit, error: null }
  } catch (err) {
    return {
      version: '',
      commit: null,
      error: err instanceof Error ? err.message : '无法连接 GitHub',
    }
  }
}

function blockReason(info: {
  isRepo: boolean
  dirty: boolean
  ahead: number
  behind: number
  error: string | null
}): string | null {
  if (!info.isRepo) return '当前目录不是 git 仓库，无法自动更新'
  if (info.error && info.behind === 0) return info.error
  if (info.dirty) return '有未提交的本地改动，无法自动更新'
  if (info.ahead > 0 && info.behind > 0) return '本地与远端分叉，无法自动更新'
  if (info.ahead > 0) return '本地提交尚未推送，无法自动更新'
  if (info.behind === 0) return '已是最新'
  return null
}

export async function readAppVersion(): Promise<AppVersionInfo> {
  const checkedAt = new Date().toISOString()
  const localVersion = localPackageVersion()
  const base: AppVersionInfo = {
    repoUrl: PUBLIC_REPO_URL,
    trackBranch: TRACK_BRANCH,
    localVersion,
    remoteVersion: '',
    local: null,
    remote: null,
    isRepo: false,
    dirty: false,
    behind: 0,
    ahead: 0,
    canUpdate: false,
    error: null,
    checkedAt,
  }

  const repo = await isGitRepo()
  if (!repo) {
    const http = await fetchRemoteHttp()
    return {
      ...base,
      remoteVersion: http.version,
      remote: http.commit,
      error: http.error,
    }
  }

  const [local, dirty] = await Promise.all([localCommit(), isDirty()])
  const fetchErr = await fetchUpstream()
  if (fetchErr) {
    const http = await fetchRemoteHttp()
    const info = {
      ...base,
      isRepo: true,
      dirty,
      local,
      remoteVersion: http.version,
      remote: http.commit,
      error: fetchErr,
    }
    return { ...info, canUpdate: false }
  }

  const [remote, remoteVersion, behind, ahead] = await Promise.all([
    refCommit(UPSTREAM_REF),
    remotePackageVersion(),
    revCount(`HEAD..${UPSTREAM_REF}`),
    revCount(`${UPSTREAM_REF}..HEAD`),
  ])
  const info = {
    ...base,
    isRepo: true,
    dirty,
    local,
    remote,
    remoteVersion,
    behind,
    ahead,
    error: null,
  }
  const blocked = blockReason(info)
  return {
    ...info,
    canUpdate: blocked == null,
  }
}

async function npmInstall(): Promise<void> {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = await run(cmd, ['install'], APP_ROOT, 300_000)
  if (result.code !== 0) {
    throw new Error(
      (result.err || result.out).trim().split(/\r?\n/).slice(-3).join('\n') ||
        'npm install 失败',
    )
  }
}

function readText(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : ''
  } catch {
    return ''
  }
}

export async function updateApp(): Promise<AppUpdateResult> {
  if (updateLock) return updateLock
  const job = (async () => {
    const before = await readAppVersion()
    const reason = blockReason(before)
    if (reason) throw new Error(reason)

    const pkgPath = join(APP_ROOT, 'package.json')
    const lockPath = join(APP_ROOT, 'package-lock.json')
    const pkgBefore = readText(pkgPath)
    const lockBefore = readText(lockPath)

    const merged = await git(['merge', '--ff-only', UPSTREAM_REF], 30_000)
    if (merged.code !== 0) {
      throw new Error(
        (merged.err || merged.out).trim().split(/\r?\n/)[0] ||
          '快进合并失败',
      )
    }

    const needNpm =
      readText(pkgPath) !== pkgBefore || readText(lockPath) !== lockBefore
    if (needNpm) await npmInstall()

    const after = await readAppVersion()
    return {
      ok: true as const,
      localVersion: after.localVersion || before.remoteVersion,
      remoteVersion: after.remoteVersion || before.remoteVersion,
      npmInstall: needNpm,
    }
  })()
  updateLock = job
  try {
    return await job
  } finally {
    updateLock = null
  }
}
