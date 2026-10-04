import { looksLikeHtml, isWebUrl } from './paths'

export type FsEntry = {
  name: string
  path: string
  kind: 'dir' | 'file'
}

export type FilePreview = {
  path: string
  name: string
  relative: string
  mime: string
  kind: 'text' | 'image' | 'binary' | 'pdf' | 'markdown' | 'code'
  language?: string
  message?: string
  size: number
  text?: string
  truncated?: boolean
  ancestors: string[]
}

export type GitChange = {
  path: string
  originalPath?: string
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed'
  staged: boolean
  unstaged: boolean
}

export type ShellInfo = {
  id: string
  label: string
  command: string
  args: string[]
  available: boolean
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

export function friendlyFsError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : ''
  if (
    !msg ||
    msg === 'not found' ||
    /^ENOENT\b/.test(msg) ||
    /no such file or directory/i.test(msg)
  ) {
    return fallback
  }
  return msg
}

export async function listDir(path: string): Promise<FsEntry[]> {
  const res = await fetch(`/api/fs/list?path=${encodeURIComponent(path)}`)
  const data = await parseJson<{ entries: FsEntry[] }>(res)
  return data.entries ?? []
}

export async function readFilePreview(
  cwd: string,
  path: string,
): Promise<FilePreview> {
  const q = new URLSearchParams({ cwd, path })
  const res = await fetch(`/api/fs/file?${q}`)
  return parseJson<FilePreview>(res)
}

export function rawFileUrl(cwd: string, path: string): string {
  const q = new URLSearchParams({ cwd, path })
  return `/api/fs/raw?${q}`
}

export async function fetchGitChanges(path: string): Promise<{
  isRepo: boolean
  branch: string
  files: GitChange[]
}> {
  const res = await fetch(`/api/git/changes?path=${encodeURIComponent(path)}`)
  return parseJson(res)
}

export async function fetchGitDiff(
  cwd: string,
  file: string,
): Promise<{ path: string; patch: string }> {
  const q = new URLSearchParams({ path: cwd, file })
  const res = await fetch(`/api/git/diff?${q}`)
  return parseJson(res)
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<T>(res)
}

/** file 为 null 表示全部 */
export function gitStage(cwd: string, file: string | null): Promise<unknown> {
  return postJson('/api/git/stage', { path: cwd, file, all: file == null })
}

export function gitUnstage(cwd: string, file: string | null): Promise<unknown> {
  return postJson('/api/git/unstage', { path: cwd, file, all: file == null })
}

export function gitDiscard(cwd: string, change: GitChange): Promise<unknown> {
  return postJson('/api/git/discard', {
    path: cwd,
    file: change.path,
    originalPath: change.originalPath,
  })
}

export function gitCommit(cwd: string, message: string): Promise<{ sha: string }> {
  return postJson('/api/git/commit', { path: cwd, message })
}

/** 当前文件夹下按名称模糊查找文件，返回相对路径（正斜杠） */
export async function findFiles(
  cwd: string,
  q: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<{ root: string; files: string[] }> {
  const query = new URLSearchParams({ cwd, q, limit: String(limit) })
  const res = await fetch(`/api/fs/find?${query}`, { signal })
  return parseJson(res)
}

export async function fetchShells(): Promise<ShellInfo[]> {
  const res = await fetch('/api/shells')
  const data = await parseJson<{ shells: ShellInfo[] }>(res)
  return data.shells ?? []
}

export type TerminalMode = 'pty' | 'pipe'

export async function startTerminal(
  cwd: string,
  shellId: string,
  size?: { cols: number; rows: number },
): Promise<{
  id: string
  cwd: string
  shellId: string
  reused: boolean
  mode: TerminalMode
}> {
  const res = await fetch('/api/terminal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cwd, shellId, ...size }),
  })
  return parseJson(res)
}

export async function resizeTerminal(id: string, cols: number, rows: number): Promise<void> {
  const res = await fetch(`/api/terminal/${encodeURIComponent(id)}/resize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cols, rows }),
  })
  await parseJson(res)
}

export async function sendTerminal(id: string, text: string): Promise<void> {
  const res = await fetch(`/api/terminal/${encodeURIComponent(id)}/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  await parseJson(res)
}

export async function interruptTerminal(id: string): Promise<void> {
  const res = await fetch(`/api/terminal/${encodeURIComponent(id)}/signal`, {
    method: 'POST',
  })
  await parseJson(res)
}

export async function killTerminal(id: string): Promise<void> {
  const res = await fetch(`/api/terminal/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  await parseJson(res)
}

export async function openExternal(
  target: string,
  cwd?: string,
): Promise<void> {
  const body: Record<string, string> = isWebUrl(target)
    ? { url: target }
    : looksLikeHtml(target)
      ? { path: target, url: target }
      : { path: target }
  if (cwd && !isWebUrl(target)) body.cwd = cwd
  const res = await fetch('/api/open-external', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  await parseJson(res)
}

export async function revealInExplorer(
  target: string,
  cwd?: string,
): Promise<void> {
  const body: Record<string, string | boolean> = {
    path: target,
    reveal: true,
  }
  if (cwd) body.cwd = cwd
  const res = await fetch('/api/open-external', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  await parseJson(res)
}
