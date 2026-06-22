import { useState } from 'react'
import type { QueryResult } from '../core/arrowToRows'
import { buildChartSpec } from '../core/chartSpec'
import { ResultGrid } from './ResultGrid'
import { Chart } from './Chart'

interface Props {
  result: QueryResult | null
  meta: { ms: number; rows: number } | null
  error: string | null
}

export function ResultPanel({ result, meta, error }: Props) {
  const [view, setView] = useState<'table' | 'chart'>('table')
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
      {error && <pre className="result-error">{error}</pre>}
      {!error && showChart && <Chart spec={spec!} rows={result!.rows} />}
      {!error && result && !showChart && <ResultGrid result={result} />}
      {!error && !result && (
        <p className="result-empty">Запусти запрос (⌘↵), чтобы увидеть строки.</p>
      )}
    </section>
  )
}
