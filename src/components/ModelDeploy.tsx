import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IconBox,
  IconCheck,
  IconChevron,
  IconClose,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconPlus,
  IconTrash,
} from '../icons'
import {
  API_BACKENDS,
  deleteDeployment,
  fetchDeployments,
  fetchRemoteCatalog,
  formatContextSize,
  parseContextSize,
  saveDeployment,
  slugifyProvider,
  testDeployment,
  type DeployModel,
  type DeployProvider,
  type DeployTestResult,
  type RemoteCatalogItem,
} from '../lib/deploy'
import { EFFORTS, type EffortLevel } from '../types'
import { useWorkspace } from '../workspace'
import { Popover } from './Popover'

const DEFAULT_EFFORTS: EffortLevel[] = ['low', 'medium', 'high']
const DEFAULT_CONTEXT = 200000

function emptyProvider(taken: Set<string>): DeployProvider {
  let id = 'custom'
  let n = 2
  while (taken.has(id)) {
    id = `custom-${n}`
    n += 1
  }
  return {
    id,
    name: '自定义供应商',
    enabled: true,
    baseUrl: '',
    apiKey: '',
    apiBackend: 'chat_completions',
    models: [],
  }
}

function nextCatalogId(
  providerId: string,
  modelId: string,
  taken: Set<string>,
): string {
  const slug = slugifyProvider(modelId) || 'model'
  const base =
    slug === providerId || slug.startsWith(`${providerId}-`)
      ? slug
      : `${providerId}-${slug}`
  if (!taken.has(base)) return base
  for (let i = 2; i < 100; i++) {
    const id = `${base}-${i}`
    if (!taken.has(id)) return id
  }
  return `${base}-${Date.now().toString(36)}`
}

