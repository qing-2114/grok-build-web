import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export type WindowLaunch = {
  executable: string
  args: string[]
  env: NodeJS.ProcessEnv
}

export function electronExecutable(): string {
  const fromEnv = (process.env.GROK_WEB_ELECTRON || '').trim()
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const resolved = require('electron') as string
  if (!resolved || !existsSync(resolved)) {
    throw new Error('找不到应用窗口程序。请先在仓库根目录运行 npm install。')
  }
  return resolved
}

export function appWindowArgs(url: string, icon: string): WindowLaunch {
  const executable = electronExecutable()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GROK_WEB_URL: url,
    GROK_WEB_ICON: icon,
  }
  // An empty value still counts as set and makes Electron start as plain Node.
  delete env.ELECTRON_RUN_AS_NODE
  return {
    executable,
    args: [join(root, 'electron', 'main.cjs')],
    env,
  }
}

export function openAppWindow(url: string, icon: string): ChildProcess {
  const launch = appWindowArgs(url, icon)
  return spawn(launch.executable, launch.args, {
    cwd: root,
    env: launch.env,
    windowsHide: false,
    stdio: 'ignore',
  })
}
