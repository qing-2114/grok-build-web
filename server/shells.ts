import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { normalizeFsPath, resolveInRoot } from './fs.ts'

export type ShellInfo = {
  id: string
  label: string
  command: string
  args: string[]
  available: boolean
}

function findOnPath(exe: string): string | null {
  if (!exe) return null
  if ((exe.includes('\\') || exe.includes('/')) && existsSync(exe)) return exe
  const pathEnv = process.env.PATH || ''
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(Boolean)
      : []
  const names = [exe]
  if (!/\.[a-z0-9]+$/i.test(exe)) {
    for (const ext of exts) names.push(exe + ext)
  }
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue
    for (const name of names) {
      const full = join(dir, name)
      if (existsSync(full)) return full
    }
  }
  return existsSync(exe) ? exe : null
}

function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    if (p && existsSync(p)) return p
  }
  return null
}

function registryGitRoot(key: string): string | null {
  try {
    const r = spawnSync('reg', ['query', key, '/v', 'InstallPath'], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 1500,
    })
    const m = String(r.stdout || '').match(/InstallPath\s+REG_\w+\s+(.+)/i)
    const path = m?.[1]?.trim()
    return path || null
  } catch {
    return null
  }
}

function gitInstallRoots(): string[] {
  const roots: string[] = []
  const seen = new Set<string>()
  const add = (p: string | null | undefined) => {
    const n = (p || '').trim().replace(/[\\/]+$/, '')
    if (!n) return
    const key = n.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    roots.push(n)
  }

  add(registryGitRoot('HKLM\\SOFTWARE\\GitForWindows'))
  add(registryGitRoot('HKLM\\SOFTWARE\\WOW6432Node\\GitForWindows'))
  add(registryGitRoot('HKCU\\SOFTWARE\\GitForWindows'))

  const git = findOnPath('git.exe')
  if (git) {
    const dir = dirname(git)
    const name = dir.split(/[/\\]/).pop()?.toLowerCase()
    if (name === 'cmd' || name === 'bin' || name === 'mingw64') {
      add(dirname(dir))
    }
    add(dir)
  }

  return roots
}

function findGitBash(pf: string, pf86: string, local: string): string | null {
  const fromRoots = gitInstallRoots().flatMap((root) => [
    join(root, 'bin', 'bash.exe'),
    join(root, 'usr', 'bin', 'bash.exe'),
  ])
  return firstExisting([
    ...fromRoots,
    join(pf, 'Git', 'bin', 'bash.exe'),
    join(pf, 'Git', 'usr', 'bin', 'bash.exe'),
    join(pf86, 'Git', 'bin', 'bash.exe'),
    join(local, 'Programs', 'Git', 'bin', 'bash.exe'),
  ])
}

function runCapture(
  command: string,
  args: string[],
  timeoutMs = 2500,
): Promise<{ code: number; out: Buffer }> {
  return new Promise((resolvePromise) => {
    const proc = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const chunks: Buffer[] = []
    proc.stdout.on('data', (c: Buffer) => chunks.push(c))
    proc.stderr.on('data', (c: Buffer) => chunks.push(c))
    const timer = setTimeout(() => {
      proc.kill()
      resolvePromise({ code: 1, out: Buffer.concat(chunks) })
    }, timeoutMs)
    proc.on('error', () => {
      clearTimeout(timer)
      resolvePromise({ code: 1, out: Buffer.concat(chunks) })
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      resolvePromise({ code: code ?? 1, out: Buffer.concat(chunks) })
    })
  })
}

function decodeMaybeUtf16(buf: Buffer): string {
  if (buf.length >= 2 && buf[1] === 0) {
    return buf.toString('utf16le')
  }
  return buf.toString('utf8')
}

async function wslAvailable(exe: string): Promise<boolean> {
  try {
    const r = await runCapture(exe, ['-l', '-q'])
    const text = decodeMaybeUtf16(r.out)
    if (/no (installed|distribution)/i.test(text)) return false
    return r.code === 0 && text.replace(/\0/g, '').trim().length > 0
  } catch {
    return false
  }
}

