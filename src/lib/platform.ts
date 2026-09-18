export function hostPlatform(): string {
  if (typeof navigator === 'undefined') return ''
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string }
  }
  return nav.userAgentData?.platform || navigator.platform || ''
}

export function isApplePlatform(host = hostPlatform()): boolean {
  return /mac|iphone|ipad|ipod/i.test(host)
}

export function isWindowsPlatform(host = hostPlatform()): boolean {
  return /win/i.test(host)
}

export function modKeyLabel(host = hostPlatform()): string {
  return isApplePlatform(host) ? '⌘' : 'Ctrl'
}

export function fileManagerName(host = hostPlatform()): string {
  if (isApplePlatform(host)) return 'Finder'
  if (isWindowsPlatform(host)) return '资源管理器'
  return '文件管理器'
}
