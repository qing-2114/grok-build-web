import { useEffect, useMemo, useRef, useState } from 'react'
import { IconDiff } from '../icons'
import { fetchGitChanges, fetchGitDiff, type GitChange } from '../lib/fs'
import { looksLikeFilePath } from '../lib/paths'
import { useWorkspace } from '../workspace'
import { PathLink } from './PathLink'

const STATUS_LABEL: Record<GitChange['status'], string> = {
  modified: '修改',
  added: '新增',
  deleted: '删除',
  untracked: '未跟踪',
  renamed: '重命名',
}

function DiffView({ patch }: { patch: string }) {
  if (!patch.trim()) {
    return <p className="review-empty-line">没有可显示的差异</p>
  }
  return (
    <pre className="diff-view">
      {patch.split('\n').map((ln, i) => {
        let cls = ''
        if (ln.startsWith('+') && !ln.startsWith('+++')) cls = 'is-add'
        else if (ln.startsWith('-') && !ln.startsWith('---')) cls = 'is-del'
        else if (ln.startsWith('@@')) cls = 'is-hunk'
        return (
          <span key={i} className={cls}>
            {ln}
            {'\n'}
          </span>
        )
      })}
    </pre>
  )
}

export function ReviewPane() {
  const {
    sessionCwd,
    activeSession,
    isThinking,
    openLocalFile,
    openExternalUrl,
    revealInExplorer,
  } = useWorkspace()
  const [files, setFiles] = useState<GitChange[]>([])
  const [isRepo, setIsRepo] = useState(true)
  const [branch, setBranch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [patch, setPatch] = useState('')
  const [loading, setLoading] = useState(false)
  const diffGen = useRef(0)
  const lastScope = useRef('')

  const mentioned = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const m of activeSession?.messages ?? []) {
      const t = m.tool?.target?.trim() ?? ''
      if (!t || !looksLikeFilePath(t)) continue
      const key = t.replace(/\//g, '\\').toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(t)
    }
    return out
  }, [activeSession?.messages])

  useEffect(() => {
    // 换会话或换工作目录后，之前展开的 diff 属于旧目录：丢弃并取消在途请求。
    // 放在这个 effect 里（而不是单独依赖 cwd 的 effect），这样生成中的 isThinking
    // 翻转不会顺手清掉用户正打开的 diff。
    const scope = `${activeSession?.id ?? ''}|${sessionCwd}`
    if (lastScope.current !== scope) {
      lastScope.current = scope
      diffGen.current += 1
      setOpenPath(null)
      setPatch('')
    }
    if (!sessionCwd) {
      setFiles([])
      setIsRepo(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void fetchGitChanges(sessionCwd)
      .then((data) => {
        if (cancelled) return
        setIsRepo(data.isRepo)
        setBranch(data.branch)
        setFiles(data.files)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '无法读取更改')
        setFiles([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // 只在会话 / 工作目录变化，以及一轮生成开始和结束时刷新。
    // 不能依赖 activeSession.updatedAt：流式事件每个 token 都会改它，
    // 那样每来一个字都会重跑 git status。
  }, [sessionCwd, activeSession?.id, isThinking])

  async function toggleFile(file: GitChange) {
    if (openPath === file.path) {
      diffGen.current += 1
      setOpenPath(null)
      setPatch('')
      return
    }
    const gen = ++diffGen.current
    setOpenPath(file.path)
    setPatch('')
    try {
      const data = await fetchGitDiff(sessionCwd, file.path)
      if (diffGen.current !== gen) return
      setPatch(data.patch)
    } catch (err) {
      if (diffGen.current !== gen) return
      setPatch(err instanceof Error ? err.message : '无法读取差异')
    }
  }

  return (
    <div className="review-pane">
      {sessionCwd ? (
        <p className="review-cwd">
          {branch ? `${branch} · ` : ''}
          {sessionCwd}
        </p>
      ) : (
        <p className="review-cwd">没有工作目录</p>
      )}

      {error ? <p className="tree-error">{error}</p> : null}

      {loading ? <p className="review-empty-line">正在读取更改…</p> : null}

      {!loading && isRepo && files.length === 0 ? (
        <div className="files-empty">
          <IconDiff />
          <h2>没有文件更改</h2>
          <p>当前会话工作目录是干净的</p>
        </div>
      ) : null}

      {!loading && !isRepo ? (
        <div className="files-empty">
          <IconDiff />
          <h2>不是 git 仓库</h2>
          <p>审查会列出工作区里尚未提交的文件改动</p>
        </div>
      ) : null}

      {files.length > 0 ? (
        <ul className="review-list">
          {files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                className={
                  openPath === f.path ? 'review-file is-open' : 'review-file'
                }
                onClick={() => void toggleFile(f)}
              >
                <span className={`review-status is-${f.status}`}>
                  {STATUS_LABEL[f.status]}
                </span>
                <span className="review-path">{f.path}</span>
              </button>
              {openPath === f.path ? (
                <div className="review-diff">
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => openLocalFile(f.path)}
                  >
                    打开预览
                  </button>
                  <DiffView patch={patch} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {mentioned.length > 0 ? (
        <section className="review-mentioned">
          <h3>本会话提到的文件</h3>
          <ul>
            {mentioned.map((p) => (
              <li key={p}>
                <PathLink
                  href={p}
                  onOpenFile={openLocalFile}
                  onOpenUrl={openExternalUrl}
                  onReveal={revealInExplorer}
                >
                  {p}
                </PathLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
