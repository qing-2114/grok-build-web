// MCP 服务器配置：全部通过 Grok Build 自带的 `grok mcp` 子命令读写，
// 不自己解析 / 拼 TOML。参数用数组传给 spawn（不经过 shell），值用 `--env=K=V`
// 这种写法，避免以 `-` 开头的值被当成选项。
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { normalizeFsPath } from './fs.ts'

export type McpScope = 'user' | 'project'
export type McpTransport = 'stdio' | 'http' | 'sse'

export type McpServer = {
  name: string
  scope: string
  transport: McpTransport
  enabled: boolean
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export type McpInput = {
  name: string
  scope: McpScope
  transport: McpTransport
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/
const HEADER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/

function hasControl(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    if (c < 0x20 || c === 0x7f) return true
  }
  return false
}

function runGrok(
  args: string[],
  cwd: string,
  timeoutMs = 30_000,
): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const proc = spawn('grok', args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GROK_DISABLE_AUTOUPDATER: '1', NO_COLOR: '1' },
    })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      err += '\n超时'
      proc.kill()
    }, timeoutMs)
    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')
    proc.stdout.on('data', (c: string) => (out += c))
    proc.stderr.on('data', (c: string) => (err += c))
    proc.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: 1, out: '', err: e.message })
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, out, err })
    })
  })
}

function workDir(cwd: string): string {
  const dir = normalizeFsPath(cwd)
  return dir && existsSync(dir) ? dir : homedir()
}

function failure(r: { out: string; err: string }, what: string): Error {
  const text = (r.err.trim() || r.out.trim()).split(/\r?\n/).slice(-4).join('\n')
  return new Error(text || `${what}失败`)
}

function asRecord(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const out: Record<string, string> = {}
  for (const [k, x] of Object.entries(v)) out[k] = String(x)
  return out
}

/** 列出当前目录能看到的 MCP 服务器（用户级 + 该目录的项目级）。 */
export async function listMcp(cwd: string): Promise<McpServer[]> {
  const r = await runGrok(['mcp', 'list', '--json'], workDir(cwd))
  if (r.code !== 0) throw failure(r, '读取 MCP 配置')
  let data: unknown
  try {
    data = JSON.parse(r.out)
  } catch {
    throw new Error('grok mcp list 的输出无法解析')
  }
  if (!Array.isArray(data)) return []
  return data
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => {
      const url = typeof x.url === 'string' ? x.url : undefined
      const t = x.transport
      const transport: McpTransport =
        t === 'sse' || t === 'http' || t === 'stdio' ? t : url ? 'http' : 'stdio'
      return {
        name: String(x.name ?? ''),
        scope: String(x.scope ?? 'user'),
        transport,
        enabled: x.enabled !== false,
        command: typeof x.command === 'string' ? x.command : undefined,
        args: Array.isArray(x.args) ? x.args.map(String) : undefined,
        env: asRecord(x.env),
        url,
        headers: asRecord(x.headers),
      }
    })
    .filter((s) => s.name)
}

export function assertMcpName(raw: unknown): string {
  const name = String(raw ?? '').trim()
  if (!NAME_RE.test(name)) {
    throw new Error('名称只能用字母、数字、下划线、点和连字符，且以字母或数字开头')
  }
  return name
}

function assertScope(raw: unknown): McpScope {
  return raw === 'project' ? 'project' : 'user'
}

