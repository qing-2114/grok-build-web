// `npm test` 用的解析钩子：src/ 里按 Vite 习惯写不带扩展名的相对导入
// （`./lib/uid`），Node 自己不会补 `.ts`，这里帮它补上。
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

const EXTS = ['.ts', '/index.ts']

registerHooks({
  resolve(specifier, context, next) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../')
    if (relative && context.parentURL && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const ext of EXTS) {
        const url = new URL(specifier + ext, context.parentURL)
        if (existsSync(fileURLToPath(url))) return next(url.href, context)
      }
    }
    return next(specifier, context)
  },
})
