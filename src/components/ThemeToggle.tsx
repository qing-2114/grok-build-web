import { IconMoon, IconSun } from '../icons'
import { useWorkspace } from '../workspace'

/** Compact, keyboard-friendly theme switch shared by both chat headers. */
export function ThemeToggle() {
  const { theme, setTheme } = useWorkspace('theme', 'setTheme')
  const light = theme === 'light'
  return (
    <button
      type="button"
      className="icon-btn theme-toggle-btn hint-bottom"
      data-hint={light ? '切换到深色模式' : '切换到浅色模式'}
      aria-label={light ? '切换到深色模式' : '切换到浅色模式'}
      aria-pressed={light}
      onClick={() => setTheme(light ? 'dark' : 'light')}
    >
      {light ? <IconMoon /> : <IconSun />}
    </button>
  )
}