function toWslPath(win: string): string {
  const n = win.replace(/\//g, '\\')
  const m = n.match(/^([A-Za-z]):\\(.*)$/)
  if (!m) return n.replace(/\\/g, '/')
  return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`
}

function detectPosixShells(): ShellInfo[] {
  const login = process.env.SHELL?.trim() || ''
  const loginPath = login && existsSync(login) ? login : null
  const candidates: Array<{ id: string; label: string; command: string | null }> = [
    {
      id: 'zsh',
      label: 'zsh',
      command: findOnPath('zsh') || (loginPath && basename(loginPath) === 'zsh' ? loginPath : null),
    },
    {
      id: 'bash',
      label: 'bash',
      command: findOnPath('bash') || (loginPath && basename(loginPath) === 'bash' ? loginPath : null),
    },
    {
      id: 'fish',
      label: 'fish',
      command: findOnPath('fish') || (loginPath && basename(loginPath) === 'fish' ? loginPath : null),
    },
    {
      id: 'sh',
      label: 'sh',
      command: findOnPath('sh') || (loginPath && basename(loginPath) === 'sh' ? loginPath : null),
    },
  ]

  const shells: ShellInfo[] = []
  const seen = new Set<string>()
  const add = (id: string, label: string, command: string) => {
    if (!command || seen.has(id) || !existsSync(command)) return
    seen.add(id)
    shells.push({
      id,
      label,
      command,
      args: ['-i'],
      available: true,
    })
  }

  if (loginPath) add(basename(loginPath), basename(loginPath), loginPath)
  for (const c of candidates) {
    if (c.command) add(c.id, c.label, c.command)
  }
  return shells
}

async function detectWindowsShells(): Promise<ShellInfo[]> {
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files'
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const local = process.env['LOCALAPPDATA'] || join(homedir(), 'AppData', 'Local')
  const sys = process.env.SystemRoot || 'C:\\Windows'

  const pwsh =
    findOnPath('pwsh.exe') ||
    firstExisting([
      join(pf, 'PowerShell', '7', 'pwsh.exe'),
      join(local, 'Microsoft', 'WindowsApps', 'pwsh.exe'),
    ])
  const powershell =
    findOnPath('powershell.exe') ||
    join(sys, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const cmd =
    findOnPath('cmd.exe') || join(sys, 'System32', 'cmd.exe')
  const gitBash = findGitBash(pf, pf86, local)
  const wsl = findOnPath('wsl.exe') || join(sys, 'System32', 'wsl.exe')
  const wslOk = wsl && existsSync(wsl) ? await wslAvailable(wsl) : false

  const shells: ShellInfo[] = [
    {
      id: 'powershell',
      label: pwsh ? 'PowerShell' : 'Windows PowerShell',
      command: pwsh || powershell,
      args: pwsh
        ? ['-NoLogo']
        : ['-NoLogo', '-NoProfile'],
      available: Boolean(pwsh || (powershell && existsSync(powershell))),
    },
    {
      id: 'cmd',
      label: 'Command Prompt',
      command: cmd,
      args: ['/Q', '/K', 'chcp 65001 >nul'],
      available: Boolean(cmd && existsSync(cmd)),
    },
    {
      id: 'git-bash',
      label: 'Git Bash',
      command: gitBash || '',
      args: ['--login', '-i'],
      available: Boolean(gitBash),
    },
    {
      id: 'wsl',
      label: 'WSL',
      command: wsl && existsSync(wsl) ? wsl : '',
      args: [],
      available: wslOk,
    },
  ]
  return shells.filter((s) => s.available)
}

export async function detectShells(): Promise<ShellInfo[]> {
  if (process.platform === 'win32') return detectWindowsShells()
  return detectPosixShells()
}

export function defaultShellId(
  shells: ShellInfo[],
  platform: NodeJS.Platform = process.platform,
  loginShell = process.env.SHELL || '',
): string {
  if (platform === 'win32') {
    return shells.find((s) => s.id === 'powershell')?.id ?? shells[0]?.id ?? 'powershell'
  }
  const loginName = basename(loginShell.trim())
  return (
    shells.find((s) => s.id === loginName)?.id ??
    shells.find((s) => s.id === 'zsh')?.id ??
    shells.find((s) => s.id === 'bash')?.id ??
    shells[0]?.id ??
    'zsh'
  )
}

type TermEvent =
  | { type: 'data'; text: string }
  | { type: 'exit'; code: number }

type TermRec = {
  id: string
  cwd: string
  shellId: string
  proc: ChildProcessWithoutNullStreams
  buffer: string
  listeners: Set<(ev: TermEvent) => void>
  exitCode: number | null
}

const byId = new Map<string, TermRec>()
const byKey = new Map<string, string>()
const BUFFER_MAX = 200_000

function termKey(cwd: string, shellId: string): string {
  return `${normalizeFsPath(cwd).toLowerCase()}|${shellId}`
}

function appendBuf(rec: TermRec, text: string): void {
  rec.buffer = (rec.buffer + text).slice(-BUFFER_MAX)
}

function emit(rec: TermRec, ev: TermEvent): void {
  if (ev.type === 'data') appendBuf(rec, ev.text)
  for (const fn of rec.listeners) fn(ev)
}

export async function startTerminal(
  cwd: string,
  shellId: string,
): Promise<{ id: string; cwd: string; shellId: string; reused: boolean }> {
  const dir = normalizeFsPath(cwd) || homedir()
  const key = termKey(dir, shellId)
  const existingId = byKey.get(key)
  const existing = existingId ? byId.get(existingId) : undefined
  if (existing && existing.exitCode == null) {
    return {
      id: existing.id,
      cwd: existing.cwd,
      shellId: existing.shellId,
      reused: true,
    }
  }

  const shells = await detectShells()
  const shell = shells.find((s) => s.id === shellId) ?? shells[0]
  if (!shell) throw new Error('没有可用的终端')

  const args =
    shell.id === 'wsl' ? ['--cd', toWslPath(dir)] : shell.args
  const proc = spawn(shell.command, args, {
    cwd: dir,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      PYTHONIOENCODING: 'utf-8',
    },
  })

  const id = randomUUID()
  const rec: TermRec = {
    id,
    cwd: dir,
    shellId: shell.id,
    proc,
    buffer: '',
    listeners: new Set(),
    exitCode: null,
  }
  byId.set(id, rec)
  byKey.set(key, id)

  const onChunk = (buf: Buffer) => {
    emit(rec, { type: 'data', text: buf.toString('utf8') })
  }
  proc.stdout.on('data', onChunk)
  proc.stderr.on('data', onChunk)
  proc.on('error', (err) => {
    emit(rec, { type: 'data', text: `\r\n${err.message}\r\n` })
  })
  proc.on('close', (code) => {
    rec.exitCode = code ?? 0
    emit(rec, { type: 'exit', code: rec.exitCode })
    if (byKey.get(key) === id) byKey.delete(key)
  })

  const banner = `当前目录 ${dir}\r\nShell: ${shell.label}\r\n\r\n`
  emit(rec, { type: 'data', text: banner })

  return { id, cwd: dir, shellId: shell.id, reused: false }
}

export function writeTerminal(id: string, text: string): void {
  const rec = byId.get(id)
  if (!rec || rec.exitCode != null) throw new Error('终端已结束')
  rec.proc.stdin.write(text, 'utf8')
}

export function interruptTerminal(id: string): void {
  const rec = byId.get(id)
  if (!rec || rec.exitCode != null) return
  rec.proc.stdin.write('\u0003')
}

export function closeTerminal(id: string): void {
  const rec = byId.get(id)
  if (!rec) return
  try {
    rec.proc.kill()
  } catch {
    // already gone
  }
  byId.delete(id)
  for (const [k, v] of byKey) {
    if (v === id) byKey.delete(k)
  }
}

export function streamTerminal(
  id: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  return new Promise((resolvePromise) => {
    const rec = byId.get(id)
    if (!rec) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: '终端不存在' }))
      resolvePromise()
      return
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    const send = (obj: unknown) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`)
    }
    send({ type: 'history', text: rec.buffer })
    const onEv = (ev: TermEvent) => send(ev)
    rec.listeners.add(onEv)
    if (rec.exitCode != null) send({ type: 'exit', code: rec.exitCode })
    const done = () => {
      rec.listeners.delete(onEv)
      if (!res.writableEnded) res.end()
      resolvePromise()
    }
    req.on('close', done)
  })
}

