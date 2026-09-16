import type { Session } from '../types'

export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return '新对话'
  return t.length > 28 ? `${t.slice(0, 28)}…` : t
}

export function firstPromptTitle(session: Session): string | null {
  const first = session.messages.find(
    (m) => m.role === 'user' && m.content.trim(),
  )
  return first ? titleFrom(first.content) : null
}

export function displayTitle(
  session: Session,
  override?: string | null,
): string {
  const manual = override?.replace(/\s+/g, ' ').trim()
  if (manual) return manual
  return firstPromptTitle(session) || session.title || '新对话'
}
