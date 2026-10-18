export const INSTALLER_ASSET = /^Grok-Build-Setup-[\d.]+(-[0-9A-Za-z.]+)?\.exe$/i

export type ReleaseAsset = {
  name?: string
  browser_download_url?: string
  size?: number
}

export function pickInstallerAsset(
  assets: ReleaseAsset[] | undefined,
): { name: string; url: string; size: number } | null {
  if (!assets) return null
  for (const asset of assets) {
    const name = asset.name?.trim() ?? ''
    const url = asset.browser_download_url?.trim() ?? ''
    if (!name || !url) continue
    if (!INSTALLER_ASSET.test(name)) continue
    const size = typeof asset.size === 'number' && asset.size > 0 ? asset.size : 0
    return { name, url, size }
  }
  return null
}

export function tagVersion(tag: string): string {
  return tag.trim().replace(/^v/i, '')
}
