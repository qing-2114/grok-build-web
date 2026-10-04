import { turnUsageFrom, type SessionExtras, type TurnUsage } from './session-index.ts'

export type ToolStatus = 'running' | 'success' | 'failed'

export type PlanEntry = {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: string
}

export type WireMessage = {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  createdAt: number
  tool?: { name: string; target: string; status: ToolStatus }
  usage?: TurnUsage
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
      status: ToolStatus
    }
  | { type: 'title'; title: string }
  | { type: 'permission'; requestId: number; title: string; options: unknown }
  | { type: 'done'; stopReason: string }
  | { type: 'error'; message: string }
  | { type: 'usage'; used: number }
  | { type: 'plan'; entries: PlanEntry[] }
  | { type: 'turn'; usage: TurnUsage; stopReason: string }

type AcpUpdate = {
  sessionUpdate?: string
  entries?: unknown
  usage?: unknown
  elapsed_ms?: unknown
  stop_reason?: unknown
  content?: { type?: string; text?: string }
  title?: string
  toolCallId?: string
  kind?: string
  status?: string
  rawInput?: Record<string, unknown>
  locations?: Array<{ path?: string }>
  _meta?: {
    'x.ai/tool'?: { name?: string; label?: string }
    totalTokens?: unknown
  }
}

function asTokenCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value)
  }
  return null
}

export function usageFromParams(params: {
  update?: { _meta?: { totalTokens?: unknown } }
  _meta?: { totalTokens?: unknown }
}): StreamEvent | null {
  const used =
    asTokenCount(params.update?._meta?.totalTokens) ??
    asTokenCount(params._meta?.totalTokens)
  if (used == null) return null
  return { type: 'usage', used }
}

function uid(): string {
  return `msg_${crypto.randomUUID()}`
}

function toolName(update: AcpUpdate): string {
  return update._meta?.['x.ai/tool']?.label || update.title || '工具'
}

function toolTarget(update: AcpUpdate): string {
  const loc = update.locations?.[0]?.path
  if (typeof loc === 'string' && loc) return loc
  const input = update.rawInput ?? {}
  for (const key of [
    'path',
    'target_directory',
    'file_path',
    'command',
    'query',
    'pattern',
  ]) {
    const v = input[key]
    if (typeof v === 'string' && v) return v
  }
  return ''
}

function toolStatus(update: AcpUpdate): ToolStatus {
  const s = update.status
  if (s === 'failed' || s === 'cancelled') return 'failed'
  if (s === 'completed') return 'success'
  return 'running'
}

export function updateToEvent(update: AcpUpdate): StreamEvent | null {
  switch (update.sessionUpdate) {
    case 'user_message_chunk':
      return { type: 'user', text: String(update.content?.text ?? '') }
    case 'agent_message_chunk':
      return { type: 'text', text: String(update.content?.text ?? '') }
    case 'agent_thought_chunk':
      return { type: 'thought', text: String(update.content?.text ?? '') }
    case 'tool_call':
    case 'tool_call_update': {
      const id = String(update.toolCallId ?? uid())
      return {
        type: 'tool',
        id,
        name: toolName(update),
        target: toolTarget(update),
        status: toolStatus(update),
      }
    }
    case 'plan': {
      const entries = Array.isArray(update.entries) ? update.entries : []
      return {
        type: 'plan',
        entries: entries
          .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
          .map((e) => ({
            content: String(e.content ?? ''),
            status:
              e.status === 'completed' || e.status === 'in_progress'
                ? e.status
                : 'pending',
            priority: typeof e.priority === 'string' ? e.priority : undefined,
          })),
      }
    }
    case 'turn_completed': {
      const usage = turnUsageFrom(update as Record<string, unknown>)
      if (!usage) return null
      return {
        type: 'turn',
        usage,
        stopReason: String(update.stop_reason ?? ''),
      }
    }
    case 'session_info_update':
      if (update.title) return { type: 'title', title: String(update.title) }
      return null
    default:
      return null
  }
}

export class TranscriptBuilder {
  messages: WireMessage[] = []
  title = ''
  plan: PlanEntry[] = []

  applyUpdate(update: AcpUpdate): void {
    const ev = updateToEvent(update)
    if (ev) this.applyEvent(ev)
  }

  applyEvent(ev: StreamEvent): void {
    if (ev.type === 'user') this.append('user', ev.text)
    else if (ev.type === 'text') this.append('assistant', ev.text)
    else if (ev.type === 'tool') this.upsertTool(ev)
    else if (ev.type === 'title') this.title = ev.title
    else if (ev.type === 'plan') this.plan = ev.entries
    else if (ev.type === 'turn') {
      // 只挂到本轮（最后一条用户消息之后）的最后一段助手回复上。
      for (let i = this.messages.length - 1; i >= 0; i--) {
        const m = this.messages[i]
        if (m.role === 'user') break
        if (m.role === 'assistant') {
          m.usage = ev.usage
          break
        }
      }
    }
  }

  /** 把磁盘上读到的回合用量和计划补进回放结果（ACP 回放里没有这两样）。 */
  applyExtras(extras: SessionExtras): void {
    if (extras.plan.length && !this.plan.length) this.plan = extras.plan
    if (!extras.usageByPrompt.size) return
    let prompt = -1
    let lastAssistant: WireMessage | null = null
    const flush = () => {
      const usage = extras.usageByPrompt.get(prompt)
      if (lastAssistant && usage && !lastAssistant.usage) lastAssistant.usage = usage
    }
    for (const m of this.messages) {
      if (m.role === 'user') {
        flush()
        prompt += 1
        lastAssistant = null
      } else if (m.role === 'assistant') {
        lastAssistant = m
      }
    }
    flush()
  }

  private append(role: 'user' | 'assistant', text: string): void {
    if (!text) return
    const last = this.messages[this.messages.length - 1]
    if (last && last.role === role && !last.tool) {
      last.content += text
      return
    }
    this.messages.push({
      id: uid(),
      role,
      content: text,
      createdAt: Date.now(),
    })
  }

  private upsertTool(ev: {
    id: string
    name: string
    target: string
    status: ToolStatus
  }): void {
    const existing = this.messages.find(
      (m) => m.role === 'tool' && m.id === ev.id,
    )
    if (existing && existing.tool) {
      if (ev.name) existing.tool.name = ev.name
      if (ev.target) existing.tool.target = ev.target
      existing.tool.status = ev.status
      return
    }
    this.messages.push({
      id: ev.id,
      role: 'tool',
      content: '',
      createdAt: Date.now(),
      tool: {
        name: ev.name,
        target: ev.target,
        status: ev.status,
      },
    })
  }
}

export function permissionMeta(mode: string): Record<string, unknown> {
  if (mode === 'always-approve') return { yoloMode: true }
  if (mode === 'auto') return { autoMode: true }
  if (mode === 'plan') return { planMode: true }
  return {}
}
