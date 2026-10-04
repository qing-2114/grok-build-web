import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  IconChart,
  IconDiff,
  IconDownload,
  IconFile,
  IconFileTree,
  IconFolder,
  IconGear,
  IconNewChat,
  IconPrompt,
  IconRetry,
  IconSearch,
  IconShield,
  IconSidebar,
  IconSpark,
  IconTerminal,
} from '../icons'
import { findFiles } from '../lib/fs'
import { displayTitle } from '../lib/title'
import { PERMISSION_MODES } from '../types'
import { useWorkspace } from '../workspace'

type Item = {
  id: string
  group: string
  label: string
  hint?: string
  keywords?: string
  icon: ReactNode
  run: () => void
}

// 不区分大小写：开头命中 > 子串命中 > 子序列命中（`rev`、`设置`、`newchat` 都能找到）。
function score(text: string, q: string): number {
  if (!q) return 1
  const t = text.toLowerCase()
  const i = t.indexOf(q)
  if (i === 0) return 300
  if (i > 0) return 200 - Math.min(i, 100)
  let k = 0
  for (const ch of t) {
    if (ch === q[k]) k++
    if (k === q.length) return 50
  }
  return -1
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useWorkspace('paletteOpen', 'setPaletteOpen')
  if (!paletteOpen) return null
  return <Palette close={() => setPaletteOpen(false)} />
}

