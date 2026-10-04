import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { platform } from 'node:os'
import { isAbsolute, relative, resolve } from 'node:path'

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
    return resolve(trimmed)
  } catch {
    return trimmed
  }
}

export function samePath(a: string, b: string): boolean {
  const left = normalizePath(a)
  const right = normalizePath(b)
  return platform() === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
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

// git refname 规则：空白、~ ^ : ? * [ \ " ' 以及 `..`、`@{` 都不允许；
// 以 `-` 开头会被 git 当成选项（`git checkout -f` 会静默丢掉未提交的改动），
// 所以必须挡在这里。注意不能用 `git checkout -- <name>` 兜底：那个写法是
// “恢复路径”，不是切分支。
const BRANCH_BAD_CHARS = /[\s~^:?*[\\"']/

export function assertBranchName(raw: string): string {
  const name = raw.trim()
  if (!name) throw new Error('缺少路径或分支名')
  if (name.length > 255) throw new Error('分支名过长')
  if (name.startsWith('-')) throw new Error('分支名不能以 - 开头')
  if (
    BRANCH_BAD_CHARS.test(name) ||
    name.includes('..') ||
    name.includes('@{')
  ) {
    throw new Error('分支名包含非法字符')
  }
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) throw new Error('分支名包含非法字符')
  }
  return name
}

// UI 只发 gitInfo 列出的本地分支，所以这里要求名字确实存在于仓库里；
// 顺带放行远端跟踪分支（origin/x）和 detached HEAD 的 "HEAD"，
// 免得把合法的切换挡掉。
async function assertKnownBranch(cwd: string, name: string): Promise<void> {
  const info = await gitInfo(cwd)
  if (!info.isRepo) throw new Error('不是 git 仓库')
  if (info.branches.includes(name)) return
  const listed = await runGit(cwd, [
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/remotes',
  ])
  const remotes = listed.out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (remotes.includes(name)) return
  throw new Error(`找不到分支 ${name}`)
}

export async function gitCheckout(
  path: string,
  branch: string,
): Promise<void> {
  const cwd = normalizePath(path)
  if (!cwd) throw new Error('缺少路径或分支名')
  const name = assertBranchName(branch)
  await assertKnownBranch(cwd, name)
  const result = await runGit(cwd, ['checkout', name])
  if (result.code !== 0) {
    throw new Error(result.err.trim() || result.out.trim() || 'git checkout 失败')
  }
}

function stripGitQuotes(s: string): string {
  const t = s.trim()
  if (t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\"/g, '"')
  }
  return t
}

export type GitChange = {
  path: string
  originalPath?: string
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed'
  /** 索引里有这一项的改动（`git add` 过） */
  staged: boolean
  /** 工作区里还有没暂存的改动 */
  unstaged: boolean
}

export async function gitChanges(path: string): Promise<{
  isRepo: boolean
  branch: string
  files: GitChange[]
}> {
  const info = await gitInfo(path)
  if (!info.isRepo) return { isRepo: false, branch: '', files: [] }
  const cwd = normalizePath(path)
  const st = await runGit(cwd, [
    '-c',
    'core.quotepath=false',
    'status',
    '--porcelain',
    '-uall',
  ])
  const files: GitChange[] = []
  for (const raw of st.out.split(/\r?\n/)) {
    if (!raw) continue
    const x = raw[0] ?? ' '
    const y = raw[1] ?? ' '
    const rest = raw.slice(3)
    let originalPath: string | undefined
    let filePath = rest
    if (rest.includes(' -> ')) {
      const [a, b] = rest.split(' -> ')
      originalPath = stripGitQuotes(a)
      filePath = stripGitQuotes(b)
    } else {
      filePath = stripGitQuotes(rest)
    }
    if (!filePath) continue
    let status: GitChange['status'] = 'modified'
    if (x === '?' && y === '?') status = 'untracked'
    else if (x === 'R' || y === 'R') status = 'renamed'
    else if (x === 'A' || y === 'A') status = 'added'
    else if (x === 'D' || y === 'D') status = 'deleted'
    files.push({
      path: filePath,
      originalPath,
      status,
      staged: x !== ' ' && x !== '?',
      unstaged: y !== ' ',
    })
  }
  return { isRepo: true, branch: info.branch, files }
}

export async function gitFileDiff(
  path: string,
  file: string,
): Promise<{ path: string; patch: string }> {
  const cwd = normalizePath(path)
  const rel = file.trim()
  if (!cwd || !rel) throw new Error('缺少路径')
  const cached = await runGit(cwd, [
    '-c',
    'core.quotepath=false',
    'diff',
    '--cached',
    '--no-color',
    '--',
    rel,
  ])
  const work = await runGit(cwd, [
    '-c',
    'core.quotepath=false',
    'diff',
    '--no-color',
    '--',
    rel,
  ])
  let patch = [cached.out, work.out].filter((s) => s.trim()).join('\n')
  if (!patch.trim()) {
    const neu = await runGit(cwd, [
      '-c',
      'core.quotepath=false',
      'diff',
      '--no-color',
      '--no-index',
      '--',
      platform() === 'win32' ? 'NUL' : '/dev/null',
      rel,
    ])
    patch = neu.out
  }
  if (patch.length > 200_000) {
    patch = `${patch.slice(0, 200_000)}\n…`
  }
  return { path: rel, patch }
}

// ---- 审查面板的写操作 ----
// 文件参数一律放在 `--` 之后，并要求解析后仍在仓库根目录里；
// 不接受以 `-` 开头的名字，免得被当成选项。

async function repoRoot(path: string): Promise<string> {
  const cwd = normalizePath(path)
  if (!cwd) throw new Error('缺少路径')
  const top = await runGit(cwd, ['rev-parse', '--show-toplevel'])
  if (top.code !== 0) throw new Error('不是 git 仓库')
  return normalizePath(top.out.trim())
}

export function assertRepoFile(root: string, file: string): string {
  const rel = file.trim().replace(/\\/g, '/')
  if (!rel) throw new Error('缺少文件')
  if (rel.startsWith('-')) throw new Error('文件名不能以 - 开头')
  if (isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) throw new Error('只接受仓库内的相对路径')
  for (const ch of rel) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) throw new Error('文件名包含非法字符')
  }
  const abs = resolve(root, rel)
  const back = relative(root, abs)
  if (!back || back.startsWith('..') || isAbsolute(back)) {
    throw new Error('文件不在仓库内')
  }
  return rel
}

