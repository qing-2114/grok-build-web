import { homedir } from 'node:os'
import { basename, extname, relative, resolve } from 'node:path'
import { createReadStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { docxToMarkdown } from './docx.ts'

export function normalizeFsPath(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  try {
    return resolve(trimmed)
  } catch {
    return trimmed
  }
}

function isAbsPath(input: string): boolean {
  const s = input.trim()
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(s) || s.startsWith('file:')
}

export function resolveInRoot(root: string, target: string): string {
  const base = normalizeFsPath(root) || homedir()
  const raw = target.trim().replace(/^file:\/\//i, '')
  if (isAbsPath(raw)) return normalizeFsPath(raw)
  return normalizeFsPath(resolve(base, raw))
}

export type FsEntry = {
  name: string
  path: string
  kind: 'dir' | 'file'
}

const TEXT_EXT = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.htm',
  '.xml',
  '.yml',
  '.yaml',
  '.toml',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.kt',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cs',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.sql',
  '.csv',
  '.svg',
  '.vue',
  '.svelte',
  '.php',
  '.rb',
  '.swift',
  '.log',
  '.ini',
  '.cfg',
  '.conf',
  '.lock',
  '.map',
  '.env',
])

const IMAGE_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.avif',
])

const PDF_EXT = new Set(['.pdf'])

const DOC_EXT = new Set(['.docx'])

const OFFICE_SKIP = new Set([
  '.doc',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.rtf',
  '.odt',
])

const MARKDOWN_EXT = new Set(['.md', '.markdown', '.mdx'])

const LANG_BY_EXT: Record<string, string> = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.jsx': 'jsx',
  '.mjs': 'js',
  '.cjs': 'js',
  '.json': 'json',
  '.css': 'css',
  '.scss': 'css',
  '.less': 'css',
  '.html': 'html',
  '.htm': 'html',
  '.xml': 'xml',
  '.svg': 'xml',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.cs': 'csharp',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.ps1': 'powershell',
  '.sql': 'sql',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.php': 'php',
  '.rb': 'ruby',
  '.swift': 'swift',
  '.vue': 'html',
  '.svelte': 'html',
  '.csv': 'plaintext',
  '.log': 'plaintext',
  '.txt': 'plaintext',
  '.ini': 'plaintext',
  '.cfg': 'plaintext',
  '.conf': 'plaintext',
  '.env': 'plaintext',
  '.lock': 'json',
  '.map': 'json',
}

const TEXT_MAX = 1_200_000
const IMAGE_MAX = 8_000_000

function extOf(name: string): string {
  if (name.startsWith('.') && !name.slice(1).includes('.')) {
    return name.toLowerCase()
  }
  return extname(name).toLowerCase()
}

function mimeOf(name: string): string {
  const e = extOf(name)
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.pdf': 'application/pdf',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  if (map[e]) return map[e]
  if (IMAGE_EXT.has(e)) return 'application/octet-stream'
  return 'text/plain; charset=utf-8'
}

function isNotFound(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === 'ENOENT',
  )
}

function missingError(kind: 'file' | 'dir'): Error {
  return new Error(kind === 'dir' ? '找不到该文件夹' : '找不到该文件')
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.cache',
  'coverage',
  '.tmp',
  '.tmp-verify',
  '__pycache__',
  '.grok',
])

async function findByName(
  root: string,
  name: string,
  relativeHint: string,
): Promise<string[]> {
  const needle = name.toLowerCase()
  const hint = relativeHint.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
  const hits: string[] = []
  let scanned = 0
  const limit = 4000

  async function walk(dir: string, depth: number): Promise<void> {
    if (hits.length >= 16 || scanned >= limit || depth > 10) return
    let items
    try {
      items = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const it of items) {
      if (hits.length >= 16 || scanned >= limit) return
      scanned += 1
      const p = resolve(dir, it.name)
      if (it.isDirectory()) {
        if (SKIP_DIRS.has(it.name)) continue
        await walk(p, depth + 1)
        continue
      }
      if (!it.isFile() || it.name.toLowerCase() !== needle) continue
      if (hint && hint.includes('/')) {
        const rel = relative(root, p).replace(/\\/g, '/').toLowerCase()
        if (rel !== hint && !rel.endsWith(`/${hint}`)) continue
      }
      hits.push(p)
    }
  }

  await walk(root, 0)
  return hits
}

async function locateExisting(root: string, target: string): Promise<string> {
  const base = normalizeFsPath(root) || homedir()
  const abs = resolveInRoot(base, target)
  try {
    const st = await stat(abs)
    if (st.isDirectory()) throw new Error('这是文件夹')
    return abs
  } catch (err) {
    if (!isNotFound(err)) throw err
  }
  const name = basename(target.trim().replace(/[\\/]+$/, ''))
  if (!name) throw missingError('file')
  const hits = await findByName(base, name, target.trim())
  if (hits.length === 1) return hits[0]
  if (hits.length === 0) throw missingError('file')
  hits.sort((a, b) => a.length - b.length)
  return hits[0]
}

function ancestorsOf(root: string, abs: string): string[] {
  const base = normalizeFsPath(root)
  const rel = relative(base, abs)
  if (!rel || rel.startsWith('..')) return [base]
  const parts = rel.split(/[/\\]/).filter(Boolean)
  const out = [base]
  let acc = base
  for (const part of parts.slice(0, -1)) {
    acc = resolve(acc, part)
    out.push(acc)
  }
  return out
}

