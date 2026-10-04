import { useEffect, useRef, useState } from 'react'
import {
  IconBox,
  IconChart,
  IconCheck,
  IconChevron,
  IconCpu,
  IconSliders,
  IconUser,
} from '../icons'
import { notificationPermission } from '../lib/notify'
import { fetchShells, type ShellInfo } from '../lib/fs'
import { initials, readAvatarFile } from '../lib/profile'
import { useWorkspace } from '../workspace'
import type { SettingsPage } from '../workspace-state'
import { ModelDeploy } from './ModelDeploy'
import { Popover } from './Popover'
import { McpSettings } from './McpSettings'
import { UsagePanel } from './UsagePanel'

export function Settings() {
  const {
    profile,
    setProfile,
    setSettingsOpen,
    notify,
    terminalShellId,
    setTerminalShell,
    settingsPage,
    notifyDone,
    setNotifyDone,
  } = useWorkspace(
    'profile',
    'setProfile',
    'setSettingsOpen',
    'notify',
    'terminalShellId',
    'setTerminalShell',
    'settingsPage',
    'notifyDone',
    'setNotifyDone',
  )
  // App 用 settingsPage 做 key：命令面板在设置已打开时跳页会重新挂载，这里只取初值。
  const [page, setPage] = useState<SettingsPage>(settingsPage)
  const permission = notificationPermission()
  const [name, setName] = useState(profile.name)
  const [avatar, setAvatar] = useState(profile.avatar)
  const [shells, setShells] = useState<ShellInfo[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  // 模型部署页把「有未保存的修改」写在这里，离开这一页前确认一次。
  const deployDirtyRef = useRef(false)
  // /api/shells 在服务端会阻塞，只在挂载时拉一次：用户切换 Shell 会改
  // terminalShellId，但不应因此重拉，所以把当前值和 setter 放进 ref。
  const setTerminalShellRef = useRef(setTerminalShell)
  const terminalShellRef = useRef(terminalShellId)
  useEffect(() => {
    setTerminalShellRef.current = setTerminalShell
    terminalShellRef.current = terminalShellId
  })

  useEffect(() => {
    let cancelled = false
    void fetchShells()
      .then((list) => {
        if (cancelled) return
        setShells(list)
        const current = terminalShellRef.current
        if (list.length && !list.some((s) => s.id === current)) {
          setTerminalShellRef.current(list[0].id)
        }
      })
      .catch(() => {
        if (!cancelled) setShells([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onAvatar(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      notify('请选择图片文件')
      return
    }
    try {
      const data = await readAvatarFile(file)
      setAvatar(data)
    } catch {
      notify('头像读取失败')
    }
  }

  function save() {
    const next = name.trim() || 'local'
    setProfile({ name: next, avatar })
    notify('个人资料已保存', 'success')
  }

  /** 离开模型部署页会丢掉没保存的改动，先问一声。 */
  function leaveDeploy(): boolean {
    if (page !== 'deploy' || !deployDirtyRef.current) return true
    return window.confirm('模型部署有未保存的修改，确定要放弃吗？')
  }

  function goPage(next: SettingsPage) {
    if (next === page) return
    if (!leaveDeploy()) return
    setPage(next)
  }

  const currentShell =
    shells.find((s) => s.id === terminalShellId) ?? shells[0] ?? null

  return (
    <main className="settings">
      <header className="settings-head">
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            if (!leaveDeploy()) return
            setSettingsOpen(false)
          }}
        >
          ← 返回
        </button>
        <h1>设置</h1>
      </header>

      <div className="settings-body">
        <nav className="settings-nav" aria-label="设置">
          <button
            type="button"
            className={
              page === 'general'
                ? 'settings-nav-item is-active'
                : 'settings-nav-item'
            }
            onClick={() => goPage('general')}
          >
            <IconSliders />
            通用
          </button>
          <button
            type="button"
            className={
              page === 'deploy'
                ? 'settings-nav-item is-active'
                : 'settings-nav-item'
            }
            onClick={() => goPage('deploy')}
          >
            <IconCpu />
            模型部署
          </button>
          <button
            type="button"
            className={
              page === 'mcp'
                ? 'settings-nav-item is-active'
                : 'settings-nav-item'
            }
            onClick={() => goPage('mcp')}
          >
            <IconBox />
            MCP 服务器
          </button>
          <button
            type="button"
            className={
              page === 'usage'
                ? 'settings-nav-item is-active'
                : 'settings-nav-item'
            }
            onClick={() => goPage('usage')}
          >
            <IconChart />
            用量统计
          </button>
          <button
            type="button"
            className={
              page === 'profile'
                ? 'settings-nav-item is-active'
                : 'settings-nav-item'
            }
            onClick={() => goPage('profile')}
          >
            <IconUser />
            个人资料
          </button>
        </nav>

        <div className={page === 'deploy' ? 'settings-main is-deploy' : 'settings-main'}>
          {page === 'general' ? (
            <section className="settings-card">
              <h2>通用</h2>
              <p className="settings-lead">
                本机工作台选项。终端会在当前会话的工作目录打开。
              </p>

              <div className="settings-row">
                <div className="settings-row-copy">
                  <h3>集成终端 Shell</h3>
                  <p>选择要在集成终端中打开的 Shell。只列出这台电脑上检测到的环境。</p>
                </div>
                <Popover
                  portal
                  align="down-right"
                  menuClassName="shell-menu"
                  trigger={({ open, toggle }) => (
                    <button
                      type="button"
                      className={open ? 'shell-select is-open' : 'shell-select'}
                      onClick={toggle}
                      disabled={shells.length === 0}
                    >
                      <span>{currentShell?.label ?? '未检测到终端'}</span>
                      <IconChevron />
                    </button>
                  )}
                >
                  {({ close }) => (
                    <>
                      {shells.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={
                            s.id === (currentShell?.id ?? '')
                              ? 'is-active'
                              : ''
                          }
                          onClick={() => {
                            setTerminalShell(s.id)
                            close()
                          }}
                        >
                          <span>{s.label}</span>
                          {s.id === (currentShell?.id ?? '') ? (
                            <IconCheck />
                          ) : null}
                        </button>
                      ))}
                    </>
                  )}
                </Popover>
              </div>

              <div className="settings-row">
                <div className="settings-row-copy">
                  <h3>完成提醒</h3>
                  <p>
                    页面不在前台、或者在看别的会话时，回复完成或等待批准会发系统通知，标签页标题也会显示待处理数。
                    {notifyDone && permission === 'denied'
                      ? ' 浏览器已拒绝通知，请在地址栏左侧的网站设置里允许。'
                      : ''}
                    {notifyDone && permission === 'unsupported' ? ' 这个浏览器不支持系统通知。' : ''}
                  </p>
                </div>
                <div className="deploy-toggle" role="group" aria-label="完成提醒">
                  <button
                    type="button"
                    className={notifyDone ? 'deploy-flag is-on' : 'deploy-flag'}
                    aria-pressed={notifyDone}
                    onClick={() => setNotifyDone(true)}
                  >
                    开
                  </button>
                  <button
                    type="button"
                    className={!notifyDone ? 'deploy-flag is-off' : 'deploy-flag'}
                    aria-pressed={!notifyDone}
                    onClick={() => setNotifyDone(false)}
                  >
                    关
                  </button>
                </div>
              </div>
            </section>
          ) : page === 'usage' ? (
            <UsagePanel />
          ) : page === 'mcp' ? (
            <McpSettings />
          ) : page === 'deploy' ? (
            <ModelDeploy dirtyRef={deployDirtyRef} />
          ) : (
            <section className="settings-card">
              <h2>个人资料</h2>
              <p className="settings-lead">
                头像和名字会显示在侧栏左下角，并保存在本机。
              </p>

              <div className="profile-editor">
                <button
                  type="button"
                  className="avatar-edit"
                  onClick={() => fileRef.current?.click()}
                >
                  {avatar ? (
                    <img src={avatar} alt="" />
                  ) : (
                    <span>{initials(name || profile.name)}</span>
                  )}
                  <em>更换头像</em>
                </button>
                <input
                  ref={fileRef}
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    void onAvatar(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />

                <label className="field" htmlFor="profile-name">
                  <span>名字</span>
                  <input
                    id="profile-name"
                    value={name}
                    maxLength={24}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="你的名字"
                    autoComplete="nickname"
                  />
                </label>
              </div>

              <div className="settings-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setName(profile.name)
                    setAvatar(profile.avatar)
                  }}
                >
                  取消
                </button>
                <button type="button" className="btn-solid" onClick={save}>
                  保存
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
