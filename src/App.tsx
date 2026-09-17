import { useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChatPane } from './components/ChatPane'
import { NewProjectDialog } from './components/NewProjectDialog'
import { PermissionDialog } from './components/PermissionDialog'
import { RightRail } from './components/RightRail'
import { Settings } from './components/Settings'
import { Sidebar } from './components/Sidebar'
import { IconCheck } from './icons'
import { useWorkspace } from './workspace'

function Shortcuts() {
  const { settingsOpen, openRightPanel } = useWorkspace()
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (settingsOpen) return
      const key = e.key.toLowerCase()
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
  }, [settingsOpen, openRightPanel])
  return null
}

function Toast() {
  const { toast } = useWorkspace()
  if (!toast) return null
  return createPortal(
    <div
      className={['toast', toast.kind === 'success' ? 'is-success' : '', toast.kind === 'error' ? 'is-error' : ''].filter(Boolean).join(' ')}
      role="status"
    >
      {toast.kind === 'success' ? (
        <span className="toast-mark">
          <IconCheck />
        </span>
      ) : null}
      <span>{toast.text}</span>
    </div>,
    document.body,
  )
}

function MobileScrim() {
  const { mobileNavOpen, setMobileNav } = useWorkspace()
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
  const { settingsOpen, toast, sidebarWidth, rightRailWidth } = useWorkspace()
  return (
    <div
      className="app"
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
      {settingsOpen ? <Settings /> : null}
      <NewProjectDialog />
      <PermissionDialog />
      <MobileScrim />
      {toast ? <Toast key={toast.id} /> : null}
    </div>
  )
}
