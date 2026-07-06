import { useRef, useState } from 'react'
import { useSession } from '../state/session'
import type { DuckDBClient } from '../db/duckdbClient'
import { buildResetStatements } from '../core/resetPlan'
import { loadOneFile } from './loadFiles'
import { Explore } from './Explore'
import { Report } from './Report'
import { Rail } from './Rail'
import { Toast } from '../components/Toast'
import { Icon } from '../components/Icon'
import { WelcomeScreen } from '../components/WelcomeScreen'
import { AboutModal } from '../components/AboutModal'

export function Shell({ client }: { client: DuckDBClient }) {
  const [aboutOpen, setAboutOpen] = useState(false)
  const mode = useSession((s) => s.mode)
  const setMode = useSession((s) => s.setMode)
  const datasets = useSession((s) => s.datasets)
  const welcomeDismissed = useSession((s) => s.welcomeDismissed)
  const addDataset = useSession((s) => s.addDataset)
  const reset = useSession((s) => s.reset)

  const inflightFiles = useRef(new Set<string>())

  async function handleFiles(files: File[]) {
    for (const file of files) {
      const key = `${file.name}:${file.size}`
      if (inflightFiles.current.has(key)) continue // двойной дроп той же пачки
      inflightFiles.current.add(key)
      try {
        // taken — из ЖИВОГО стора на каждый файл: параллельная пачка не
        // проверяет коллизии против устаревшего списка.
        const taken = useSession.getState().datasets.map((d) => d.table)
        const ds = await loadOneFile(client, file, taken)
        addDataset(ds)
      } catch (e) {
        // Per-file failure: surface, keep loading the rest.
        alert(`Не удалось загрузить ${file.name}: ${String(e)}`)
      } finally {
        inflightFiles.current.delete(key)
      }
    }
  }

  async function handleReset() {
    const st = useSession.getState()
    const stmts = buildResetStatements(
      st.datasets,
      st.tabs.map((t) => t.id),
      st.report.blocks.filter((b) => b.type === 'widget').map((b) => b.id),
    )
    for (const sql of stmts) {
      try {
        await client.exec(sql)
      } catch {
        // ignore — object may already be gone
      }
    }
    reset()
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="logo"><Icon name="logo" size={18} /> warpbook</span>
        <nav className="mode-toggle">
          <button className={mode === 'explore' ? 'on' : ''} onClick={() => setMode('explore')}>
            исследование
          </button>
          <button className={mode === 'report' ? 'on' : ''} onClick={() => setMode('report')}>
            отчёт
          </button>
        </nav>
        <div className="topbar-right">
          <button className="about-btn" title="о warpbook" aria-label="о warpbook" onClick={() => setAboutOpen(true)}>?</button>
          <span className="engine-tag">duckdb-wasm 1.5.4</span>
          <span className="pill-local">● local</span>
          <button className="reset-btn" onClick={handleReset}>
            Reset
          </button>
        </div>
      </header>

      <div className="body">
        <Rail client={client} onFiles={handleFiles} />
        <main className="workspace">
          {mode === 'explore' ? (
            datasets.length === 0 && !welcomeDismissed ? (
              <WelcomeScreen client={client} />
            ) : (
              <Explore client={client} />
            )
          ) : (
            <Report client={client} />
          )}
        </main>
      </div>
      <footer className="statusline">
        <span>engine <b className="sl-ok">ready</b></span>
        <span className="sl-right">MIT · v1</span>
      </footer>
      <Toast />
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  )
}
