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

export function samePath(a: string, b: string): boolean {
  return a.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase() ===
    b.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
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
