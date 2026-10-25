import { memo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import type { EffortLevel } from '../types'

type Option = { id: EffortLevel; label: string }

/**
 * 思考强度滑块：档位是离散的，拖动时吸附到最近一档，松手才提交，
 * 免得拖一下就对远端会话连发好几次 set_config_option。键盘方向键逐档切换。
 */
export const EffortSlider = memo(function EffortSlider({
  options,
  value,
  onChange,
}: {
  options: Option[]
  value: EffortLevel
  onChange: (next: EffortLevel) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const last = options.length - 1
  const current = Math.max(0, options.findIndex((o) => o.id === value))
  const index = dragIndex ?? current
  const p = last > 0 ? index / last : 1

  function indexAt(clientX: number): number {
    const track = trackRef.current
    if (!track || last <= 0) return 0
    const rect = track.getBoundingClientRect()
    const thumb = rect.height
    const usable = Math.max(1, rect.width - thumb)
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left - thumb / 2) / usable))
    return Math.round(ratio * last)
  }

  function commit(next: number) {
    const opt = options[next]
    if (opt && opt.id !== value) onChange(opt.id)
  }

  // 按下和松开可能落在同一次渲染之前（快速单击），所以拖动状态记在 ref 里，
  // state 只用来驱动画面。
  const dragging = useRef(false)

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    dragging.current = true
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // 指针已失效时拿不到捕获，照样能点
    }
    e.currentTarget.focus()
    setDragIndex(indexAt(e.clientX))
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    setDragIndex(indexAt(e.clientX))
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    dragging.current = false
    commit(indexAt(e.clientX))
    setDragIndex(null)
  }

  function onPointerCancel() {
    dragging.current = false
    setDragIndex(null)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    let next = index
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(last, index + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, index - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    else return
    e.preventDefault()
    commit(next)
  }

  return (
    <div
      ref={trackRef}
      className={dragIndex === null ? 'effort-slider' : 'effort-slider is-dragging'}
      style={{ '--p': p } as CSSProperties}
      role="slider"
      tabIndex={0}
      aria-label="思考强度"
      aria-valuemin={0}
      aria-valuemax={last}
      aria-valuenow={index}
      aria-valuetext={options[index]?.label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => (
        <span
          key={o.id}
          className="effort-slider-tick"
          style={{ '--t': last > 0 ? i / last : 1 } as CSSProperties}
          aria-hidden="true"
        />
      ))}
      <span className="effort-slider-fill" aria-hidden="true" />
      <span className="effort-slider-thumb" aria-hidden="true" />
    </div>
  )
})
