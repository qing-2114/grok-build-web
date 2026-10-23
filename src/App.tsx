import { lazy, Suspense, useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChatPane } from './components/ChatPane'
import { RightRail } from './components/RightRail'
import { Sidebar } from './components/Sidebar'
import { IconCheck, IconClose, IconInfo } from './icons'
import { useWorkspace } from './workspace'

// 弹窗组件懒加载：首屏只加载核心 UI，弹窗按需加载
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })))
const NewProjectDialog = lazy(() => import('./components/NewProjectDialog').then(m => ({ default: m.NewProjectDialog })))
const PermissionDialog = lazy(() => import('./components/PermissionDialog').then(m => ({ default: m.PermissionDialog })))
const CommandPalette = lazy(() => import('./components/CommandPalette').then(m => ({ default: m.CommandPalette })))

function Shortcuts() {
  const { settingsOpen, openRightPanel, paletteOpen, setPaletteOpen } = useWorkspace(
    'settingsOpen',
    'openRightPanel',
    'paletteOpen',
    'setPaletteOpen',
  )
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // 焦点在集成终端里时，Ctrl+K / Ctrl+P 等都是 shell 自己的按键，不抢。
      if (e.target instanceof Element && e.target.closest('.xterm')) return
      const key = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === 'k') {
        e.preventDefault()
        setPaletteOpen(!paletteOpen)
        return
      }
      if (settingsOpen || paletteOpen) return
      if (e.ctrlKey && e.shiftKey && !e.altKey && key === 'g') {
        e.preventDefault()
        openRightPanel('review')
        return
      }
      if (
        e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key === '`' || e.code === 'Backquote')
      ) {
        e.preventDefault()
        openRightPanel('terminal')
        return
      }
      if (e.ctrlKey && !e.shiftKey && !e.altKey && key === 'p') {
        e.preventDefault()
        openRightPanel('files')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen, openRightPanel, paletteOpen, setPaletteOpen])
  return null
}

function Toast() {
  const { toast } = useWorkspace('toast')
  if (!toast) return null
  return createPortal(
    <div
      className={['toast', `is-${toast.kind}`].join(' ')}
      role="status"
    >
      <span className={['toast-mark', `is-${toast.kind}`].join(' ')}>
        {toast.kind === 'error' ? (
          <IconClose />
        ) : toast.kind === 'info' ? (
          <IconInfo />
        ) : (
          <IconCheck />
        )}
      </span>
      <span className="toast-text">{toast.text}</span>
    </div>,
    document.body,
  )
}

function MobileScrim() {
  const { mobileNavOpen, setMobileNav } = useWorkspace(
    'mobileNavOpen',
    'setMobileNav',
  )
  if (!mobileNavOpen) return null
  return (
    <button
      type="button"
      className="scrim mobile-scrim"
      aria-label="关闭侧栏"
      onClick={() => setMobileNav(false)}
    />
  )
}

export default function App() {
  const { settingsOpen, settingsPage, toast, sidebarWidth, rightRailWidth, theme } = useWorkspace(
    'settingsOpen',
    'settingsPage',
    'toast',
    'sidebarWidth',
    'rightRailWidth',
    'theme',
  )
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return (
    <div
      className={`app theme-${theme}`}
      data-theme={theme}
      style={
        {
          '--sidebar-w': `${sidebarWidth}px`,
          '--right-w': `${rightRailWidth}px`,
        } as CSSProperties
      }
    >
      <Shortcuts />
      <Sidebar />
      <ChatPane />
      <RightRail />
      <Suspense fallback={null}>
        {settingsOpen ? <Settings key={settingsPage} /> : null}
        <NewProjectDialog />
        <PermissionDialog />
        <CommandPalette />
      </Suspense>
      <MobileScrim />
      {toast ? <Toast key={toast.id} /> : null}
    </div>
  )
}
