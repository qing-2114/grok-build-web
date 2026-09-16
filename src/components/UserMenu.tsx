import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconGear } from '../icons'
import { initials } from '../lib/profile'
import { useWorkspace } from '../workspace'

export function UserMenu() {
  const { profile, setSettingsOpen } = useWorkspace()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ bottom: 16, left: 16 })

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      setPos({
        bottom: Math.max(12, window.innerHeight - r.top + 8),
        left: Math.min(Math.max(12, r.left), window.innerWidth - 200),
      })
    }
    setOpen(true)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="user-chip"
        onClick={toggle}
        aria-expanded={open}
        title={profile.name}
      >
        <span className="avatar">
          {profile.avatar ? (
            <img src={profile.avatar} alt="" />
          ) : (
            initials(profile.name)
          )}
        </span>
        <span className="user-meta">
          <span className="user-name">{profile.name}</span>
          <span className="user-sub">Grok Build</span>
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="user-menu"
              role="menu"
              style={{ bottom: pos.bottom, left: pos.left }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  setSettingsOpen(true)
                }}
              >
                <IconGear />
                设置
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
