import { useSession } from '../state/session'
import { loadOneFile } from './loadFiles'
import { deserializeReport } from '../core/report'
import { tableNameFromFilename } from '../core/sql'
import { EXAMPLE_QUERIES } from '../core/exampleQueries'
import type { DuckDBClient } from '../db/duckdbClient'

const BASE = import.meta.env.BASE_URL
// Physical files stay payments.csv / users.parquet; the loaded File is named
// demo_* so the resulting dataset/table (rail, autocomplete, recipes) is demo_-prefixed.
const DEMO_FILES = [
  { path: 'demo/payments.csv', name: 'demo_payments.csv' },
  { path: 'demo/users.parquet', name: 'demo_users.parquet' },
]

/** Load the bundled demo files through the normal file pipeline. Idempotent:
 *  skips a file whose table already exists. payments (csv) gets inferred typing. */
export async function loadDemoData(
  client: DuckDBClient,
  applyInferred: (table: string) => Promise<void>,
): Promise<void> {
  for (const f of DEMO_FILES) {
    const table = tableNameFromFilename(f.name)
    if (useSession.getState().datasets.some((d) => d.table === table)) continue
    const res = await fetch(`${BASE}${f.path}`)
    if (!res.ok) throw new Error(`${f.path}: HTTP ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    const file = new File([bytes], f.name)
    const taken = useSession.getState().datasets.map((d) => d.table)
    const ds = await loadOneFile(client, file, taken)
    useSession.getState().addDataset(ds)
    if (ds.kind === 'csv') await applyInferred(ds.table)
  }
}

/** Seed the example recipe tabs (first becomes active). */
export function seedExampleTabs(): void {
  useSession.getState().seedTabs(EXAMPLE_QUERIES)
}

/** Load the prebuilt sample report and switch to Report mode. */
export async function loadSampleReport(): Promise<void> {
  const res = await fetch(`${BASE}demo/sample-report.json`)
  if (!res.ok) throw new Error(`sample-report.json: HTTP ${res.status}`)
  const doc = deserializeReport(await res.text())
  useSession.getState().loadReport(doc)
  useSession.getState().setMode('report')
}
