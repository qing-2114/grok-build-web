import type { EffortLevel, PermissionMode, Session } from '../types'
import { EFFORTS } from '../types'

export type SlashArgs = 'none' | 'optional' | 'required'

export type SlashIcon =
  | 'new'
  | 'compact'
  | 'copy'
  | 'rename'
  | 'delete'
  | 'model'
  | 'effort'
  | 'plan'
  | 'shield'
  | 'remember'
  | 'memory'
  | 'image'
  | 'video'
  | 'research'
  | 'workflow'
  | 'goal'
  | 'loop'
  | 'aside'
  | 'settings'
  | 'feedback'
  | 'usage'
  | 'docs'
  | 'learn'

export type SlashKind = 'local' | 'send'

export type SlashComplete = 'models' | 'efforts'

export type SlashCommand = {
  id: string
  name: string
  aliases: string[]
  title: string
  description: string
  group: string
  icon: SlashIcon
  args: SlashArgs
  argHint?: string
  complete?: SlashComplete
  kind: SlashKind
}

export type SlashContext = {
  activeProjectId: string | null
  activeSession: Session | null
  permissionMode: PermissionMode
  model: string
  models: { id: string; label: string; efforts: EffortLevel[] }[]
  newChat: (projectId?: string | null) => void
  setMode: (mode: PermissionMode) => void
  setModel: (id: string) => void
  setEffort: (effort: EffortLevel) => void
  setSettingsOpen: (open: boolean) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  notify: (message: string, kind?: 'info' | 'success' | 'error') => void
  copyLastReply: () => boolean
}

export type SlashMenuPhase =
  | { phase: 'catalog'; query: string; key: string }
  | { phase: 'args'; cmd: SlashCommand; query: string; key: string }

