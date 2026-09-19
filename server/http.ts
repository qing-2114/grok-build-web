import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import { PROMPT_TIMEOUT_MS, type GrokAcp } from './acp.ts'
import { assertSafeSessionId, HttpError } from './guard.ts'
import {
  gitChanges,
  gitCheckout,
  gitFileDiff,
  gitInfo,
  normalizePath,
} from './git.ts'
import { listDir, readPreview, streamRaw } from './fs.ts'
import {
  closeTerminal,
  defaultShellId,
  detectShells,
  interruptTerminal,
  openExternal,
  openLocalHtml,
  revealInExplorer,
  startTerminal,
  streamTerminal,
  writeTerminal,
} from './shells.ts'
import { contextFromDisk } from './context.ts'
import {
  deleteProvider,
  fetchCatalog,
  listProviders,
  parseProviderBody,
  probeEndpoint,
  saveProvider,
  type ApiBackend,
} from './deploy.ts'
import {
  generatedTitleFromDisk,
  titleFromFirstPrompt,
} from './prompt-title.ts'
import {
  permissionMeta,
  TranscriptBuilder,
  updateToEvent,
  usageFromParams,
  type StreamEvent,
} from './transcript.ts'
import { readAppVersion, updateApp } from './app-version.ts'

type SessionListItem = {
  sessionId: string
  cwd?: string
  title?: string
  updatedAt?: string
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const raw = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(raw)
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > 12 * 1024 * 1024) {
        reject(new Error('请求过大'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
      } catch {
        reject(new Error('JSON 无效'))
      }
    })
    req.on('error', reject)
  })
}

function match(
  method: string,
  pathname: string,
  want: string,
  pattern: string,
): Record<string, string> | null {
  if (method !== want) return null
  const wantParts = pattern.split('/')
  const got = pathname.split('/')
  if (wantParts.length !== got.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < wantParts.length; i++) {
    const part = wantParts[i]
    if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(got[i])
    else if (part !== got[i]) return null
  }
  return params
}

async function listSessions(
  acp: GrokAcp,
  cwd?: string,
): Promise<SessionListItem[]> {
  const sessions: SessionListItem[] = []
  let cursor: string | undefined
  for (let i = 0; i < 8; i++) {
    const params: Record<string, unknown> = {}
    if (cwd) params.cwd = cwd
    if (cursor) params.cursor = cursor
    const result = await acp.request<{
      sessions?: SessionListItem[]
      nextCursor?: string
    }>('session/list', params)
    sessions.push(...(result.sessions ?? []))
    if (!result.nextCursor) break
    cursor = result.nextCursor
  }
  return sessions
}

function toMillis(iso?: string): number {
  if (!iso) return Date.now()
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Date.now()
}

async function deleteOnDisk(id: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('grok', ['sessions', 'delete', id], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let err = ''
    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', (c: string) => {
      err += c
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(err.trim() || `删除会话失败 (${code})`))
    })
  })
}

function buildPrompt(body: Record<string, unknown>): unknown[] {
  const text = String(body.text ?? '').trim()
  const files = Array.isArray(body.files) ? body.files : []
  const blocks: unknown[] = []
  if (text) blocks.push({ type: 'text', text })
  for (const file of files) {
    if (!file || typeof file !== 'object') continue
    const rec = file as {
      name?: string
      mime?: string
      text?: string
      dataBase64?: string
    }
    const name = String(rec.name ?? 'file')
    const mime = String(rec.mime ?? 'application/octet-stream')
    if (typeof rec.text === 'string' && rec.text.length) {
      blocks.push({
        type: 'resource',
        resource: {
          uri: `file:///${name}`,
          mimeType: mime,
          text: rec.text,
        },
      })
    } else if (typeof rec.dataBase64 === 'string' && rec.dataBase64.length) {
      if (mime.startsWith('image/')) {
        blocks.push({
          type: 'image',
          mimeType: mime,
          data: rec.dataBase64,
        })
      } else {
        blocks.push({
          type: 'resource',
          resource: {
            uri: `file:///${name}`,
            mimeType: mime,
            blob: rec.dataBase64,
          },
        })
      }
    } else {
      blocks.push({ type: 'text', text: `\n[附件] ${name}` })
    }
  }
  if (blocks.length === 0) blocks.push({ type: 'text', text: ' ' })
  return blocks
}

