// Material Icon Theme asset names. Keep the selected subset local to the bundle.
export const fileIconKinds = [
  'file', 'word', 'pdf', 'image', 'svg', 'table', 'powerpoint', 'markdown',
  'document', 'typescript', 'javascript', 'react', 'python', 'go', 'rust',
  'java', 'html', 'css', 'sass', 'json', 'yaml', 'settings', 'git', 'lock',
  'zip', 'console', 'video', 'audio', 'database',
] as const
export type FileIconKind = typeof fileIconKinds[number]

const groups: Partial<Record<FileIconKind, string[]>> = {
  word: ['doc', 'docx', 'odt', 'rtf'], pdf: ['pdf'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'tif', 'tiff'],
  svg: ['svg'], table: ['xls', 'xlsx', 'csv', 'tsv', 'ods'],
  powerpoint: ['ppt', 'pptx', 'odp'], markdown: ['md', 'mdx', 'markdown'],
  document: ['txt', 'log'], typescript: ['ts', 'mts', 'cts'],
  javascript: ['js', 'mjs', 'cjs'], react: ['tsx', 'jsx'],
  python: ['py', 'pyw', 'pyi'], go: ['go'], rust: ['rs'], java: ['java', 'jar'],
  html: ['html', 'htm'], css: ['css'], sass: ['scss', 'sass'],
  json: ['json', 'jsonc', 'jsonl'], yaml: ['yaml', 'yml'],
  settings: ['toml', 'ini', 'conf', 'config', 'env'], lock: ['lock'],
  zip: ['zip', 'gz', 'tar', '7z', 'rar', 'bz2', 'xz'],
  console: ['sh', 'bash', 'zsh', 'ps1', 'cmd', 'bat'],
  video: ['mp4', 'webm', 'mov', 'avi', 'mkv'], audio: ['mp3', 'wav', 'ogg', 'flac', 'm4a'],
  database: ['sql', 'db', 'sqlite', 'sqlite3'],
}
const extensions = new Map(Object.entries(groups).flatMap(([kind, exts]) =>
  exts.map((ext) => [ext, kind as FileIconKind] as const),
))

export function fileIconKind(path: string): FileIconKind {
  const name = path.split(/[\\/]/).pop()?.toLowerCase() ?? ''
  if (/^\.git(ignore|attributes|modules|keep)$/.test(name)) return 'git'
  if (name === '.env' || name.startsWith('.env.')) return 'settings'
  if (/^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(name)) return 'lock'
  if (!name.includes('.')) return 'file'
  return extensions.get(name.split('.').pop() ?? '') ?? 'file'
}
