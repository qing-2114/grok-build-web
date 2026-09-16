import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

type PopoverProps = {
  align?: 'left' | 'right' | 'up-left' | 'down-right'
  menuClassName?: string
  portal?: boolean
  trigger: (args: { open: boolean; toggle: () => void }) => ReactNode
  children: (args: { close: () => void }) => ReactNode
}

export function Popover({
  align = 'left',
  menuClassName = '',
  portal = false,
  trigger,
  children,
}: PopoverProps) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (boxRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !portal) return
    const anchor = boxRef.current
    const menu = menuRef.current
    if (!anchor || !menu) return

    const place = () => {
      const r = anchor.getBoundingClientRect()
      const mw = menu.offsetWidth
      const mh = menu.offsetHeight
      const pad = 10
      let left = r.right - mw
      let top = r.bottom + 6
      if (left < pad) left = pad
      if (left + mw > window.innerWidth - pad) {
        left = Math.max(pad, window.innerWidth - pad - mw)
      }
      if (top + mh > window.innerHeight - pad) {
        top = r.top - mh - 6
      }
      if (top < pad) top = pad
      setPos({ top, left })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, portal])

  const menu = open ? (
    <div
      ref={menuRef}
      className={['menu', portal ? 'is-portal' : '', menuClassName]
        .filter(Boolean)
        .join(' ')}
      role="menu"
      style={
        portal && pos
          ? { top: pos.top, left: pos.left }
          : portal
            ? { visibility: 'hidden' }
            : undefined
      }
    >
      {children({ close: () => setOpen(false) })}
    </div>
  ) : null

  return (
    <div
      className={
        align === 'up-left'
          ? 'chip-group'
          : align === 'down-right'
            ? 'menu-anchor is-down-right'
            : 'menu-anchor'
      }
      ref={boxRef}
    >
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {portal
        ? menu
          ? createPortal(menu, document.body)
          : null
        : menu}
    </div>
  )
}
