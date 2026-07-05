import { useSession } from '../state/session'
import { loadOneFile } from './loadFiles'
import { deserializeReport } from '../core/report'
import { tableNameFromFilename } from '../core/sql'
import { SAMPLES, type Sample } from '../core/sampleCatalog'
import type { DuckDBClient } from '../db/duckdbClient'

const BASE = import.meta.env.BASE_URL

export const cookbookSample: Sample = SAMPLES.find((s) => s.id === 'cookbook')!

/** Загрузить файлы сэмпла штатным пайплайном. Идемпотентно: таблица уже
 *  в сторе → файл скипается. CSV получает инференс типов. */
export async function loadSample(
  client: DuckDBClient,
  applyInferred: (table: string) => Promise<void>,
  sample: Sample,
): Promise<void> {
  for (const f of sample.files) {
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

/** Стартовые табы сэмпла; уже существующие по title не дублируются
 *  (seedTabs в сторе аппендит без дедупа — дедуп здесь, по месту). */
export function seedSampleTabs(sample: Sample): void {
  const titles = new Set(useSession.getState().tabs.map((t) => t.title))
  const fresh = sample.seedTabs.filter((s) => !titles.has(s.title))
  if (fresh.length > 0) useSession.getState().seedTabs(fresh)
}

/** Гард перед заменой непустого отчёта примером. */
export function confirmReplaceReport(): boolean {
  return (
    useSession.getState().report.blocks.length === 0 ||
    confirm('Открыть пример отчёта? Текущий отчёт будет заменён — сохрани его в JSON, если он нужен.')
  )
}

/** Загрузить prebuilt-отчёт и перейти в режим отчёта (данные грузит вызыватель). */
export async function loadSampleReport(): Promise<void> {
  const res = await fetch(`${BASE}demo/sample-report.json`)
  if (!res.ok) throw new Error(`sample-report.json: HTTP ${res.status}`)
  const doc = deserializeReport(await res.text())
  useSession.getState().loadReport(doc)
  useSession.getState().setMode('report')
}
