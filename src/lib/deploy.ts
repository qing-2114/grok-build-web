import type { EffortLevel } from '../types'

export type ApiBackend = 'chat_completions' | 'responses' | 'messages'

export type DeployModel = {
  catalogId: string
  model: string
  name: string
  contextWindow: number
  efforts: EffortLevel[]
  extraLines?: string[]
}

export type DeployProvider = {
  id: string
  name: string
  enabled: boolean
  baseUrl: string
  apiKey: string
  apiBackend: ApiBackend
  models: DeployModel[]
}

export type DeployTestResult = {
  ok: boolean
  message: string
  latencyMs: number
  modelCount?: number
}

export type RemoteCatalogItem = {
  id: string
  name: string
}

export const API_BACKENDS: {
  id: ApiBackend
  label: string
  path: string
  hint: string
}[] = [
  {
    id: 'chat_completions',
    label: 'Chat Completions',
    path: '/v1/chat/completions',
    hint: 'OpenAI 兼容对话接口，默认',
  },
  {
    id: 'responses',
    label: 'Responses',
    path: '/v1/responses',
    hint: 'OpenAI Responses 接口',
  },
  {
    id: 'messages',
    label: 'Messages',
    path: '/v1/messages',
    hint: 'Anthropic Messages 接口',
  },
]

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || res.statusText)
  }
  return data
}

export async function fetchDeployments(): Promise<DeployProvider[]> {
  const res = await fetch('/api/deployments')
  const data = await parseJson<{ providers?: DeployProvider[] }>(res)
  return data.providers ?? []
}

export async function saveDeployment(
  provider: DeployProvider,
): Promise<{
  providers: DeployProvider[]
  connected: boolean
  error: string | null
}> {
  const res = await fetch('/api/deployments', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  })
  return parseJson(res)
}

export async function deleteDeployment(id: string): Promise<{
  providers: DeployProvider[]
  connected: boolean
  error: string | null
}> {
  const res = await fetch(`/api/deployments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  return parseJson(res)
}

export async function testDeployment(input: {
  baseUrl: string
  apiKey: string
  apiBackend: ApiBackend
  model?: string
}): Promise<DeployTestResult> {
  const res = await fetch('/api/deployments/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseJson(res)
}

export async function fetchRemoteCatalog(input: {
  baseUrl: string
  apiKey: string
  apiBackend: ApiBackend
}): Promise<RemoteCatalogItem[]> {
  const res = await fetch('/api/deployments/catalog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await parseJson<{ models?: RemoteCatalogItem[] }>(res)
  return data.models ?? []
}

export function parseContextSize(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/,/g, '').replace(/_/g, '')
  const m = t.match(/^(\d+(?:\.\d+)?)([kmb])?$/)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return null
  const mul =
    m[2] === 'k' ? 1000 : m[2] === 'm' ? 1_000_000 : m[2] === 'b' ? 1_000_000_000 : 1
  const v = Math.round(n * mul)
  if (v < 1024 || v > 16_000_000) return null
  return v
}

export function formatContextSize(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1_000_000 && n % 1_000_000 === 0) return `${n / 1_000_000}M`
  if (n >= 1000 && n % 1000 === 0) {
    const k = n / 1000
    return k >= 10 ? `${k}k` : `${k}k`
  }
  return String(n)
}

export function slugifyProvider(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'custom'
}
