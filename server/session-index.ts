// 读 ~/.grok/sessions/*/*/updates.jsonl：全文搜索、用量统计、工具调用详情。
// 只读，不改 grok 的文件。索引按 (mtime, size) 缓存在内存里，文件没变就不重扫。
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { findSessionDir, grokHome } from './context.ts'

export type TurnUsage = {
  input: number
  output: number
  cached: number
  reasoning: number
  total: number
  calls: number
  elapsedMs: number
}

// 一个回合可能用到多个模型，每个模型一条记录；只有最后一条 countsTurn。
type TurnRecord = TurnUsage & { at: number; model: string; countsTurn: boolean }

type Digest = {
  id: string
  cwd: string
  mtimeMs: number
  size: number
  text: string
  lower: string
  turns: TurnRecord[]
  lastAt: number
}

const TEXT_CAP = 300_000
const index = new Map<string, Digest>()
let building: Promise<void> | null = null

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0
}

export function turnUsageFrom(update: Record<string, unknown>): TurnUsage | null {
  const u = update.usage as Record<string, unknown> | undefined
  if (!u || typeof u !== 'object') return null
  return {
    input: num(u.inputTokens),
    output: num(u.outputTokens),
    cached: num(u.cachedReadTokens),
    reasoning: num(u.reasoningTokens),
    total: num(u.totalTokens),
    calls: num(u.modelCalls),
    elapsedMs: num(update.elapsed_ms),
  }
}

function eachLine(file: string, onLine: (line: string) => void): Promise<void> {
  return new Promise((resolve) => {
    const stream = createReadStream(file, { encoding: 'utf8' })
    const rl = createInterface({ input: stream, crlfDelay: Infinity })
    rl.on('line', onLine)
    rl.on('close', () => resolve())
    stream.on('error', () => {
      rl.close()
      resolve()
    })
  })
}

async function digestFile(file: string, id: string, cwd: string): Promise<Digest | null> {
  const st = await stat(file).catch(() => null)
  if (!st) return null
  const prev = index.get(id)
  if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) return prev
  const parts: string[] = []
  let length = 0
  let lastRole = ''
  const turns: TurnRecord[] = []
  await eachLine(file, (line) => {
    const isMsg =
      line.includes('"user_message_chunk"') || line.includes('"agent_message_chunk"')
    const isTurn = line.includes('"turn_completed"')
    if (!isMsg && !isTurn) return
    let row: { timestamp?: number; params?: { update?: Record<string, unknown> } }
    try {
      row = JSON.parse(line)
    } catch {
      return
    }
    const update = row.params?.update
    if (!update) return
    const kind = update.sessionUpdate
    if (kind === 'user_message_chunk' || kind === 'agent_message_chunk') {
      if (length >= TEXT_CAP) return
      const text = String((update.content as { text?: unknown } | undefined)?.text ?? '')
      if (!text) return
      if (lastRole && lastRole !== kind) parts.push('\n\n')
      lastRole = kind
      parts.push(text)
      length += text.length
      return
    }
    if (kind === 'turn_completed') {
      const at = num(row.timestamp) * 1000
      const models = (update.usage as { modelUsage?: Record<string, Record<string, unknown>> } | undefined)
        ?.modelUsage
      if (models && typeof models === 'object' && Object.keys(models).length) {
        for (const [model, u] of Object.entries(models)) {
          const usage = turnUsageFrom({ usage: u, elapsed_ms: 0 })
          if (usage) turns.push({ ...usage, at, model, countsTurn: false })
        }
        const last = turns[turns.length - 1]
        if (last) {
          last.elapsedMs = num(update.elapsed_ms)
          last.countsTurn = true
        }
      } else {
        const usage = turnUsageFrom(update)
        if (usage) turns.push({ ...usage, at, model: '', countsTurn: true })
      }
    }
  })
  const text = parts.join('')
  const digest: Digest = {
    id,
    cwd,
    mtimeMs: st.mtimeMs,
    size: st.size,
    text,
    lower: text.toLowerCase(),
    turns,
    lastAt: st.mtimeMs,
  }
  index.set(id, digest)
  return digest
}

async function refreshIndex(): Promise<void> {
  if (building) return building
  building = (async () => {
    const root = join(grokHome(), 'sessions')
    const seen = new Set<string>()
    const groups = await readdir(root, { withFileTypes: true }).catch(() => [])
    for (const group of groups) {
      if (!group.isDirectory()) continue
      let cwd = group.name
      try {
        cwd = decodeURIComponent(group.name)
      } catch {
        // 保留原名
      }
      let items
      try {
        items = await readdir(join(root, group.name), { withFileTypes: true })
      } catch {
        continue
      }
      for (const it of items) {
        if (!it.isDirectory()) continue
        let id = it.name
        try {
          id = decodeURIComponent(it.name)
        } catch {
          // 保留原名
        }
        seen.add(id)
        await digestFile(join(root, group.name, it.name, 'updates.jsonl'), id, cwd)
      }
    }
    for (const id of index.keys()) if (!seen.has(id)) index.delete(id)
  })().finally(() => {
    building = null
  })
  return building
}

