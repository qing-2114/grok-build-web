/**
 * 组装 Windows 安装包的暂存目录：构建产物、打包后的服务、
 * 独立 Node 运行时、Electron 窗口。不依赖用户机器上的 Node。
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const stage = join(root, 'release', 'win-unpacked')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const nodeVersion = process.versions.node
const electronVersion = pkg.dependencies.electron.replace(/^[^\d]*/, '')

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 退出码 ${result.status}`)
  }
}

function copyElectron(dest) {
  const electronRoot = join(root, 'node_modules', 'electron')
  const hinted = readFileSync(join(electronRoot, 'path.txt'), 'utf8').trim()
  const candidates = [join(electronRoot, hinted), join(electronRoot, 'dist')]
  const dist = candidates.find((dir) => existsSync(join(dir, 'electron.exe')))
  if (!dist) {
    throw new Error('找不到 Electron 运行时，请先 npm install')
  }
  cpSync(dist, dest, { recursive: true })
  const exe = join(dest, 'electron.exe')
  const named = join(dest, 'Grok Build.exe')
  if (existsSync(exe)) {
    cpSync(exe, named)
    rmSync(exe)
  }
}

rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })

run('npm', ['run', 'build'])
run('node', ['scripts/bundle-server.mjs'])

cpSync(join(root, 'dist'), join(stage, 'dist'), { recursive: true })
mkdirSync(join(stage, 'server'), { recursive: true })
cpSync(join(root, 'build', 'desktop.cjs'), join(stage, 'server', 'desktop.cjs'))
cpSync(join(root, 'electron', 'main.cjs'), join(stage, 'electron', 'main.cjs'))
cpSync(join(root, 'public', 'grok-icon.ico'), join(stage, 'icon.ico'))
cpSync(join(root, 'scripts', 'launch-packaged.cjs'), join(stage, 'launch.cjs'))

const ptySrc = join(root, 'node_modules', 'node-pty')
if (!existsSync(ptySrc)) throw new Error('缺少 node-pty，请先 npm install')
cpSync(ptySrc, join(stage, 'node_modules', 'node-pty'), {
  recursive: true,
  filter: (src) => !src.includes(`${join('node-pty', 'src')}`),
})

copyElectron(join(stage, 'electron'))

const nodeDir = join(stage, 'node')
mkdirSync(nodeDir, { recursive: true })
const nodeZip = join(root, 'release', `node-v${nodeVersion}-win-x64.zip`)
if (!existsSync(nodeZip)) {
  const url = `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-win-x64.zip`
  run('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Invoke-WebRequest -Uri '${url}' -OutFile '${nodeZip}'`,
  ])
}
run('powershell.exe', [
  '-NoProfile',
  '-Command',
  `Expand-Archive -Force -Path '${nodeZip}' -DestinationPath '${join(root, 'release', 'node-extract')}'`,
])
const extracted = join(root, 'release', 'node-extract', `node-v${nodeVersion}-win-x64`)
for (const name of ['node.exe', 'LICENSE']) {
  cpSync(join(extracted, name), join(nodeDir, name))
}

writeFileSync(
  join(stage, 'version.json'),
  JSON.stringify(
    { version: pkg.version, node: nodeVersion, electron: electronVersion },
    null,
    2,
  ),
)

console.log(`staged ${stage}`)
