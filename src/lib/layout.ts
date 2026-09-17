export const SIDEBAR_WIDTH_DEFAULT = 264
export const RIGHT_RAIL_WIDTH_DEFAULT = 520

export function clampWidth(value: number): number {
  if (!Number.isFinite(value)) return 0
  const cap =
    typeof window === 'undefined' ? value : Math.max(0, window.innerWidth)
  return Math.round(Math.max(0, Math.min(cap, value)))
}

export function storedWidth(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.round(n)
}