export type SlashOutcome =
  | { kind: 'none' }
  | { kind: 'handled' }
  | { kind: 'insert'; text: string }
  | { kind: 'send'; text: string }

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'new',
    name: 'new',
    aliases: ['clear'],
    title: 'new',
    description: 'Start a fresh session and clear the current conversation.',
    group: 'Session Management',
    icon: 'new',
    args: 'none',
    kind: 'local',
  },
  {
    id: 'compact',
    name: 'compact',
    aliases: [],
    title: 'compact',
    description: 'Compress conversation history to reclaim context-window space.',
    group: 'Session Management',
    icon: 'compact',
    args: 'optional',
    argHint: 'context',
    kind: 'send',
  },
  {
    id: 'copy',
    name: 'copy',
    aliases: [],
    title: 'copy',
    description: "Copy the most recent response's source markdown to the clipboard.",
    group: 'Session Management',
    icon: 'copy',
    args: 'none',
    kind: 'local',
  },
  {
    id: 'rename',
    name: 'rename',
    aliases: ['title'],
    title: 'rename',
    description: 'Rename the current session.',
    group: 'Session Management',
    icon: 'rename',
    args: 'required',
    argHint: 'title',
    kind: 'local',
  },
  {
    id: 'delete',
    name: 'delete',
    aliases: [],
    title: 'delete',
    description: "Delete the current session's history.",
    group: 'Session Management',
    icon: 'delete',
    args: 'none',
    kind: 'local',
  },
  {
    id: 'model',
    name: 'model',
    aliases: ['m'],
    title: 'model',
    description: 'Switch models.',
    group: 'Model and Mode',
    icon: 'model',
    args: 'required',
    argHint: 'name',
    complete: 'models',
    kind: 'local',
  },
  {
    id: 'effort',
    name: 'effort',
    aliases: [],
    title: 'effort',
    description: 'Set reasoning effort on the current model.',
    group: 'Model and Mode',
    icon: 'effort',
    args: 'required',
    argHint: 'low|medium|high|xhigh',
    complete: 'efforts',
    kind: 'local',
  },
  {
    id: 'plan',
    name: 'plan',
    aliases: [],
    title: 'plan',
    description: 'Enter plan mode.',
    group: 'Model and Mode',
    icon: 'plan',
    args: 'optional',
    argHint: 'description',
    kind: 'local',
  },
  {
    id: 'auto',
    name: 'auto',
    aliases: [],
    title: 'auto',
    description: 'Classifier approves safe tools (dangerous ones may still prompt).',
    group: 'Model and Mode',
    icon: 'shield',
    args: 'none',
    kind: 'local',
  },
  {
    id: 'always-approve',
    name: 'always-approve',
    aliases: [],
    title: 'always-approve',
    description: 'Skip all permission prompts.',
    group: 'Model and Mode',
    icon: 'shield',
    args: 'none',
    kind: 'local',
  },
  {
    id: 'remember',
    name: 'remember',
    aliases: [],
    title: 'remember',
    description: 'Save a note to memory immediately.',
    group: 'Memory',
    icon: 'remember',
    args: 'required',
    argHint: 'note',
    kind: 'send',
  },
  {
    id: 'memory',
    name: 'memory',
    aliases: ['mem'],
    title: 'memory',
    description: 'Browse, view, and manage saved memories.',
    group: 'Memory',
    icon: 'memory',
    args: 'none',
    kind: 'send',
  },
  {
    id: 'flush',
    name: 'flush',
    aliases: [],
    title: 'flush',
    description: "Save the current session's knowledge to memory right now.",
    group: 'Memory',
    icon: 'memory',
    args: 'none',
    kind: 'send',
  },
  {
    id: 'dream',
    name: 'dream',
    aliases: [],
    title: 'dream',
    description: 'Run memory consolidation — merge session logs into organized topics.',
    group: 'Memory',
    icon: 'memory',
    args: 'none',
    kind: 'send',
  },
  {
    id: 'imagine',
    name: 'imagine',
    aliases: [],
    title: 'imagine',
    description: 'Generate an image from a text description.',
    group: 'Media Generation',
    icon: 'image',
    args: 'required',
    argHint: 'description',
    kind: 'send',
  },
  {
    id: 'imagine-video',
    name: 'imagine-video',
    aliases: [],
    title: 'imagine-video',
    description: 'Generate a video from a text (or image) description.',
    group: 'Media Generation',
    icon: 'video',
    args: 'required',
    argHint: 'description',
    kind: 'send',
  },
  {
    id: 'deep-research',
    name: 'deep-research',
    aliases: [],
    title: 'deep-research',
    description: 'Kick off a background research workflow.',
    group: 'Workflows and Goals',
    icon: 'research',
    args: 'required',
    argHint: 'query',
    kind: 'send',
  },
  {
    id: 'workflow',
    name: 'workflow',
    aliases: [],
    title: 'workflow',
    description: 'Launch a saved workflow, or manage a running one.',
    group: 'Workflows and Goals',
    icon: 'workflow',
    args: 'optional',
    argHint: 'name',
    kind: 'send',
  },
  {
    id: 'goal',
    name: 'goal',
    aliases: [],
    title: 'goal',
    description: 'Set, manage, or check an autonomous goal.',
    group: 'Workflows and Goals',
    icon: 'goal',
    args: 'optional',
    argHint: 'objective',
    kind: 'send',
  },
  {
    id: 'loop',
    name: 'loop',
    aliases: [],
    title: 'loop',
    description: 'Run a prompt on a recurring interval.',
    group: 'Workflows and Goals',
    icon: 'loop',
    args: 'required',
    argHint: 'interval prompt',
    kind: 'send',
  },
  {
    id: 'btw',
    name: 'btw',
    aliases: [],
    title: 'btw',
    description: 'Send an aside to the agent without interrupting the current task.',
    group: 'Workflows and Goals',
    icon: 'aside',
    args: 'required',
    argHint: 'question',
    kind: 'send',
  },
  {
    id: 'settings',
    name: 'settings',
    aliases: ['config', 'preferences', 'prefs'],
    title: 'settings',
    description: 'Open the settings modal.',
    group: 'Other',
    icon: 'settings',
    args: 'none',
    kind: 'local',
  },
  {
    id: 'feedback',
    name: 'feedback',
    aliases: [],
    title: 'feedback',
    description: 'Report an issue or send feedback.',
    group: 'Other',
    icon: 'feedback',
    args: 'optional',
    argHint: 'message',
    kind: 'send',
  },
  {
    id: 'usage',
    name: 'usage',
    aliases: ['cost'],
    title: 'usage',
    description: 'View credit usage or manage billing.',
    group: 'Other',
    icon: 'usage',
    args: 'none',
    kind: 'send',
  },
  {
    id: 'docs',
    name: 'docs',
    aliases: ['howto', 'guides'],
    title: 'docs',
    description: 'Browse the built-in How-to Guides.',
    group: 'Other',
    icon: 'docs',
    args: 'optional',
    argHint: 'title',
    kind: 'send',
  },
  {
    id: 'learn',
    name: 'learn',
    aliases: [],
    title: 'learn',
    description: 'Learn from your own Grok Build sessions and tune your setup.',
    group: 'Other',
    icon: 'learn',
    args: 'optional',
    kind: 'send',
  },
]

