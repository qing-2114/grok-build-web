import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'

export type ApiBackend = 'chat_completions' | 'responses' | 'messages'
export type EffortValue = 'low' | 'medium' | 'high' | 'xhigh'

export type DeployModel = {
  catalogId: string
  model: string
  name: string
  contextWindow: number
  efforts: EffortValue[]
  extraLines: string[]
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

const EFFORTS: EffortValue[] = ['low', 'medium', 'high', 'xhigh']
const EFFORT_LABEL: Record<EffortValue, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'xHigh',
}
const BACKENDS: ApiBackend[] = [
  'chat_completions',
  'responses',
  'messages',
]
const MODEL_HEADER = /^\[\[?model\./
const LABEL_RE = /^#\s*grok-build-web-provider\s+(\S+)\s*=\s*(.+)$/
const FETCH_TIMEOUT_MS = 15000
const MAX_BODY = 2 * 1024 * 1024

function grokHome(): string {
  return process.env.GROK_HOME || join(homedir(), '.grok')
}

export function configPath(): string {
  return join(grokHome(), 'config.toml')
}

function isEffort(v: string): v is EffortValue {
  return EFFORTS.includes(v as EffortValue)
}

function isBackend(v: string): v is ApiBackend {
  return BACKENDS.includes(v as ApiBackend)
}

function splitTomlPath(raw: string): string[] {
  const parts: string[] = []
  let i = 0
  while (i < raw.length) {
    if (raw[i] === '"') {
      let out = ''
      i += 1
      while (i < raw.length && raw[i] !== '"') {
        if (raw[i] === '\\' && i + 1 < raw.length) {
          out += raw[i + 1]
          i += 2
          continue
        }
        out += raw[i]
        i += 1
      }
      i += 1
      parts.push(out)
      if (raw[i] === '.') i += 1
      continue
    }
    const next = raw.indexOf('.', i)
    if (next < 0) {
      parts.push(raw.slice(i))
      break
    }
    parts.push(raw.slice(i, next))
    i = next + 1
  }
  return parts.filter(Boolean)
}

function parseHeader(line: string): { array: boolean; path: string[] } | null {
  const t = line.trim()
  if (!t.startsWith('[')) return null
  const array = t.startsWith('[[')
  const inner = array
    ? t.slice(2, t.endsWith(']]') ? -2 : undefined)
    : t.slice(1, t.endsWith(']') ? -1 : undefined)
  if (!inner) return null
  return { array, path: splitTomlPath(inner) }
}

function parseBasicString(raw: string): string {
  if (raw.length < 2 || raw[0] !== '"') return raw
  let out = ''
  for (let i = 1; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '"') break
    if (ch === '\\' && i + 1 < raw.length) {
      const n = raw[i + 1]
      const map: Record<string, string> = {
        n: '\n',
        t: '\t',
        r: '\r',
        '"': '"',
        '\\': '\\',
      }
      out += map[n] ?? n
      i += 1
      continue
    }
    out += ch
  }
  return out
}

// 极简行扫描：只回答两个问题——这一行结束时是否还在多行字符串（""" / '''）
// 里面，以及行内注释（未被引号包住的 `#`）从哪个下标开始。不做完整语法解析。
type LineScan = { open: string | null; commentAt: number }

function scanTomlLine(line: string, open: string | null): LineScan {
  let i = 0
  let state = open
  while (i < line.length) {
    if (state) {
      const at = line.indexOf(state, i)
      if (at < 0) return { open: state, commentAt: -1 }
      i = at + state.length
      state = null
      continue
    }
    const ch = line[i]
    if (ch === '#') return { open: null, commentAt: i }
    if (ch === '"' || ch === "'") {
      const delim = ch.repeat(3)
      if (line.startsWith(delim, i)) {
        const at = line.indexOf(delim, i + 3)
        if (at < 0) {
          state = delim
          i = line.length
          continue
        }
        i = at + 3
        continue
      }
      let j = i + 1
      while (j < line.length) {
        if (ch === '"' && line[j] === '\\') {
          j += 2
          continue
        }
        if (line[j] === ch) break
        j += 1
      }
      if (j >= line.length) return { open: null, commentAt: -1 }
      i = j + 1
      continue
    }
    i += 1
  }
  return { open: state, commentAt: -1 }
}

// `name = foo # x` 的值是 foo，不能把 `# x` 一起当成值存进去。
function parseScalar(raw: string): string | number | boolean {
  const scan = scanTomlLine(raw, null)
  const v = (scan.commentAt >= 0 ? raw.slice(0, scan.commentAt) : raw).trim()
  if (v === 'true') return true
  if (v === 'false') return false
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
    return v.slice(1, -1)
  }
  if (v.startsWith('"')) return parseBasicString(v)
  if (/^[+-]?\d+$/.test(v)) return Number(v)
  if (/^[+-]?\d+\.\d+$/.test(v)) return Number(v)
  return v
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function quoteKey(id: string): string {
  return `"${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

type RawModel = {
  catalogId: string
  fields: Record<string, string | number | boolean>
  extraLines: string[]
  efforts: Array<Record<string, string | number | boolean>>
}

// 删掉原文里所有 model 段（包括 [model.x.sampling] 这类子表），
// 重新生成。多行字符串里的 `[model.` 不是表头，不能被误判。
function stripModelSections(text: string): string {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const out: string[] = []
  let skip = false
  let open: string | null = null
  for (const line of lines) {
    const startedInString = open != null
    open = scanTomlLine(line, open).open
    if (startedInString) {
      if (!skip) out.push(line)
      continue
    }
    const trimmed = line.trim()
    if (LABEL_RE.test(trimmed)) continue
    if (/^\s*\[/.test(line)) {
      skip = MODEL_HEADER.test(trimmed)
    }
    if (!skip) out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

// 逐行解析。凡是重新生成会丢内容的东西（注释、空行、子表、未知键、复杂值、
// 多行字符串）都原样塞进 extraLines，写回时照原样吐出来。
function parseRawModels(text: string): RawModel[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const byId = new Map<string, RawModel>()
  let current: RawModel | null = null
  let effort: Record<string, string | number | boolean> | null = null
  let inSubTable = false
  let open: string | null = null

  const finishEffort = () => {
    if (!current || !effort) return
    current.efforts.push(effort)
    effort = null
  }
  const keep = (rawLine: string) => {
    if (current) current.extraLines.push(rawLine)
  }

  for (const rawLine of lines) {
    const startedInString = open != null
    const scan = scanTomlLine(rawLine, open)
    open = scan.open
    if (startedInString) {
      keep(rawLine)
      continue
    }
    const body =
      scan.commentAt >= 0 ? rawLine.slice(0, scan.commentAt) : rawLine
    const comment = scan.commentAt >= 0 ? rawLine.slice(scan.commentAt) : ''
    const trimmed = body.trim()
    if (!trimmed) {
      // 空行不进 extraLines：dumpModel 自己会在每张 effort 表前插空行，
      // 段与段之间也会拼空行，保留空行会一轮一轮地越积越多。
      if (comment) keep(rawLine)
      continue
    }
    if (trimmed.startsWith('[')) {
      finishEffort()
      const header = parseHeader(trimmed)
      if (
        !header ||
        header.path[0] !== 'model' ||
        header.path.length < 2
      ) {
        current = null
        inSubTable = false
        continue
      }
      const catalogId = header.path[1]
      let rec = byId.get(catalogId)
      if (!rec) {
        rec = { catalogId, fields: {}, extraLines: [], efforts: [] }
        byId.set(catalogId, rec)
      }
      current = rec
      if (header.array && header.path[2] === 'reasoning_efforts') {
        effort = {}
        inSubTable = false
      } else if (header.path.length > 2) {
        // [model.foo.sampling] 之类：原样保留，绝不能整段删掉。
        inSubTable = true
        effort = null
        keep(rawLine)
      } else {
        effort = null
        inSubTable = false
      }
      if (comment) keep(comment)
      continue
    }
    if (!current) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) {
      keep(rawLine)
      continue
    }
    const keyRaw = trimmed.slice(0, eq).trim()
    const valRaw = trimmed.slice(eq + 1).trim()
    const key = keyRaw.startsWith('"') ? parseBasicString(keyRaw) : keyRaw
    if (inSubTable) {
      // 子表里的键属于子表，不能当成 model 的字段。
      keep(rawLine)
      continue
    }
    const complex =
      valRaw.startsWith('{') ||
      valRaw.startsWith('[') ||
      valRaw.startsWith('"""') ||
      valRaw.startsWith("'''")
    if (effort) {
      // effort 表整段由 dumpModel 重新生成（label 用固定文案、default 给首选档），
      // 所以这里只取 value/id：表里的自定义 label 等键仍会丢，属既有行为。
      if (!complex) effort[key] = parseScalar(valRaw)
      if (comment) keep(comment)
      continue
    }
    if (complex) {
      keep(rawLine)
      continue
    }
    if (!KNOWN_FIELDS.has(key)) {
      // 未知键整行原样保留，避免重新格式化时丢注释或改变字面量。
      keep(rawLine)
      continue
    }
    current.fields[key] = parseScalar(valRaw)
    if (comment) keep(comment)
  }
  finishEffort()
  return [...byId.values()]
}

function asString(v: string | number | boolean | undefined, fallback = ''): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return fallback
}

function asNumber(v: string | number | boolean | undefined, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

const KNOWN_FIELDS = new Set([
  'model',
  'base_url',
  'name',
  'api_key',
  'api_backend',
  'context_window',
  'hidden',
])

function rawToModel(raw: RawModel): DeployModel & {
  baseUrl: string
  apiKey: string
  apiBackend: ApiBackend
  hidden: boolean
} {
  const efforts = raw.efforts
    .map((row) => String(row.value ?? row.id ?? ''))
    .filter(isEffort)
  const backendRaw = asString(raw.fields.api_backend, 'chat_completions')
  // 未知键在 parseRawModels 里已经按原样进了 extraLines，这里不再重新拼。
  const extraLines = [...raw.extraLines]
  return {
    catalogId: raw.catalogId,
    model: asString(raw.fields.model, raw.catalogId),
    name: asString(raw.fields.name, raw.catalogId),
    contextWindow: asNumber(raw.fields.context_window, 200000),
    efforts: efforts.length ? [...new Set(efforts)] : ['high'],
    extraLines,
    baseUrl: asString(raw.fields.base_url),
    apiKey: asString(raw.fields.api_key),
    apiBackend: isBackend(backendRaw) ? backendRaw : 'chat_completions',
    hidden: raw.fields.hidden === true,
  }
}

function dumpModel(
  provider: DeployProvider,
  model: DeployModel,
  hidden: boolean,
): string {
  const lines = [`[model.${quoteKey(model.catalogId)}]`]
  lines.push(`model = ${tomlString(model.model || model.catalogId)}`)
  if (provider.baseUrl) lines.push(`base_url = ${tomlString(provider.baseUrl)}`)
  lines.push(`name = ${tomlString(model.name || model.model || model.catalogId)}`)
  if (provider.apiKey) lines.push(`api_key = ${tomlString(provider.apiKey)}`)
  lines.push(`api_backend = ${tomlString(provider.apiBackend)}`)
  if (model.contextWindow > 0) {
    lines.push(`context_window = ${Math.round(model.contextWindow)}`)
  }
  if (hidden) lines.push('hidden = true')
  for (const extra of model.extraLines) lines.push(extra)
  const efforts = model.efforts.filter(isEffort)
  const preferred = efforts.includes('high') ? 'high' : efforts[0]
  for (const value of efforts) {
    lines.push('')
    lines.push(`[[model.${quoteKey(model.catalogId)}.reasoning_efforts]]`)
    lines.push(`value = ${tomlString(value)}`)
    lines.push(`label = ${tomlString(EFFORT_LABEL[value])}`)
    if (value === preferred) lines.push('default = true')
  }
  return lines.join('\n')
}

function slugify(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return slug || 'custom'
}

function hostLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    const parts = host.split('.')
    if (parts[0] === 'api' && parts.length > 2) return slugify(parts[1])
    return slugify(parts[0] || host)
  } catch {
    return 'custom'
  }
}

function readLabels(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(LABEL_RE)
    if (m) map.set(m[1], m[2].trim())
  }
  return map
}

function uniqueId(base: string, taken: Set<string>): string {
  const root = slugify(base)
  if (!taken.has(root)) return root
  for (let i = 2; i < 100; i++) {
    const next = `${root}-${i}`
    if (!taken.has(next)) return next
  }
  return `${root}-${Date.now().toString(36)}`
}

function toProvider(
  id: string,
  name: string,
  list: Array<DeployModel & {
    baseUrl: string
    apiKey: string
    apiBackend: ApiBackend
    hidden: boolean
  }>,
): DeployProvider {
  return {
    id,
    name,
    enabled: list.some((m) => !m.hidden),
    baseUrl: list[0]?.baseUrl ?? '',
    apiKey: list[0]?.apiKey ?? '',
    apiBackend: list[0]?.apiBackend ?? 'chat_completions',
    models: list.map((m) => ({
      catalogId: m.catalogId,
      model: m.model,
      name: m.name,
      contextWindow: m.contextWindow,
      efforts: m.efforts,
      extraLines: m.extraLines,
    })),
  }
}

export function groupProviders(
  rows: Array<DeployModel & {
    baseUrl: string
    apiKey: string
    apiBackend: ApiBackend
    hidden: boolean
  }>,
  labels: Map<string, string> = new Map(),
): DeployProvider[] {
  const used = new Set<string>()
  const taken = new Set<string>()
  const providers: DeployProvider[] = []

  for (const [id, name] of labels) {
    const list = rows.filter(
      (m) => m.catalogId === id || m.catalogId.startsWith(`${id}-`),
    )
    if (!list.length) continue
    for (const m of list) used.add(m.catalogId)
    taken.add(id)
    providers.push(toProvider(id, name || id, list))
  }

  const buckets = new Map<string, typeof rows>()
  for (const row of rows) {
    if (used.has(row.catalogId)) continue
    const key = `${row.baseUrl}\0${row.apiBackend}\0${row.apiKey}`
    const list = buckets.get(key)
    if (list) list.push(row)
    else buckets.set(key, [row])
  }
  for (const list of buckets.values()) {
    const id = uniqueId(hostLabel(list[0].baseUrl), taken)
    taken.add(id)
    providers.push(toProvider(id, labels.get(id) || id, list))
  }
  return providers
}

export async function listProviders(): Promise<DeployProvider[]> {
  let text = ''
  try {
    text = await readFile(configPath(), 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return []
    throw err
  }
  const labels = readLabels(text)
  return groupProviders(parseRawModels(text).map(rawToModel), labels)
}

function assertProviderId(id: string): string {
  const next = id.trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(next)) {
    throw new Error('供应商 ID 只能用字母、数字、点、下划线和连字符')
  }
  return next
}

function catalogIdFor(providerId: string, modelId: string, taken: Set<string>): string {
  const raw = slugify(modelId) || 'model'
  const prefixed =
    raw === providerId || raw.startsWith(`${providerId}-`)
      ? raw
      : `${providerId}-${raw}`
  let id = prefixed.slice(0, 64)
  if (!taken.has(id) && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id)) {
    return id
  }
  for (let n = 2; n < 100; n++) {
    const next = `${prefixed.slice(0, 60)}-${n}`
    if (!taken.has(next)) return next
  }
  return `${prefixed.slice(0, 48)}-${Date.now().toString(36)}`
}

function normalizeModel(input: DeployModel, providerId: string, taken: Set<string>): DeployModel {
  const model = String(input.model ?? '').trim()
  if (!model) throw new Error('模型 ID 不能为空')
  if (model.length > 200) throw new Error('模型 ID 过长')
  const catalogId = assertProviderId(
    String(input.catalogId ?? '').trim() || catalogIdFor(providerId, model, taken),
  )
  taken.add(catalogId)
  const efforts = [...new Set((input.efforts ?? []).filter(isEffort))]
  const contextWindow = Math.round(Number(input.contextWindow) || 0)
  if (contextWindow < 1024 || contextWindow > 16_000_000) {
    throw new Error('上下文大小应在 1024 到 16000000 之间')
  }
  return {
    catalogId,
    model,
    name: String(input.name ?? '').trim() || model,
    contextWindow,
    efforts: efforts.length ? efforts : ['high'],
    // 绝不接受客户端传来的 extraLines：那是逐行写进 [model.*] 的原文，
    // 伪造它可以注入 base_url 甚至整个 [model.evil] 段。真正的 extraLines
    // 由 mergeProviderExtraLines 从磁盘上已有的解析结果里取回。
    extraLines: [],
  }
}

// 保存时用磁盘上已有的 extraLines（同 catalogId）覆盖请求里的，保住用户
// config.toml 里原有的注释、未知键和子表；新模型就是空数组。
export function mergeProviderExtraLines(
  provider: DeployProvider,
  existing: DeployModel[],
): DeployModel[] {
  const byId = new Map(existing.map((m) => [m.catalogId, m]))
  return provider.models.map((m) => ({
    ...m,
    extraLines: [...(byId.get(m.catalogId)?.extraLines ?? [])],
  }))
}

export function parseProviderBody(body: Record<string, unknown>): DeployProvider {
  const rec = (body.provider ?? body) as Record<string, unknown>
  if (!rec || typeof rec !== 'object') throw new Error('供应商数据无效')
  const id = assertProviderId(String(rec.id ?? ''))
  const name = String(rec.name ?? '').trim() || id
  const baseUrl = String(rec.baseUrl ?? '').trim()
  if (!baseUrl) throw new Error('请填写请求地址')
  assertHttpUrl(baseUrl)
  const apiBackendRaw = String(rec.apiBackend ?? 'chat_completions')
  if (!isBackend(apiBackendRaw)) throw new Error('不支持的协议')
  const modelsIn = Array.isArray(rec.models) ? rec.models : []
  if (modelsIn.length > 64) throw new Error('单个供应商最多 64 个模型')
  const taken = new Set<string>()
  const models = modelsIn.map((m) =>
    normalizeModel(m as DeployModel, id, taken),
  )
  return {
    id,
    name: name.slice(0, 80),
    enabled: rec.enabled !== false,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey: String(rec.apiKey ?? ''),
    apiBackend: apiBackendRaw,
    models,
  }
}

async function readToml(): Promise<string> {
  try {
    return await readFile(configPath(), 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return ''
    throw err
  }
}

// config.toml 的读-改-写全部串到一条 promise 链上：两个标签页同时保存时
// 排队执行，而不是互相覆盖。
let writeChain: Promise<unknown> = Promise.resolve()

function withConfigLock<T>(job: () => Promise<T>): Promise<T> {
  const run = writeChain.then(job, job)
  writeChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

// 先写同目录临时文件再 rename 覆盖：中途崩溃也不会把用户的配置（含 API Key）
// 截断成半截。Windows 上 rename 会替换已存在的目标文件。
async function writeFileAtomic(path: string, text: string): Promise<void> {
  const tmp = join(dirname(path), `.${randomUUID()}.config.toml.tmp`)
  try {
    await writeFile(tmp, text, 'utf8')
    await rename(tmp, path)
    return
  } catch {
    // 目标被别的进程占住（杀软、编辑器）时 rename 会失败，退回直接写：
    // 和改动前一样能用，只是少了原子性。
    await rm(tmp, { force: true }).catch(() => undefined)
  }
  await writeFile(path, text, 'utf8')
}

function belongsToProvider(catalogId: string, providerId: string, previousIds: Set<string>): boolean {
  if (previousIds.has(catalogId)) return true
  return catalogId === providerId || catalogId.startsWith(`${providerId}-`)
}

export async function saveProvider(provider: DeployProvider): Promise<DeployProvider[]> {
  return withConfigLock(async () => {
    const text = await readToml()
    const existing = parseRawModels(text).map(rawToModel)
    const labels = readLabels(text)
    const previous = groupProviders(existing, labels).find((p) => p.id === provider.id)
    const previousIds = new Set((previous?.models ?? []).map((m) => m.catalogId))
    const kept = existing.filter(
      (m) => !belongsToProvider(m.catalogId, provider.id, previousIds),
    )
    const hidden = !provider.enabled
    const nextRows = [
      ...kept,
      ...mergeProviderExtraLines(provider, existing).map((m) => ({
        ...m,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        apiBackend: provider.apiBackend,
        hidden,
      })),
    ]
    labels.set(provider.id, provider.name)
    const others = groupProviders(kept, labels).filter((p) => p.id !== provider.id)
    await writeModels(text, nextRows, [...others, provider])
    return groupProviders(nextRows, labels)
  })
}

export async function deleteProvider(id: string): Promise<DeployProvider[]> {
  return withConfigLock(async () => {
    const providerId = assertProviderId(id)
    const text = await readToml()
    const existing = parseRawModels(text).map(rawToModel)
    const labels = readLabels(text)
    const previous = groupProviders(existing, labels).find((p) => p.id === providerId)
    if (!previous) throw new Error('找不到该供应商')
    const previousIds = new Set(previous.models.map((m) => m.catalogId))
    const kept = existing.filter(
      (m) => !belongsToProvider(m.catalogId, providerId, previousIds),
    )
    labels.delete(providerId)
    const remaining = groupProviders(kept, labels)
    await writeModels(text, kept, remaining)
    return remaining
  })
}

export type ConfigModelRow = DeployModel & {
  baseUrl: string
  apiKey: string
  apiBackend: ApiBackend
  hidden: boolean
}

// 纯函数版本：把磁盘原文和要保留的行拼成新的 config.toml 内容，不碰文件系统。
export function renderConfigToml(
  original: string,
  rows: ConfigModelRow[],
  providers: DeployProvider[],
): string {
  const rest = stripModelSections(original)
  const labels = providers
    .filter((p) => p.models.length)
    .map(
      (p) =>
        `# grok-build-web-provider ${p.id} = ${p.name.replace(/[\r\n]+/g, ' ').trim()}`,
    )
    .join('\n')
  const chunks = rows.map((row) =>
    dumpModel(
      {
        id: '',
        name: '',
        enabled: !row.hidden,
        baseUrl: row.baseUrl,
        apiKey: row.apiKey,
        apiBackend: row.apiBackend,
        models: [],
      },
      row,
      row.hidden,
    ),
  )
  const body = [rest.trimEnd(), labels, chunks.join('\n\n')]
    .filter(Boolean)
    .join('\n\n')
  return body.endsWith('\n') ? body : `${body}\n`
}

async function writeModels(
  original: string,
  rows: ConfigModelRow[],
  providers: DeployProvider[],
): Promise<void> {
  const final = renderConfigToml(original, rows, providers)
  await writeFileAtomic(configPath(), final)
}

// 纯函数：按 listProviders/saveProvider 的方式把磁盘原文解析成行。
export function parseConfigModels(text: string): ConfigModelRow[] {
  return parseRawModels(text).map(rawToModel)
}

export function assertHttpUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('请求地址不是合法 URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('请求地址只支持 http 或 https')
  }
  if (!url.hostname) {
    throw new Error('请求地址缺少主机名')
  }
  return url
}

