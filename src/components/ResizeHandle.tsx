import { useRef, type PointerEvent } from 'react'
import { clampWidth } from '../lib/layout'

export function ResizeHandle({
  label,
  invert,
  value,
  fallback,
  onChange,
}: {
  label: string
  invert?: boolean
  value: number
  fallback: number
  onChange: (width: number) => void
}) {
  const drag = useRef<{ x: number; w: number } | null>(null)

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, w: value }
    document.documentElement.classList.add('is-col-resizing')
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    const start = drag.current
    if (!start || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    const dx = e.clientX - start.x
    onChange(clampWidth(invert ? start.w - dx : start.w + dx))
  }

  function onPointerUp(e: PointerEvent<HTMLButtonElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    drag.current = null
    document.documentElement.classList.remove('is-col-resizing')
  }

  return (
    <button
      type="button"
      className={invert ? 'resize-handle is-end' : 'resize-handle is-start'}
      aria-label={label}
      title="拖动调整宽度，双击恢复默认"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => onChange(fallback)}
    />
  )
}
