import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'

export type JsonRpcId = number

type Pending = {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
}

export type PermissionOption = {
  optionId: string
  name: string
  kind: string
}

export type PermissionRequest = {
  rpcId: JsonRpcId
  sessionId: string
  title: string
  options: PermissionOption[]
}

type RpcMessage = {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code?: number; message?: string; data?: unknown }
}

function rpcError(err: RpcMessage['error']): Error {
  const extra =
    typeof err?.data === 'string'
      ? err.data
      : err?.data
        ? JSON.stringify(err.data)
        : ''
  const msg = [err?.message || 'ACP error', extra].filter(Boolean).join('\n')
  return new Error(msg)
}

export class GrokAcp extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null
  private buf = ''
  private nextId = 1
  private pending = new Map<JsonRpcId, Pending>()
  private permissions = new Map<JsonRpcId, PermissionRequest>()
  private stderrTail: string[] = []
  private starting: Promise<void> | null = null
  connected = false
  version = ''
  home = ''
  currentModelId = ''
  lastError: string | null = null
  models: Array<{
    id: string
    label: string
    efforts: string[]
  }> = []

  start(): Promise<void> {
    if (this.connected && this.proc && !this.proc.killed) {
      return Promise.resolve()
    }
    if (this.starting) return this.starting
    this.starting = this.boot().finally(() => {
      this.starting = null
    })
    return this.starting
  }

  stop(): void {
    this.killProc()
    this.starting = null
  }

  private killProc(): void {
    const proc = this.proc
    this.proc = null
    this.connected = false
    for (const [, p] of this.pending) p.reject(new Error('ACP 已断开'))
    this.pending.clear()
    this.permissions.clear()
    if (proc && !proc.killed) {
      proc.kill()
    }
  }

  async ensure(): Promise<void> {
    if (!this.connected) await this.start()
  }

  request<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    if (!this.proc || !this.connected) {
      return Promise.reject(new Error('本机 Grok Build 未连接'))
    }
    const id = this.nextId++
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params })
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      })
      this.proc!.stdin.write(payload + '\n', (err) => {
        if (err) {
          this.pending.delete(id)
          reject(err)
        }
      })
    })
  }

  respond(id: JsonRpcId, result: unknown): void {
    if (!this.proc) return
    this.proc.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n',
    )
  }

  resolvePermission(
    rpcId: JsonRpcId,
    optionId: string | null,
  ): boolean {
    const req = this.permissions.get(rpcId)
    if (!req) return false
    this.permissions.delete(rpcId)
    if (optionId) {
      this.respond(rpcId, {
        outcome: { outcome: 'selected', optionId },
      })
    } else {
      this.respond(rpcId, { outcome: { outcome: 'cancelled' } })
    }
    return true
  }

  private async boot(): Promise<void> {
    this.killProc()
    this.lastError = null
    this.buf = ''
    this.nextId = 1

    const proc = spawn(
      'grok',
      ['agent', '--no-leader', 'stdio'],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GROK_DISABLE_AUTOUPDATER: '1',
        },
        windowsHide: true,
      },
    )
    this.proc = proc

    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => this.onStdout(chunk))
    proc.stderr.on('data', (chunk: string) => {
      const text = chunk.trim()
      if (!text) return
      this.stderrTail.push(text)
      if (this.stderrTail.length > 20) this.stderrTail.shift()
    })
    proc.on('exit', (code, signal) => {
      if (this.proc !== proc) return
      this.connected = false
      this.proc = null
      const why = signal
        ? `grok agent 退出 (${signal})`
        : `grok agent 退出 (code ${code ?? '?'})`
      this.lastError = this.stderrTail.slice(-3).join('\n') || why
      for (const [, p] of this.pending) p.reject(new Error(this.lastError!))
      this.pending.clear()
      this.emit('disconnect', this.lastError)
    })
    proc.on('error', (err) => {
      this.lastError =
        err.message.includes('ENOENT')
          ? '找不到 grok 命令，请确认本机已安装 Grok Build 并在 PATH 中'
          : err.message
      this.connected = false
      this.emit('disconnect', this.lastError)
    })

    await new Promise((r) => setTimeout(r, 200))
    if (!this.proc) {
      throw new Error(this.lastError || '无法启动 grok agent')
    }

    this.connected = true
    try {
      const init = await this.request<{
        protocolVersion?: number
        _meta?: {
          agentVersion?: string
          currentWorkingDirectory?: string
          modelState?: {
            currentModelId?: string
            availableModels?: Array<{
              modelId: string
              name?: string
              _meta?: { reasoningEfforts?: Array<{ id?: string; value?: string }> }
            }>
          }
        }
      }>('initialize', {
        protocolVersion: 1,
        clientInfo: { name: 'grok-build-web', version: '0.1.0' },
        clientCapabilities: {},
      })
      this.version = String(init._meta?.agentVersion ?? '')
      this.home = String(init._meta?.currentWorkingDirectory ?? '')
      const state = init._meta?.modelState
      this.currentModelId = String(state?.currentModelId ?? '')
      this.models = (state?.availableModels ?? []).map((m) => ({
        id: m.modelId,
        label: m.name || m.modelId,
        efforts: (m._meta?.reasoningEfforts ?? [])
          .map((e) => e.id || e.value || '')
          .filter(Boolean),
      }))
      this.emit('ready')
    } catch (err) {
      this.connected = false
      this.lastError = err instanceof Error ? err.message : String(err)
      this.stop()
      throw err instanceof Error ? err : new Error(this.lastError)
    }
  }

  private onStdout(chunk: string): void {
    this.buf += chunk
    let nl = this.buf.indexOf('\n')
    while (nl >= 0) {
      let line = this.buf.slice(0, nl)
      this.buf = this.buf.slice(nl + 1)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      if (line.trim()) this.onLine(line)
      nl = this.buf.indexOf('\n')
    }
  }

  private onLine(line: string): void {
    let msg: RpcMessage
    try {
      msg = JSON.parse(line) as RpcMessage
    } catch {
      return
    }

    if (msg.id != null && this.pending.has(msg.id) && !msg.method) {
      const pending = this.pending.get(msg.id)
      this.pending.delete(msg.id)
      if (!pending) return
      if (msg.error) pending.reject(rpcError(msg.error))
      else pending.resolve(msg.result)
      return
    }

    if (msg.method === 'session/update') {
      this.emit('update', msg.params)
      return
    }

    if (msg.method === 'session/request_permission' && msg.id != null) {
      const params = (msg.params ?? {}) as {
        sessionId?: string
        toolCall?: { title?: string; _meta?: Record<string, { label?: string }> }
        options?: PermissionOption[]
      }
      const toolMeta = params.toolCall?._meta?.['x.ai/tool']
      const req: PermissionRequest = {
        rpcId: msg.id,
        sessionId: String(params.sessionId ?? ''),
        title:
          toolMeta?.label ||
          params.toolCall?.title ||
          '工具调用',
        options: Array.isArray(params.options) ? params.options : [],
      }
      this.permissions.set(msg.id, req)
      this.emit('permission', req)
      return
    }

    if (msg.method && msg.id != null) {
      this.respond(msg.id, {})
    }
  }
}
