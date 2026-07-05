import { useState } from 'react'
import type { DuckDBClient } from '../db/duckdbClient'
import { useSchemaActions } from '../features/useSchemaActions'
import { loadDemoData, seedExampleTabs, loadSampleReport } from '../features/demoData'
import { useSession } from '../state/session'
import { DitherSwirl } from './DitherSwirl'

export function WelcomeScreen({ client }: { client: DuckDBClient }) {
  const { applyInferred } = useSchemaActions(client)
  const setMode = useSession((s) => s.setMode)
  const [busy, setBusy] = useState<null | 'data' | 'report'>(null)

  async function onData() {
    setBusy('data')
    try {
      await loadDemoData(client, applyInferred)
      seedExampleTabs()
    } catch (e) {
      alert('Не удалось загрузить демо-данные: ' + String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onReport() {
    // A returning user may already have a hydrated report; don't clobber it silently.
    if (
      useSession.getState().report.blocks.length > 0 &&
      !confirm('Открыть пример отчёта? Текущий отчёт будет заменён — сохрани его в JSON, если он нужен.')
    ) {
      return
    }
    setBusy('report')
    // Switch to the report surface up front so the Explore screen doesn't flash
    // while the demo data fetches. (This unmounts WelcomeScreen — the awaited
    // loaders below run off useSession.getState(), so they finish regardless.)
    setMode('report')
    try {
      await loadDemoData(client, applyInferred)
      await loadSampleReport()
    } catch (e) {
      alert('Не удалось открыть пример отчёта: ' + String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="welcome-stage">
      <DitherSwirl />
      <div className="stage-veil" aria-hidden="true" />
      <div className="welcome welcome-content">
        <div className="welcome-kicker">Browser analytical terminal</div>
        <h1 className="welcome-title">Аналитический ноутбук в браузере</h1>
        <p className="welcome-lead">
          Брось CSV или Parquet в панель слева — и работай: пиши SQL с JOIN/UNION,
          смотри профиль значений, закрепляй результаты виджетами и собирай
          нарративный отчёт. <b>Всё локально, без бэкенда.</b>
        </p>
        <ol className="steps-box">
          <li className="step-row"><span className="step-n">01</span><span><b>Данные.</b> CSV/Parquet → схема и типы в рейле слева.</span></li>
          <li className="step-row"><span className="step-n">02</span><span><b>Исследование.</b> SQL → таблица, график, профиль значений.</span></li>
          <li className="step-row"><span className="step-n">03</span><span><b>Отчёт.</b> Закрепи виджеты, впиши текст, выгрузи в HTML/PDF.</span></li>
        </ol>
        <div className="welcome-actions">
          <button className="welcome-cta" disabled={busy !== null} onClick={onData}>
            {busy === 'data' ? 'Грузим…' : '▸ Загрузить демо-данные'}
          </button>
          <button className="welcome-cta ghost" disabled={busy !== null} onClick={onReport}>
            {busy === 'report' ? 'Грузим…' : 'Открыть пример отчёта'}
          </button>
        </div>
        <p className="welcome-credit">
          Демо-данные из учебника{' '}
          <a href="https://github.com/cosmiksoul/sql-product-analytics-cookbook" target="_blank" rel="noopener noreferrer">
            «SQL 101: Рецепты продуктового аналитика»
          </a>{' '}
          · MIT. Запросы в книге на BigQuery — примеры в демо адаптированы под DuckDB.
        </p>
      </div>
    </div>
  )
}
