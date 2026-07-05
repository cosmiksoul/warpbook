import { useState } from 'react'
import type { DuckDBClient } from '../db/duckdbClient'
import { loadSample, loadSampleReport, confirmReplaceReport, cookbookSample } from '../features/sampleData'
import { useSession } from '../state/session'
import { DitherSwirl } from './DitherSwirl'
import { SampleGallery } from './SampleGallery'
import { useSchemaActions } from '../features/useSchemaActions'

export function WelcomeScreen({ client }: { client: DuckDBClient }) {
  const { applyInferred } = useSchemaActions(client)
  const setMode = useSession((s) => s.setMode)
  const dismissWelcome = useSession((s) => s.dismissWelcome)
  const [busy, setBusy] = useState(false)

  async function onReport() {
    // A returning user may already have a hydrated report; don't clobber it silently.
    if (!confirmReplaceReport()) return
    setBusy(true)
    // Switch to the report surface up front so the Explore screen doesn't flash
    // while the demo data fetches. (This unmounts WelcomeScreen — the awaited
    // loaders below run off useSession.getState(), so they finish regardless.)
    setMode('report')
    try {
      await loadSample(client, applyInferred, cookbookSample)
      await loadSampleReport()
    } catch (e) {
      alert('Не удалось открыть пример отчёта: ' + String(e))
    } finally {
      setBusy(false)
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
        <div className="welcome-gallery-label">Учебные датасеты</div>
        <SampleGallery client={client} />
        <div className="welcome-actions">
          <button className="welcome-cta ghost" disabled={busy} onClick={onReport}>
            {busy ? 'Грузим…' : 'Открыть пример отчёта'}
          </button>
          <button className="welcome-skip" disabled={busy} onClick={dismissWelcome}>
            Пропустить
          </button>
        </div>
      </div>
    </div>
  )
}
