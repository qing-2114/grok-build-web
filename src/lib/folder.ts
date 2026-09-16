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
