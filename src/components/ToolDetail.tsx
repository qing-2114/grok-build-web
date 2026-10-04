import { useEffect, useMemo, useState } from 'react'
import { fetchToolDetail, type ToolDetail, type ToolDiff } from '../lib/agent'
import { diffStats, lineDiff } from '../lib/diff'

// 已结束的工具详情不会再变，按 会话:工具 缓存，展开收起不重复请求。
const cache = new Map<string, ToolDetail>()

function DiffBlock({ diff }: { diff: ToolDiff }) {
  const lines = useMemo(() => lineDiff(diff.oldText, diff.newText), [diff])
  const { added, removed } = diffStats(lines)
  const name = diff.path.split(/[\\/]/).pop() || diff.path
  return (
    <div className="tool-diff">
      <div className="tool-diff-head" title={diff.path}>
        <span className="tool-diff-name">{name}</span>
        <span className="tool-diff-stat">
          <span className="is-add">+{added}</span> <span className="is-del">−{removed}</span>
        </span>
      </div>
      <pre className="diff-view tool-diff-body">
        {lines.map((l, i) =>
          l.kind === 'fold' ? (
            <span key={i} className="is-hunk">
              {`… ${l.count} 行未改动\n`}
            </span>
          ) : (
            <span
              key={i}
              className={l.kind === 'add' ? 'is-add' : l.kind === 'del' ? 'is-del' : ''}
            >
              {l.kind === 'add' ? '+ ' : l.kind === 'del' ? '- ' : '  '}
              {l.text}
              {'\n'}
            </span>
          ),
        )}
      </pre>
      {diff.truncated ? <p className="tool-note">内容过长，只显示了一部分</p> : null}
    </div>
  )
}

export function ToolDetailView({
  sessionId,
  cwd,
  toolId,
  running,
}: {
  sessionId: string
  cwd: string
  toolId: string
  running: boolean
}) {
  const key = `${sessionId}:${toolId}`
  const [detail, setDetail] = useState<ToolDetail | null>(() =>
    running ? null : (cache.get(key) ?? null),
  )
  const [error, setError] = useState<string | null>(null)
  const [showInput, setShowInput] = useState(false)

  useEffect(() => {
    if (!running && cache.has(key)) return
    let alive = true
    void fetchToolDetail(sessionId, cwd, toolId)
      .then((d) => {
        if (!alive) return
        if (!running && d.found) cache.set(key, d)
        setDetail(d)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : '读取失败')
      })
    return () => {
      alive = false
    }
  }, [key, sessionId, cwd, toolId, running])

  if (error) return <div className="tool-detail tool-note">{error}</div>
  if (!detail) return <div className="tool-detail tool-note">正在读取…</div>
  if (!detail.found) {
    return (
      <div className="tool-detail tool-note">
        {running ? '工具还在运行，结果稍后可见' : '会话记录里没有这次调用的详情'}
      </div>
    )
  }
  return (
    <div className="tool-detail">
      {detail.diffs.map((d) => (
        <DiffBlock key={d.path} diff={d} />
      ))}
      {detail.output ? (
        <pre className="tool-output">{detail.output}</pre>
      ) : detail.diffs.length ? null : (
        <p className="tool-note">没有输出</p>
      )}
      {detail.input ? (
        <div className="tool-input">
          <button
            type="button"
            className="tool-input-toggle"
            onClick={() => setShowInput((v) => !v)}
            aria-expanded={showInput}
          >
            {showInput ? '收起参数' : '查看参数'}
          </button>
          {showInput ? <pre className="tool-output is-input">{detail.input}</pre> : null}
        </div>
      ) : null}
      {detail.truncated ? <p className="tool-note">内容过长，只显示了一部分</p> : null}
    </div>
  )
}