// 只在打开时挂载，订阅的字段（会话列表等）不会让关着的面板跟着流式输出重渲染。
function Palette({ close }: { close: () => void }) {
  const ws = useWorkspace(    'history',
    'projects',
    'composerProject',
    'sessionCwd',
    'models',
    'model',
    'permissionMode',
    'titleOverrides',
    'activeSession',
    'isThinking',
    'notifyDone',
    'newChat',
    'selectSession',
    'selectProject',
    'openRightPanel',
    'openLocalFile',
    'setSettingsOpen',
    'setMode',
    'setModel',
    'toggleSidebar',
    'exportSession',
    'retryLast',
    'setNotifyDone',
  )
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [files, setFiles] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const q = query.trim().toLowerCase()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 文件只在输入了内容后才查，避免一打开就扫整个目录。
  useEffect(() => {
    if (!q || !ws.sessionCwd) return
    const ac = new AbortController()
    const t = window.setTimeout(() => {
      void findFiles(ws.sessionCwd, q, 8, ac.signal)
        .then((r) => setFiles(r.files))
        .catch(() => undefined)
    }, 120)
    return () => {
      ac.abort()
      window.clearTimeout(t)
    }
  }, [q, ws.sessionCwd])

  const items = useMemo(() => {
    const run = (fn: () => void) => () => {
      close()
      fn()
    }
    const actions: Item[] = [
      { id: 'new', group: '操作', label: '新建对话', keywords: 'new chat', icon: <IconNewChat />, run: run(() => ws.newChat(null)) },
      ...(ws.composerProject
        ? [{
            id: 'new-in-project',
            group: '操作',
            label: `在 ${ws.composerProject.name} 中新建对话`,
            keywords: 'new project',
            icon: <IconNewChat />,
            run: run(() => ws.newChat(ws.composerProject!.id)),
          }]
        : []),
      { id: 'review', group: '操作', label: '打开审查', hint: 'Ctrl+Shift+G', keywords: 'review git diff', icon: <IconDiff />, run: run(() => ws.openRightPanel('review')) },
      { id: 'terminal', group: '操作', label: '打开终端', hint: 'Ctrl+`', keywords: 'terminal shell', icon: <IconTerminal />, run: run(() => ws.openRightPanel('terminal')) },
      { id: 'files', group: '操作', label: '打开文件', hint: 'Ctrl+P', keywords: 'files explorer', icon: <IconFileTree />, run: run(() => ws.openRightPanel('files')) },
      { id: 'sidebar', group: '操作', label: '收起 / 展开侧栏', keywords: 'sidebar toggle', icon: <IconSidebar />, run: run(ws.toggleSidebar) },
      ...(ws.activeSession?.messages.length
        ? [
            { id: 'export', group: '操作', label: '导出当前会话为 Markdown', keywords: 'export markdown download', icon: <IconDownload />, run: run(() => ws.exportSession()) },
            ...(!ws.isThinking
              ? [{ id: 'retry', group: '操作', label: '重试上一条消息', keywords: 'retry resend', icon: <IconRetry />, run: run(ws.retryLast) }]
              : []),
          ]
        : []),
      { id: 'settings', group: '操作', label: '打开设置', keywords: 'settings preferences', icon: <IconGear />, run: run(() => ws.setSettingsOpen(true)) },
      { id: 'mcp', group: '操作', label: 'MCP 服务器', keywords: 'mcp servers tools', icon: <IconGear />, run: run(() => ws.setSettingsOpen(true, 'mcp')) },
      { id: 'usage', group: '操作', label: '用量统计', keywords: 'usage tokens stats', icon: <IconChart />, run: run(() => ws.setSettingsOpen(true, 'usage')) },
      {
        id: 'notify',
        group: '操作',
        label: ws.notifyDone ? '关闭完成提醒' : '开启完成提醒',
        keywords: 'notification notify',
        icon: <IconPrompt />,
        run: run(() => ws.setNotifyDone(!ws.notifyDone)),
      },
      ...PERMISSION_MODES.map((m) => ({
        id: `mode-${m.id}`,
        group: '权限',
        label: `权限：${m.label}`,
        hint: m.id === ws.permissionMode ? '当前' : undefined,
        keywords: `mode permission ${m.id}`,
        icon: <IconShield />,
        run: run(() => ws.setMode(m.id)),
      })),
      ...ws.models.map((m) => ({
        id: `model-${m.id}`,
        group: '模型',
        label: `模型：${m.label}`,
        hint: m.id === ws.model ? '当前' : undefined,
        keywords: `model ${m.id}`,
        icon: <IconSpark />,
        run: run(() => ws.setModel(m.id)),
      })),
    ]
    const sessions: Item[] = ws.history.map((s) => ({
      id: `s-${s.id}`,
      group: '会话',
      label: displayTitle(s, ws.titleOverrides[s.id]),
      icon: <IconSearch />,
      run: run(() => ws.selectSession(s.id)),
    }))
    const projects: Item[] = ws.projects.map((p) => ({
      id: `p-${p.id}`,
      group: '项目',
      label: p.name,
      hint: p.path,
      keywords: p.path,
      icon: <IconFolder />,
      run: run(() => ws.newChat(p.id)),
    }))
    const fileItems: Item[] = (q ? files : []).map((rel) => ({
      id: `f-${rel}`,
      group: '文件',
      label: rel.split('/').pop() || rel,
      hint: rel,
      icon: <IconFile />,
      run: run(() => ws.openLocalFile(rel)),
    }))

    const pick = (list: Item[], max: number) =>
      list
        .map((it) => ({ it, s: Math.max(score(it.label, q), it.keywords ? score(it.keywords, q) - 20 : -1) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, max)
        .map((x) => x.it)

    if (!q) return [...actions.filter((a) => a.group === '操作'), ...sessions.slice(0, 6)]
    return [...pick(actions, 8), ...pick(sessions, 8), ...pick(projects, 4), ...fileItems]
  }, [ws, q, files, close])

  const active = Math.min(index, Math.max(0, items.length - 1))

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function onKey(e: KeyboardEvent) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (items.length) setIndex((active + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (items.length) setIndex((active - 1 + items.length) % items.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[active]?.run()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  let lastGroup = ''
  return createPortal(
    <div className="palette-root" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="命令面板" onKeyDown={onKey}>
        <label className="palette-input">
          <IconSearch />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            placeholder="搜索命令、会话、项目、文件"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `palette-${active}` : undefined}
          />
          <kbd>Esc</kbd>
        </label>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {items.map((it, i) => {
            const head = it.group !== lastGroup ? it.group : null
            lastGroup = it.group
            return (
              <div key={it.id}>
                {head ? <div className="palette-group">{head}</div> : null}
                <button
                  type="button"
                  id={`palette-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? 'palette-item is-active' : 'palette-item'}
                  onMouseMove={() => i !== active && setIndex(i)}
                  onClick={it.run}
                >
                  <span className="palette-icon">{it.icon}</span>
                  <span className="palette-label">{it.label}</span>
                  {it.hint ? <span className="palette-hint">{it.hint}</span> : null}
                </button>
              </div>
            )
          })}
          {items.length === 0 ? <div className="palette-empty">没有匹配的结果</div> : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