export async function listDir(dir: string): Promise<FsEntry[]> {
  const root = normalizeFsPath(dir)
  if (!root) throw new Error('缺少路径')
  let st: Awaited<ReturnType<typeof stat>>
  try {
    st = await stat(root)
  } catch (err) {
    if (isNotFound(err)) throw missingError('dir')
    throw err
  }
  if (!st.isDirectory()) throw new Error('不是文件夹')
  const items = await readdir(root, { withFileTypes: true })
  const out: FsEntry[] = []
  for (const it of items) {
    const p = resolve(root, it.name)
    let kind: 'dir' | 'file'
    if (it.isDirectory()) kind = 'dir'
    else if (it.isFile()) kind = 'file'
    else if (it.isSymbolicLink()) {
      try {
        const linked = await stat(p)
        kind = linked.isDirectory() ? 'dir' : 'file'
      } catch {
        continue
      }
    } else {
      continue
    }
    out.push({ name: it.name, path: p, kind })
  }
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })
  return out
}

export type FilePreview = {
  path: string
  name: string
  relative: string
  mime: string
  kind: 'text' | 'image' | 'binary' | 'pdf' | 'markdown' | 'code'
  language?: string
  message?: string
  size: number
  text?: string
  truncated?: boolean
  ancestors: string[]
}

export async function readPreview(
  root: string,
  target: string,
): Promise<FilePreview> {
  const base = normalizeFsPath(root) || homedir()
  const abs = await locateExisting(base, target)
  const st = await stat(abs)
  if (st.isDirectory()) throw new Error('这是文件夹')
  const name = basename(abs)
  const e = extOf(name)
  const mime = mimeOf(name)
  const rel = relative(base, abs)
  const relativePath = !rel || rel.startsWith('..') ? abs : rel
  const ancestors = ancestorsOf(base, abs)
  const baseMeta = {
    path: abs,
    name,
    relative: relativePath,
    mime,
    size: st.size,
    ancestors,
  }
  if (IMAGE_EXT.has(e)) {
    return {
      ...baseMeta,
      kind: st.size > IMAGE_MAX ? 'binary' : 'image',
      message: st.size > IMAGE_MAX ? '图片太大，无法预览' : undefined,
    }
  }
  if (PDF_EXT.has(e)) {
    return { ...baseMeta, mime: 'application/pdf', kind: 'pdf' }
  }
  if (OFFICE_SKIP.has(e)) {
    return {
      ...baseMeta,
      kind: 'binary',
      message: '此办公格式暂不支持预览',
    }
  }
  if (DOC_EXT.has(e)) {
    if (st.size > 20 * 1024 * 1024) {
      return {
        ...baseMeta,
        kind: 'binary',
        message: 'Word 文件太大，无法预览',
      }
    }
    const buf = await readFile(abs)
    try {
      const text = docxToMarkdown(buf)
      return {
        ...baseMeta,
        kind: 'markdown',
        language: 'markdown',
        text,
      }
    } catch (err) {
      return {
        ...baseMeta,
        kind: 'binary',
        message: err instanceof Error ? err.message : '无法解析 Word 文档',
      }
    }
  }
  const looksText =
    TEXT_EXT.has(e) ||
    e === '.gitignore' ||
    e === '.dockerignore' ||
    e === '.editorconfig' ||
    mime.startsWith('text/')
  if (!looksText && st.size > 512_000) {
    return {
      ...baseMeta,
      kind: 'binary',
      message: '无法预览此文件',
    }
  }
  const buf = await readFile(abs)
  if (!looksText && buf.includes(0)) {
    return {
      ...baseMeta,
      kind: 'binary',
      message: '无法预览此文件',
    }
  }
  const truncated = buf.length > TEXT_MAX
  const slice = truncated ? buf.subarray(0, TEXT_MAX) : buf
  const text = slice.toString('utf8')
  if (MARKDOWN_EXT.has(e)) {
    return {
      ...baseMeta,
      kind: 'markdown',
      language: 'markdown',
      text,
      truncated,
    }
  }
  const language =
    LANG_BY_EXT[e] ||
    (e.startsWith('.') && looksText ? 'plaintext' : undefined)
  if (language && language !== 'plaintext') {
    return {
      ...baseMeta,
      kind: 'code',
      language,
      text,
      truncated,
    }
  }
  return {
    ...baseMeta,
    kind: 'text',
    language: language || 'plaintext',
    text,
    truncated,
  }
}

export async function streamRaw(
  root: string,
  target: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const abs = await locateExisting(root, target)
  const st = await stat(abs)
  if (st.isDirectory()) throw new Error('这是文件夹')
  const mime = mimeOf(basename(abs))
  const filename = basename(abs).replace(/[\r\n"]/g, '')
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': st.size,
    'Cache-Control': 'no-store',
    'Content-Disposition': `inline; filename="${filename}"`,
  })
  const stream = createReadStream(abs)
  stream.pipe(res)
  await new Promise<void>((resolvePromise, reject) => {
    stream.on('error', reject)
    res.on('close', () => {
      stream.destroy()
      resolvePromise()
    })
    res.on('finish', () => resolvePromise())
    req.on('close', () => {
      stream.destroy()
      resolvePromise()
    })
  })
}
