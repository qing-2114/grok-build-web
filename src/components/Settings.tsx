import { useRef, useState } from 'react'
import { IconGear } from '../icons'
import { initials, readAvatarFile } from '../lib/profile'
import { useWorkspace } from '../workspace'

export function Settings() {
  const { profile, setProfile, setSettingsOpen, notify } = useWorkspace()
  const [name, setName] = useState(profile.name)
  const [avatar, setAvatar] = useState(profile.avatar)
  const fileRef = useRef<HTMLInputElement>(null)

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

  return (
    <main className="settings">
      <header className="settings-head">
        <button
          type="button"
          className="text-btn"
          onClick={() => setSettingsOpen(false)}
        >
          ← 返回
        </button>
        <h1>设置</h1>
      </header>

      <div className="settings-body">
        <nav className="settings-nav" aria-label="设置">
          <button type="button" className="settings-nav-item is-active">
            <IconGear />
            个人资料
          </button>
        </nav>

        <div className="settings-main">
          <section className="settings-card">
            <h2>个人资料</h2>
            <p className="settings-lead">头像和名字会显示在侧栏左下角，并保存在本机。</p>

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
        </div>
      </div>
    </main>
  )
}