export type SearchHit = { id: string; cwd: string; snippet: string; updatedAt: number }

export async function searchSessions(query: string, limit = 30): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  await refreshIndex()
  const hits: SearchHit[] = []
  for (const d of index.values()) {
    const at = d.lower.indexOf(q)
    if (at < 0) continue
    const start = Math.max(0, at - 40)
    const end = Math.min(d.text.length, at + q.length + 80)
    const snippet =
      (start > 0 ? '…' : '') +
      d.text.slice(start, end).replace(/\s+/g, ' ').trim() +
      (end < d.text.length ? '…' : '')
    hits.push({ id: d.id, cwd: d.cwd, snippet, updatedAt: d.lastAt })
  }
  hits.sort((a, b) => b.updatedAt - a.updatedAt)
  return hits.slice(0, limit)
}

export type UsageReport = {
  days: Array<{ date: string } & TurnUsage & { turns: number }>
  models: Array<{ model: string } & TurnUsage & { turns: number }>
  sessions: Array<{ id: string; cwd: string } & TurnUsage & { turns: number }>
  totals: TurnUsage & { turns: number }
}

function zero(): TurnUsage & { turns: number } {
  return { input: 0, output: 0, cached: 0, reasoning: 0, total: 0, calls: 0, elapsedMs: 0, turns: 0 }
}

function add(into: TurnUsage & { turns: number }, t: TurnUsage, countsTurn = true): void {
  into.input += t.input
  into.output += t.output
  into.cached += t.cached
  into.reasoning += t.reasoning
  into.total += t.total
  into.calls += t.calls
  into.elapsedMs += t.elapsedMs
  if (countsTurn) into.turns += 1
}

