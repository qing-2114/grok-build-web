import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { IconClose, IconFolder } from '../icons'
import { folderNameFromPath, pickLocalFolder } from '../lib/folder'
import { useWorkspace } from '../workspace'

export function NewProjectDialog() {
  const { projectDialogOpen, setProjectDialog } = useWorkspace()
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
  } = useWorkspace()
  const editing = projects.find((p) => p.id === editingProjectId) ?? null
  const [name, setName] = useState(editing?.name ?? '')
  const [path, setPath] = useState(editing?.path ?? '')
  const nameId = useId()
  const pathId = useId()
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = window.setTimeout(() => firstRef.current?.focus(), 40)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  async function browse() {
    try {
      const picked = await pickLocalFolder()
      if (picked === 'aborted') return
      if (picked === 'unsupported') {
        notify('当前浏览器不支持文件夹选择，请手动填写路径')
        return
      }
      setPath((prev) => prev || picked.pathHint)
      setName((prev) => prev || picked.name)
    } catch {
      notify('无法打开文件夹选择器')
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
    if (editing) {
      updateProject({
        id: editing.id,
        name: nextName,
        path: nextPath || editing.path,
      })
      return
    }
    addProject({
      name: nextName,
      path: nextPath || nextName,
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
            ? '可以改名称或工作文件夹。浏览器只能拿到文件夹名，完整路径请再确认一次。'
            : '选择本机文件夹作为工作区。浏览器只能拿到文件夹名，完整路径请再确认一次。'}
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
                if (!name) setName(folderNameFromPath(v))
              }}
              placeholder="例如 F:\your-project"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className="btn-ghost" onClick={browse}>
              <IconFolder />
              浏览
            </button>
          </div>
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
