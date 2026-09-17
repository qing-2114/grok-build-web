const FILE_EXT =
  /\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|less|html|htm|vue|svelte|py|rs|go|java|kt|kts|c|h|cpp|hpp|cc|cs|toml|ya?ml|xml|svg|txt|sh|bash|zsh|ps1|sql|php|rb|swift|log|ini|cfg|conf|lock|map|png|jpe?g|gif|webp|ico|bmp|avif|pdf|docx|doc|env)$/i

const DOTFILE = /^\.[A-Za-z0-9][A-Za-z0-9._-]*$/

export function isWebUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

export function looksLikeHtml(value: string): boolean {
  const s = value.trim()
  return isWebUrl(s) || /\.html?$/i.test(s)
}

export function looksLikeFilePath(value: string): boolean {
  const s = value.trim().replace(/^<|>$/g, '')
  if (!s || s.length > 420) return false
  if (isWebUrl(s)) return false
  if (s.startsWith('file://')) return true
  const spaced = /\s/.test(s)
  if (spaced && !/^[A-Za-z]:[\\/]/.test(s) && !s.startsWith('\\\\')) return false
  if (/^[A-Za-z]:[\\/]/.test(s)) return true
  if (s.startsWith('\\\\')) return true
  if (
    s.startsWith('/') ||
    s.startsWith('./') ||
    s.startsWith('../') ||
    s.startsWith('.\\') ||
    s.startsWith('~')
  ) {
    return true
  }
  if (s.includes('/') || s.includes('\\')) return true
  if (FILE_EXT.test(s)) return true
  if (DOTFILE.test(s)) return true
  return false
}

export function pathKey(path: string): string {
  return path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

export function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b)
}

export function isAbsPath(value: string): boolean {
  const s = value.trim()
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(s)
}

/** True when `to` is the same path, or an absolute path that `from` (relative/basename) resolved to. */
export function pathResolvesTo(from: string, to: string): boolean {
  if (!from || !to) return false
  if (samePath(from, to)) return true
  if (isAbsPath(from)) return false
  const a = pathKey(from)
  const b = pathKey(to)
  return b.endsWith(`\\${a}`)
}

/**
 * Turn a chat link (`文章目录.md` or `文章\\文章目录.md`) into a concrete path.
 * Prefers the newest matching tool-card target, then `cwd` + relative.
 */
export function resolveOpenPath(
  requested: string,
  cwd: string,
  hints: Iterable<string> = [],
): string {
  const raw = requested.trim().replace(/^file:\/\//i, '').replace(/^<|>$/g, '')
  if (!raw || isWebUrl(raw)) return raw
  if (isAbsPath(raw)) return raw
  const want = pathKey(raw)
  const wantName = fileName(raw).toLowerCase()
  const list = [...hints]
  for (let i = list.length - 1; i >= 0; i--) {
    const hint = list[i]?.trim()
    if (!hint || !looksLikeFilePath(hint)) continue
    const key = pathKey(hint)
    if (key === want || key.endsWith(`\\${want}`)) return hint
  }
  if (!raw.includes('/') && !raw.includes('\\')) {
    for (let i = list.length - 1; i >= 0; i--) {
      const hint = list[i]?.trim()
      if (hint && fileName(hint).toLowerCase() === wantName) return hint
    }
  }
  return cwd ? joinPath(cwd, raw) : raw
}

export function fileName(path: string): string {
  const t = path.replace(/[\\/]+$/, '')
  const parts = t.split(/[\\/]/)
  return parts[parts.length - 1] || t
}

export function dirName(path: string): string {
  const t = path.replace(/[\\/]+$/, '')
  const i = Math.max(t.lastIndexOf('\\'), t.lastIndexOf('/'))
  return i >= 0 ? t.slice(0, i) : t
}

export function joinPath(root: string, child: string): string {
  const next = child.trim().replace(/^file:\/\//i, '')
  if (!next || /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(next) || isWebUrl(next)) {
    return next
  }
  const sep = root.includes('/') && !root.includes('\\') ? '/' : '\\'
  const cleaned = next.replace(/^\.[\\/]/, '').replace(/[\\/]/g, sep)
  return `${root.replace(/[\\/]+$/, '')}${sep}${cleaned}`
}
