import { zipEntry } from './zip.ts'

function decodeXml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function headingLevel(pXml: string): number {
  const m = pXml.match(
    /w:val="(?:Heading\s*|标题\s*|heading\s*)(\d)"/i,
  )
  if (m) return Math.min(6, Number(m[1]) || 0)
  return 0
}

function isList(pXml: string): boolean {
  return /<w:numPr[\s>]/.test(pXml)
}

function paragraphText(pXml: string): string {
  const parts: string[] = []
  const re = /<w:tab\b[^/]*\/>|<w:br\b[^/]*\/>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(pXml))) {
    if (m[0].startsWith('<w:tab')) parts.push('\t')
    else if (m[0].startsWith('<w:br')) parts.push('\n')
    else parts.push(decodeXml(m[1] ?? ''))
  }
  return parts.join('')
}

function relTargets(relsXml: string): Map<string, string> {
  const map = new Map<string, string>()
  const re =
    /Id="([^"]+)"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(relsXml))) {
    const id = m[1] || m[4]
    const target = m[2] || m[3]
    if (id && target) map.set(id, target)
  }
  return map
}

function hyperlinkMarkdown(pXml: string, rels: Map<string, string>): string | null {
  const id = pXml.match(/<w:hyperlink[^>]*r:id="([^"]+)"/)
  if (!id) return null
  const href = rels.get(id[1])
  const text = paragraphText(pXml).trim()
  if (!href || !text) return null
  if (/^https?:\/\//i.test(href)) return `[${text}](${href})`
  return text
}

export function docxToMarkdown(buf: Buffer): string {
  const xmlBuf = zipEntry(buf, 'word/document.xml')
  if (!xmlBuf) throw new Error('无法读取 Word 文档内容')
  const xml = xmlBuf.toString('utf8')
  let rels = new Map<string, string>()
  const relBuf = zipEntry(buf, 'word/_rels/document.xml.rels')
  if (relBuf) rels = relTargets(relBuf.toString('utf8'))

  const blocks = xml.split(/<w:p[\s>]/).slice(1)
  const lines: string[] = []
  for (const raw of blocks) {
    const p = raw.split(/<\/w:p>/)[0] ?? raw
    const text = paragraphText(p)
    const trimmed = text.replace(/[ \t]+$/g, '')
    const level = headingLevel(p)
    const link = hyperlinkMarkdown(p, rels)
    if (level && trimmed) {
      lines.push(`${'#'.repeat(level)} ${trimmed}`)
      continue
    }
    if (link) {
      lines.push(link)
      continue
    }
    if (!trimmed) {
      if (lines[lines.length - 1] !== '') lines.push('')
      continue
    }
    if (isList(p)) lines.push(`- ${trimmed}`)
    else lines.push(trimmed)
  }
  const out = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!out) throw new Error('Word 文档是空的')
  return out.length > 400_000 ? `${out.slice(0, 400_000)}\n\n…` : out
}
