import { useCallback, useEffect, useState } from 'react'
import { IconPlus } from '../icons'
import {
  doctorMcp,
  formatPairs,
  listMcp,
  parsePairs,
  removeMcp,
  saveMcp,
  setMcpEnabled,
  type McpDoctor,
  type McpScope,
  type McpServer,
  type McpTransport,
} from '../lib/mcp'
import { useWorkspace } from '../workspace'

type Draft = {
  previousName?: string
  name: string
  scope: McpScope
  transport: McpTransport
  command: string
  args: string
  env: string
  url: string
  headers: string
}

const EMPTY: Draft = {
  name: '',
  scope: 'user',
  transport: 'stdio',
  command: '',
  args: '',
  env: '',
  url: '',
  headers: '',
}

const TRANSPORTS: { id: McpTransport; label: string }[] = [
  { id: 'stdio', label: '本地进程' },
  { id: 'http', label: 'HTTP' },
  { id: 'sse', label: 'SSE' },
]

function draftFrom(s: McpServer): Draft {
  return {
    previousName: s.name,
    name: s.name,
    scope: s.scope === 'project' ? 'project' : 'user',
    transport: s.transport,
    command: s.command ?? '',
    args: (s.args ?? []).join('\n'),
    env: formatPairs(s.env, '='),
    url: s.url ?? '',
    headers: formatPairs(s.headers, ': '),
  }
}

function target(s: McpServer): string {
  if (s.url) return s.url
  return [s.command, ...(s.args ?? [])].filter(Boolean).join(' ')
}

