import type { ReactNode } from 'react'

function inline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={i} className="inline-code">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return <span key={i}>{part}</span>
  })
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

function isFence(line: string): boolean {
  return /^```/.test(line)
}

function headingLevel(line: string): 1 | 2 | 3 | 0 {
  if (/^###\s/.test(line)) return 3
  if (/^##\s/.test(line)) return 2
  if (/^#\s/.test(line)) return 1
  return 0
}

function isHr(line: string): boolean {
  return /^(---|\*\*\*|___)\s*$/.test(line)
}

function isTableSep(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-]+/.test(line) && /---/.test(line)
}

function isTableRow(line: string): boolean {
  return line.includes('|') && !isFence(line)
}

function bulletKind(line: string): 'ul' | 'ol' | null {
  if (/^\s*[-*]\s+/.test(line)) return 'ul'
  if (/^\s*\d+\.\s+/.test(line)) return 'ol'
  return null
}

function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*]|\d+\.)\s+/, '')
}

export function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const nodes: ReactNode[] = []
  let i = 0
  let k = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }

    if (isFence(line)) {
      const buf: string[] = []
      i += 1
      while (i < lines.length && !isFence(lines[i])) {
        buf.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      nodes.push(
        <pre key={k++} className="code-block">
          <code>{buf.join('\n')}</code>
        </pre>,
      )
      continue
    }

    const h = headingLevel(line)
    if (h) {
      const Tag = (h === 1 ? 'h1' : h === 2 ? 'h2' : 'h3') as 'h1' | 'h2' | 'h3'
      nodes.push(
        <Tag key={k++} className={`prose-h prose-h${h}`}>
          {inline(line.replace(/^#{1,3}\s+/, ''))}
        </Tag>,
      )
      i += 1
      continue
    }

    if (isHr(line)) {
      nodes.push(<hr key={k++} className="prose-hr" />)
      i += 1
      continue
    }

    if (line.startsWith('>')) {
      const buf: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) {
        buf.push(lines[i].replace(/^>\s?/, ''))
        i += 1
      }
      nodes.push(
        <blockquote key={k++} className="quote">
          {inline(buf.join('\n'))}
        </blockquote>,
      )
      continue
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const headers = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && isTableRow(lines[i]) && !isTableSep(lines[i])) {
        rows.push(splitRow(lines[i]))
        i += 1
      }
      nodes.push(
        <div key={k++} className="table-wrap">
          <table className="prose-table">
            <thead>
              <tr>
                {headers.map((hcell, hi) => (
                  <th key={hi}>{inline(hcell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    const kind = bulletKind(line)
    if (kind) {
      const items: string[] = []
      while (i < lines.length && bulletKind(lines[i]) === kind) {
        items.push(stripBullet(lines[i]))
        i += 1
      }
      const List = kind === 'ol' ? 'ol' : 'ul'
      nodes.push(
        <List key={k++} className={kind === 'ol' ? 'prose-ol' : 'prose-ul'}>
          {items.map((item, ii) => (
            <li key={ii}>{inline(item)}</li>
          ))}
        </List>,
      )
      continue
    }

    const buf: string[] = [line]
    i += 1
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isFence(lines[i]) &&
      !headingLevel(lines[i]) &&
      !isHr(lines[i]) &&
      !lines[i].startsWith('>') &&
      !bulletKind(lines[i]) &&
      !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      buf.push(lines[i])
      i += 1
    }
    nodes.push(
      <p key={k++} className="prose-p">
        {buf.map((ln, li) => (
          <span key={li}>
            {li > 0 ? <br /> : null}
            {inline(ln)}
          </span>
        ))}
      </p>,
    )
  }

  return <div className="prose">{nodes}</div>
}
