export type GrokCliInfo = {
  installed: boolean
  path: string
  version: string
  latestVersion: string
  updateAvailable: boolean
  error: string | null
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

export async function fetchGrokCli(): Promise<GrokCliInfo> {
  const res = await fetch('/api/grok/cli')
  return parseJson<GrokCliInfo>(res)
}

export async function installGrokCli(): Promise<{ ok: true; version: string }> {
  const res = await fetch('/api/grok/install', { method: 'POST' })
  return parseJson(res)
}

export async function updateGrokCli(): Promise<{ ok: true; version: string }> {
  const res = await fetch('/api/grok/update', { method: 'POST' })
  return parseJson(res)
}
