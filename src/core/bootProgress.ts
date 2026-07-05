/** WASM engine instantiation download progress (bytes). */
export interface BootProgress {
  loaded: number
  total: number
}

/**
 * Percentage 0..100 of the engine download, or null when the total is unknown
 * (no Content-Length yet / not started) — the boot screen then shows an
 * indeterminate bar instead of a bogus number.
 */
export function bootPercent(p: BootProgress | null): number | null {
  if (!p || p.total <= 0) return null
  return Math.min(100, Math.max(0, Math.round((p.loaded / p.total) * 100)))
}

/** Decimal megabytes, one decimal (e.g. "34.2 МБ"). */
export function formatMb(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1) + ' МБ'
}

/**
 * Сколько сегментов ▮ из total подсветить для процента загрузки.
 * null (total неизвестен) → null: сегменты пульсируют индетерминацией.
 */
export function bootSegments(pct: number | null, total: number): number | null {
  if (pct === null) return null
  return Math.max(0, Math.min(total, Math.round((pct / 100) * total)))
}
