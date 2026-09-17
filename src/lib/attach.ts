const IMAGE_EXT =
  /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|heic|heif)$/i
const GENERIC_NAME = /^(image|blob|untitled|download|paste)(\(\d+\))?$/i
export const MAX_ATTACH_BYTES = 10 * 1024 * 1024

type FileEntry = { isFile: boolean; isDirectory: boolean }

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function extFrom(file: File): string {
  const fromName = file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.') + 1)
    : ''
  if (fromName) return fromName.toLowerCase()
  const mime = file.type.split('/')[1] || ''
  if (mime === 'jpeg') return 'jpg'
  return mime.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT.test(file.name)
}

export function hasFilePayload(dt: DataTransfer | null): boolean {
  if (!dt) return false
  return Array.from(dt.types).some(
    (t) => t === 'Files' || t === 'application/x-moz-file',
  )
}

function keyOf(file: File): string {
  return `${file.name}:${file.size}:${file.type}:${file.lastModified}`
}

function renameClipboard(file: File): File {
  const base = file.name.replace(/\.[^.]+$/, '')
  if (file.name && !GENERIC_NAME.test(base)) return file
  const ext = extFrom(file)
  const mime = file.type || (isImageFile(file) ? `image/${ext}` : '')
  return new File([file], `粘贴图片-${stamp()}.${ext}`, {
    type: mime || 'application/octet-stream',
    lastModified: file.lastModified,
  })
}

function collectUnique(files: File[], rename = false): File[] {
  const seen = new Set<string>()
  const out: File[] = []
  for (const raw of files) {
    if (!raw || raw.size < 0) continue
    const file = rename ? renameClipboard(raw) : raw
    const k = keyOf(file)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(file)
  }
  return out
}

export function filesFromDrop(dt: DataTransfer | null): File[] {
  if (!dt) return []
  const skip = new Set<number>()
  const items = dt.items
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as DataTransferItem & {
        webkitGetAsEntry?: () => FileEntry | null
      }
      const entry = item.webkitGetAsEntry?.()
      if (entry?.isDirectory) skip.add(i)
    }
  }
  const picked: File[] = []
  for (let i = 0; i < dt.files.length; i++) {
    if (skip.has(i)) continue
    picked.push(dt.files[i])
  }
  return collectUnique(picked)
}

export function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return []
  const picked: File[] = []
  if (data.files?.length) {
    picked.push(...Array.from(data.files))
  }
  if (data.items) {
    for (const item of Array.from(data.items)) {
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (file) picked.push(file)
    }
  }
  return collectUnique(picked, true)
}

export function partitionAttach(files: File[]): {
  ok: File[]
  oversized: number
} {
  let oversized = 0
  const ok: File[] = []
  for (const file of files) {
    if (file.size > MAX_ATTACH_BYTES) {
      oversized += 1
      continue
    }
    ok.push(file)
  }
  return { ok, oversized }
}
