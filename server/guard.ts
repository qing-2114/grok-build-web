import type { Connect } from 'vite'
import type { IncomingMessage } from 'node:http'

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1']

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export type GuardDecision =
  | { ok: true }
  | { ok: false; status: number; error: string }

function normalizeHost(raw: string | undefined): string {
  const value = (raw ?? '').trim().toLowerCase()
  if (!value) return ''
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    return end > 0 ? value.slice(1, end) : ''
  }
  const colon = value.lastIndexOf(':')
  if (colon >= 0 && value.indexOf(':') === colon) return value.slice(0, colon)
  return value
}

function allowedHosts(): Set<string> {
  const allowed = new Set(LOOPBACK_HOSTS)
  for (const item of (process.env.GROK_WEB_ALLOWED_HOSTS ?? '').split(',')) {
    const host = normalizeHost(item)
    if (host) allowed.add(host)
  }
  const bound = normalizeHost(process.env.GROK_WEB_HOST)
  if (bound && bound !== '0.0.0.0' && bound !== 'true' && bound !== '::') {
    allowed.add(bound)
  }
  return allowed
}

export function checkApiRequest(
  method: string,
  host: string | undefined,
  origin: string | undefined,
  contentType: string | undefined,
  hasBody: boolean,
): GuardDecision {
  const requestHost = (host ?? '').trim()
  if (!requestHost || !allowedHosts().has(normalizeHost(requestHost))) {
    return { ok: false, status: 403, error: '只允许从本机访问' }
  }

  if (origin !== undefined) {
    let parsed: URL
    try {
      parsed = new URL(origin)
    } catch {
      return { ok: false, status: 403, error: '请求来源不是本机页面' }
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, status: 403, error: '请求来源不是本机页面' }
    }
    if (parsed.host.toLowerCase() !== requestHost.toLowerCase()) {
      return { ok: false, status: 403, error: '请求来源不是本机页面' }
    }
  }

  const verb = method.toUpperCase()
  if (hasBody && verb !== 'GET' && verb !== 'HEAD' && verb !== 'OPTIONS') {
    const type = (contentType ?? '').trim().toLowerCase()
    if (!type.startsWith('application/json')) {
      return { ok: false, status: 415, error: '请求体必须是 application/json' }
    }
  }

  return { ok: true }
}

const SAFE_SESSION_ID = /^[A-Za-z0-9._-]{1,128}$/

export function assertSafeSessionId(id: string): string {
  if (!SAFE_SESSION_ID.test(id) || id.includes('..')) {
    throw new HttpError(400, '会话 ID 无效')
  }
  return id
}

function hasRequestBody(req: IncomingMessage): boolean {
  const length = Number(req.headers['content-length'])
  if (Number.isFinite(length) && length > 0) return true
  return Boolean(req.headers['transfer-encoding'])
}

function isApiPath(req: IncomingMessage): boolean {
  try {
    const url = new URL(
      req.url || '/',
      `http://${req.headers.host || 'localhost'}`,
    )
    return url.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

export function createApiGuard(): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (!isApiPath(req)) {
      next()
      return
    }
    const decision = checkApiRequest(
      req.method || 'GET',
      req.headers.host,
      req.headers.origin,
      req.headers['content-type'],
      hasRequestBody(req),
    )
    if (decision.ok) {
      next()
      return
    }
    res.writeHead(decision.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify({ error: decision.error }))
  }
}