export function openCommand(
  target: string,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } {
  if (platform === 'win32') {
    return { command: 'cmd.exe', args: ['/c', 'start', '', target] }
  }
  if (platform === 'darwin') {
    return { command: 'open', args: [target] }
  }
  return { command: 'xdg-open', args: [target] }
}

function spawnDetached(command: string, args: string[]): void {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
}

export function openExternal(target: string): void {
  const url = target.trim()
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('只能打开网页链接')
  }
  const { command, args } = openCommand(url)
  spawnDetached(command, args)
}

function absFrom(path: string, cwd = ''): string {
  const raw = path.trim().replace(/^file:\/\//i, '')
  if (!raw) return ''
  return cwd ? resolveInRoot(cwd, raw) : normalizeFsPath(raw)
}

export function openLocalHtml(path: string, cwd = ''): void {
  const abs = absFrom(path, cwd)
  if (!abs || !existsSync(abs)) throw new Error('文件不存在')
  if (!/\.html?$/i.test(abs)) throw new Error('不是网页文件')
  const { command, args } = openCommand(abs)
  spawnDetached(command, args)
}

export function revealInExplorer(path: string, cwd = ''): void {
  const abs = absFrom(path, cwd)
  if (!abs) throw new Error('路径无效')
  let target = abs
  if (!existsSync(target)) {
    const parent = dirname(target)
    if (!parent || !existsSync(parent)) throw new Error('文件不存在')
    target = parent
  }
  if (process.platform === 'win32') {
    const child = spawn('explorer.exe', [`/select,${target}`], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    return
  }
  if (process.platform === 'darwin') {
    const child = spawn('open', ['-R', target], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    return
  }
  const folder = existsSync(target) ? dirname(target) : target
  const child = spawn('xdg-open', [folder], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}
