import { useEffect, useState } from 'react'
import { fetchGrokCli, installGrokCli, updateGrokCli, type GrokCliInfo } from '../lib/grok-cli'
import { useWorkspace } from '../workspace'

export function GrokCliBanner() {
  const { connection, notify, refreshAgent } = useWorkspace(
    'connection',
    'notify',
    'refreshAgent',
  )
  const [cli, setCli] = useState<GrokCliInfo | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void fetchGrokCli()
      .then((info) => {
        if (alive) setCli(info)
      })
      .catch(() => {
        if (alive) setCli(null)
      })
    return () => {
      alive = false
    }
  }, [connection])

  if (!cli) return null
  const missing = connection !== 'connected' && !cli.installed
  const outdated = cli.installed && cli.updateAvailable
  if (!missing && !outdated) return null

  async function run(action: 'install' | 'update') {
    setBusy(true)
    try {
      const result =
        action === 'install' ? await installGrokCli() : await updateGrokCli()
      notify(
        action === 'install'
          ? `已安装 Grok Build ${result.version}`
          : `Grok Build CLI 已更新到 ${result.version}`,
        'success',
      )
      await refreshAgent()
      const next = await fetchGrokCli()
      setCli(next)
    } catch (err) {
      notify(err instanceof Error ? err.message : '操作失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`cli-banner ${missing ? 'is-missing' : 'is-update'}`} role="status">
      <p>
        {missing
          ? '还没有安装 Grok Build。装好之后才能开始对话。'
          : `Grok Build CLI 有新版本 ${cli.latestVersion}（当前 ${cli.version}）。`}
      </p>
      <button
        type="button"
        className="btn-solid"
        disabled={busy}
        onClick={() => void run(missing ? 'install' : 'update')}
      >
        {busy ? '请稍候…' : missing ? '一键安装' : '更新 CLI'}
      </button>
    </div>
  )
}
