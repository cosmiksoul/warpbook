import { useState } from 'react'
import type { DuckDBClient } from '../db/duckdbClient'
import { useSession } from '../state/session'
import { useSchemaActions } from '../features/useSchemaActions'
import { loadSample, seedSampleTabs } from '../features/sampleData'
import { SAMPLES, sampleLoaded, type Sample } from '../core/sampleCatalog'

/** Витрина сэмплов: featured-карточка cookbook + три классических датасета.
 *  Клик грузит файлы штатным пайплайном и сидит стартовый таб с готовым
 *  запросом. Повторный клик невозможен — карточка гаснет в «✓ загружено». */
export function SampleGallery({ client }: { client: DuckDBClient }) {
  const { applyInferred } = useSchemaActions(client)
  const tables = useSession((s) => s.datasets).map((d) => d.table)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function onPick(sample: Sample) {
    setBusyId(sample.id)
    try {
      await loadSample(client, applyInferred, sample)
      seedSampleTabs(sample)
    } catch (e) {
      alert('Не удалось загрузить сэмпл: ' + String(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="sample-grid">
      {SAMPLES.map((s) => {
        const loaded = sampleLoaded(s, tables)
        const fmts = [...new Set(s.files.map((f) => (f.name.endsWith('.parquet') ? 'PQ' : 'CSV')))]
        return (
          <button
            key={s.id}
            className={'sample-card' + (s.featured ? ' featured' : '') + (loaded ? ' loaded' : '')}
            disabled={busyId !== null || loaded}
            onClick={() => void onPick(s)}
          >
            <span className="sample-meta">
              {fmts.map((f) => (
                <span className="sample-badge" key={f}>{f}</span>
              ))}
              <span className="sample-size">{s.sizeLabel}</span>
            </span>
            <span className="sample-title">{s.title}</span>
            <span className="sample-blurb">{s.blurb}</span>
            {s.credit && <span className="sample-credit">{s.credit}</span>}
            <span className="sample-state">
              {busyId === s.id ? 'грузим…' : loaded ? '✓ загружено' : '▸ загрузить'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
