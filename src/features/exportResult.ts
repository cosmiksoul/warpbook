import type { DuckDBClient } from '../db/duckdbClient'

const MIME: Record<'csv' | 'parquet', string> = {
  csv: 'text/csv',
  parquet: 'application/octet-stream',
}

/** Export the FULL result of `sql` and trigger a browser download. */
export async function downloadResult(
  client: DuckDBClient,
  sql: string,
  format: 'csv' | 'parquet',
): Promise<void> {
  const bytes = await client.exportQuery(sql, format)
  // DuckDB-WASM never returns SharedArrayBuffer; cast to satisfy strict TS BlobPart check.
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME[format] })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `quackbook-result.${format}`
  document.body.appendChild(a) // Firefox needs the anchor in the DOM
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
