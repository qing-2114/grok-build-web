import { access, readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type ContextUsage = {
  used: number
  total: number
  percent: number
}

function grokHome(): string {
  return process.env.GROK_HOME?.trim() || join(homedir(), '.grok')
}

function empty(): ContextUsage {
  return { used: 0, total: 0, percent: 0 }
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : 0
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function findSessionDir(
  cwd: string,
  sessionId: string,
): Promise<string | null> {
  if (!sessionId) return null
  const root = join(grokHome(), 'sessions')
  const tried = new Set<string>()
  const candidates: string[] = []
  if (cwd) {
    const variants = [
      cwd,
      cwd.replace(/\//g, '\\'),
      cwd.replace(/\\/g, '/'),
    ]
    for (const path of variants) {
      const dir = join(
        root,
        encodeURIComponent(path),
        encodeURIComponent(sessionId),
      )
      if (tried.has(dir)) continue
      tried.add(dir)
      candidates.push(dir)
    }
  }
  for (const dir of candidates) {
    if (await exists(join(dir, 'signals.json')) || await exists(join(dir, 'summary.json'))) {
      return dir
    }
  }
  try {
    const groups = await readdir(root, { withFileTypes: true })
    for (const group of groups) {
      if (!group.isDirectory()) continue
      const dir = join(root, group.name, encodeURIComponent(sessionId))
      if (await exists(join(dir, 'signals.json')) || await exists(join(dir, 'summary.json'))) {
        return dir
      }
    }
  } catch {
    return null
  }
  return null
}

export async function contextFromDisk(
  cwd: string,
  sessionId: string,
): Promise<ContextUsage> {
  const dir = await findSessionDir(cwd, sessionId)
  if (!dir) return empty()
  try {
    const raw = await readFile(join(dir, 'signals.json'), 'utf8')
    const data = JSON.parse(raw) as {
      contextWindowUsage?: unknown
      contextTokensUsed?: unknown
      contextWindowTokens?: unknown
    }
    const used = asCount(data.contextTokensUsed)
    const total = asCount(data.contextWindowTokens)
    const stored = asCount(data.contextWindowUsage)
    const percent =
      total > 0
        ? Math.min(100, stored || Math.round((used / total) * 100))
        : stored
    return { used, total, percent }
  } catch {
    return empty()
  }
}
