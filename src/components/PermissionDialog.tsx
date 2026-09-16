import { useWorkspace } from '../workspace'

export function PermissionDialog() {
  const { permissionRequest, resolvePermission } = useWorkspace()
  if (!permissionRequest) return null
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
        <p className="dialog-lead">{permissionRequest.title}</p>
        <footer className="dialog-foot">
          {permissionRequest.options.map((opt) => (
            <button
              key={opt.optionId}
              type="button"
              className={
                opt.kind.startsWith('allow') ? 'btn-solid' : 'btn-ghost'
              }
              onClick={() => resolvePermission(opt.optionId)}
            >
              {opt.name}
            </button>
          ))}
          {permissionRequest.options.length === 0 ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => resolvePermission(null)}
            >
              拒绝
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  )
}
