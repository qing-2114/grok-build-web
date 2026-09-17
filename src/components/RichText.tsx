import { useState, type ReactNode } from 'react'
import { IconCheck, IconCopy } from '../icons'
import { isWebUrl, looksLikeFilePath } from '../lib/paths'
import type { ChatImage } from '../types'
import { PathLink } from './PathLink'

const IMAGE_TOKEN = /\[Image #(\d+)\]/
const MD_IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/
const MD_LINK = /^\[([^\]]+)\]\(([^)]+)\)$/
const SPLIT =
  /(`[^`]+`|\*\*[^*]+\*\*|\[Image #\d+\]|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<>)"']+)/g

type Openers = {
  onOpenFile?: (path: string) => void
  onOpenUrl?: (url: string) => void
  onReveal?: (path: string) => void
  resolveMedia?: (src: string) => string | null
}

function FileOrWebLink({
  href,
  children,
  onOpenFile,
  onOpenUrl,
  onReveal,
}: {
  href: string
  children: ReactNode
} & Openers) {
  return (
    <PathLink
      href={href}
      onOpenFile={onOpenFile}
      onOpenUrl={onOpenUrl}
      onReveal={onReveal}
    >
      {children}
    </PathLink>
  )
}

function inline(text: string, images: ChatImage[], openers: Openers) {
  const parts = text.split(SPLIT)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      const inner = part.slice(1, -1)
      if (isWebUrl(inner) || looksLikeFilePath(inner)) {
        return (
          <FileOrWebLink key={i} href={inner} {...openers}>
            <code className="inline-code is-link">{inner}</code>
          </FileOrWebLink>
        )
      }
      return (
        <code key={i} className="inline-code">
          {inner}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    const token = part.match(IMAGE_TOKEN)
    if (token) {
      const n = Number(token[1])
      const hit = images.find((img) => img.n === n)
      if (hit) {
        return (
          <a
            key={i}
            className="image-chip"
            href={hit.src}
            target="_blank"
            rel="noreferrer"
          >
            <img src={hit.src} alt={`Image #${n}`} />
          </a>
        )
      }
      return (
        <span key={i} className="image-chip-label">
          {part}
        </span>
      )
    }
    const md = part.match(MD_IMAGE)
    if (md) {
      const src =
        /^(https?:|data:image\/)/i.test(md[2])
          ? md[2]
          : (openers.resolveMedia?.(md[2]) ?? '')
      if (src) {
        return (
          <img
            key={i}
            className="prose-inline-image"
            src={src}
            alt={md[1] || ''}
          />
        )
      }
    }
    const link = part.match(MD_LINK)
    if (link) {
      const href = link[2].trim().replace(/^<|>$/g, '').split(/\s+/)[0]
      if (isWebUrl(href) || looksLikeFilePath(href)) {
        return (
          <FileOrWebLink key={i} href={href} {...openers}>
            {link[1]}
          </FileOrWebLink>
        )
      }
    }
    if (isWebUrl(part)) {
      return (
        <FileOrWebLink key={i} href={part} {...openers}>
          {part}
        </FileOrWebLink>
      )
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

function isImageOnlyLine(line: string): boolean {
  const t = line.trim()
  return /^\[Image #\d+\]$/.test(t) || /^!\[[^\]]*\]\([^)]+\)$/.test(t)
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="code-block-wrap">
      <button
        type="button"
        className="code-copy"
        aria-label="复制代码"
        onClick={() => void copy()}
      >
        {copied ? <IconCheck /> : <IconCopy />}
      </button>
      <pre className="code-block">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function ImageBlock({
  line,
  images,
  openers,
}: {
  line: string
  images: ChatImage[]
  openers: Openers
}) {
  const token = line.trim().match(/^\[Image #(\d+)\]$/)
  if (token) {
    const n = Number(token[1])
    const hit = images.find((img) => img.n === n)
    if (hit) {
      return (
        <figure className="prose-image">
          <img src={hit.src} alt={`Image #${n}`} />
        </figure>
      )
    }
    return <p className="prose-p">{line.trim()}</p>
  }
  const md = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
  if (md) {
    const src =
      /^(https?:|data:image\/)/i.test(md[2])
        ? md[2]
        : (openers.resolveMedia?.(md[2]) ?? '')
    if (src) {
      return (
        <figure className="prose-image">
          <img src={src} alt={md[1] || ''} />
        </figure>
      )
    }
  }
  return <p className="prose-p">{inline(line, images, openers)}</p>
}

export function RichText({
  text,
  images = [],
  onOpenFile,
  onOpenUrl,
  onReveal,
  resolveMedia,
}: {
  text: string
  images?: ChatImage[]
  onOpenFile?: (path: string) => void
  onOpenUrl?: (url: string) => void
  onReveal?: (path: string) => void
  resolveMedia?: (src: string) => string | null
}) {
  const openers: Openers = { onOpenFile, onOpenUrl, onReveal, resolveMedia }
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
      nodes.push(<CodeBlock key={k++} code={buf.join('\n')} />)
      continue
    }

    const h = headingLevel(line)
    if (h) {
      const Tag = (h === 1 ? 'h1' : h === 2 ? 'h2' : 'h3') as 'h1' | 'h2' | 'h3'
      nodes.push(
        <Tag key={k++} className={`prose-h prose-h${h}`}>
          {inline(line.replace(/^#{1,3}\s+/, ''), images, openers)}
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
          {inline(buf.join('\n'), images, openers)}
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
                  <th key={hi}>{inline(hcell, images, openers)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{inline(cell, images, openers)}</td>
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
            <li key={ii}>{inline(item, images, openers)}</li>
          ))}
        </List>,
      )
      continue
    }

    if (isImageOnlyLine(line)) {
      nodes.push(
        <ImageBlock key={k++} line={line} images={images} openers={openers} />,
      )
      i += 1
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
      !isImageOnlyLine(lines[i]) &&
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
            {inline(ln, images, openers)}
          </span>
        ))}
      </p>,
    )
  }

  return <div className="prose">{nodes}</div>
}
