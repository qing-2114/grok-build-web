import { createReadStream } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

function grokHome(): string {
  return process.env.GROK_HOME?.trim() || join(homedir(), '.grok')
}

function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  return t.length > 28 ? `${t.slice(0, 28)}…` : t
}

export async function titleFromFirstPrompt(
  cwd: string,
  sessionId: string,
): Promise<string> {
  if (!cwd || !sessionId) return ''
  const file = join(
    grokHome(),
    'sessions',
    encodeURIComponent(cwd),
    sessionId,
    'updates.jsonl',
  )
  try {
    await access(file)
  } catch {
    return ''
  }

  const stream = createReadStream(file, { encoding: 'utf8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  let buf = ''
  let n = 0
  try {
    for await (const line of rl) {
      n += 1
      if (n > 80) break
      if (!line.trim()) continue
      let row: {
        method?: string
        params?: {
          update?: {
            sessionUpdate?: string
            content?: { text?: string }
          }
        }
      }
      try {
        row = JSON.parse(line) as typeof row
      } catch {
        continue
      }
      const update = row.params?.update
      if (!update) continue
      if (update.sessionUpdate === 'user_message_chunk') {
        buf += String(update.content?.text ?? '')
        continue
      }
      if (buf.trim()) break
    }
  } finally {
    rl.close()
    stream.destroy()
  }
  return titleFrom(buf)
}
