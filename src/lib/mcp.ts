export type McpTransport = 'stdio' | 'http' | 'sse'
export type McpScope = 'user' | 'project'

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

export type McpDoctor = {
  name: string
  healthy: boolean
  checks: Array<{ label: string; passed: boolean; detail?: string; hint?: string }>
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

function post<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => parseJson<T>(r))
}

export async function listMcp(cwd: string): Promise<McpServer[]> {
  const res = await fetch(`/api/mcp?cwd=${encodeURIComponent(cwd)}`)
  return (await parseJson<{ servers: McpServer[] }>(res)).servers ?? []
}

type WriteResult = { ok: boolean; restartError: string | null }

export function saveMcp(cwd: string, server: McpInput, previousName?: string): Promise<WriteResult> {
  return post('/api/mcp', { cwd, server, previousName }, 'PUT')
}

export function removeMcp(cwd: string, name: string, scope: string): Promise<WriteResult> {
  return post('/api/mcp/remove', { cwd, name, scope })
}

export function setMcpEnabled(cwd: string, name: string, enabled: boolean): Promise<WriteResult> {
  return post('/api/mcp/enabled', { cwd, name, enabled })
}

export function doctorMcp(cwd: string, name: string): Promise<McpDoctor> {
  return post('/api/mcp/doctor', { cwd, name })
}

/** 「KEY=value」每行一条 → 对象；空行忽略。分隔符为 sep 的第一次出现。 */
export function parsePairs(text: string, sep: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const i = line.indexOf(sep)
    if (i <= 0) throw new Error(`格式应为「名称${sep}值」：${line}`)
    out[line.slice(0, i).trim()] = line.slice(i + sep.length).trim()
  }
  return out
}

export function formatPairs(obj: Record<string, string> | undefined, sep: string): string {
  return Object.entries(obj ?? {})
    .map(([k, v]) => `${k}${sep}${v}`)
    .join('\n')
}
