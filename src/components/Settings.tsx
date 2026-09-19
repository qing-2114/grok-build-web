import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconChevron, IconCpu, IconSliders, IconUser } from '../icons'
import { fetchShells, type ShellInfo } from '../lib/fs'
import { initials, readAvatarFile } from '../lib/profile'
import { useWorkspace } from '../workspace'
import { ModelDeploy } from './ModelDeploy'
import { Popover } from './Popover'

type SettingsPage = 'general' | 'deploy' | 'profile'

export function Settings() {
  const {
    profile,
    setProfile,
    setSettingsOpen,
    notify,
    terminalShellId,
    setTerminalShell,
  } = useWorkspace()
  const [page, setPage] = useState<SettingsPage>('general')
  const [name, setName] = useState(profile.name)
  const [avatar, setAvatar] = useState(profile.avatar)
  const [shells, setShells] = useState<ShellInfo[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  // 模型部署页把「有未保存的修改」写在这里，离开这一页前确认一次。
  const deployDirtyRef = useRef(false)
  // 上下文里的 setter / 值每次 provider 渲染都会换新引用（每个流式 token 都会换），
  // 所以只读一次 /api/shells：把最新的 setter 和当前值放进 ref，挂载时拉一次即可。
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
            </section>
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
