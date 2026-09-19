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
  const { notify, openExternalUrl } = useWorkspace()
  const [info, setInfo] = useState<AppVersionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
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
      const next = await fetchAppVersion()
      if (!aliveRef.current) return
      setInfo(next)
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
      notify(
        `已更新到 ${result.localVersion || result.remoteVersion}。请关掉名为 Grok Build 的命令行窗口，再开桌面快捷方式。`,
        'success',
      )
      await check()
    } catch (err) {
      notify(err instanceof Error ? err.message : '更新失败', 'error')
    } finally {
      if (aliveRef.current) setUpdating(false)
    }
  }

  const status = info ? versionStatus(info) : null

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
          对比本机工作台与 GitHub 公开仓库 main 上的版本。不更新 Grok CLI。
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
          <button
            type="button"
            className="btn-solid"
            onClick={() => void onUpdate()}
            disabled={!info?.canUpdate || loading || updating}
          >
            {updating ? '正在更新…' : '更新到最新'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
