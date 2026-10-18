import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from '../icons'
import {
  fetchAppVersion,
  formatCommitDate,
  shortSha,
  updateApp,
  versionStatus,
  type AppCommit,
  type AppVersionInfo,
} from '../lib/app-version'
import {
  fetchGrokCli,
  updateGrokCli,
  type GrokCliInfo,
} from '../lib/grok-cli'
import { useWorkspace } from '../workspace'

function commitMeta(commit: AppCommit | null): string {
  if (!commit) return '—'
  const parts = [shortSha(commit.sha)]
  const day = formatCommitDate(commit.date)
  if (day) parts.push(day)
  if (commit.subject) parts.push(commit.subject)
  return parts.join(' · ')
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const { notify, openExternalUrl } = useWorkspace('notify', 'openExternalUrl')
  const [info, setInfo] = useState<AppVersionInfo | null>(null)
  const [cli, setCli] = useState<GrokCliInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [updatingCli, setUpdatingCli] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 关闭对话框时请求可能还在路上，之后不要再 setState。
  const aliveRef = useRef(true)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  async function check() {
    setLoading(true)
    setError(null)
    try {
      const [next, grok] = await Promise.all([
        fetchAppVersion(),
        fetchGrokCli().catch(() => null),
      ])
      if (!aliveRef.current) return
      setInfo(next)
      setCli(grok)
    } catch (err) {
      if (!aliveRef.current) return
      setError(err instanceof Error ? err.message : '检查失败')
      setInfo(null)
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    void check()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function onUpdate() {
    if (!info?.canUpdate || updating) return
    setUpdating(true)
    try {
      const result = await updateApp()
      if (result.relaunching) {
        notify('安装包已开始安装，窗口即将关闭。装完后从开始菜单重新打开。', 'success')
        return
      }
      notify(
        `已更新到 ${result.localVersion || result.remoteVersion}。请先跑 scripts\\stop-grok-build.cmd 停掉后台服务，再开桌面快捷方式。`,
        'success',
      )
      await check()
    } catch (err) {
      notify(err instanceof Error ? err.message : '更新失败', 'error')
    } finally {
      if (aliveRef.current) setUpdating(false)
    }
  }

  async function onUpdateCli() {
    if (!cli?.updateAvailable || updatingCli) return
    setUpdatingCli(true)
    try {
      const result = await updateGrokCli()
      notify(`Grok Build CLI 已更新到 ${result.version}`, 'success')
      await check()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'CLI 更新失败', 'error')
    } finally {
      if (aliveRef.current) setUpdatingCli(false)
    }
  }

  const status = info ? versionStatus(info) : null
  const packaged = info?.updateMode === 'installer'

  return createPortal(
    <div className="dialog-root about-root" role="presentation">
      <button
        type="button"
        className="scrim"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        className="dialog about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
      >
        <header className="dialog-head">
          <h2 id="about-title">关于版本</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </header>
        <p className="dialog-lead">
          {packaged
            ? '对比本机安装版与 GitHub Release 上的安装包。'
            : '对比本机工作台与 GitHub 公开仓库 main。开发仓用 git 快进，不下载安装包。'}
        </p>
        {loading && !info ? (
          <p className="about-status">正在检查…</p>
        ) : error ? (
          <p className="about-status is-error">{error}</p>
        ) : info ? (
          <>
            <dl className="about-versions">
              <div className="about-row">
                <dt>本地</dt>
                <dd className="about-ver">{info.localVersion || '未知'}</dd>
                <dd className="about-meta">{commitMeta(info.local)}</dd>
              </div>
              <div className="about-row">
                <dt>GitHub</dt>
                <dd className="about-ver">{info.remoteVersion || '未知'}</dd>
                <dd className="about-meta">{commitMeta(info.remote)}</dd>
              </div>
              <div className="about-row">
                <dt>Grok Build CLI</dt>
                <dd className="about-ver">
                  {cli?.installed ? cli.version || '未知' : '未安装'}
                </dd>
                <dd className="about-meta">
                  {cli?.updateAvailable
                    ? `有新版本 ${cli.latestVersion}`
                    : cli?.installed
                      ? cli.latestVersion
                        ? `最新 ${cli.latestVersion}`
                        : '已安装'
                      : '连接对话前需要先安装'}
                </dd>
              </div>
            </dl>
            {status ? (
              <p className={`about-status is-${status.kind}`}>{status.text}</p>
            ) : null}
            <p className="about-repo">
              <button
                type="button"
                className="about-link"
                onClick={() => openExternalUrl(info.repoUrl)}
              >
                {info.repoUrl.replace(/^https:\/\//, '')}
              </button>
              <span> · {info.trackBranch}</span>
            </p>
          </>
        ) : null}
        <footer className="dialog-foot about-foot">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void check()}
            disabled={loading || updating}
          >
            检查更新
          </button>
          {cli?.updateAvailable ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void onUpdateCli()}
              disabled={loading || updating || updatingCli}
            >
              {updatingCli ? '正在更新 CLI…' : '更新 CLI'}
            </button>
          ) : null}
          <button
            type="button"
            className="btn-solid"
            onClick={() => void onUpdate()}
            disabled={!info?.canUpdate || loading || updating || updatingCli}
          >
            {updating
              ? packaged
                ? '正在下载…'
                : '正在更新…'
              : '更新到最新'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
