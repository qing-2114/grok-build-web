import {
  IconClose,
  IconDiff,
  IconFileTree,
  IconPlus,
  IconTerminal,
} from '../icons'
import { RIGHT_RAIL_WIDTH_DEFAULT } from '../lib/layout'
import { fileName } from '../lib/paths'
import { modKeyLabel } from '../lib/platform'
import type { RightTab } from '../types'
import { useWorkspace } from '../workspace'
import { FileExplorer } from './FileExplorer'
import { ResizeHandle } from './ResizeHandle'
import { ReviewPane } from './ReviewPane'
import { TerminalPane } from './TerminalPane'

function shortcuts() {
  const mod = modKeyLabel()
  return [
    { id: 'review' as const, label: '审查', keys: `${mod}+Shift+G`, icon: IconDiff },
    { id: 'terminal' as const, label: '终端', keys: `${mod}+\``, icon: IconTerminal },
    { id: 'files' as const, label: '文件', keys: `${mod}+P`, icon: IconFileTree },
  ]
}

function tabLabel(tab: RightTab): string {
  if (tab.kind === 'review') return '审查'
  if (tab.kind === 'terminal') return '终端'
  if (tab.path) return fileName(tab.path)
  return '打开文件'
}

export function RightRail() {
  const {
    rightRailOpen,
    rightTabs,
    activeRightTabId,
    rightRailWidth,
    setRightPanel,
    setRightRailWidth,
    selectRightTab,
    closeRightTab,
    addRightTab,
    closeRightRail,
  } = useWorkspace()

  if (!rightRailOpen) return null

  const active =
    rightTabs.find((t) => t.id === activeRightTabId) ?? null
  const isFiles = active?.kind === 'file'

  return (
    <aside className={isFiles ? 'right-rail is-files' : 'right-rail'}>
      {rightTabs.length ? (
        <header className="right-rail-head">
          <div className="right-rail-tabs" role="tablist">
            {rightTabs.map((tab) => (
              <div
                key={tab.id}
                className={
                  tab.id === activeRightTabId
                    ? 'editor-tab is-active'
                    : 'editor-tab'
                }
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab.id === activeRightTabId}
                  className="editor-tab-label"
                  onClick={() => selectRightTab(tab.id)}
                >
                  {tabLabel(tab)}
                </button>
                <button
                  type="button"
                  className="tab-x"
                  aria-label={`关闭 ${tabLabel(tab)}`}
                  onClick={() => closeRightTab(tab.id)}
                >
                  <IconClose />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="icon-btn editor-tab-add"
              aria-label="新建标签"
              onClick={addRightTab}
            >
              <IconPlus />
            </button>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭右侧栏"
            onClick={closeRightRail}
          >
            <IconClose />
          </button>
        </header>
      ) : (
        <header className="right-rail-head is-idle">
          <span />
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭右侧栏"
            onClick={closeRightRail}
          >
            <IconClose />
          </button>
        </header>
      )}

      <ResizeHandle
        label="调整右侧栏宽度"
        invert
        value={rightRailWidth}
        fallback={RIGHT_RAIL_WIDTH_DEFAULT}
        onChange={setRightRailWidth}
      />
      <div className="right-rail-body">
        {!active ? (
          <div className="right-empty">
            <ul>
              {shortcuts().map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="right-empty-row"
                    onClick={() => setRightPanel(s.id)}
                  >
                    <span className="right-empty-left">
                      <s.icon />
                      {s.label}
                    </span>
                    <kbd>{s.keys}</kbd>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : active.kind === 'review' ? (
          <ReviewPane />
        ) : active.kind === 'terminal' ? (
          <TerminalPane />
        ) : (
          <FileExplorer />
        )}
      </div>
    </aside>
  )
}