export function createRouter(acp: GrokAcp) {
  return async function router(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> {
    const host = req.headers.host || 'localhost'
    const url = new URL(req.url || '/', `http://${host}`)
    if (!url.pathname.startsWith('/api/')) {
      next()
      return
    }

    try {
      await handle(acp, req, res, url)
    } catch (err) {
      if (res.headersSent) {
        res.end()
        return
      }
      sendJson(res, err instanceof HttpError ? err.status : 500, {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

async function handle(
  acp: GrokAcp,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const method = req.method || 'GET'
  const path = url.pathname

  if (match(method, path, 'GET', '/api/status')) {
    try {
      await acp.ensure()
    } catch (err) {
      sendJson(res, 200, {
        connected: false,
        error: err instanceof Error ? err.message : String(err),
        version: acp.version,
        home: homedir(),
        models: acp.models,
        currentModelId: acp.currentModelId,
      })
      return
    }
    sendJson(res, 200, {
      connected: acp.connected,
      error: acp.lastError,
      version: acp.version,
      home: homedir(),
      models: acp.models,
      currentModelId: acp.currentModelId,
    })
    return
  }

  if (match(method, path, 'GET', '/api/app/version')) {
    sendJson(res, 200, await readAppVersion())
    return
  }

  if (match(method, path, 'POST', '/api/app/update')) {
    try {
      sendJson(res, 200, await updateApp())
    } catch (err) {
      sendJson(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  if (match(method, path, 'GET', '/api/git')) {
    const p = url.searchParams.get('path') || ''
    const info = await gitInfo(p)
    sendJson(res, 200, info)
    return
  }

  if (match(method, path, 'POST', '/api/git/checkout')) {
    const body = await readJson(req)
    try {
      await gitCheckout(String(body.path ?? ''), String(body.branch ?? ''))
    } catch (err) {
      // Bad branch name or a refused checkout is the caller's fault, not a server fault.
      sendJson(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      })
      return
    }
    const info = await gitInfo(String(body.path ?? ''))
    sendJson(res, 200, info)
    return
  }

  if (match(method, path, 'GET', '/api/git/changes')) {
    const p = url.searchParams.get('path') || ''
    sendJson(res, 200, await gitChanges(p))
    return
  }

  if (match(method, path, 'GET', '/api/git/diff')) {
    const p = url.searchParams.get('path') || ''
    const file = url.searchParams.get('file') || ''
    sendJson(res, 200, await gitFileDiff(p, file))
    return
  }

  if (match(method, path, 'GET', '/api/fs/list')) {
    const p = url.searchParams.get('path') || ''
    sendJson(res, 200, { entries: await listDir(p) })
    return
  }

  if (match(method, path, 'GET', '/api/fs/file')) {
    const cwd = url.searchParams.get('cwd') || homedir()
    const file = url.searchParams.get('path') || ''
    sendJson(res, 200, await readPreview(cwd, file))
    return
  }

  if (match(method, path, 'GET', '/api/fs/raw')) {
    const cwd = url.searchParams.get('cwd') || homedir()
    const file = url.searchParams.get('path') || ''
    await streamRaw(cwd, file, req, res)
    return
  }

  if (match(method, path, 'GET', '/api/shells')) {
    sendJson(res, 200, { shells: await detectShells() })
    return
  }

  if (match(method, path, 'GET', '/api/deployments')) {
    sendJson(res, 200, { providers: await listProviders() })
    return
  }

  if (match(method, path, 'PUT', '/api/deployments')) {
    const body = await readJson(req)
    let provider
    try {
      provider = parseProviderBody(body)
    } catch (err) {
      sendJson(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      })
      return
    }
    const providers = await saveProvider(provider)
    let connected = acp.connected
    let error: string | null = null
    try {
      await acp.restart()
      connected = acp.connected
    } catch (err) {
      connected = false
      error = err instanceof Error ? err.message : String(err)
    }
    sendJson(res, 200, {
      ok: true,
      providers,
      connected,
      error,
      models: acp.models,
      currentModelId: acp.currentModelId,
    })
    return
  }

  const deployDel = match(method, path, 'DELETE', '/api/deployments/:id')
  if (deployDel) {
    const providers = await deleteProvider(deployDel.id)
    let connected = acp.connected
    let error: string | null = null
    try {
      await acp.restart()
      connected = acp.connected
    } catch (err) {
      connected = false
      error = err instanceof Error ? err.message : String(err)
    }
    sendJson(res, 200, {
      ok: true,
      providers,
      connected,
      error,
      models: acp.models,
      currentModelId: acp.currentModelId,
    })
    return
  }

  if (match(method, path, 'POST', '/api/deployments/test')) {
    const body = await readJson(req)
    try {
      const result = await probeEndpoint({
        baseUrl: String(body.baseUrl ?? ''),
        apiKey: String(body.apiKey ?? ''),
        apiBackend: String(body.apiBackend ?? 'chat_completions') as ApiBackend,
        model: typeof body.model === 'string' ? body.model : '',
      })
      sendJson(res, 200, result)
    } catch (err) {
      sendJson(res, 200, {
        ok: false,
        latencyMs: 0,
        message: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  if (match(method, path, 'POST', '/api/deployments/catalog')) {
    const body = await readJson(req)
    try {
      const models = await fetchCatalog({
        baseUrl: String(body.baseUrl ?? ''),
        apiKey: String(body.apiKey ?? ''),
        apiBackend: String(body.apiBackend ?? 'chat_completions') as ApiBackend,
      })
      sendJson(res, 200, { models })
    } catch (err) {
      sendJson(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  if (match(method, path, 'POST', '/api/open-external')) {
    const body = await readJson(req)
    const target = String(body.url ?? body.path ?? '')
    const cwd = String(body.cwd ?? '')
    try {
      if (body.reveal) {
        revealInExplorer(String(body.path ?? target), cwd)
      } else if (/\.html?$/i.test(target) && !/^https?:\/\//i.test(target)) {
        openLocalHtml(target, cwd)
      } else {
        openExternal(target)
      }
      sendJson(res, 200, { ok: true })
    } catch (err) {
      sendJson(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  if (match(method, path, 'POST', '/api/terminal')) {
    const body = await readJson(req)
    const shells = await detectShells()
    const requested = String(body.shellId ?? '').trim()
    const created = await startTerminal(
      String(body.cwd ?? ''),
      requested || defaultShellId(shells),
    )
    sendJson(res, 200, created)
    return
  }

  const termStream = match(method, path, 'GET', '/api/terminal/:id/stream')
  if (termStream) {
    await streamTerminal(assertSafeSessionId(termStream.id), req, res)
    return
  }

  const termInput = match(method, path, 'POST', '/api/terminal/:id/input')
  if (termInput) {
    const body = await readJson(req)
    writeTerminal(assertSafeSessionId(termInput.id), String(body.text ?? ''))
    sendJson(res, 200, { ok: true })
    return
  }

  const termSig = match(method, path, 'POST', '/api/terminal/:id/signal')
  if (termSig) {
    interruptTerminal(assertSafeSessionId(termSig.id))
    sendJson(res, 200, { ok: true })
    return
  }

  const termDel = match(method, path, 'DELETE', '/api/terminal/:id')
  if (termDel) {
    closeTerminal(assertSafeSessionId(termDel.id))
    sendJson(res, 200, { ok: true })
    return
  }

  const contextGet = match(method, path, 'GET', '/api/sessions/:id/context')
  if (contextGet) {
    const sessionId = assertSafeSessionId(contextGet.id)
    const cwd = normalizePath(url.searchParams.get('cwd') || '') || homedir()
    sendJson(res, 200, await contextFromDisk(cwd, sessionId))
    return
  }

  await acp.ensure()

  if (match(method, path, 'GET', '/api/sessions')) {
    const cwd = url.searchParams.get('cwd') || undefined
    const sessions = await listSessions(acp, cwd)
    const listed = await Promise.all(
      sessions.map(async (s) => {
        const cwd = s.cwd || ''
        const generated = await generatedTitleFromDisk(cwd, s.sessionId)
        const fromPrompt = generated
          ? ''
          : await titleFromFirstPrompt(cwd, s.sessionId)
        return {
          id: s.sessionId,
          title: generated || s.title || fromPrompt || '会话',
          cwd,
          updatedAt: toMillis(s.updatedAt),
        }
      }),
    )
    sendJson(res, 200, { sessions: listed })
    return
  }

  if (match(method, path, 'POST', '/api/sessions')) {
    const body = await readJson(req)
    const cwd = normalizePath(String(body.cwd ?? '')) || homedir()
    const created = await acp.request<{
      sessionId: string
      models?: { currentModelId?: string }
      configOptions?: Array<{ id: string; currentValue?: string }>
    }>('session/new', {
      cwd,
      mcpServers: [],
      _meta: permissionMeta(String(body.permissionMode ?? 'ask')),
    })
    const model = typeof body.model === 'string' ? body.model : ''
    const effort = typeof body.effort === 'string' ? body.effort : ''
    if (model) {
      try {
        await acp.request('session/set_config_option', {
          sessionId: created.sessionId,
          configId: 'model',
          value: model,
        })
      } catch {
        // keep agent default when the selected model is not authenticated
      }
    }
    if (effort) {
      try {
        await acp.request('session/set_config_option', {
          sessionId: created.sessionId,
          configId: 'reasoning_effort',
          value: effort,
        })
      } catch {
        // effort not advertised on this model
      }
    }
    sendJson(res, 200, {
      sessionId: created.sessionId,
      cwd,
    })
    return
  }

  const load = match(method, path, 'POST', '/api/sessions/:id/load')
  if (load) {
    const body = await readJson(req)
    const sessionId = assertSafeSessionId(load.id)
    const cwd = normalizePath(String(body.cwd ?? '')) || homedir()
    const builder = new TranscriptBuilder()
    const onUpdate = (params: { sessionId?: string; update?: unknown }) => {
      if (params.sessionId !== sessionId) return
      builder.applyUpdate((params.update ?? {}) as Parameters<TranscriptBuilder['applyUpdate']>[0])
    }
    acp.on('update', onUpdate)
    try {
      const result = await acp.request<{
        configOptions?: Array<{ id: string; currentValue?: string }>
        _meta?: { currentWorkingDirectory?: string }
      }>('session/load', {
        sessionId,
        cwd,
        mcpServers: [],
      })
      const diskTitle = await generatedTitleFromDisk(cwd, sessionId)
      sendJson(res, 200, {
        sessionId,
        cwd: result._meta?.currentWorkingDirectory || cwd,
        title: builder.title || diskTitle,
        messages: builder.messages,
        config: Object.fromEntries(
          (result.configOptions ?? []).map((o) => [o.id, o.currentValue]),
        ),
      })
    } finally {
      acp.off('update', onUpdate)
    }
    return
  }

  const titleGet = match(method, path, 'GET', '/api/sessions/:id/title')
  if (titleGet) {
    const sessionId = assertSafeSessionId(titleGet.id)
    const cwd = normalizePath(url.searchParams.get('cwd') || '') || homedir()
    const title = await generatedTitleFromDisk(cwd, sessionId)
    sendJson(res, 200, { title })
    return
  }

  const prompt = match(method, path, 'POST', '/api/sessions/:id/prompt')
  if (prompt) {
    const body = await readJson(req)
    const sessionId = assertSafeSessionId(prompt.id)
    const blocks = buildPrompt(body)
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    })
    const write = (ev: StreamEvent) => {
      if (!res.writableEnded) res.write(JSON.stringify(ev) + '\n')
    }
    const onUpdate = (params: { sessionId?: string; update?: unknown; _meta?: { totalTokens?: unknown } }) => {
      if (params.sessionId !== sessionId) return
      const ev = updateToEvent(
        (params.update ?? {}) as Parameters<typeof updateToEvent>[0],
      )
      if (ev) write(ev)
      const usage = usageFromParams(
        params as Parameters<typeof usageFromParams>[0],
      )
      if (usage) write(usage)
    }
    const onPerm = (reqPerm: {
      rpcId: number
      sessionId: string
      title: string
      options: unknown
    }) => {
      if (reqPerm.sessionId !== sessionId) return
      write({
        type: 'permission',
        requestId: reqPerm.rpcId,
        title: reqPerm.title,
        options: reqPerm.options,
      })
    }
    acp.on('update', onUpdate)
    acp.on('permission', onPerm)
    try {
      const result = await acp.request<{ stopReason?: string }>(
        'session/prompt',
        { sessionId, prompt: blocks },
        PROMPT_TIMEOUT_MS,
      )
      write({ type: 'done', stopReason: result.stopReason || 'end_turn' })
    } catch (err) {
      write({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      acp.off('update', onUpdate)
      acp.off('permission', onPerm)
      acp.cancelPermissions(sessionId)
      res.end()
    }
    return
  }

  const cancel = match(method, path, 'POST', '/api/sessions/:id/cancel')
  if (cancel) {
    const sessionId = assertSafeSessionId(cancel.id)
    await acp.request('session/cancel', { sessionId }).catch(() => undefined)
    acp.cancelPermissions(sessionId)
    sendJson(res, 200, { ok: true })
    return
  }

  const config = match(method, path, 'POST', '/api/sessions/:id/config')
  if (config) {
    const sessionId = assertSafeSessionId(config.id)
    const body = await readJson(req)
    if (typeof body.model === 'string' && body.model) {
      await acp.request('session/set_config_option', {
        sessionId,
        configId: 'model',
        value: body.model,
      })
    }
    if (typeof body.effort === 'string' && body.effort) {
      await acp.request('session/set_config_option', {
        sessionId,
        configId: 'reasoning_effort',
        value: body.effort,
      })
    }
    sendJson(res, 200, { ok: true })
    return
  }

  const del = match(method, path, 'DELETE', '/api/sessions/:id')
  if (del) {
    const sessionId = assertSafeSessionId(del.id)
    await acp.request('session/close', { sessionId }).catch(() => undefined)
    acp.cancelPermissions(sessionId)
    await deleteOnDisk(sessionId)
    sendJson(res, 200, { ok: true })
    return
  }

  if (match(method, path, 'POST', '/api/permission')) {
    const body = await readJson(req)
    const rpcId = Number(body.requestId)
    const optionId = body.optionId
    if (!Number.isFinite(rpcId)) {
      sendJson(res, 400, { error: '权限请求编号无效' })
      return
    }
    if (optionId != null && (typeof optionId !== 'string' || !optionId)) {
      sendJson(res, 400, { error: '权限选项无效' })
      return
    }
    const ok = acp.resolvePermission(
      rpcId,
      typeof optionId === 'string' ? optionId : null,
    )
    sendJson(res, 200, { ok })
    return
  }

  sendJson(res, 404, { error: 'not found' })
}
