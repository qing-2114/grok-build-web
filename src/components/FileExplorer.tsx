import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { IconChevron, IconFolder, IconSearch } from '../icons'
import {
  listDir,
  rawFileUrl,
  readFilePreview,
  type FilePreview,
  type FsEntry,
} from '../lib/fs'
import {
  dirName,
  fileName,
  isWebUrl,
  joinPath,
  looksLikeHtml,
  samePath,
} from '../lib/paths'
import { useWorkspace } from '../workspace'
import { CodePreview } from './CodePreview'
import { RichText } from './RichText'

function TreeRow({
  entry,
  depth,
  expanded,
  previewPath,
  childrenMap,
  filter,
  onToggle,
  onOpen,
}: {
  entry: FsEntry
  depth: number
  expanded: Set<string>
  previewPath: string | null
  childrenMap: Map<string, FsEntry[]>
  filter: string
  onToggle: (path: string) => void
  onOpen: (path: string) => void
}) {
  const q = filter.trim().toLowerCase()
  const kids = childrenMap.get(entry.path) ?? []
  const open = expanded.has(entry.path)
  const active = previewPath ? samePath(previewPath, entry.path) : false
  const selfHit = !q || entry.name.toLowerCase().includes(q)
  const childHits = q
    ? kids.some((k) => k.name.toLowerCase().includes(q))
    : true
  if (q && !selfHit && entry.kind === 'file') return null
  if (q && !selfHit && entry.kind === 'dir' && !open && !childHits) return null

  return (
    <li>
      <button
        type="button"
        className={
          active ? 'tree-row is-active' : 'tree-row'
        }
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => {
          if (entry.kind === 'dir') onToggle(entry.path)
          else onOpen(entry.path)
        }}
      >
        {entry.kind === 'dir' ? (
          <IconChevron className={open ? 'is-open' : ''} />
        ) : (
          <span className="tree-file-mark" />
        )}
        <span className="tree-name">{entry.name}</span>
      </button>
      {entry.kind === 'dir' && open ? (
        <ul className="tree-list">
          {kids.map((child) => (
            <TreeRow
              key={child.path}
              entry={child}
              depth={depth + 1}
              expanded={expanded}
              previewPath={previewPath}
              childrenMap={childrenMap}
              filter={filter}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function FileExplorer() {
  const {
    sessionCwd,
    previewPath,
    setPreviewPath,
    openExternalUrl,
    notify,
  } = useWorkspace()
  const [filter, setFilter] = useState('')
  const [root, setRoot] = useState<FsEntry[]>([])
  const [childrenMap, setChildrenMap] = useState<Map<string, FsEntry[]>>(
    () => new Map(),
  )
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [preview, setPreview] = useState<FilePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionCwd) {
      setRoot([])
      return
    }
    let cancelled = false
    void listDir(sessionCwd)
      .then((entries) => {
        if (cancelled) return
        setRoot(entries)
        setChildrenMap(new Map([[sessionCwd, entries]]))
        setExpanded(new Set([sessionCwd]))
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setRoot([])
        setError(err instanceof Error ? err.message : '无法读取目录')
      })
    return () => {
      cancelled = true
    }
  }, [sessionCwd])

  useEffect(() => {
    if (!previewPath || !sessionCwd) {
      setPreview(null)
      return
    }
    let cancelled = false
    setLoading(true)
    void readFilePreview(sessionCwd, previewPath)
      .then((file) => {
        if (cancelled) return
        setPreview(file)
        setError(null)
        setExpanded((prev) => {
          const next = new Set(prev)
          for (const p of file.ancestors) next.add(p)
          return next
        })
        void Promise.all(
          file.ancestors.map(async (dir) => {
            try {
              const entries = await listDir(dir)
              return [dir, entries] as const
            } catch {
              return [dir, [] as FsEntry[]] as const
            }
          }),
        ).then((pairs) => {
          if (cancelled) return
          setChildrenMap((prev) => {
            const next = new Map(prev)
            for (const [dir, entries] of pairs) next.set(dir, entries)
            return next
          })
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setPreview(null)
        notify(err instanceof Error ? err.message : '无法打开文件', 'error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [previewPath, sessionCwd, notify])

  async function toggleDir(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
    if (childrenMap.has(path)) return
    try {
      const entries = await listDir(path)
      setChildrenMap((prev) => new Map(prev).set(path, entries))
    } catch (err) {
      notify(err instanceof Error ? err.message : '无法读取文件夹', 'error')
    }
  }

  const rootName = useMemo(
    () => fileName(sessionCwd) || sessionCwd || '工作区',
    [sessionCwd],
  )

  const html = preview ? looksLikeHtml(preview.path) : false
  const previewDir = preview ? dirName(preview.path) : ''

  function resolveMedia(src: string): string | null {
    const href = src.trim().replace(/^<|>$/g, '').split(/\s+/)[0]
    if (!href) return null
    if (isWebUrl(href) || href.startsWith('data:image/')) return href
    return rawFileUrl(sessionCwd, joinPath(previewDir, href))
  }

  let body: ReactNode
  if (loading) {
    body = (
      <div className="files-empty">
        <p>正在打开…</p>
      </div>
    )
  } else if (preview?.kind === 'pdf') {
    body = (
      <div className="file-preview-body is-frame">
        <iframe
          className="file-preview-frame"
          title={preview.name}
          src={`${rawFileUrl(sessionCwd, preview.path)}#toolbar=1`}
        />
      </div>
    )
  } else if (preview?.kind === 'markdown') {
    body = (
      <div className="file-preview-body md-preview">
        <RichText
          text={preview.text || ''}
          onOpenFile={(path) => {
            if (isWebUrl(path)) return
            if (/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(path)) {
              setPreviewPath(path)
              return
            }
            setPreviewPath(joinPath(previewDir, path))
          }}
          onOpenUrl={openExternalUrl}
          resolveMedia={resolveMedia}
        />
        {preview.truncated ? (
          <p className="file-preview-hint">文件较大，只显示前面一部分。</p>
        ) : null}
      </div>
    )
  } else if (preview?.kind === 'code' || preview?.kind === 'text') {
    body = (
      <div className="file-preview-body is-code">
        <CodePreview
          code={preview.text || ''}
          language={preview.language}
          truncated={preview.truncated}
        />
      </div>
    )
  } else if (preview?.kind === 'image') {
    body = (
      <div className="file-preview-body is-image">
        <img
          src={rawFileUrl(sessionCwd, preview.path)}
          alt={preview.name}
        />
      </div>
    )
  } else if (preview?.kind === 'binary') {
    body = (
      <div className="files-empty">
        <p>{preview.message || '无法预览此文件'}</p>
      </div>
    )
  } else {
    body = (
      <div className="files-empty">
        <IconFolder />
        <h2>打开文件</h2>
        <p>从工作区目录树中选择文件</p>
      </div>
    )
  }

  return (
    <div className="files-layout">
      <section className="files-preview">{body}</section>
      <aside className="files-tree">
        <label className="tree-filter">
          <IconSearch />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="筛选文件…"
          />
        </label>
        {error ? <p className="tree-error">{error}</p> : null}
        {!sessionCwd ? (
          <p className="tree-error">没有工作目录</p>
        ) : (
          <ul className="tree-list tree-root">
            <li className="tree-root-label">{rootName}</li>
            {root.map((entry) => (
              <TreeRow
                key={entry.path}
                entry={entry}
                depth={0}
                expanded={expanded}
                previewPath={preview?.path ?? previewPath}
                childrenMap={childrenMap}
                filter={filter}
                onToggle={(p) => void toggleDir(p)}
                onOpen={(p) => setPreviewPath(p)}
              />
            ))}
          </ul>
        )}
        {html && preview ? (
          <button
            type="button"
            className="text-btn tree-open-browser"
            onClick={() => openExternalUrl(preview.path)}
          >
            在浏览器打开
          </button>
        ) : null}
      </aside>
    </div>
  )
}
