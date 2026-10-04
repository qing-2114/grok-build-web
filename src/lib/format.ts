/** 标记数缩写：1234 → 1.2k，56000 → 56k，2300000 → 2.3m */
export function formatMarks(n: number): string {
  if (n < 1000) return String(Math.max(0, Math.round(n)))
  if (n < 10_000) {
    const k = n / 1000
    const t = k.toFixed(1)
    return `${t.endsWith('.0') ? t.slice(0, -2) : t}k`
  }
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  const m = n / 1_000_000
  const t = m >= 10 ? String(Math.round(m)) : m.toFixed(1)
  return `${t.endsWith('.0') ? t.slice(0, -2) : t}m`
}

/** 毫秒 → 「12 秒」「3 分 5 秒」「1 小时 2 分」 */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} 分 ${s % 60} 秒`
  return `${Math.floor(m / 60)} 小时 ${m % 60} 分`
}