const EFFORT_ALIAS: Record<string, EffortLevel> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  '极高': 'xhigh',
  extra: 'xhigh',
  '低': 'low',
  '中': 'medium',
  '高': 'high',
}

export function slashMenuPhase(text: string): SlashMenuPhase | null {
  if (!text.startsWith('/')) return null
  if (text.includes('\n')) return null
  const rest = text.slice(1)
  const space = rest.search(/\s/)
  if (space < 0) {
    return { phase: 'catalog', query: rest, key: rest }
  }
  const cmd = findCommand(rest.slice(0, space))
  if (!cmd?.complete) return null
  const query = rest.slice(space + 1).trim()
  return { phase: 'args', cmd, query, key: `args:${cmd.id}:${query}` }
}

export function parseSlashLine(
  text: string,
): { name: string; args: string } | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null
  if (trimmed.includes('\n')) return null
  const m = trimmed.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/)
  if (!m) return null
  return { name: m[1], args: (m[2] ?? '').trim() }
}

export function findCommand(name: string): SlashCommand | null {
  const q = name.toLowerCase()
  return (
    SLASH_COMMANDS.find(
      (c) => c.name === q || c.aliases.some((a) => a === q),
    ) ?? null
  )
}

function fuzzyScore(query: string, text: string): number {
  if (!query) return 1
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t === q) return 1000
  if (t.startsWith(q)) return 800 - t.length
  const idx = t.indexOf(q)
  if (idx >= 0) return 500 - idx
  let qi = 0
  let gap = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      qi += 1
    } else if (qi > 0) {
      gap += 1
    }
  }
  if (qi !== q.length) return 0
  return Math.max(10, 120 - gap * 4)
}

function commandScore(query: string, cmd: SlashCommand): number {
  if (!query) return 1
  const q = query.toLowerCase()
  if (cmd.name === q || cmd.aliases.includes(q)) return 2000
  const parts = [
    fuzzyScore(q, cmd.name),
    ...cmd.aliases.map((a) => fuzzyScore(q, a)),
    fuzzyScore(q, cmd.title) * 0.9,
    fuzzyScore(q, cmd.description) * 0.35,
    fuzzyScore(q, cmd.group) * 0.2,
  ]
  return Math.max(0, ...parts)
}

export type SlashGroup = {
  group: string
  commands: SlashCommand[]
}

