import { neededDatasets } from '../core/report'
import { useSession } from '../state/session'

export function RehydrationBanner() {
  const report = useSession((s) => s.report)
  const datasets = useSession((s) => s.datasets)

  const loaded = new Set(datasets.map((d) => d.table))
  const missing = neededDatasets(report).filter((t) => !loaded.has(t))

  if (missing.length === 0) return null
  return (
    <div className="rehydration-banner" role="alert">
      Этому отчёту нужны источники: {missing.join(', ')} — подгрузи их (брось
      файлы выше), чтобы виджеты пересчитались.
    </div>
  )
}
