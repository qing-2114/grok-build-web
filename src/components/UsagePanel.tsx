import { useEffect, useState } from 'react'
import { fetchUsageReport, type UsageReport } from '../lib/agent'
import { formatDuration, formatMarks } from '../lib/format'
import { displayTitle } from '../lib/title'
import { useWorkspace } from '../workspace'

const RANGES = [7, 30, 90] as const

function fillDays(report: UsageReport, days: number): Array<{ date: string; total: number; input: number; output: number; turns: number }> {
  const byDate = new Map(report.days.map((d) => [d.date, d]))
  const out = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    const p = (n: number) => String(n).padStart(2, '0')
    const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    const hit = byDate.get(date)
    out.push({
      date,
      total: hit?.total ?? 0,
      input: hit?.input ?? 0,
      output: hit?.output ?? 0,
      turns: hit?.turns ?? 0,
    })
  }
  return out
}

function DailyBars({ rows }: { rows: ReturnType<typeof fillDays> }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...rows.map((r) => r.total))
  const active = hover != null ? rows[hover] : null
  return (
    <figure className="usage-chart">
      <figcaption className="usage-chart-head">
        <span>每日标记用量</span>
        <span className="usage-chart-read">
          {active
            ? `${active.date} · ${formatMarks(active.total)}（输入 ${formatMarks(active.input)}，输出 ${formatMarks(active.output)}）· ${active.turns} 轮`
            : `峰值 ${formatMarks(max)}`}
        </span>
      </figcaption>
      <div
        className="usage-bars"
        role="img"
        aria-label="每日标记用量柱状图"
        onMouseLeave={() => setHover(null)}
      >
        {rows.map((r, i) => (
          <div
            key={r.date}
            className={hover === i ? 'usage-bar-slot is-hover' : 'usage-bar-slot'}
            onMouseEnter={() => setHover(i)}
          >
            {r.total > 0 ? (
              <span
                className="usage-bar"
                style={{ height: `${Math.max(2, (r.total / max) * 100)}%` }}
              />
            ) : null}
          </div>
        ))}
      </div>
      <div className="usage-axis">
        <span>{rows[0]?.date.slice(5)}</span>
        <span>{rows[rows.length - 1]?.date.slice(5)}</span>
      </div>
    </figure>
  )
}

export function UsagePanel() {
  const { history, titleOverrides, selectSession, setSettingsOpen } = useWorkspace(
    'history',
    'titleOverrides',
    'selectSession',
    'setSettingsOpen',
  )
  const [days, setDays] = useState<(typeof RANGES)[number]>(30)
  const [report, setReport] = useState<UsageReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void fetchUsageReport(days)
      .then((r) => {
        if (!alive) return
        setReport(r)
        setError(null)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : '读取用量失败')
      })
    return () => {
      alive = false
    }
  }, [days])

  const t = report?.totals
  const cacheRate = t && t.input > 0 ? Math.round((t.cached / t.input) * 100) : 0

  return (
    <section className="settings-card usage-card">
      <div className="usage-top">
        <div>
          <h2>用量统计</h2>
          <p className="settings-lead">
            从本机 Grok Build 会话记录汇总，每轮结束时 agent 报告的标记数。只读，不联网。
          </p>
        </div>
        <div className="deploy-toggle" role="group" aria-label="时间范围">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              className={d === days ? 'deploy-flag is-on' : 'deploy-flag'}
              aria-pressed={d === days}
              onClick={() => setDays(d)}
            >
              {d} 天
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="tree-error">{error}</p> : null}
      {!report && !error ? <p className="review-empty-line">正在汇总会话记录…</p> : null}

      {report && t ? (
        <>
          <div className="usage-tiles">
            <div className="usage-tile">
              <span>回合</span>
              <strong>{t.turns.toLocaleString()}</strong>
            </div>
            <div className="usage-tile">
              <span>输入标记</span>
              <strong>{formatMarks(t.input)}</strong>
              <em>缓存命中 {cacheRate}%</em>
            </div>
            <div className="usage-tile">
              <span>输出标记</span>
              <strong>{formatMarks(t.output)}</strong>
              <em>其中推理 {formatMarks(t.reasoning)}</em>
            </div>
            <div className="usage-tile">
              <span>生成用时</span>
              <strong>{formatDuration(t.elapsedMs)}</strong>
              <em>模型调用 {t.calls.toLocaleString()} 次</em>
            </div>
          </div>

          <DailyBars rows={fillDays(report, days)} />

          {report.models.length ? (
            <table className="usage-table">
              <caption>按模型</caption>
              <thead>
                <tr>
                  <th>模型</th>
                  <th>输入</th>
                  <th>输出</th>
                  <th>调用</th>
                </tr>
              </thead>
              <tbody>
                {report.models.map((m) => (
                  <tr key={m.model}>
                    <td>{m.model}</td>
                    <td>{formatMarks(m.input)}</td>
                    <td>{formatMarks(m.output)}</td>
                    <td>{m.calls.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {report.sessions.length ? (
            <table className="usage-table">
              <caption>用量最多的会话</caption>
              <thead>
                <tr>
                  <th>会话</th>
                  <th>回合</th>
                  <th>总标记</th>
                </tr>
              </thead>
              <tbody>
                {report.sessions.map((row) => {
                  const session = history.find((s) => s.id === row.id)
                  const label = session
                    ? displayTitle(session, titleOverrides[session.id])
                    : row.id.slice(0, 8)
                  return (
                    <tr key={row.id}>
                      <td>
                        {session ? (
                          <button
                            type="button"
                            className="usage-link"
                            onClick={() => {
                              setSettingsOpen(false)
                              selectSession(session.id)
                            }}
                          >
                            {label}
                          </button>
                        ) : (
                          <span className="usage-muted">{label}</span>
                        )}
                      </td>
                      <td>{row.turns}</td>
                      <td>{formatMarks(row.total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : null}

          {t.turns === 0 ? (
            <p className="review-empty-line">这段时间没有完成的回合</p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
