// 工具卡片里的 diff：grok 给的是 oldText / newText 整段，这里算出逐行差异，
// 再把大段未改动的行折叠成「… N 行未改动」。

export type DiffLine =
  | { kind: 'same' | 'add' | 'del'; text: string }
  | { kind: 'fold'; count: number }

// 超过这个规模就不跑 LCS（O(n·m) 内存），直接整段删 + 整段加。
const LCS_LIMIT = 4_000_000

function splitLines(text: string): string[] {
  if (!text) return []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

function rawDiff(a: string[], b: string[]): DiffLine[] {
  // 先剥掉共同的首尾，LCS 只算中间那段。
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const head: DiffLine[] = a.slice(0, start).map((text) => ({ kind: 'same', text }))
  const tail: DiffLine[] = a.slice(endA).map((text) => ({ kind: 'same', text }))
  const x = a.slice(start, endA)
  const y = b.slice(start, endB)
  const n = x.length
  const m = y.length
  const mid: DiffLine[] = []
  if (n * m > LCS_LIMIT) {
    for (const text of x) mid.push({ kind: 'del', text })
    for (const text of y) mid.push({ kind: 'add', text })
    return [...head, ...mid, ...tail]
  }
  // dp[i][j] = x[i..] 与 y[j..] 的 LCS 长度
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      mid.push({ kind: 'same', text: x[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      mid.push({ kind: 'del', text: x[i++] })
    } else {
      mid.push({ kind: 'add', text: y[j++] })
    }
  }
  while (i < n) mid.push({ kind: 'del', text: x[i++] })
  while (j < m) mid.push({ kind: 'add', text: y[j++] })
  return [...head, ...mid, ...tail]
}

/** 逐行 diff，未改动的长段只保留前后 context 行。 */
export function lineDiff(oldText: string, newText: string, context = 3): DiffLine[] {
  const lines = rawDiff(splitLines(oldText), splitLines(newText))
  const keep = new Array<boolean>(lines.length).fill(false)
  lines.forEach((l, idx) => {
    if (l.kind === 'same') return
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) {
      keep[k] = true
    }
  })
  const out: DiffLine[] = []
  let folded = 0
  lines.forEach((l, idx) => {
    if (keep[idx]) {
      if (folded) out.push({ kind: 'fold', count: folded })
      folded = 0
      out.push(l)
    } else {
      folded++
    }
  })
  if (folded) out.push({ kind: 'fold', count: folded })
  return out
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.kind === 'add') added++
    else if (l.kind === 'del') removed++
  }
  return { added, removed }
}
