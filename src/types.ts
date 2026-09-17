export type PermissionMode = 'ask' | 'plan' | 'auto' | 'always-approve'

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh'

export type Role = 'user' | 'assistant' | 'tool'

export type ToolCall = {
  name: string
  target: string
  status: 'running' | 'success' | 'failed'
}

export type ChatImage = {
  n: number
  name: string
  mime: string
  src: string
}

export type Message = {
  id: string
  role: Role
  content: string
  createdAt: number
  tool?: ToolCall
  images?: ChatImage[]
}

export type Project = {
  id: string
  name: string
  path: string
  branch: string
  branches: string[]
}

export type Profile = {
  name: string
  avatar: string | null
}

export type Session = {
  id: string
  title: string
  projectId: string | null
  cwd?: string
  createdAt: number
  updatedAt: number
  messages: Message[]
  source?: 'local' | 'grok'
}

export type ConnectionStatus = 'connecting' | 'connected' | 'error'

export type PermissionRequest = {
  requestId: number
  title: string
  options: { optionId: string; name: string; kind: string }[]
}

export type QueuedPrompt = {
  id: string
  sessionId: string
  text: string
}

export type ContextUsage = {
  sessionId: string
  used: number
  total: number
  percent: number
}

export type RightPanel = 'idle' | 'review' | 'terminal' | 'files'

export type RightTab = {
  id: string
  kind: 'review' | 'terminal' | 'file'
  path: string | null
}

export const MODELS: {
  id: string
  label: string
  efforts: EffortLevel[]
}[] = [
  {
    id: 'grok-4.6',
    label: 'Grok 4.6',
    efforts: ['low', 'medium', 'high', 'xhigh'],
  },
  {
    id: 'grok-4.5',
    label: 'Grok 4.5',
    efforts: ['low', 'medium', 'high'],
  },
]

export const EFFORTS: {
  id: EffortLevel
  label: string
  hint: string
}[] = [
  { id: 'low', label: '低', hint: '更快，适合简单改动' },
  { id: 'medium', label: '中', hint: '默认平衡速度和深度' },
  { id: 'high', label: '高', hint: '更充分推理，适合复杂任务' },
  { id: 'xhigh', label: '极高', hint: '最深推理，耗时更长' },
]

export const PERMISSION_MODES: {
  id: PermissionMode
  label: string
  hint: string
}[] = [
  { id: 'ask', label: '询问', hint: '只读工具直接跑，改文件和命令先问你' },
  { id: 'plan', label: '计划', hint: '只写计划文件，实现前等你确认' },
  { id: 'auto', label: '自动', hint: '安全检查通过的操作直接执行' },
  { id: 'always-approve', label: '始终批准', hint: '跳过权限确认，deny 规则仍生效' },
]
