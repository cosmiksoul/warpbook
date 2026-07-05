import { Icon } from './Icon'
import { DitherSwirl } from './DitherSwirl'
import { bootPercent, bootSegments, formatMb, type BootProgress } from '../core/bootProgress'

const SEG_COUNT = 10

/**
 * First-run boot screen shown while the DuckDB-WASM engine downloads and
 * instantiates. Терминальный TUI-бокс поверх свирла: сегментированный ▮-бар
 * с реальным процентом, при неизвестном total — индетерминантная пульсация,
 * чтобы медленная первая (некэшированная) загрузка не выглядела зависшей.
 */
export function BootScreen({ progress }: { progress: BootProgress | null }) {
  const pct = bootPercent(progress)
  const lit = bootSegments(pct, SEG_COUNT)
  return (
    <div className="boot-screen">
      <DitherSwirl />
      <div className="stage-veil" aria-hidden="true" />
      <div className="boot-terminal">
        <span className="logo boot-logo"><Icon name="logo" size={22} /> warpbook</span>
        <div className="boot-line">Запуск движка DuckDB-WASM</div>
        <div
          className={'boot-segs' + (lit === null ? ' indeterminate' : '')}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct ?? undefined}
        >
          {Array.from({ length: SEG_COUNT }, (_, i) => (
            <i
              key={i}
              className={lit !== null && i < lit ? 'on' : ''}
              style={lit === null ? { animationDelay: `${i * 0.1}s` } : undefined}
            />
          ))}
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
