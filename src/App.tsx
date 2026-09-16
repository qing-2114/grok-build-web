import { createPortal } from 'react-dom'
import { ChatPane } from './components/ChatPane'
import { NewProjectDialog } from './components/NewProjectDialog'
import { PermissionDialog } from './components/PermissionDialog'
import { Settings } from './components/Settings'
import { Sidebar } from './components/Sidebar'
import { IconCheck } from './icons'
import { useWorkspace } from './workspace'

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
  const { settingsOpen, toast } = useWorkspace()
  return (
    <div className="app">
      <Sidebar />
      <ChatPane />
      {settingsOpen ? <Settings /> : null}
      <NewProjectDialog />
      <PermissionDialog />
      <MobileScrim />
      {toast ? <Toast key={toast.id} /> : null}
    </div>
  )
}
