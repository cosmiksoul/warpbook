import { Icon } from './Icon'
import { WarpShader } from './WarpShader'
import { bootPercent, formatMb, type BootProgress } from '../core/bootProgress'

/**
 * First-run boot screen shown while the DuckDB-WASM engine downloads and
 * instantiates. Shows a real percentage when the download reports a total size,
 * otherwise an animated indeterminate bar — so a slow first (uncached) load
 * never looks like a frozen tab.
 */
export function BootScreen({ progress }: { progress: BootProgress | null }) {
  const pct = bootPercent(progress)
  return (
    <div className="boot-screen">
      <WarpShader intensity={1} />
      <div className="boot-card">
        <span className="logo boot-logo"><Icon name="logo" size={22} /> warpbook</span>
        <div className="boot-title">Запуск движка DuckDB-WASM…</div>
        <div className={'boot-bar' + (pct === null ? ' indeterminate' : '')}>
          <div className="boot-bar-fill" style={pct === null ? undefined : { width: `${pct}%` }} />
        </div>
        <div className="boot-detail">
          {pct === null
            ? progress && progress.loaded > 0
              ? `загружено ${formatMb(progress.loaded)}…`
              : 'подготовка…'
            : `${pct}%${progress ? ` · ${formatMb(progress.loaded)} из ${formatMb(progress.total)}` : ''}`}
        </div>
        <div className="boot-note">
          Первый запуск скачивает движок (~35&nbsp;МБ) — дальше он берётся из кэша браузера.
        </div>
      </div>
    </div>
  )
}
