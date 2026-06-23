import type { QueryResult } from '../core/arrowToRows'
import { buildChartSpec } from '../core/chartSpec'
import { useSession } from '../state/session'
import { ResultGrid } from './ResultGrid'
import { Chart } from './Chart'
import { ProfilePanel } from './ProfilePanel'

interface Props {
  result: QueryResult | null
  meta: { ms: number; rows: number } | null
  error: string | null
}

export function ResultPanel({ result, meta, error }: Props) {
  const view = useSession((s) => s.exploreView)
  const setView = useSession((s) => s.setExploreView)
  const spec = result ? buildChartSpec(result.columns) : null
  const showChart = view === 'chart' && spec && result

  return (
    <section className="result-panel">
      <header className="panel-head">
        <span className="panel-title">Результат</span>
        {meta && (
          <span className="panel-meta">
            {meta.rows} строк · {meta.ms.toFixed(1)} мс
          </span>
        )}
        {result && (
          <div className="view-toggle">
            <button
              className={view === 'table' ? 'on' : ''}
              onClick={() => setView('table')}
            >
              таблица
            </button>
            <button
              className={view === 'chart' ? 'on' : ''}
              disabled={!spec}
              title={spec ? '' : 'нет числовой колонки для графика'}
              onClick={() => setView('chart')}
            >
              график
            </button>
          </div>
        )}
      </header>
      {view === 'profile' && <ProfilePanel />}
      {view !== 'profile' && error && <pre className="result-error">{error}</pre>}
      {view !== 'profile' && !error && showChart && <Chart spec={spec!} rows={result!.rows} />}
      {view !== 'profile' && !error && result && !showChart && <ResultGrid result={result} />}
      {view !== 'profile' && !error && !result && (
        <p className="result-empty">Запусти запрос (⌘↵), чтобы увидеть строки.</p>
      )}
    </section>
  )
}