function localDate(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export async function usageReport(days = 30): Promise<UsageReport> {
  await refreshIndex()
  const since = Date.now() - Math.max(1, Math.min(days, 366)) * 86_400_000
  const byDay = new Map<string, TurnUsage & { turns: number }>()
  const byModel = new Map<string, TurnUsage & { turns: number }>()
  const bySession = new Map<string, TurnUsage & { turns: number; cwd: string }>()
  const totals = zero()
  for (const d of index.values()) {
    for (const t of d.turns) {
      if (!t.at || t.at < since) continue
      const day = localDate(t.at)
      if (!byDay.has(day)) byDay.set(day, zero())
      add(byDay.get(day)!, t, t.countsTurn)
      const model = t.model || '未知模型'
      if (!byModel.has(model)) byModel.set(model, zero())
      add(byModel.get(model)!, t)
      if (!bySession.has(d.id)) bySession.set(d.id, { ...zero(), cwd: d.cwd })
      add(bySession.get(d.id)!, t, t.countsTurn)
      add(totals, t, t.countsTurn)
    }
  }
  return {
    days: [...byDay.entries()]
      .map(([date, u]) => ({ date, ...u }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    models: [...byModel.entries()]
      .map(([model, u]) => ({ model, ...u }))
      .sort((a, b) => b.total - a.total),
    sessions: [...bySession.entries()]
      .map(([id, u]) => ({ id, ...u }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20),
    totals,
  }
}

// ---- 工具调用详情 ----

export type ToolDiff = { path: string; oldText: string; newText: string; truncated: boolean }
export type ToolDetail = {
  found: boolean
  input: string
  output: string
  diffs: ToolDiff[]
  truncated: boolean
}

const OUTPUT_CAP = 40_000
const INPUT_CAP = 12_000
const DIFF_CAP = 120_000

function isByteArray(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.length < 5_000_000 &&
    typeof v[0] === 'number' &&
    v.every((n) => typeof n === 'number' && n >= 0 && n <= 255 && Number.isInteger(n))
  )
}

// grok 把 stdout 之类存成字节数组；递归换成字符串，便于展示。
function decodeBytes(v: unknown, depth = 0): unknown {
  if (depth > 6) return v
  if (isByteArray(v)) return Buffer.from(v).toString('utf8')
  if (Array.isArray(v)) return v.map((x) => decodeBytes(x, depth + 1))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[k] = decodeBytes(x, depth + 1)
    return out
  }
  return v
}

// 常见形状里挑出「正文」：stdout / output / 文件内容 / 列目录结果。
function primaryText(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return typeof raw === 'string' ? raw : null
  const o = raw as Record<string, unknown>
  for (const key of ['stdout', 'output', 'content', 'text']) {
    if (typeof o[key] === 'string' && o[key]) {
      const err = typeof o.stderr === 'string' && o.stderr ? `\n[stderr]\n${o.stderr}` : ''
      return (o[key] as string) + err
    }
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = primaryText(v)
      if (inner) return inner
    }
  }
  return null
}

function cap(s: string, n: number): [string, boolean] {
  return s.length > n ? [`${s.slice(0, n)}\n…`, true] : [s, false]
}

export async function toolDetail(cwd: string, sessionId: string, toolId: string): Promise<ToolDetail> {
  const empty: ToolDetail = { found: false, input: '', output: '', diffs: [], truncated: false }
  if (!toolId || toolId.length > 200) return empty
  const dir = await findSessionDir(cwd, sessionId)
  if (!dir) return empty
  let rawInput: unknown = null
  let rawOutput: unknown = null
  const texts: string[] = []
  const diffs = new Map<string, ToolDiff>()
  let found = false
  const needle = JSON.stringify(toolId)
  await eachLine(join(dir, 'updates.jsonl'), (line) => {
    if (!line.includes(needle)) return
    let row: { params?: { update?: Record<string, unknown> } }
    try {
      row = JSON.parse(line)
    } catch {
      return
    }
    const u = row.params?.update
    if (!u || u.toolCallId !== toolId) return
    found = true
    if (u.rawInput && typeof u.rawInput === 'object' && Object.keys(u.rawInput).length) {
      rawInput = u.rawInput
    }
    if (u.rawOutput != null) rawOutput = u.rawOutput
    for (const c of (Array.isArray(u.content) ? u.content : []) as Array<Record<string, unknown>>) {
      if (c.type === 'diff' && typeof c.path === 'string') {
        const [oldText, a] = cap(String(c.oldText ?? ''), DIFF_CAP)
        const [newText, b] = cap(String(c.newText ?? ''), DIFF_CAP)
        diffs.set(c.path, { path: c.path, oldText, newText, truncated: a || b })
      } else if (c.type === 'content') {
        const t = (c.content as { text?: unknown } | undefined)?.text
        if (typeof t === 'string' && t && !texts.includes(t)) texts.push(t)
      }
    }
  })
  if (!found) return empty
  const decoded = decodeBytes(rawOutput)
  const primary = primaryText(decoded)
  let output = primary ?? ''
  if (!output && texts.length) output = texts.join('\n')
  else if (texts.length && !output.includes(texts[0])) output = `${texts.join('\n')}\n\n${output}`
  // 编辑类工具已经有 diff，就不再贴一遍原始 JSON。
  if (!output && decoded != null && !diffs.size) output = JSON.stringify(decoded, null, 2)
  const [out, t1] = cap(output, OUTPUT_CAP)
  const [inp, t2] = cap(rawInput ? JSON.stringify(rawInput, null, 2) : '', INPUT_CAP)
  return { found: true, input: inp, output: out, diffs: [...diffs.values()], truncated: t1 || t2 }
}

// ---- 载入会话时补上 ACP 回放里没有的内容 ----
// grok 的 session/load 只回放标准 ACP 更新（消息、工具），turn_completed 和 plan
// 是 grok 扩展，要从 updates.jsonl 里读。用量按 promptIndex 对到第几条用户消息。

export type SessionExtras = {
  /** 第 N 条用户消息（promptIndex）那一轮的用量 */
  usageByPrompt: Map<number, TurnUsage>
  plan: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed'; priority?: string }>
}

export async function sessionExtrasFromDisk(cwd: string, sessionId: string): Promise<SessionExtras> {
  const extras: SessionExtras = { usageByPrompt: new Map(), plan: [] }
  const dir = await findSessionDir(cwd, sessionId)
  if (!dir) return extras
  let promptIndex = -1
  await eachLine(join(dir, 'updates.jsonl'), (line) => {
    const isUser = line.includes('"user_message_chunk"')
    const isTurn = line.includes('"turn_completed"')
    const isPlan = line.includes('"plan"') && line.includes('"entries"')
    if (!isUser && !isTurn && !isPlan) return
    let row: { params?: { update?: Record<string, unknown> } }
    try {
      row = JSON.parse(line)
    } catch {
      return
    }
    const u = row.params?.update
    if (!u) return
    if (u.sessionUpdate === 'user_message_chunk') {
      const idx = (u._meta as { promptIndex?: unknown } | undefined)?.promptIndex
      if (typeof idx === 'number') promptIndex = idx
    } else if (u.sessionUpdate === 'turn_completed') {
      const usage = turnUsageFrom(u)
      if (usage && promptIndex >= 0) extras.usageByPrompt.set(promptIndex, usage)
    } else if (u.sessionUpdate === 'plan' && Array.isArray(u.entries)) {
      extras.plan = (u.entries as Array<Record<string, unknown>>)
        .filter((e) => e && typeof e === 'object')
        .map((e) => ({
          content: String(e.content ?? ''),
          status:
            e.status === 'completed' || e.status === 'in_progress' ? e.status : 'pending',
          priority: typeof e.priority === 'string' ? e.priority : undefined,
        }))
    }
  })
  return extras
}