export function McpSettings() {
  const { composerProject, sessionCwd, notify } = useWorkspace(
    'composerProject',
    'sessionCwd',
    'notify',
  )
  // 项目级配置写在项目文件夹的 .grok/config.toml；没选项目时只能管用户级。
  const projectDir = composerProject?.path ?? ''
  const cwd = projectDir || sessionCwd
  const [servers, setServers] = useState<McpServer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [doctor, setDoctor] = useState<Record<string, McpDoctor | 'running'>>({})
  const [showSecrets, setShowSecrets] = useState(false)

  const reload = useCallback(() => {
    void listMcp(cwd)
      .then((list) => {
        setServers(list)
        setError(null)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '读取失败'))
  }, [cwd])

  useEffect(reload, [reload])

  useEffect(() => {
    if (!confirmDelete) return
    const t = window.setTimeout(() => setConfirmDelete(null), 3000)
    return () => window.clearTimeout(t)
  }, [confirmDelete])

  function afterWrite(result: { restartError: string | null }, done: string) {
    if (result.restartError) notify(`已保存，但重启 agent 失败：${result.restartError}`, 'error')
    else notify(done, 'success')
    reload()
  }

  async function save() {
    if (!draft) return
    let input
    try {
      input = {
        name: draft.name.trim(),
        scope: draft.scope,
        transport: draft.transport,
        command: draft.command.trim(),
        args: draft.args.split(/\r?\n/).map((a) => a.trim()).filter(Boolean),
        env: parsePairs(draft.env, '='),
        url: draft.url.trim(),
        headers: draft.transport === 'stdio' ? {} : parsePairs(draft.headers, ':'),
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : '格式有误', 'error')
      return
    }
    setSaving(true)
    try {
      const r = await saveMcp(cwd, input, draft.previousName)
      setDraft(null)
      afterWrite(r, `已保存 ${input.name}`)
    } catch (err) {
      notify(err instanceof Error ? err.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function run(name: string, op: () => Promise<{ restartError: string | null }>, done: string) {
    setBusy(name)
    try {
      afterWrite(await op(), done)
    } catch (err) {
      notify(err instanceof Error ? err.message : '操作失败', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function check(name: string) {
    setDoctor((d) => ({ ...d, [name]: 'running' }))
    try {
      const r = await doctorMcp(cwd, name)
      setDoctor((d) => ({ ...d, [name]: r }))
    } catch (err) {
      setDoctor((d) => ({
        ...d,
        [name]: {
          name,
          healthy: false,
          checks: [{ label: err instanceof Error ? err.message : '检查失败', passed: false }],
        },
      }))
    }
  }

  return (
    <section className="settings-card">
      <div className="usage-top">
        <div>
          <h2>MCP 服务器</h2>
          <p className="settings-lead">
            通过本机 <code>grok mcp</code> 管理。用户级写入 <code>~/.grok/config.toml</code>，项目级写入项目文件夹的{' '}
            <code>.grok/config.toml</code>。停用按名字记在用户配置里，对同名的项目级服务器也生效。保存后会重启本机 agent，进行中的生成会中断。
          </p>
        </div>
        {!draft ? (
          <button type="button" className="btn-solid mcp-add" onClick={() => setDraft({ ...EMPTY })}>
            <IconPlus />
            添加
          </button>
        ) : null}
      </div>

      {error ? <p className="tree-error">{error}</p> : null}

      {draft ? (
        <div className="mcp-form">
          <label className="field">
            <span>名称</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="例如 github"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="mcp-form-row">
            <div className="field">
              <span>连接方式</span>
              <div className="deploy-toggle" role="group" aria-label="连接方式">
                {TRANSPORTS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={draft.transport === t.id ? 'deploy-flag is-on' : 'deploy-flag'}
                    aria-pressed={draft.transport === t.id}
                    onClick={() => setDraft({ ...draft, transport: t.id })}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>作用范围</span>
              <div className="deploy-toggle" role="group" aria-label="作用范围">
                <button
                  type="button"
                  className={draft.scope === 'user' ? 'deploy-flag is-on' : 'deploy-flag'}
                  aria-pressed={draft.scope === 'user'}
                  disabled={Boolean(draft.previousName)}
                  onClick={() => setDraft({ ...draft, scope: 'user' })}
                >
                  所有项目
                </button>
                <button
                  type="button"
                  className={draft.scope === 'project' ? 'deploy-flag is-on' : 'deploy-flag'}
                  aria-pressed={draft.scope === 'project'}
                  disabled={!projectDir || Boolean(draft.previousName)}
                  onClick={() => setDraft({ ...draft, scope: 'project' })}
                >
                  {composerProject ? `仅 ${composerProject.name}` : '仅当前项目（先选项目）'}
                </button>
              </div>
            </div>
          </div>
          {draft.transport === 'stdio' ? (
            <>
              <label className="field">
                <span>启动命令</span>
                <input
                  value={draft.command}
                  onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                  placeholder="npx"
                  spellCheck={false}
                />
              </label>
              <label className="field">
                <span>参数（每行一个）</span>
                <textarea
                  rows={3}
                  value={draft.args}
                  onChange={(e) => setDraft({ ...draft, args: e.target.value })}
                  placeholder={'-y\n@modelcontextprotocol/server-github'}
                  spellCheck={false}
                />
              </label>
            </>
          ) : (
            <>
              <label className="field">
                <span>地址</span>
                <input
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://mcp.example.com/mcp"
                  spellCheck={false}
                />
              </label>
              <label className="field">
                <span>请求头（每行「名称: 值」）</span>
                <textarea
                  rows={2}
                  value={draft.headers}
                  onChange={(e) => setDraft({ ...draft, headers: e.target.value })}
                  placeholder="Authorization: Bearer …"
                  spellCheck={false}
                />
              </label>
            </>
          )}
          <label className="field">
            <span>环境变量（每行「KEY=值」）</span>
            <textarea
              rows={2}
              value={draft.env}
              onChange={(e) => setDraft({ ...draft, env: e.target.value })}
              placeholder="GITHUB_TOKEN=…"
              spellCheck={false}
            />
          </label>
          <div className="settings-actions">
            <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>
              取消
            </button>
            <button
              type="button"
              className="btn-solid"
              disabled={saving || !draft.name.trim()}
              onClick={() => void save()}
            >
              {saving ? '正在保存…' : '保存'}
            </button>
          </div>
        </div>
      ) : null}

      {servers && servers.length === 0 && !draft ? (
        <p className="review-empty-line">还没有配置 MCP 服务器</p>
      ) : null}

      {servers && servers.length > 0 ? (
        <>
          <div className="mcp-list-head">
            <span>已配置 {servers.length} 个</span>
            <button type="button" className="text-btn" onClick={() => setShowSecrets((v) => !v)}>
              {showSecrets ? '隐藏密钥' : '显示环境变量 / 请求头'}
            </button>
          </div>
          <ul className="mcp-list">
            {servers.map((s) => {
              const doc = doctor[s.name]
              const secrets = { ...(s.env ?? {}), ...(s.headers ?? {}) }
              const secretCount = Object.keys(secrets).length
              return (
                <li key={`${s.scope}:${s.name}`} className={s.enabled ? 'mcp-item' : 'mcp-item is-off'}>
                  <div className="mcp-item-head">
                    <strong>{s.name}</strong>
                    <span className="mcp-tag">{s.scope === 'project' ? '项目' : '用户'}</span>
                    <span className="mcp-tag">{s.transport === 'stdio' ? '本地进程' : s.transport.toUpperCase()}</span>
                    {!s.enabled ? <span className="mcp-tag is-off">已停用</span> : null}
                    <div className="mcp-ops">
                      <button type="button" disabled={busy != null || doc === 'running'} onClick={() => void check(s.name)}>
                        {doc === 'running' ? '检查中…' : '检查'}
                      </button>
                      <button
                        type="button"
                        disabled={busy != null}
                        onClick={() =>
                          void run(s.name, () => setMcpEnabled(cwd, s.name, !s.enabled), s.enabled ? `已停用 ${s.name}` : `已启用 ${s.name}`)
                        }
                      >
                        {s.enabled ? '停用' : '启用'}
                      </button>
                      <button type="button" disabled={busy != null} onClick={() => setDraft(draftFrom(s))}>
                        编辑
                      </button>
                      <button
                        type="button"
                        className={confirmDelete === s.name ? 'is-danger is-confirm' : 'is-danger'}
                        disabled={busy != null}
                        onClick={() => {
                          if (confirmDelete !== s.name) {
                            setConfirmDelete(s.name)
                            return
                          }
                          setConfirmDelete(null)
                          void run(s.name, () => removeMcp(cwd, s.name, s.scope), `已删除 ${s.name}`)
                        }}
                      >
                        {confirmDelete === s.name ? '确认删除' : '删除'}
                      </button>
                    </div>
                  </div>
                  <code className="mcp-target">{target(s)}</code>
                  {secretCount ? (
                    <div className="mcp-secrets">
                      {showSecrets
                        ? Object.entries(secrets).map(([k, v]) => (
                            <code key={k}>
                              {k} = {v}
                            </code>
                          ))
                        : `${secretCount} 个环境变量 / 请求头（已隐藏）`}
                    </div>
                  ) : null}
                  {doc && doc !== 'running' ? (
                    <ul className={doc.healthy ? 'mcp-doctor is-ok' : 'mcp-doctor'}>
                      <li className="mcp-doctor-sum">{doc.healthy ? '连接正常' : '连接有问题'}</li>
                      {doc.checks.map((c, i) => (
                        <li key={i} className={c.passed ? 'is-pass' : 'is-fail'}>
                          {c.passed ? '✓' : '✗'} {c.label}
                          {c.detail ? <em>{c.detail}</em> : null}
                          {c.hint ? <em>{c.hint}</em> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </section>
  )
}