/** 校验并整理成 `grok mcp add` 的参数。导出给测试用。 */
export function mcpAddArgs(input: McpInput): string[] {
  const name = assertMcpName(input.name)
  const scope = assertScope(input.scope)
  const transport: McpTransport =
    input.transport === 'http' || input.transport === 'sse' ? input.transport : 'stdio'
  const args = ['mcp', 'add', `--scope=${scope}`]
  if (transport !== 'stdio') args.push(`--transport=${transport}`)

  for (const [k, v] of Object.entries(input.env ?? {})) {
    if (!ENV_KEY_RE.test(k)) throw new Error(`环境变量名无效：${k}`)
    if (hasControl(v)) throw new Error(`环境变量 ${k} 的值不能含换行或控制字符`)
    args.push(`--env=${k}=${v}`)
  }

  if (transport === 'stdio') {
    const command = String(input.command ?? '').trim()
    if (!command) throw new Error('请填写启动命令')
    if (command.length > 1000 || hasControl(command)) throw new Error('启动命令无效')
    const extra = (input.args ?? []).map(String)
    if (extra.length > 64) throw new Error('参数太多')
    for (const a of extra) {
      if (a.length > 4000 || hasControl(a)) throw new Error('参数不能含换行或控制字符')
    }
    if (Object.keys(input.headers ?? {}).length) throw new Error('本地进程（stdio）不支持请求头')
    // `--` 之后全部原样交给服务器命令，不会被 grok 当成自己的选项。
    args.push(name, '--', command, ...extra)
    return args
  }

  const url = String(input.url ?? '').trim()
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('请填写有效的地址')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('远程地址只能是 http 或 https')
  }
  if (hasControl(url) || url.length > 4000) throw new Error('地址无效')
  for (const [k, v] of Object.entries(input.headers ?? {})) {
    if (!HEADER_RE.test(k)) throw new Error(`请求头名称无效：${k}`)
    if (hasControl(v)) throw new Error(`请求头 ${k} 的值不能含换行或控制字符`)
    args.push(`--header=${k}: ${v}`)
  }
  args.push(name, url)
  return args
}

export async function saveMcp(input: McpInput, cwd: string, previousName?: string): Promise<void> {
  const args = mcpAddArgs(input)
  const dir = workDir(cwd)
  if (input.scope === 'project' && dir === homedir() && !normalizeFsPath(cwd)) {
    throw new Error('项目级配置需要先选择项目文件夹')
  }
  // 改名：先删旧的，再加新的（add 只会按名字新增或覆盖）。
  if (previousName && previousName !== input.name) {
    await removeMcp(previousName, input.scope, cwd)
  }
  const r = await runGrok(args, dir)
  if (r.code !== 0) throw failure(r, '保存 MCP 服务器')
}

export async function removeMcp(name: string, scope: unknown, cwd: string): Promise<void> {
  const safe = assertMcpName(name)
  const dir = workDir(cwd)
  // grok 的「停用」是按名字记在用户配置的 disabled_mcp_servers 里，remove 不会清掉它。
  // 删除前先启用一次，免得清单里留下一个已经不存在的名字。
  const current = await listMcp(dir).catch(() => [])
  if (current.some((s) => s.name === safe && !s.enabled)) {
    await runGrok(['mcp', 'enable', safe], dir)
  }
  const r = await runGrok(['mcp', 'remove', `--scope=${assertScope(scope)}`, safe], dir)
  if (r.code !== 0) throw failure(r, '删除 MCP 服务器')
}

export async function setMcpEnabled(name: string, enabled: boolean, cwd: string): Promise<void> {
  const safe = assertMcpName(name)
  const r = await runGrok(['mcp', enabled ? 'enable' : 'disable', safe], workDir(cwd))
  if (r.code !== 0) throw failure(r, enabled ? '启用' : '停用')
}

export type McpCheck = { label: string; passed: boolean; detail?: string; hint?: string }
export type McpDoctor = { name: string; healthy: boolean; checks: McpCheck[] }

/** `grok mcp doctor`：真的去连一次服务器。失败时退出码非 0，但 JSON 照样输出。 */
export async function doctorMcp(name: string, cwd: string): Promise<McpDoctor> {
  const safe = assertMcpName(name)
  const r = await runGrok(['mcp', 'doctor', '--json', safe], workDir(cwd), 90_000)
  let data: { servers?: Array<Record<string, unknown>> }
  try {
    data = JSON.parse(r.out)
  } catch {
    throw failure(r, '检查')
  }
  const s = (data.servers ?? []).find((x) => x.name === safe) ?? data.servers?.[0]
  if (!s) return { name: safe, healthy: false, checks: [{ label: '没有找到这个服务器', passed: false }] }
  const checks = Array.isArray(s.checks)
    ? (s.checks as Array<Record<string, unknown>>).map((c) => ({
        label: String(c.label ?? ''),
        passed: c.passed === true,
        detail: typeof c.detail === 'string' ? c.detail : undefined,
        hint: typeof c.hint === 'string' ? c.hint : undefined,
      }))
    : []
  return { name: safe, healthy: s.healthy === true, checks }
}
