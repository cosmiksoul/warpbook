import type { QueryResult } from '../core/arrowToRows'
import { ResultGrid } from './ResultGrid'

interface Props {
  result: QueryResult | null
  meta: { ms: number; rows: number } | null
  error: string | null
}

export function ResultPanel({ result, meta, error }: Props) {
  return (
    <section className="result-panel">
      <header className="panel-head">
        <span className="panel-title">Результат</span>
        {meta && (
          <span className="panel-meta">
            {meta.rows} строк · {meta.ms.toFixed(1)} мс
          </span>
        )}
      </header>
      {error && <pre className="result-error">{error}</pre>}
      {!error && result && <ResultGrid result={result} />}
      {!error && !result && (
        <p className="result-empty">Запусти запрос (⌘↵), чтобы увидеть строки.</p>
      )}
    </section>
  )
}
