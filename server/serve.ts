import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { GrokAcp } from './acp.ts'
import { checkApiRequest, HttpError } from './guard.ts'
import { createRouter } from './http.ts'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

function hasRequestBody(req: IncomingMessage): boolean {
  const length = Number(req.headers['content-length'])
  if (Number.isFinite(length) && length > 0) return true
  return Boolean(req.headers['transfer-encoding'])
}

function reject(res: ServerResponse, status: number, error: string): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify({ error }))
}

function fileUnderRoot(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split('?')[0] || '/')
  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  if (!rel || rel.includes('\0')) return null
  const abs = resolve(root, normalize(rel))
  const base = resolve(root)
  if (abs !== base && !abs.startsWith(base + sep)) return null
  return abs
}

function sendFile(res: ServerResponse, file: string): void {
  const stat = statSync(file)
  res.writeHead(200, {
    'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
  })
  createReadStream(file).pipe(res)
}

function sendIndex(res: ServerResponse, indexFile: string): void {
  if (!existsSync(indexFile)) {
    reject(res, 500, '缺少构建产物，请先在仓库根目录运行 npm run build')
    return
  }
  sendFile(res, indexFile)
}

export type DesktopServer = {
  port: number
  url: string
  close: () => Promise<void>
}

export function startDesktopServer(
  distDir: string,
  acp: GrokAcp,
  port = 5173,
): Promise<DesktopServer> {
  const router = createRouter(acp)
  const indexFile = join(distDir, 'index.html')

  const server = createServer((req, res) => {
    const host = req.headers.host || '127.0.0.1'
    let url: URL
    try {
      url = new URL(req.url || '/', `http://${host}`)
    } catch {
      reject(res, 400, '请求地址无效')
      return
    }

    if (url.pathname.startsWith('/api/')) {
      const decision = checkApiRequest(
        req.method || 'GET',
        req.headers.host,
        req.headers.origin,
        req.headers['content-type'],
        hasRequestBody(req),
      )
      if (!decision.ok) {
        reject(res, decision.status, decision.error)
        return
      }
      void router(req, res, () => {
        if (!res.headersSent) reject(res, 404, '接口不存在')
      }).catch((err: unknown) => {
        if (res.headersSent) {
          res.end()
          return
        }
        reject(
          res,
          err instanceof HttpError ? err.status : 500,
          err instanceof Error ? err.message : String(err),
        )
      })
      return
    }

    if ((req.method || 'GET') !== 'GET' && (req.method || 'GET') !== 'HEAD') {
      reject(res, 405, '不支持的方法')
      return
    }

    const file = fileUnderRoot(distDir, url.pathname)
    if (file && existsSync(file) && statSync(file).isFile()) {
      sendFile(res, file)
      return
    }
    sendIndex(res, indexFile)
  })

  server.on('close', () => {
    void acp.stop()
  })

  return new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        rejectListen(new Error('服务没有绑定到本机端口'))
        return
      }
      const port = addr.port
      resolveListen({
        port,
        url: `http://127.0.0.1:${port}/`,
        close: () =>
          new Promise((done) => {
            server.close(() => done())
          }),
      })
    })
  })
}


