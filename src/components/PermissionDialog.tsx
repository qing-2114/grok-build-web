import { useEffect, useRef } from 'react'
import type { PermissionRequest } from '../types'
import { useWorkspace } from '../workspace'

type PermissionOption = PermissionRequest['options'][number]

/**
 * 服务端原样转发 agent 的 options，元素可能是 null 或缺少字段。
 * 渲染前先挑出能用的，避免权限弹窗直接把界面打崩。
 */
function validOptions(raw: PermissionRequest['options']): PermissionOption[] {
  if (!Array.isArray(raw)) return []
  const out: PermissionOption[] = []
  for (const item of raw as unknown[]) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const optionId = rec['optionId']
    const kind = rec['kind']
    if (typeof optionId !== 'string' || !optionId) continue
    if (typeof kind !== 'string') continue
    const name = rec['name']
    out.push({
      optionId,
      name: typeof name === 'string' && name ? name : optionId,
      kind,
    })
  }
  return out
}

export function PermissionDialog() {
  const { permissionRequest, resolvePermission } = useWorkspace()
  const resolveRef = useRef(resolvePermission)
  useEffect(() => {
    resolveRef.current = resolvePermission
  })
  const firstRef = useRef<HTMLButtonElement>(null)
  const dismissRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!permissionRequest) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolveRef.current(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [permissionRequest])

  useEffect(() => {
    if (!permissionRequest) return
    const t = window.setTimeout(() => {
      const el = firstRef.current ?? dismissRef.current
      el?.focus()
    }, 40)
    return () => window.clearTimeout(t)
  }, [permissionRequest])

  if (!permissionRequest) return null

  const options = validOptions(permissionRequest.options)
  const title =
    typeof permissionRequest.title === 'string' && permissionRequest.title.trim()
      ? permissionRequest.title
      : '工具调用'

  return (
    <div className="dialog-root" role="presentation">
      <button
        type="button"
        className="scrim"
        aria-label="关闭"
        onClick={() => resolvePermission(null)}
      />
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-title"
      >
        <header className="dialog-head">
          <h2 id="permission-title">需要批准</h2>
        </header>
        <p className="dialog-lead">{title}</p>
        {options.length === 0 ? (
          <p className="dialog-lead">权限请求没有可用的选项。</p>
        ) : null}
        <footer className="dialog-foot">
          {options.map((opt, i) => (
            <button
              key={opt.optionId}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              className={
                opt.kind.startsWith('allow') ? 'btn-solid' : 'btn-ghost'
              }
              onClick={() => resolvePermission(opt.optionId)}
            >
              {opt.name}
            </button>
          ))}
          {options.length === 0 ? (
            <button
              ref={dismissRef}
              type="button"
              className="btn-ghost"
              onClick={() => resolvePermission(null)}
            >
              关闭
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  )
}