export function filterSlashCommands(query: string): SlashGroup[] {
  const ranked = SLASH_COMMANDS.map((cmd) => ({
    cmd,
    score: commandScore(query, cmd),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.cmd.name.localeCompare(b.cmd.name))

  const groups: SlashGroup[] = []
  for (const { cmd } of ranked) {
    let g = groups.find((x) => x.group === cmd.group)
    if (!g) {
      g = { group: cmd.group, commands: [] }
      groups.push(g)
    }
    g.commands.push(cmd)
  }
  if (!query) {
    const catalog: SlashGroup[] = []
    for (const cmd of SLASH_COMMANDS) {
      let g = catalog.find((x) => x.group === cmd.group)
      if (!g) {
        g = { group: cmd.group, commands: [] }
        catalog.push(g)
      }
      g.commands.push(cmd)
    }
    return catalog
  }
  return groups
}

export function flattenSlash(groups: SlashGroup[]): SlashCommand[] {
  return groups.flatMap((g) => g.commands)
}

function rankItems<T>(
  items: T[],
  query: string,
  texts: (item: T) => string[],
): T[] {
  if (!query) return items
  return items
    .map((item) => ({
      item,
      score: Math.max(0, ...texts(item).map((t) => fuzzyScore(query, t))),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item)
}

export function filterSlashArgs(
  cmd: SlashCommand,
  query: string,
  ctx: Pick<SlashContext, 'model' | 'models'>,
): SlashGroup[] {
  if (cmd.complete === 'models') {
    const models = rankItems(ctx.models, query, (m) => [m.id, m.label])
    return [
      {
        group: 'Models',
        commands: models.map(
          (m): SlashCommand => ({
            id: `arg:model:${m.id}`,
            name: m.id,
            aliases: m.label === m.id ? [] : [m.label],
            title: m.label,
            description: m.id === ctx.model ? `${m.id} · current` : m.id,
            group: 'Models',
            icon: 'model',
            args: 'none',
            kind: 'local',
          }),
        ),
      },
    ].filter((g) => g.commands.length)
  }
  if (cmd.complete === 'efforts') {
    const allowed =
      ctx.models.find((m) => m.id === ctx.model)?.efforts ??
      EFFORTS.map((e) => e.id)
    const efforts = rankItems(
      EFFORTS.filter((e) => allowed.includes(e.id)),
      query,
      (e) => [e.id, e.label, e.hint],
    )
    return [
      {
        group: 'Reasoning effort',
        commands: efforts.map(
          (e): SlashCommand => ({
            id: `arg:effort:${e.id}`,
            name: e.id,
            aliases: [e.label],
            title: e.id,
            description: `${e.label} · ${e.hint}`,
            group: 'Reasoning effort',
            icon: 'effort',
            args: 'none',
            kind: 'local',
          }),
        ),
      },
    ].filter((g) => g.commands.length)
  }
  return []
}

export function menuGroupsForPhase(
  phase: SlashMenuPhase,
  ctx: Pick<SlashContext, 'model' | 'models'>,
): SlashGroup[] {
  if (phase.phase === 'catalog') return filterSlashCommands(phase.query)
  return filterSlashArgs(phase.cmd, phase.query, ctx)
}

export function acceptSlashPick(
  item: SlashCommand,
  phase: SlashMenuPhase,
  ctx: SlashContext,
): SlashOutcome {
  if (phase.phase === 'args') return runSlash(phase.cmd, item.name, ctx)
  return pickSlash(item, ctx)
}

function sendLine(cmd: SlashCommand, args: string): SlashOutcome {
  return {
    kind: 'send',
    text: args ? `/${cmd.name} ${args}` : `/${cmd.name}`,
  }
}

function parseEffort(raw: string): EffortLevel | null {
  const key = raw.trim().toLowerCase()
  return EFFORT_ALIAS[key] ?? EFFORT_ALIAS[raw.trim()] ?? null
}

function parseModelArgs(
  args: string,
  models: SlashContext['models'],
): { modelId: string; effort?: EffortLevel } | null {
  const text = args.trim()
  if (!text) return null
  const parts = text.split(/\s+/)
  let effort: EffortLevel | undefined
  let rest = text
  if (parts.length > 1) {
    const last = parseEffort(parts[parts.length - 1])
    if (last) {
      effort = last
      rest = parts.slice(0, -1).join(' ')
    }
  }
  const q = rest.toLowerCase()
  const hit =
    models.find(
      (m) => m.id.toLowerCase() === q || m.label.toLowerCase() === q,
    ) ??
    models.find(
      (m) =>
        m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q),
    )
  if (!hit) return null
  return { modelId: hit.id, effort }
}

export function pickSlash(cmd: SlashCommand, ctx: SlashContext): SlashOutcome {
  if (cmd.args === 'required') {
    return { kind: 'insert', text: `/${cmd.name} ` }
  }
  return runSlash(cmd, '', ctx)
}

export function runSlash(
  cmd: SlashCommand,
  args: string,
  ctx?: SlashContext,
): SlashOutcome {
  if (cmd.args === 'required' && !args) {
    return { kind: 'insert', text: `/${cmd.name} ` }
  }
  if (cmd.kind === 'send') return sendLine(cmd, args)
  if (!ctx) return { kind: 'none' }

  switch (cmd.id) {
    case 'new':
      ctx.newChat(ctx.activeProjectId)
      return { kind: 'handled' }
    case 'copy': {
      if (!ctx.copyLastReply()) {
        ctx.notify('还没有可复制的回复', 'error')
      }
      return { kind: 'handled' }
    }
    case 'rename': {
      const session = ctx.activeSession
      if (!session) {
        ctx.notify('没有可重命名的会话', 'error')
        return { kind: 'handled' }
      }
      ctx.renameSession(session.id, args)
      ctx.notify('已重命名会话', 'success')
      return { kind: 'handled' }
    }
    case 'delete': {
      const session = ctx.activeSession
      if (!session) {
        ctx.notify('没有可删除的会话', 'error')
        return { kind: 'handled' }
      }
      ctx.deleteSession(session.id)
      return { kind: 'handled' }
    }
    case 'model': {
      const parsed = parseModelArgs(args, ctx.models)
      if (!parsed) {
        ctx.notify('找不到这个模型', 'error')
        return { kind: 'handled' }
      }
      ctx.setModel(parsed.modelId)
      if (parsed.effort) ctx.setEffort(parsed.effort)
      const meta = ctx.models.find((m) => m.id === parsed.modelId)
      ctx.notify(
        parsed.effort
          ? `已切换到 ${meta?.label ?? parsed.modelId} · ${parsed.effort}`
          : `已切换到 ${meta?.label ?? parsed.modelId}`,
      )
      return { kind: 'handled' }
    }
    case 'effort': {
      const effort = parseEffort(args)
      if (!effort) {
        ctx.notify('思考强度应为 low / medium / high / xhigh', 'error')
        return { kind: 'handled' }
      }
      ctx.setEffort(effort)
      ctx.notify(`思考强度已设为 ${effort}`)
      return { kind: 'handled' }
    }
    case 'plan': {
      ctx.setMode('plan')
      ctx.notify('已切换到计划')
      if (args) return { kind: 'send', text: args }
      return { kind: 'handled' }
    }
    case 'auto': {
      const next: PermissionMode =
        ctx.permissionMode === 'auto' ? 'ask' : 'auto'
      ctx.setMode(next)
      ctx.notify(next === 'auto' ? '已切换到自动' : '已切回询问')
      return { kind: 'handled' }
    }
    case 'always-approve': {
      const next: PermissionMode =
        ctx.permissionMode === 'always-approve' ? 'ask' : 'always-approve'
      ctx.setMode(next)
      ctx.notify(next === 'always-approve' ? '已切换到始终批准' : '已切回询问')
      return { kind: 'handled' }
    }
    case 'settings':
      ctx.setSettingsOpen(true)
      return { kind: 'handled' }
    default:
      return { kind: 'none' }
  }
}

export function resolveSlash(text: string, ctx: SlashContext): SlashOutcome {
  const parsed = parseSlashLine(text)
  if (!parsed) return { kind: 'none' }
  const cmd = findCommand(parsed.name)
  if (!cmd) return { kind: 'none' }
  return runSlash(cmd, parsed.args, ctx)
}
