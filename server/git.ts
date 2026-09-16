import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

function runGit(cwd: string, args: string[]): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolvePromise) => {
    const proc = spawn('git', args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')
    proc.stdout.on('data', (c: string) => {
      out += c
    })
    proc.stderr.on('data', (c: string) => {
      err += c
    })
    proc.on('error', (e) => {
      resolvePromise({ code: 1, out: '', err: e.message })
    })
    proc.on('close', (code) => {
      resolvePromise({ code: code ?? 1, out, err })
    })
  })
}

export function normalizePath(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  try {
    return resolve(trimmed).replace(/\//g, '\\')
  } catch {
    return trimmed
  }
}

export function samePath(a: string, b: string): boolean {
  return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase()
}

export type GitInfo = {
  isRepo: boolean
  branch: string
  branches: string[]
}

export async function gitInfo(path: string): Promise<GitInfo> {
  const cwd = normalizePath(path)
  if (!cwd) return { isRepo: false, branch: '', branches: [] }
  const head = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (head.code !== 0) return { isRepo: false, branch: '', branches: [] }
  const branch = head.out.trim()
  const listed = await runGit(cwd, [
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/heads',
  ])
  const branches = listed.out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (branch && !branches.includes(branch)) branches.unshift(branch)
  return { isRepo: true, branch, branches }
}

export async function gitCheckout(
  path: string,
  branch: string,
): Promise<void> {
  const cwd = normalizePath(path)
  const name = branch.trim()
  if (!cwd || !name) throw new Error('缺少路径或分支名')
  const result = await runGit(cwd, ['checkout', name])
  if (result.code !== 0) {
    throw new Error(result.err.trim() || result.out.trim() || 'git checkout 失败')
  }
}
