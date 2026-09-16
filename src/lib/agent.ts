import type { EffortLevel, Message, PermissionMode } from '../types'

export type AgentModel = {
  id: string
  label: string
  efforts: EffortLevel[]
}

export type AgentStatus = {
  connected: boolean
  error: string | null
  version: string
  home: string
  models: AgentModel[]
  currentModelId: string
}

export type RemoteSession = {
  id: string
  title: string
  cwd: string
  updatedAt: number
}

export type GitInfo = {
  isRepo: boolean
  branch: string
  branches: string[]
}

export type PermissionOption = {
  optionId: string
  name: string
  kind: string
}

export type StreamEvent =
  | { type: 'user'; text: string }
  | { type: 'text'; text: string }
  | { type: 'thought'; text: string }
  | {
      type: 'tool'
      id: string
      name: string
      target: string
      status: 'running' | 'success' | 'failed'
    }
  | { type: 'title'; title: string }
  | {
      type: 'permission'
      requestId: number
      title: string
      options: PermissionOption[]
    }
  | { type: 'done'; stopReason: string }
  | { type: 'error'; message: string }

export type PromptFile = {
  name: string
  mime: string
  text?: string
  dataBase64?: string
}

const KNOWN_EFFORTS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh']

function asEffort(id: string): EffortLevel | null {
  return KNOWN_EFFORTS.includes(id as EffortLevel) ? (id as EffortLevel) : null
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || res.statusText)
  }
  return data
}

export async function fetchStatus(): Promise<AgentStatus> {
  const res = await fetch('/api/status')
  const data = await parseJson<{
    connected: boolean
    error?: string | null
    version?: string
    home?: string
    models?: Array<{ id: string; label: string; efforts?: string[] }>
    currentModelId?: string
  }>(res)
  return {
    connected: Boolean(data.connected),
    error: data.error ?? null,
    version: data.version ?? '',
    home: data.home ?? '',
    currentModelId: data.currentModelId ?? '',
    models: (data.models ?? []).map((m) => ({
      id: m.id,
      label: m.label,
      efforts: (m.efforts ?? [])
        .map(asEffort)
        .filter((e): e is EffortLevel => e != null),
    })),
  }
}

export async function fetchSessions(cwd?: string): Promise<RemoteSession[]> {
  const q = cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''
  const res = await fetch(`/api/sessions${q}`)
  const data = await parseJson<{ sessions: RemoteSession[] }>(res)
  return data.sessions ?? []
}

export async function createRemoteSession(input: {
  cwd: string
  permissionMode: PermissionMode
  model: string
  effort: EffortLevel
}): Promise<{ sessionId: string; cwd: string }> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseJson(res)
}

export async function loadRemoteSession(
  id: string,
  cwd: string,
): Promise<{
  sessionId: string
  cwd: string
  title: string
  messages: Message[]
}> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cwd }),
  })
  return parseJson(res)
}

export async function deleteRemoteSession(id: string): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  await parseJson(res)
}

export async function setRemoteConfig(
  id: string,
  patch: { model?: string; effort?: EffortLevel },
): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  await parseJson(res)
}

export async function fetchGit(path: string): Promise<GitInfo> {
  const res = await fetch(`/api/git?path=${encodeURIComponent(path)}`)
  return parseJson(res)
}

export async function checkoutGit(
  path: string,
  branch: string,
): Promise<GitInfo> {
  const res = await fetch('/api/git/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, branch }),
  })
  return parseJson(res)
}

export async function answerPermission(
  requestId: number,
  optionId: string | null,
): Promise<void> {
  const res = await fetch('/api/permission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, optionId }),
  })
  await parseJson(res)
}

export async function cancelSession(id: string): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  })
  await parseJson(res)
}

export async function promptSession(
  id: string,
  input: { text: string; files?: PromptFile[] },
  onEvent: (ev: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  })
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || res.statusText)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl = buf.indexOf('\n')
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) {
        const ev = JSON.parse(line) as StreamEvent
        onEvent(ev)
        if (ev.type === 'error') throw new Error(ev.message)
      }
      nl = buf.indexOf('\n')
    }
  }
  const tail = buf.trim()
  if (tail) {
    const ev = JSON.parse(tail) as StreamEvent
    onEvent(ev)
    if (ev.type === 'error') throw new Error(ev.message)
  }
}

const TEXT_MIME = /^(text\/|application\/(json|xml|javascript|toml|yaml|x-yaml|sql))/i
const TEXT_EXT =
  /\.(txt|md|markdown|json|ts|tsx|js|jsx|css|html|xml|yml|yaml|toml|py|rs|go|java|kt|c|h|cpp|hpp|cs|sh|ps1|sql|csv|svg)$/i

export async function filesToPrompt(files: File[]): Promise<PromptFile[]> {
  const out: PromptFile[] = []
  for (const file of files) {
    const mime = file.type || 'application/octet-stream'
    const textLike = TEXT_MIME.test(mime) || TEXT_EXT.test(file.name)
    if (textLike && file.size < 400_000) {
      out.push({ name: file.name, mime, text: await file.text() })
      continue
    }
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    out.push({ name: file.name, mime, dataBase64: btoa(binary) })
  }
  return out
}

export function isGrokSessionId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  )
}
