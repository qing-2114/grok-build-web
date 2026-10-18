/**
 * 截图 / 演示模式：地址带 `?demo=1` 时不读取本机真实会话，
 * 避免把私人会话标题带进公开截图。
 */
export function isDemoMode(search?: string): boolean {
  const query =
    search ?? (typeof window === 'undefined' ? '' : window.location.search)
  return new URLSearchParams(query).get('demo') === '1'
}