async function mustGit(cwd: string, args: string[], what: string): Promise<string> {
  const r = await runGit(cwd, args)
  if (r.code !== 0) throw new Error(r.err.trim() || r.out.trim() || `${what}失败`)
  return r.out
}

export async function gitStage(path: string, file: string | null): Promise<void> {
  const root = await repoRoot(path)
  if (file == null) {
    await mustGit(root, ['add', '-A'], '暂存')
    return
  }
  await mustGit(root, ['add', '--', assertRepoFile(root, file)], '暂存')
}

export async function gitUnstage(path: string, file: string | null): Promise<void> {
  const root = await repoRoot(path)
  const hasHead = (await runGit(root, ['rev-parse', '--verify', '-q', 'HEAD'])).code === 0
  const target = file == null ? '.' : assertRepoFile(root, file)
  if (hasHead) {
    await mustGit(root, ['restore', '--staged', '--', target], '取消暂存')
  } else {
    await mustGit(root, ['rm', '--cached', '-r', '-q', '--', target], '取消暂存')
  }
}

async function inHead(root: string, rel: string): Promise<boolean> {
  return (await runGit(root, ['cat-file', '-e', `HEAD:${rel}`])).code === 0
}

/**
 * 把文件恢复成 HEAD 里的样子。HEAD 里没有的文件（未跟踪 / 新增）会被删除，
 * 重命名会同时恢复原路径、删掉新路径。调用方必须先让用户确认。
 */
export async function gitDiscard(
  path: string,
  file: string,
  originalPath?: string,
): Promise<void> {
  const root = await repoRoot(path)
  const rel = assertRepoFile(root, file)
  const orig = originalPath ? assertRepoFile(root, originalPath) : null
  if (orig && (await inHead(root, orig))) {
    await mustGit(root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', orig], '撤销')
  }
  if (await inHead(root, rel)) {
    await mustGit(root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', rel], '撤销')
    return
  }
  await runGit(root, ['rm', '--cached', '-q', '--ignore-unmatch', '--', rel])
  await rm(resolve(root, rel), { force: true })
}

export async function gitCommit(path: string, message: string): Promise<{ sha: string }> {
  const root = await repoRoot(path)
  const msg = message.replace(/\r\n/g, '\n').trim()
  if (!msg) throw new Error('请填写提交说明')
  if (msg.length > 8000) throw new Error('提交说明过长')
  const staged = await runGit(root, ['diff', '--cached', '--quiet'])
  if (staged.code === 0) throw new Error('没有已暂存的更改')
  // spawn 不经过 shell，说明作为单个参数传入，不会被解释。
  await mustGit(root, ['commit', '-q', '-m', msg], '提交')
  const sha = (await mustGit(root, ['rev-parse', '--short', 'HEAD'], '提交')).trim()
  return { sha }
}
