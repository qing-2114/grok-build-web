import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { IconClose, IconFolder } from '../icons'
import { pickNativeFolder } from '../lib/fs'
import { folderNameFromPath, isAbsoluteFolderPath, pickLocalFolder } from '../lib/folder'
import { isWindowsPlatform } from '../lib/platform'
import { useWorkspace } from '../workspace'

export function NewProjectDialog() {
  const { projectDialogOpen, setProjectDialog } = useWorkspace(
    'projectDialogOpen',
    'setProjectDialog',
  )
  if (!projectDialogOpen) return null
  return <ProjectForm onClose={() => setProjectDialog(false)} />
}

function ProjectForm({ onClose }: { onClose: () => void }) {
  const {
    addProject,
    updateProject,
    editingProjectId,
    projects,
    notify,
  } = useWorkspace(
    'addProject',
    'updateProject',
    'editingProjectId',
    'projects',
    'notify',
  )
  const editing = projects.find((p) => p.id === editingProjectId) ?? null
  const [name, setName] = useState(editing?.name ?? '')
  const [path, setPath] = useState(editing?.path ?? '')
  const [pathError, setPathError] = useState('')
  const [picking, setPicking] = useState(false)
  const nameId = useId()
  const pathId = useId()
  const firstRef = useRef<HTMLInputElement>(null)
  // onClose 是父组件每次渲染新建的箭头函数，放进 ref，让下面的 effect 只跑一次，
  // 否则流式输出期间会不断重设 40ms 定时器，把焦点从用户正在输入的框里抢走。
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const t = window.setTimeout(() => firstRef.current?.focus(), 40)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  async function browse() {
    setPicking(true)
    setPathError('')
    try {
      if (isWindowsPlatform()) {
        const native = await pickNativeFolder(isAbsoluteFolderPath(path) ? path : '')
        if (!native) return
        setPath(native)
        setName((prev) => prev || folderNameFromPath(native))
        return
      }
      const picked = await pickLocalFolder()
      if (picked === 'aborted') return
      if (picked === 'unsupported') {
        notify('当前浏览器不支持文件夹选择，请手动填写路径')
        return
      }
      if (!isAbsoluteFolderPath(path)) {
        setPath('')
        setPathError(
          `已选中「${picked.name}」。浏览器拿不到完整路径，请填写以 / 开头的路径。`,
        )
      }
      setName((prev) => prev || picked.name)
    } catch (err) {
      notify(err instanceof Error ? err.message : '无法打开文件夹选择器', 'error')
    } finally {
      setPicking(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const nextPath = path.trim()
    const nextName = name.trim() || (nextPath ? folderNameFromPath(nextPath) : '')
    if (!nextName) {
      firstRef.current?.focus()
      return
    }
    if (!nextPath || !isAbsoluteFolderPath(nextPath)) {
      const leaf = nextPath || nextName
      setPathError(
        isWindowsPlatform()
          ? `请填写完整路径。只写「${leaf}」会被接到工作台目录下，文件夹实际并不在那里。例如 F:\\${leaf}`
          : `请填写以 / 开头的完整路径。只写「${leaf}」会被接到工作台目录下。`,
      )
      document.getElementById(pathId)?.focus()
      return
    }
    if (editing) {
      updateProject({
        id: editing.id,
        name: nextName,
        path: nextPath,
      })
      return
    }
    addProject({
      name: nextName,
      path: nextPath,
    })
  }

  return (
    <div className="dialog-root" role="presentation">
      <button
        type="button"
        className="scrim"
        aria-label="关闭"
        onClick={onClose}
      />
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        onSubmit={onSubmit}
      >
        <header className="dialog-head">
          <h2 id="new-project-title">{editing ? '编辑项目' : '新建项目'}</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </header>
        <p className="dialog-lead">
          {editing
            ? '可以改名称或工作文件夹。点浏览会打开系统文件夹窗口，并填入完整路径。'
            : '选择本机文件夹作为工作区。点浏览会打开系统文件夹窗口，并填入完整路径。'}
        </p>
        <label className="field" htmlFor={nameId}>
          <span>项目名称</span>
          <input
            id={nameId}
            ref={firstRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如 my-project"
            autoComplete="off"
          />
        </label>
        <label className="field" htmlFor={pathId}>
          <span>文件夹路径</span>
          <div className="field-row">
            <input
              id={pathId}
              value={path}
              onChange={(e) => {
                const v = e.target.value
                setPath(v)
                setPathError('')
                if (!name) setName(folderNameFromPath(v))
              }}
              aria-invalid={pathError ? true : undefined}
              aria-describedby={pathError ? `${pathId}-error` : undefined}
              placeholder={
                isWindowsPlatform()
                  ? '例如 F:\\your-project'
                  : '例如 /Users/you/your-project'
              }
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className="btn-ghost" onClick={browse} disabled={picking}>
              <IconFolder />
              {picking ? '选择中' : '浏览'}
            </button>
          </div>
          {pathError ? (
            <span id={`${pathId}-error`} className="field-error" role="alert">
              {pathError}
            </span>
          ) : null}
        </label>
        <footer className="dialog-foot">
          <button type="button" className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn-solid">
            {editing ? '保存' : '创建项目'}
          </button>
        </footer>
      </form>
    </div>
  )
}
