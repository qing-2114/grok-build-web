import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { cmpVersion } from '../src/lib/semver.ts'

export const GROK_INSTALL_PS1 = 'https://x.ai/cli/install.ps1'

export type GrokCliInfo = {
  installed: boolean
  path: string
  version: string
  latestVersion: string
  updateAvailable: boolean
  error: string | null
}

export function grokBinDir(): string {
  return join(process.env.GROK_HOME?.trim() || join(homedir(), '.grok'), 'bin')
}

export function grokVersionFile(): string {
  return join(process.env.GROK_HOME?.trim() || join(homedir(), '.grok'), 'version.json')
}

function readVersionFile(): string {
  try {
    const raw = readFileSync(grokVersionFile(), 'utf8')
    const parsed = JSON.parse(raw) as { version?: unknown }
    return typeof parsed.version === 'string' ? parsed.version.trim() : ''
  } catch {
    return ''
  }
}

export function parseGrokVersion(text: string): string {
  const match = text.match(/\b(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.]+)?)\b/)
  if (match) return match[1]
  const line = text.trim().split(/\r?\n/)[0]?.trim() ?? ''
  return line
}

export function cliCandidates(): string[] {
  const names = process.platform === 'win32' ? ['grok.exe', 'grok.cmd', 'grok'] : ['grok']
  const found: string[] = []
  const seen = new Set<string>()
  const add = (path: string) => {
    const trimmed = path.trim()
    if (!trimmed || !existsSync(trimmed)) return
    const key = process.platform === 'win32' ? trimmed.toLowerCase() : trimmed
    if (seen.has(key)) return
    seen.add(key)
    found.push(trimmed)
  }

  for (const name of names) add(join(grokBinDir(), name))

  const extra = (process.env.GROK_BIN || '').trim()
  if (extra) {
    add(extra)
    for (const name of names) add(join(extra, name))
    for (const name of names) add(join(extra, 'bin', name))
  }

  const pathEnv = process.env.PATH || ''
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue
    for (const name of names) add(join(dir, name))
  }
  return found
}

function grokEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${grokBinDir()}${delimiter}${process.env.PATH || ''}`,
  }
  // 从 `npm run dev` 拉起时会带上 npm_*。官方 grok 看到这些变量会把自己当成
  // npm 安装，`update --check` 就报 program not found。
  for (const key of Object.keys(env)) {
    if (key.startsWith('npm_')) delete env[key]
  }
  return env
}

function run(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: grokEnv(),
    })
    let out = ''
    let done = false
    const finish = (code: number) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ code, out })
    }
    const timer = setTimeout(() => {
      proc.kill()
      finish(1)
    }, timeoutMs)
    proc.stdout?.setEncoding('utf8')
    proc.stderr?.setEncoding('utf8')
    proc.stdout?.on('data', (c: string) => {
      out += c
    })
    proc.stderr?.on('data', (c: string) => {
      out += c
    })
    proc.on('error', () => finish(1))
    proc.on('close', (code) => finish(code ?? 1))
  })
}

type GrokUpdateCheck = {
  currentVersion?: string
  latestVersion?: string
  current_version?: string
  latest_version?: string
  updateAvailable?: boolean
  update_available?: boolean
}

async function checkGrokUpdate(
  bin: string,
): Promise<{ version: string; latest: string; available: boolean }> {
  const result = await run(bin, ['update', '--check', '--json'], 20_000)
  const line = result.out
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.startsWith('{'))
  if (!line) return { version: '', latest: '', available: false }
  try {
    const data = JSON.parse(line) as GrokUpdateCheck
    const version = (data.currentVersion ?? data.current_version ?? '').trim()
    const latest = (data.latestVersion ?? data.latest_version ?? '').trim()
    const flagged = data.updateAvailable ?? data.update_available
    const available =
      flagged === true ||
      Boolean(version && latest && cmpVersion(version, latest) < 0)
    return { version, latest, available }
  } catch {
    return { version: '', latest: '', available: false }
  }
}

export async function readGrokCli(): Promise<GrokCliInfo> {
  const base: GrokCliInfo = {
    installed: false,
    path: '',
    version: '',
    latestVersion: '',
    updateAvailable: false,
    error: null,
  }
  let path = ''
  let version = ''
  for (const candidate of cliCandidates()) {
    const result = await run(candidate, ['--version'], 8_000)
    const parsed = parseGrokVersion(result.out)
    if (result.code === 0 || parsed) {
      path = candidate
      version = parsed || readVersionFile()
      break
    }
  }
  if (!path) {
    const fileVersion = readVersionFile()
    const fallback = join(grokBinDir(), process.platform === 'win32' ? 'grok.exe' : 'grok')
    if (existsSync(fallback) && fileVersion) {
      path = fallback
      version = fileVersion
    }
  }
  if (!path) {
    return { ...base, error: '未安装 Grok Build CLI' }
  }
  const check = await checkGrokUpdate(path)
  return {
    installed: true,
    path,
    version: version || check.version || '未知',
    latestVersion: check.latest,
    updateAvailable: check.available,
    error: null,
  }
}

let installLock: Promise<{ ok: true; version: string }> | null = null

export async function installGrokCli(): Promise<{ ok: true; version: string }> {
  if (installLock) return installLock
  const job = (async () => {
    if (process.platform !== 'win32') {
      throw new Error('当前只支持在 Windows 上一键安装 Grok Build CLI')
    }
    const result = await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `irm ${GROK_INSTALL_PS1} | iex`,
      ],
      180_000,
    )
    if (result.code !== 0) {
      const tail = result.out.trim().split(/\r?\n/).slice(-4).join('\n')
      throw new Error(tail || 'Grok Build 安装失败')
    }
    const info = await readGrokCli()
    if (!info.installed) throw new Error('安装脚本已结束，但仍找不到 grok 命令')
    return { ok: true as const, version: info.version }
  })()
  installLock = job
  try {
    return await job
  } finally {
    installLock = null
  }
}

export async function updateGrokCli(): Promise<{ ok: true; version: string }> {
  const before = await readGrokCli()
  if (!before.installed) throw new Error('尚未安装 Grok Build CLI')
  if (!before.updateAvailable) throw new Error('Grok Build CLI 已是最新')
  const bin = before.path || 'grok'
  const result = await run(bin, ['update'], 180_000)
  if (result.code !== 0) {
    const tail = result.out.trim().split(/\r?\n/).slice(-4).join('\n')
    throw new Error(tail || 'Grok Build CLI 更新失败')
  }
  const after = await readGrokCli()
  return { ok: true as const, version: after.version || before.latestVersion }
}