function joinUrl(base: string, path: string): string {
  const root = base.replace(/\/+$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${root}${suffix}`
}

function authHeaders(apiKey: string, backend: ApiBackend): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (!apiKey) return headers
  if (backend === 'messages') {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else {
    headers.Authorization = `Bearer ${apiKey}`
  }
  return headers
}

function scrub(text: string, apiKey: string): string {
  let out = text
  if (apiKey) out = out.split(apiKey).join('***')
  return out.replace(/Bearer\s+\S+/gi, 'Bearer ***')
}

function errorFromBody(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  try {
    const data = JSON.parse(trimmed) as {
      error?: { message?: string } | string
      message?: string
      msg?: string
    }
    if (typeof data.error === 'string') return data.error
    if (data.error?.message) return data.error.message
    if (data.message) return data.message
    if (data.msg) return data.msg
  } catch {
    // plain text
  }
  return trimmed.slice(0, 400)
}

async function readLimited(res: Response): Promise<string> {
  const buf = await res.arrayBuffer()
  const bytes = buf.byteLength > MAX_BODY ? buf.slice(0, MAX_BODY) : buf
  return new TextDecoder().decode(bytes)
}

export async function probeEndpoint(input: {
  baseUrl: string
  apiKey: string
  apiBackend: ApiBackend
  model?: string
}): Promise<DeployTestResult> {
  const baseUrl = String(input.baseUrl ?? '').trim()
  const apiKey = String(input.apiKey ?? '')
  const apiBackend = isBackend(String(input.apiBackend ?? ''))
    ? (input.apiBackend as ApiBackend)
    : 'chat_completions'
  assertHttpUrl(baseUrl)
  const started = Date.now()
  const model = String(input.model ?? '').trim()
  if (model) {
    try {
      await pingCompletion({
        baseUrl,
        apiKey,
        apiBackend,
        model,
      })
      return {
        ok: true,
        latencyMs: Date.now() - started,
        message: `模型 ${model} 推理接口可用`,
      }
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  }
  return probeReachable({
    baseUrl,
    apiKey,
    apiBackend,
    started,
  })
}

async function probeReachable(input: {
  baseUrl: string
  apiKey: string
  apiBackend: ApiBackend
  started: number
}): Promise<DeployTestResult> {
  const { baseUrl, apiKey, apiBackend, started } = input
  const headers = authHeaders(apiKey, apiBackend)
  const urls = [baseUrl.replace(/\/+$/, ''), joinUrl(baseUrl, '/models')]
  let lastError = ''
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
      })
      const text = await readLimited(res)
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          latencyMs: Date.now() - started,
          message: scrub(
            errorFromBody(text) || `API Key 被拒绝（HTTP ${res.status}）`,
            apiKey,
          ),
        }
      }
      return {
        ok: true,
        latencyMs: Date.now() - started,
        message: '已通过 API Key 连通请求地址',
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }
  return {
    ok: false,
    latencyMs: Date.now() - started,
    message: lastError || '无法连通请求地址',
  }
}

export async function fetchCatalog(input: {
  baseUrl: string
  apiKey: string
  apiBackend: ApiBackend
}): Promise<RemoteCatalogItem[]> {
  const baseUrl = String(input.baseUrl ?? '').trim()
  const apiKey = String(input.apiKey ?? '')
  const apiBackend = isBackend(String(input.apiBackend ?? ''))
    ? (input.apiBackend as ApiBackend)
    : 'chat_completions'
  assertHttpUrl(baseUrl)
  const url = joinUrl(baseUrl, '/models')
  const res = await fetch(url, {
    method: 'GET',
    headers: authHeaders(apiKey, apiBackend),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  })
  const text = await readLimited(res)
  if (!res.ok) {
    throw new Error(
      scrub(
        errorFromBody(text) || `获取模型列表失败（HTTP ${res.status}）`,
        apiKey,
      ),
    )
  }
  let data: unknown
  try {
    data = JSON.parse(text) as unknown
  } catch {
    throw new Error('模型列表不是 JSON')
  }
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)
      ? (data as { data: unknown[] }).data
      : data && typeof data === 'object' && Array.isArray((data as { models?: unknown }).models)
        ? (data as { models: unknown[] }).models
        : null
  if (!rows) throw new Error('模型列表格式无法识别')
  const out: RemoteCatalogItem[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const rec = row as { id?: unknown; name?: unknown; model?: unknown }
    const id = String(rec.id ?? rec.model ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      name: String(rec.name ?? id),
    })
  }
  return out.slice(0, 400)
}

async function pingCompletion(input: {
  baseUrl: string
  apiKey: string
  apiBackend: ApiBackend
  model: string
}): Promise<void> {
  const { baseUrl, apiKey, apiBackend, model } = input
  let path = '/chat/completions'
  let body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 1,
    stream: false,
  }
  if (apiBackend === 'responses') {
    path = '/responses'
    body = {
      model,
      input: 'ping',
      max_output_tokens: 1,
    }
  } else if (apiBackend === 'messages') {
    path = '/messages'
    body = {
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    }
  }
  const res = await fetch(joinUrl(baseUrl, path), {
    method: 'POST',
    headers: {
      ...authHeaders(apiKey, apiBackend),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  })
  const text = await readLimited(res)
  if (!res.ok) {
    throw new Error(
      scrub(errorFromBody(text) || `HTTP ${res.status}`, apiKey),
    )
  }
}
