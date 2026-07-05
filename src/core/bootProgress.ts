/** WASM engine instantiation download progress (bytes). */
export interface BootProgress {
  loaded: number
  total: number
}

/**
 * Percentage 0..100 of the engine download, or null when the total is unknown
 * or unreliable — the boot screen then shows an indeterminate bar instead of a
 * bogus number. Unreliable = loaded > total: on compressed transfer (GitHub
 * Pages brotli/gzip) Content-Length is the ENCODED size while the stream
 * counts DECODED bytes, so «34.2 МБ из 7.8 МБ» is a units mismatch, not 100%.
 */
export function bootPercent(p: BootProgress | null): number | null {
  if (!p || p.total <= 0 || p.loaded > p.total) return null
  return Math.max(0, Math.round((p.loaded / p.total) * 100))
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
