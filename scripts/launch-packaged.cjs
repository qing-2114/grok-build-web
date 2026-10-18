const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

const resources = process.resourcesPath
const node = join(resources, 'node', 'node.exe')
const server = join(resources, 'server', 'desktop.cjs')
const electron = join(resources, 'electron', 'Grok Build.exe')

if (!existsSync(node) || !existsSync(server)) {
  console.error('安装不完整：缺少 Node 运行时或服务程序')
  process.exit(1)
}

const child = spawn(node, [server], {
  cwd: resources,
  windowsHide: true,
  env: {
    ...process.env,
    GROK_WEB_PACKAGED: '1',
    GROK_WEB_ROOT: resources,
    GROK_WEB_DIST: join(resources, 'dist'),
    GROK_WEB_ICON: join(resources, 'icon.ico'),
    GROK_WEB_ELECTRON: existsSync(electron) ? electron : '',
  },
  stdio: 'inherit',
})

child.on('exit', (code) => process.exit(code ?? 0))
