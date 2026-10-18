export type PickedFolder = {
  name: string
  pathHint: string
}

export async function pickLocalFolder(): Promise<
  PickedFolder | 'unsupported' | 'aborted'
> {
  const picker = (
    window as Window & {
      showDirectoryPicker?: (opts?: { mode?: 'read' }) => Promise<{ name: string }>
    }
  ).showDirectoryPicker

  if (!picker) return 'unsupported'

  try {
    const handle = await picker({ mode: 'read' })
    return { name: handle.name, pathHint: handle.name }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'aborted'
    throw err
  }
}

export function folderNameFromPath(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const parts = trimmed.split(/[\\/]/)
  return parts[parts.length - 1] || trimmed
}

/** Windows 盘符、UNC，或 POSIX 绝对路径。浏览器选文件夹只回传叶子名，不能当 cwd。 */
export function isAbsoluteFolderPath(path: string): boolean {
  const s = path.trim()
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(s)
}

export function relativeFolderMessage(path: string): string {
  const leaf = path.trim() || '该文件夹'
  const win =
    typeof navigator !== 'undefined' && /win/i.test(navigator.platform || '')
  return win
    ? `项目文件夹「${leaf}」不是完整路径，会被接到工作台目录下。请改成带盘符的路径，例如 F:\\${leaf}`
    : `项目文件夹「${leaf}」不是完整路径，会被接到工作台目录下。请改成以 / 开头的路径。`
}
