import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { IconFolder, IconMonitor } from '../icons'
import { isWebUrl, looksLikeFilePath, looksLikeHtml } from '../lib/paths'

export function PathLink({
  href,
  children,
  className = 'file-link',
  onOpenFile,
  onOpenUrl,
  onReveal,
}: {
  href: string
  children: ReactNode
  className?: string
  onOpenFile?: (path: string) => void
  onOpenUrl?: (url: string) => void
  onReveal?: (path: string) => void
}) {
  const web = isWebUrl(href)
  const html = looksLikeHtml(href)
  const file = !web && looksLikeFilePath(href)
  const canBrowser = Boolean((web || html) && onOpenUrl)
  const canReveal = Boolean(file && onReveal)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault()
    if ((e.ctrlKey || e.metaKey) && canBrowser) {
      onOpenUrl?.(href)
      return
    }
    if (web) return
    onOpenFile?.(href)
  }

  function onContextMenu(e: MouseEvent<HTMLAnchorElement>) {
    if (!canBrowser && !canReveal) return
    e.preventDefault()
    e.stopPropagation()
    setPos(null)
    setMenu({ x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onDown = (ev: globalThis.MouseEvent) => {
      if (menuRef.current?.contains(ev.target as Node)) return
      close()
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') close()
    }
    const timer = window.setTimeout(() => {
      window.addEventListener('mousedown', onDown)
      window.addEventListener('keydown', onKey)
      window.addEventListener('scroll', close, true)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu])

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return
    const el = menuRef.current
    const mw = el.offsetWidth
    const mh = el.offsetHeight
    const pad = 8
    let left = menu.x
    let top = menu.y
    if (left + mw > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - pad - mw)
    }
    if (top + mh > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - pad - mh)
    }
    setPos({ x: left, y: top })
  }, [menu])

  const hint = canBrowser
    ? 'Ctrl+单击在默认浏览器打开 · 右键更多'
    : '单击在右侧栏预览 · 右键更多'

  return (
    <>
      <a
        className={className}
        href={web ? href : '#'}
        onClick={onClick}
        onContextMenu={onContextMenu}
        title={hint}
      >
        {children}
      </a>
      {menu
        ? createPortal(
            <div
              ref={menuRef}
              className="menu is-portal session-menu path-link-menu"
              role="menu"
              style={{
                top: pos?.y ?? menu.y,
                left: pos?.x ?? menu.x,
                visibility: pos ? 'visible' : 'hidden',
              }}
            >
              {canBrowser ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(null)
                    onOpenUrl?.(href)
                  }}
                >
                  <IconMonitor />
                  <span>在浏览器打开</span>
                </button>
              ) : null}
              {canReveal ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(null)
                    onReveal?.(href)
                  }}
                >
                  <IconFolder />
                  <span>在资源管理器中打开</span>
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