export function ModelDeploy() {
  const { notify, refreshAgent } = useWorkspace()
  const [providers, setProviders] = useState<DeployProvider[]>([])
  const [persisted, setPersisted] = useState<Set<string>>(() => new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<DeployTestResult | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [ctxDraft, setCtxDraft] = useState<Record<string, string>>({})
  const [manualId, setManualId] = useState('')
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [catalog, setCatalog] = useState<RemoteCatalogItem[]>([])
  const [catalogSel, setCatalogSel] = useState<Set<string>>(() => new Set())
  const [catalogBusy, setCatalogBusy] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const catalogGen = useRef(0)
  const testGen = useRef(0)
  const modelTestGen = useRef(new Map<string, number>())
  const [modelBusy, setModelBusy] = useState<Record<string, boolean>>({})
  const [modelTest, setModelTest] = useState<Record<string, DeployTestResult>>(
    {},
  )

  const selected = providers.find((p) => p.id === selectedId) ?? null
  const backendMeta =
    API_BACKENDS.find((b) => b.id === selected?.apiBackend) ?? API_BACKENDS[0]

  function resetTransient() {
    catalogGen.current += 1
    testGen.current += 1
    modelTestGen.current = new Map()
    setTest(null)
    setModelBusy({})
    setModelTest({})
    setCatalogOpen(false)
    setCatalogBusy(false)
    setCatalogError(null)
    setCatalog([])
    setCatalogSel(new Set())
    setTesting(false)
    setEditingName(false)
    setShowKey(false)
    setCtxDraft({})
  }

  useEffect(() => {
    let cancelled = false
    void fetchDeployments()
      .then((list) => {
        if (cancelled) return
        setProviders(list)
        setPersisted(new Set(list.map((p) => p.id)))
        setSelectedId(list[0]?.id ?? null)
        setLoadError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : '读取模型配置失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function patchSelected(next: Partial<DeployProvider>) {
    if (!selectedId) return
    setProviders((list) =>
      list.map((p) => (p.id === selectedId ? { ...p, ...next } : p)),
    )
    if (
      next.baseUrl != null ||
      next.apiKey != null ||
      next.apiBackend != null
    ) {
      testGen.current += 1
      modelTestGen.current = new Map()
      setTest(null)
      setTesting(false)
      setModelBusy({})
      setModelTest({})
    }
  }

  function patchModels(models: DeployModel[]) {
    patchSelected({ models })
  }

  function addProvider() {
    const taken = new Set(providers.map((p) => p.id))
    const next = emptyProvider(taken)
    resetTransient()
    setProviders((list) => [...list, next])
    setSelectedId(next.id)
    setEditingName(true)
  }

  async function onSave() {
    if (!selected) return
    if (!selected.baseUrl.trim()) {
      notify('请填写请求地址', 'error')
      return
    }
    if (!selected.models.length) {
      notify('请先添加至少一个模型', 'error')
      return
    }
    setSaving(true)
    try {
      const result = await saveDeployment(selected)
      setProviders(result.providers)
      setPersisted(new Set(result.providers.map((p) => p.id)))
      const still = result.providers.find((p) => p.id === selected.id)
      setSelectedId(still?.id ?? result.providers[0]?.id ?? null)
      await refreshAgent()
      if (result.error) {
        notify(`已写入配置，但重载 agent 失败：${result.error}`, 'error')
      } else {
        notify('模型部署已保存', 'success')
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!selected) return
    const label = selected.name || selected.id
    if (!window.confirm(`删除供应商「${label}」及其模型？`)) return
    if (!persisted.has(selected.id)) {
      const next = providers.filter((p) => p.id !== selected.id)
      setProviders(next)
      setSelectedId(next[0]?.id ?? null)
      return
    }
    setSaving(true)
    try {
      const result = await deleteDeployment(selected.id)
      setProviders(result.providers)
      setPersisted(new Set(result.providers.map((p) => p.id)))
      setSelectedId(result.providers[0]?.id ?? null)
      await refreshAgent()
      notify('已删除供应商', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : '删除失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function onTest() {
    if (!selected) return
    const gen = ++testGen.current
    setTesting(true)
    setTest(null)
    try {
      const result = await testDeployment({
        baseUrl: selected.baseUrl,
        apiKey: selected.apiKey,
        apiBackend: selected.apiBackend,
      })
      if (testGen.current !== gen) return
      setTest(result)
      if (!result.ok) notify(result.message, 'error')
    } catch (err) {
      if (testGen.current !== gen) return
      const message = err instanceof Error ? err.message : '连通性测试失败'
      setTest({ ok: false, message, latencyMs: 0 })
      notify(message, 'error')
    } finally {
      if (testGen.current === gen) setTesting(false)
    }
  }

  async function onTestModel(model: DeployModel) {
    if (!selected) return
    const id = model.catalogId
    const name = model.model.trim()
    if (!name) {
      notify('请先填写模型 ID', 'error')
      return
    }
    const gen = (modelTestGen.current.get(id) ?? 0) + 1
    modelTestGen.current.set(id, gen)
    setModelBusy((m) => ({ ...m, [id]: true }))
    setModelTest((m) => {
      const next = { ...m }
      delete next[id]
      return next
    })
    try {
      const result = await testDeployment({
        baseUrl: selected.baseUrl,
        apiKey: selected.apiKey,
        apiBackend: selected.apiBackend,
        model: name,
      })
      if (modelTestGen.current.get(id) !== gen) return
      setModelTest((m) => ({ ...m, [id]: result }))
      if (!result.ok) notify(`${name}：${result.message}`, 'error')
    } catch (err) {
      if (modelTestGen.current.get(id) !== gen) return
      const message = err instanceof Error ? err.message : '连通性测试失败'
      setModelTest((m) => ({
        ...m,
        [id]: { ok: false, message, latencyMs: 0 },
      }))
      notify(`${name}：${message}`, 'error')
    } finally {
      if (modelTestGen.current.get(id) === gen) {
        setModelBusy((m) => ({ ...m, [id]: false }))
      }
    }
  }

  async function onFetchCatalog() {
    if (!selected) return
    const gen = ++catalogGen.current
    setCatalogBusy(true)
    setCatalogError(null)
    setCatalogOpen(true)
    try {
      const list = await fetchRemoteCatalog({
        baseUrl: selected.baseUrl,
        apiKey: selected.apiKey,
        apiBackend: selected.apiBackend,
      })
      if (catalogGen.current !== gen) return
      setCatalog(list)
      setCatalogSel(new Set())
      if (!list.length) setCatalogError('接口没有返回模型')
    } catch (err) {
      if (catalogGen.current !== gen) return
      setCatalog([])
      setCatalogSel(new Set())
      setCatalogError(err instanceof Error ? err.message : '获取模型列表失败')
    } finally {
      if (catalogGen.current === gen) setCatalogBusy(false)
    }
  }

  function addFromCatalog() {
    if (!selected) return
    const have = new Set(selected.models.map((m) => m.model))
    const taken = new Set(selected.models.map((m) => m.catalogId))
    const extra: DeployModel[] = []
    for (const item of catalog) {
      if (!catalogSel.has(item.id) || have.has(item.id)) continue
      const catalogId = nextCatalogId(selected.id, item.id, taken)
      taken.add(catalogId)
      extra.push({
        catalogId,
        model: item.id,
        name: item.name || item.id,
        contextWindow: DEFAULT_CONTEXT,
        efforts: DEFAULT_EFFORTS,
        extraLines: [],
      })
    }
    if (!extra.length) {
      notify('没有可添加的模型')
      return
    }
    patchModels([...selected.models, ...extra])
    setCatalogOpen(false)
    notify(`已加入 ${extra.length} 个模型`)
  }

  function addManual() {
    if (!selected) return
    const model = manualId.trim()
    if (!model) {
      notify('请输入模型 ID', 'error')
      return
    }
    if (selected.models.some((m) => m.model === model)) {
      notify('该模型已在列表中')
      return
    }
    const taken = new Set(selected.models.map((m) => m.catalogId))
    const catalogId = nextCatalogId(selected.id, model, taken)
    patchModels([
      ...selected.models,
      {
        catalogId,
        model,
        name: model,
        contextWindow: DEFAULT_CONTEXT,
        efforts: DEFAULT_EFFORTS,
        extraLines: [],
      },
    ])
    setManualId('')
  }

  function commitContext(catalogId: string) {
    if (!selected) return
    const raw = ctxDraft[catalogId]
    if (raw == null) return
    const value = parseContextSize(raw)
    if (!value) {
      setCtxDraft((d) => {
        const next = { ...d }
        delete next[catalogId]
        return next
      })
      notify('上下文大小无效，已还原', 'error')
      return
    }
    patchModels(
      selected.models.map((m) =>
        m.catalogId === catalogId ? { ...m, contextWindow: value } : m,
      ),
    )
    setCtxDraft((d) => {
      const next = { ...d }
      delete next[catalogId]
      return next
    })
  }

  const takenIds = useMemo(
    () => new Set(providers.map((p) => p.id)),
    [providers],
  )

  return (
    <section className="settings-card deploy-card">
      <div className="deploy-copy">
        <h2>模型部署</h2>
        <p className="settings-lead">
          管理自定义模型供应商。填写请求地址、密钥和协议后，可获取模型列表、勾选思考强度并设置上下文大小。保存写入本机
          Grok 配置，聊天时可选择使用。
        </p>
      </div>

      {loading ? (
        <p className="deploy-status">正在读取本机配置…</p>
      ) : loadError ? (
        <p className="deploy-banner is-err">{loadError}</p>
      ) : (
        <div className="deploy-layout">
          <aside className="deploy-nav" aria-label="自定义供应商">
            <p className="deploy-nav-kicker">自定义供应商</p>
            {providers.length === 0 ? (
              <p className="deploy-nav-empty">还没有供应商</p>
            ) : (
              providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={
                    p.id === selectedId
                      ? 'deploy-nav-item is-active'
                      : 'deploy-nav-item'
                  }
                  onClick={() => {
                    resetTransient()
                    setSelectedId(p.id)
                  }}
                >
                  <IconBox />
                  <span>{p.name || p.id}</span>
                  <i
                    className={
                      p.enabled ? 'deploy-dot is-on' : 'deploy-dot'
                    }
                    aria-hidden="true"
                  />
                </button>
              ))
            )}
            <button
              type="button"
              className="deploy-add"
              onClick={addProvider}
            >
              <IconPlus />
              添加供应商
            </button>
          </aside>

          <div className="deploy-editor">
            {selected ? (
              <>
                <div className="deploy-head">
                  <div className="deploy-title">
                    {editingName ? (
                      <input
                        className="deploy-name-input"
                        value={selected.name}
                        maxLength={80}
                        autoFocus
                        onChange={(e) => {
                          const name = e.target.value
                          if (!persisted.has(selected.id)) {
                            const slug = slugifyProvider(name)
                            let id = slug
                            let n = 2
                            while (takenIds.has(id) && id !== selected.id) {
                              id = `${slug}-${n}`
                              n += 1
                            }
                            patchSelected({ name, id })
                            setSelectedId(id)
                          } else {
                            patchSelected({ name })
                          }
                        }}
                        onBlur={() => setEditingName(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setEditingName(false)
                        }}
                      />
                    ) : (
                      <h3>{selected.name || selected.id}</h3>
                    )}
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="重命名"
                      onClick={() => setEditingName(true)}
                    >
                      <IconPencil />
                    </button>
                  </div>
                  <div className="deploy-head-actions">
                    <div className="deploy-toggle" role="group" aria-label="启用">
                      <button
                        type="button"
                        className={
                          selected.enabled
                            ? 'deploy-flag is-on'
                            : 'deploy-flag'
                        }
                        onClick={() => patchSelected({ enabled: true })}
                      >
                        已启用
                      </button>
                      <button
                        type="button"
                        className={
                          !selected.enabled
                            ? 'deploy-flag is-off'
                            : 'deploy-flag'
                        }
                        onClick={() => patchSelected({ enabled: false })}
                      >
                        禁用
                      </button>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="删除供应商"
                      onClick={() => void onDelete()}
                      disabled={saving}
                    >
                      <IconTrash />
                    </button>
                  </div>
                </div>

                <label className="field" htmlFor="deploy-url">
                  <span>请求地址</span>
                  <input
                    id="deploy-url"
                    value={selected.baseUrl}
                    onChange={(e) =>
                      patchSelected({ baseUrl: e.target.value })
                    }
                    placeholder="https://api.example.com/v1"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>

                <div className="field">
                  <span>协议</span>
                  <Popover
                    portal
                    align="left"
                    menuClassName="deploy-proto-menu"
                    trigger={({ open, toggle }) => (
                      <button
                        type="button"
                        id="deploy-backend"
                        className={
                          open ? 'deploy-proto is-open' : 'deploy-proto'
                        }
                        onClick={toggle}
                        aria-haspopup="listbox"
                        aria-expanded={open}
                      >
                        <span className="deploy-proto-copy">
                          <strong>{backendMeta.label}</strong>
                          <em>{backendMeta.path}</em>
                        </span>
                        <IconChevron />
                      </button>
                    )}
                  >
                    {({ close }) => (
                      <>
                        <div className="menu-section">
                          Grok Build 原生直连，无需本地路由
                        </div>
                        {API_BACKENDS.map((b) => {
                          const on = b.id === selected.apiBackend
                          return (
                            <button
                              key={b.id}
                              type="button"
                              role="option"
                              aria-selected={on}
                              className={on ? 'is-active' : ''}
                              onClick={() => {
                                patchSelected({ apiBackend: b.id })
                                close()
                              }}
                            >
                              <span className="deploy-proto-opt">
                                <span className="deploy-proto-opt-top">
                                  <strong>{b.label}</strong>
                                  <code>{b.path}</code>
                                </span>
                                <em>{b.hint}</em>
                              </span>
                              {on ? <IconCheck /> : null}
                            </button>
                          )
                        })}
                      </>
                    )}
                  </Popover>
                  <p className="deploy-field-hint">
                    仅列出 Grok Build 支持的三种接口：Chat Completions、Responses、Messages。直连供应商，不走本地路由。
                  </p>
                </div>

                <label className="field" htmlFor="deploy-key">
                  <span>API Key</span>
                  <div className="deploy-key">
                    <input
                      id="deploy-key"
                      type={showKey ? 'text' : 'password'}
                      value={selected.apiKey}
                      onChange={(e) =>
                        patchSelected({ apiKey: e.target.value })
                      }
                      placeholder="sk-…"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={showKey ? '隐藏密钥' : '显示密钥'}
                      onClick={() => setShowKey((v) => !v)}
                    >
                      {showKey ? <IconEyeOff /> : <IconEye />}
                    </button>
                  </div>
                </label>

                <div className="deploy-toolbar">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void onTest()}
                    disabled={testing || !selected.baseUrl.trim()}
                  >
                    {testing ? '正在测试…' : '测试接口'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void onFetchCatalog()}
                    disabled={catalogBusy || !selected.baseUrl.trim()}
                  >
                    {catalogBusy ? '正在获取…' : '获取模型列表'}
                  </button>
                </div>

                {test ? (
                  <p
                    className={
                      test.ok ? 'deploy-banner is-ok' : 'deploy-banner is-err'
                    }
                  >
                    {test.message}
                    {test.latencyMs > 0 ? ` · ${test.latencyMs}ms` : ''}
                  </p>
                ) : null}

                {catalogOpen ? (
                  <div className="deploy-catalog">
                    <div className="deploy-catalog-head">
                      <strong>选择要添加的模型</strong>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="关闭"
                        onClick={() => setCatalogOpen(false)}
                      >
                        <IconClose />
                      </button>
                    </div>
                    {catalogError ? (
                      <p className="deploy-banner is-err">{catalogError}</p>
                    ) : catalogBusy ? (
                      <p className="deploy-status">正在获取模型列表…</p>
                    ) : (
                      <ul className="deploy-catalog-list">
                        {catalog.map((item) => {
                          const already = selected.models.some(
                            (m) => m.model === item.id,
                          )
                          const on = catalogSel.has(item.id)
                          return (
                            <li key={item.id}>
                              <label
                                className={
                                  already
                                    ? 'deploy-check is-disabled'
                                    : 'deploy-check'
                                }
                              >
                                <input
                                  type="checkbox"
                                  disabled={already}
                                  checked={already || on}
                                  onChange={() => {
                                    setCatalogSel((set) => {
                                      const next = new Set(set)
                                      if (next.has(item.id)) next.delete(item.id)
                                      else next.add(item.id)
                                      return next
                                    })
                                  }}
                                />
                                <span>{item.id}</span>
                                {already ? <em>已添加</em> : null}
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    <div className="deploy-catalog-foot">
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={catalogBusy || !catalog.length}
                        onClick={() => {
                          const have = new Set(
                            selected.models.map((m) => m.model),
                          )
                          setCatalogSel(
                            new Set(
                              catalog
                                .filter((item) => !have.has(item.id))
                                .map((item) => item.id),
                            ),
                          )
                        }}
                      >
                        全选
                      </button>
                      <button
                        type="button"
                        className="btn-solid"
                        onClick={addFromCatalog}
                        disabled={Boolean(catalogError) || catalogBusy}
                      >
                        添加所选
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="deploy-models-head">
                  <h4>模型列表</h4>
                  <p>
                    为每个模型勾选思考强度、设置上下文大小，并可单独测试该模型的连通性。
                  </p>
                </div>

                <div className="deploy-models">
                  {selected.models.length === 0 ? (
                    <p className="deploy-nav-empty">
                      还没有模型。获取列表或手动添加。
                    </p>
                  ) : (
                    selected.models.map((m) => {
                      const result = modelTest[m.catalogId]
                      const busy = Boolean(modelBusy[m.catalogId])
                      return (
                      <div key={m.catalogId} className="deploy-model">
                        <div className="deploy-model-id">
                          <input
                            value={m.model}
                            aria-label="模型 ID"
                            spellCheck={false}
                            onChange={(e) => {
                              const model = e.target.value
                              patchModels(
                                selected.models.map((row) =>
                                  row.catalogId === m.catalogId
                                    ? {
                                        ...row,
                                        model,
                                        name: row.name === row.model ? model : row.name,
                                      }
                                    : row,
                                ),
                              )
                            }}
                          />
                          <span className="deploy-ctx-badge">
                            {formatContextSize(m.contextWindow) || '—'}
                          </span>
                        </div>
                        <label className="deploy-ctx">
                          <span>上下文</span>
                          <input
                            value={
                              ctxDraft[m.catalogId] ??
                              formatContextSize(m.contextWindow)
                            }
                            onChange={(e) =>
                              setCtxDraft((d) => ({
                                ...d,
                                [m.catalogId]: e.target.value,
                              }))
                            }
                            onBlur={() => commitContext(m.catalogId)}
                            spellCheck={false}
                          />
                        </label>
                        <div className="deploy-efforts" role="group" aria-label="思考强度">
                          {EFFORTS.map((e) => {
                            const on = m.efforts.includes(e.id)
                            return (
                              <button
                                key={e.id}
                                type="button"
                                className={
                                  on ? 'deploy-chip is-on' : 'deploy-chip'
                                }
                                onClick={() => {
                                  const efforts = on
                                    ? m.efforts.filter((id) => id !== e.id)
                                    : [...m.efforts, e.id]
                                  patchModels(
                                    selected.models.map((row) =>
                                      row.catalogId === m.catalogId
                                        ? {
                                            ...row,
                                            efforts: efforts.length
                                              ? efforts
                                              : ['high'],
                                          }
                                        : row,
                                    ),
                                  )
                                }}
                              >
                                {on ? <IconCheck /> : null}
                                {e.label}
                              </button>
                            )
                          })}
                        </div>
                        <button
                          type="button"
                          className="deploy-model-test"
                          onClick={() => void onTestModel(m)}
                          disabled={
                            busy ||
                            !selected.baseUrl.trim() ||
                            !m.model.trim()
                          }
                        >
                          {busy ? '测试中…' : '测试'}
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`移除 ${m.model}`}
                          onClick={() =>
                            patchModels(
                              selected.models.filter(
                                (row) => row.catalogId !== m.catalogId,
                              ),
                            )
                          }
                        >
                          <IconTrash />
                        </button>
                        {result ? (
                          <p
                            className={
                              result.ok
                                ? 'deploy-model-result is-ok'
                                : 'deploy-model-result is-err'
                            }
                          >
                            {result.message}
                            {result.latencyMs > 0
                              ? ` · ${result.latencyMs}ms`
                              : ''}
                          </p>
                        ) : null}
                      </div>
                      )
                    })
                  )}
                </div>

                <div className="deploy-manual">
                  <input
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value)}
                    placeholder="手动添加模型 ID"
                    spellCheck={false}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addManual()
                    }}
                  />
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={addManual}
                  >
                    <IconPlus />
                    添加模型
                  </button>
                </div>

                <div className="settings-actions">
                  <p className="deploy-hint">
                    保存会写入 ~/.grok/config.toml 并重载本机 Grok agent，进行中的生成会中断。
                  </p>
                  <button
                    type="button"
                    className="btn-solid"
                    onClick={() => void onSave()}
                    disabled={saving}
                  >
                    {saving ? '正在保存…' : '保存'}
                  </button>
                </div>
              </>
            ) : (
              <div className="deploy-blank">
                <p>添加一个自定义供应商，开始填写请求地址和密钥。</p>
                <button
                  type="button"
                  className="btn-solid"
                  onClick={addProvider}
                >
                  添加供应商
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
