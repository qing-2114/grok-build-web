import type { Message, Session } from '../types'
import { stripImageTokens } from './images'

function toolLine(m: Message): string {
  const t = m.tool
  if (!t) return ''
  const status = t.status === 'failed' ? '失败' : t.status === 'running' ? '进行中' : '成功'
  return `- \`${t.name}\`${t.target ? ` ${t.target}` : ''}（${status}）`
}

/** 把会话导成 Markdown：用户消息用引用块，工具调用列成清单。图片只留占位。 */
export function sessionToMarkdown(session: Session, title: string): string {
  const out: string[] = [`# ${title}`, '']
  const meta: string[] = []
  if (session.cwd) meta.push(`目录：\`${session.cwd}\``)
  meta.push(`导出时间：${new Date().toLocaleString()}`)
  out.push(meta.join(' · '), '')
  let inTools = false
  for (const m of session.messages) {
    if (m.role === 'tool') {
      if (!inTools) out.push('**工具调用**', '')
      inTools = true
      out.push(toolLine(m))
      continue
    }
    if (inTools) out.push('')
    inTools = false
    if (m.role === 'user') {
      const text = m.images?.length ? stripImageTokens(m.content) : m.content
      const imgs = m.images?.length ? `\n>\n> （附图 ${m.images.length} 张）` : ''
      out.push('---', '', ...(text || '（仅图片）').split('\n').map((l) => `> ${l}`), imgs, '')
    } else {
      out.push(m.content.trim(), '')
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

export function safeFileName(name: string): string {
  const cleaned = [...name]
    .map((ch) => (ch.charCodeAt(0) < 0x20 || '\\/:*?"<>|'.includes(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || '会话').slice(0, 80)
}

export function downloadText(fileName: string, text: string, mime = 'text/markdown'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
