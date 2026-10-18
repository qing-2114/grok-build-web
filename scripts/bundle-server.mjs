import { build } from 'esbuild'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outfile = join(root, 'build', 'desktop.cjs')

rmSync(dirname(outfile), { recursive: true, force: true })
mkdirSync(dirname(outfile), { recursive: true })

await build({
  entryPoints: [join(root, 'server', 'desktop.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', 'node-pty'],
  // 安装包由 node.exe desktop.cjs 启动，入口不能用顶层 await。
  // import.meta.url 在 CJS 里是空的，用当前文件路径补上。
  banner: {
    js: 'const __gbwImportMetaUrl = require("node:url").pathToFileURL(__filename).href;',
  },
  define: {
    'import.meta.url': '__gbwImportMetaUrl',
  },
  logLevel: 'info',
})
