import type { Session } from '../types'
import { stripImageTokens } from './images'

export function titleFrom(text: string): string {
  const t = stripImageTokens(text)
  if (!t) {
    const m = text.match(/\[Image #(\d+)\]/)
    return m ? `Image #${m[1]}` : '新对话'
  }
  return t.length > 28 ? `${t.slice(0, 28)}…` : t
}

export function firstPromptTitle(session: Session): string | null {
  const first = session.messages.find(
    (m) => m.role === 'user' && m.content.trim(),
  )
  return first ? titleFrom(first.content) : null
}

export function isPlaceholderTitle(title?: string | null): boolean {
  const t = title?.replace(/\s+/g, ' ').trim() ?? ''
  return !t || t === '新对话' || t === '会话'
}

export function displayTitle(
  session: Session,
  override?: string | null,
): string {
  const manual = override?.replace(/\s+/g, ' ').trim()
  if (manual) return manual
  if (!isPlaceholderTitle(session.title)) return session.title
  return firstPromptTitle(session) || session.title || '新对话'
}
