import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GrokAcp } from './acp.ts'
import { startDesktopServer } from './serve.ts'
import { openAppWindow } from './window.ts'

const root =
  process.env.GROK_WEB_ROOT?.trim() ||
  join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = process.env.GROK_WEB_DIST?.trim() || join(root, 'dist')
const icon =
  process.env.GROK_WEB_ICON?.trim() || join(root, 'public', 'grok-icon.ico')

function logPath(): string {
  const base = process.env.LOCALAPPDATA || process.env.TEMP || root
  const dir = join(base, 'grok-build-web')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'desktop.log')
}

function releasePid(): void {
  try {
    rmSync(pidFile(), { force: true })
  } catch {
    // the next launch treats a dead pid as stale
  }
}

function fail(message: string): never {
  releasePid()
  console.error(message)
  process.exit(1)
}

function pidFile(): string {
  return join(dirname(logPath()), 'desktop.pid')
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function anotherDesktop(): number | null {
  try {
    const pid = Number.parseInt(readFileSync(pidFile(), 'utf8').trim(), 10)
    if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) return null
    if (!processAlive(pid)) return null
    return pid
  } catch {
    return null
  }
}

function claimPid(): boolean {
  const file = pidFile()
  mkdirSync(dirname(file), { recursive: true })
  const writeNew = () => {
    const fd = openSync(file, 'wx')
    writeSync(fd, String(process.pid))
    closeSync(fd)
  }
  try {
    writeNew()
    return true
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'EEXIST') throw err
  }
  if (anotherDesktop()) return false
  rmSync(file, { force: true })
  try {
    writeNew()
    return true
  } catch {
    return false
  }
}

if (!claimPid()) {
  console.log('Grok Build desktop already running')
  process.exit(0)
}

if (!existsSync(join(distDir, 'index.html'))) {
  fail(`缺少构建产物：${join(distDir, 'index.html')}\n请先在仓库根目录运行 npm run build。`)
}

const acp = new GrokAcp()

async function main(): Promise<void> {
  let server: Awaited<ReturnType<typeof startDesktopServer>>
  try {
    server = await startDesktopServer(distDir, acp, 5173, root)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EADDRINUSE') {
      fail('端口 5173 已被占用（EADDRINUSE）。')
    }
    fail(err instanceof Error ? err.message : String(err))
  }
  void acp.start().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
  })

  let windowProc: ReturnType<typeof openAppWindow>
  try {
    windowProc = openAppWindow(server.url, existsSync(icon) ? icon : '')
  } catch (err) {
    await server.close()
    fail(err instanceof Error ? err.message : String(err))
  }

  console.log(`window ${windowProc.pid ?? 0}`)

  let closing = false
  async function shutdown(): Promise<void> {
    if (closing) return
    closing = true
    if (windowProc.exitCode == null && !windowProc.killed) {
      try {
        windowProc.kill()
      } catch {
        // window already gone
      }
    }
    releasePid()
    await server.close()
    process.exit(0)
  }

  windowProc.on('error', (err) => {
    console.error(err.message)
    void shutdown()
  })
  windowProc.on('exit', () => {
    void shutdown()
  })
  process.on('SIGINT', () => {
    void shutdown()
  })
  process.on('SIGTERM', () => {
    void shutdown()
  })

  console.log(`Grok Build desktop ${server.url}`)
  console.log(`log ${logPath()}`)
}

void main()
