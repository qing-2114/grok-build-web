import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
// 已退出的终端要留着回放（浏览器 EventSource 断线会自动重连同一个 id），
// 但不能无限留着：每个记录最多背着 BUFFER_MAX 字符和一组监听器。
const MAX_EXITED_RECORDS = 8
// byKey 只保证同一个 (cwd, shellId) 复用同一个终端，不同目录仍可无限开。
const MAX_LIVE_TERMINALS = 16

function termKey(cwd: string, shellId: string): string {
  return `${normalizeFsPath(cwd).toLowerCase()}|${shellId}`
}

function liveTerminalCount(): number {
  let count = 0
  for (const rec of byId.values()) {
    if (rec.exitCode == null) count += 1
  }
  return count
}

// Map 保持插入顺序：最先插入的就是最久没被用过的。正在运行的终端永不淘汰。
function evictExitedRecords(): void {
  let exited = 0
  for (const rec of byId.values()) {
    if (rec.exitCode != null) exited += 1
  }
  if (exited <= MAX_EXITED_RECORDS) return
  for (const [id, rec] of byId) {
    if (exited <= MAX_EXITED_RECORDS) break
    if (rec.exitCode == null) continue
    byId.delete(id)
    exited -= 1
  }
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

  evictExitedRecords()
  if (liveTerminalCount() >= MAX_LIVE_TERMINALS) {
    throw new Error(`同时运行的终端最多 ${MAX_LIVE_TERMINALS} 个，请先关闭一些终端`)
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
    // byKey 释放（同目录可以再开），byId 留作重连回放，由 LRU 兜底淘汰。
    if (byKey.get(key) === id) byKey.delete(key)
    evictExitedRecords()
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
    // 重新连接算一次使用：挪到 Map 末尾，淘汰时最后才轮到它。
    byId.delete(id)
    byId.set(id, rec)
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

export type LaunchSpec = {
  command: string
  args: string[]
}

const MAX_LAUNCH_TARGET = 4096

function hasControlChars(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

// 目标里的引号和控制字符一律拒绝（它们能改变命令行解析）；`&` `?` `=` `%`
// `#` `+` 都是正常 URL 字符，必须放行，否则带 `&` 的链接又会打不开。
function assertLaunchTarget(raw: string, label: string): string {
  // 控制字符按原文判断（trim 会把行尾的 \n 吃掉，那样就检查不到了）。
  if (hasControlChars(raw) || raw.includes('"')) {
    throw new Error(`${label}包含非法字符`)
  }
  const target = raw.trim()
  if (!target) throw new Error(`${label}为空`)
  if (target.length > MAX_LAUNCH_TARGET) throw new Error(`${label}过长`)
  return target
}

// 只返回一个可执行文件和参数数组，绝不拼命令行字符串。
// Windows 走 rundll32.exe（普通 exe，CreateProcess 不解析 `&` 等元字符）；
// 之前用 `cmd.exe /c start "" <url>` 会被 cmd 再解析一次，`&` 既能截断链接，
// 也能被注入成命令执行。
function launchSpec(target: string, platform: NodeJS.Platform): LaunchSpec {
  if (platform === 'win32') {
    return {
      command: 'rundll32.exe',
      args: ['url.dll,FileProtocolHandler', target],
    }
  }
  if (platform === 'darwin') return { command: 'open', args: [target] }
  return { command: 'xdg-open', args: [target] }
}

export function externalLaunchArgs(
  target: string,
  platform: NodeJS.Platform = process.platform,
): LaunchSpec {
  const url = assertLaunchTarget(target, '链接')
  if (!/^https?:\/\//i.test(url)) throw new Error('只能打开网页链接')
  return launchSpec(url, platform)
}

export function localHtmlLaunchArgs(
  target: string,
  platform: NodeJS.Platform = process.platform,
): LaunchSpec {
  const abs = assertLaunchTarget(target, '路径')
  if (!/\.html?$/i.test(abs)) throw new Error('不是网页文件')
  return launchSpec(abs, platform)
}

function launchDetached(spec: LaunchSpec): void {
  const child = spawn(spec.command, spec.args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
}

export function openExternal(target: string): void {
  launchDetached(externalLaunchArgs(target))
}

function absFrom(path: string, cwd = ''): string {
  const raw = path.trim().replace(/^file:\/\//i, '')
  if (!raw) return ''
  return cwd ? resolveInRoot(cwd, raw) : normalizeFsPath(raw)
}

export function openLocalHtml(path: string, cwd = ''): void {
  const abs = absFrom(path, cwd)
  if (!abs || !existsSync(abs)) throw new Error('文件不存在')
  launchDetached(localHtmlLaunchArgs(abs))
}

function revealInExplorerWin(target: string): void {
  const safe = target.replace(/"/g, '')
  // Open Explorer from this process. A hidden PowerShell host would start
  // Explorer hidden too, which looks like "nothing happened".
  spawn('explorer.exe', [`/select,"${safe}"`], {
    detached: true,
    stdio: 'ignore',
    windowsVerbatimArguments: true,
  }).unref()

  const ps1 = join(dirname(fileURLToPath(import.meta.url)), 'reveal-explorer.ps1')
  if (!existsSync(ps1)) return
  const env: NodeJS.ProcessEnv = { ...process.env, GROK_REVEAL_PATH: target }
  setTimeout(() => {
    spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-STA',
        '-WindowStyle',
        'Hidden',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        ps1,
      ],
      { detached: true, stdio: 'ignore', env },
    ).unref()
  }, 300)
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
    revealInExplorerWin(target)
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
