import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconDiff } from '../icons'
import {
  fetchGitChanges,
  fetchGitDiff,
  gitCommit,
  gitDiscard,
  gitStage,
  gitUnstage,
  type GitChange,
} from '../lib/fs'
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
    notify,
  } = useWorkspace(
    'sessionCwd',
    'activeSession',
    'isThinking',
    'openLocalFile',
    'openExternalUrl',
    'revealInExplorer',
    'notify',
  )
  const [files, setFiles] = useState<GitChange[]>([])
  const [isRepo, setIsRepo] = useState(true)
  const [branch, setBranch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [patch, setPatch] = useState('')
  const [loading, setLoading] = useState(false)
  const diffGen = useRef(0)
  const lastScope = useRef('')
  const [reloadKey, setReloadKey] = useState(0)
  const [busyPath, setBusyPath] = useState<string | null>(null)
  // 撤销会丢掉改动：第一次点只进入确认态，3 秒内再点才执行。
  const [confirmPath, setConfirmPath] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [committing, setCommitting] = useState(false)

  useEffect(() => {
    if (!confirmPath) return
    const t = window.setTimeout(() => setConfirmPath(null), 3000)
    return () => window.clearTimeout(t)
  }, [confirmPath])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  async function runOp(key: string, op: () => Promise<unknown>, done?: string) {
    setBusyPath(key)
    try {
      await op()
      if (done) notify(done, 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : '操作失败', 'error')
    } finally {
      setBusyPath(null)
      reload()
    }
  }

  async function commit() {
    const msg = message.trim()
    if (!msg || committing) return
    setCommitting(true)
    try {
      const { sha } = await gitCommit(sessionCwd, msg)
      setMessage('')
      notify(`已提交 ${sha}`, 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : '提交失败', 'error')
    } finally {
      setCommitting(false)
      reload()
    }
  }

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
  }, [sessionCwd, activeSession?.id, isThinking, reloadKey])

  const stagedCount = files.filter((f) => f.staged).length

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
        <div className="review-commit">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={stagedCount ? `提交说明（已暂存 ${stagedCount} 个文件）` : '提交说明（先暂存要提交的文件）'}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                void commit()
              }
            }}
          />
          <div className="review-commit-bar">
            <button
              type="button"
              className="text-btn"
              disabled={busyPath != null}
              onClick={() => void runOp('*', () => gitStage(sessionCwd, null))}
            >
              全部暂存
            </button>
            {stagedCount ? (
              <button
                type="button"
                className="text-btn"
                disabled={busyPath != null}
                onClick={() => void runOp('*', () => gitUnstage(sessionCwd, null))}
              >
                全部取消暂存
              </button>
            ) : null}
            <button
              type="button"
              className="btn-solid review-commit-btn"
              disabled={!message.trim() || !stagedCount || committing}
              onClick={() => void commit()}
            >
              {committing ? '正在提交…' : '提交'}
            </button>
          </div>
        </div>
      ) : null}

      {files.length > 0 ? (
        <ul className="review-list">
          {files.map((f) => (
            <li key={f.path}>
              <div className="review-row">
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
                {f.staged ? (
                  <span className={f.unstaged ? 'review-staged is-partial' : 'review-staged'}>
                    {f.unstaged ? '部分暂存' : '已暂存'}
                  </span>
                ) : null}
              </button>
              <div className="review-ops">
                {f.staged && !f.unstaged ? (
                  <button
                    type="button"
                    disabled={busyPath != null}
                    onClick={() => void runOp(f.path, () => gitUnstage(sessionCwd, f.path))}
                  >
                    取消暂存
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyPath != null}
                    onClick={() => void runOp(f.path, () => gitStage(sessionCwd, f.path))}
                  >
                    暂存
                  </button>
                )}
                <button
                  type="button"
                  className={confirmPath === f.path ? 'is-danger is-confirm' : 'is-danger'}
                  disabled={busyPath != null}
                  onClick={() => {
                    if (confirmPath !== f.path) {
                      setConfirmPath(f.path)
                      return
                    }
                    setConfirmPath(null)
                    void runOp(
                      f.path,
                      () => gitDiscard(sessionCwd, f),
                      f.status === 'untracked' || f.status === 'added'
                        ? `已删除 ${f.path}`
                        : `已撤销 ${f.path}`,
                    )
                  }}
                >
                  {confirmPath === f.path
                    ? f.status === 'untracked' || f.status === 'added'
                      ? '确认删除'
                      : '确认撤销'
                    : '撤销'}
                </button>
              </div>
              </div>
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
