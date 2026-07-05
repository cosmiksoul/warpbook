import { useEffect, useState } from 'react'
import type { DuckDBClient } from '../db/duckdbClient'
import { useSchemaActions } from '../features/useSchemaActions'
import { loadSample, loadSampleReport, confirmReplaceReport, cookbookSample } from '../features/sampleData'
import { SampleGallery } from './SampleGallery'

export function SamplesModal({ client, onClose }: { client: DuckDBClient; onClose: () => void }) {
  const { applyInferred } = useSchemaActions(client)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function onReport() {
    if (!confirmReplaceReport()) return
    setBusy(true)
    try {
      await loadSample(client, applyInferred, cookbookSample)
      await loadSampleReport()
      onClose()
    } catch (e) {
      alert('Не удалось открыть пример отчёта: ' + String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal samples-modal" role="dialog" aria-modal="true" aria-label="Сэмплы" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" aria-label="закрыть" onClick={onClose}>✕</button>
        <h2>сэмплы</h2>
        <p className="samples-note">Демо-датасеты грузятся локально — как обычные файлы, данные никуда не уходят.</p>
        <SampleGallery client={client} />
        <p className="modal-foot">
          <button className="link-btn" disabled={busy} onClick={() => void onReport()}>
            {busy ? 'грузим…' : 'открыть пример отчёта →'}
          </button>
        </p>
      </div>
    </div>
  )
}
