import { useSession } from '../state/session'
import type { ColumnProfile } from '../core/profile'
import { ProfileCard } from './ProfileCard'

/** Compact number formatting for the caption row count. */
function fmt(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n)
}

/**
 * The shared profile view. Reads the active profileTarget from the store and
 * renders ColumnProfile[] of that target (source -> Dataset.profile; result ->
 * Tab.resultProfile) with its row count. Caption disambiguates the two targets
 * and carries «N строк» (spec line 138). An empty relation (0 rows) shows an
 * explicit notice instead of empty cards (spec line 94). profiling -> a
 * placeholder; error -> a message (no crash).
 */
export function ProfilePanel() {
  const target = useSession((s) => s.profileTarget)
  const datasets = useSession((s) => s.datasets)
  const tabs = useSession((s) => s.tabs)

  if (!target) {
    return <p className="result-empty">Нажми «профиль источника» в рейле.</p>
  }

  let profiles: ColumnProfile[] | undefined
  let rowCount: number | undefined
  let profiling: boolean
  let error: string | null | undefined
  let caption: string

  if (target.kind === 'source') {
    const ds = datasets.find((d) => d.table === target.table)
    profiles = ds?.profile
    rowCount = ds?.rowCount
    profiling = ds?.profiling ?? false
    error = ds?.profileError
    caption = `профиль источника · ${ds?.fileName ?? target.table}`
  } else {
    const tab = tabs.find((t) => t.id === target.tabId)
    profiles = tab?.resultProfile
    rowCount = tab?.resultRowCount
    profiling = tab?.resultProfiling ?? false
    error = tab?.resultProfileError
    caption = `профиль результата · ${tab?.title ?? target.tabId}`
  }

  if (error) return <pre className="result-error">{error}</pre>
  if (profiling) return <p className="result-empty">считаю профиль…</p>
  if (!profiles) {
    // после re-apply схемы кэш сброшен, но никто не считает — не врём спиннером
    return (
      <p className="result-empty">
        {target.kind === 'source'
          ? 'профиль не посчитан — нажми «профиль источника» в рейле'
          : 'профиль не посчитан — нажми «профиль» над результатом'}
      </p>
    )
  }

  const rowsLabel = rowCount != null ? `${fmt(rowCount)} строк` : ''
  const fullCaption = rowsLabel ? `${caption} · ${rowsLabel}` : caption

  if (rowCount === 0) {
    return (
      <div className="view-profile">
        <div className="psub">{caption}</div>
        <p className="result-empty">таблица пуста · 0 строк</p>
      </div>
    )
  }

  return (
    <div className="view-profile">
      <div className="psub">{fullCaption}</div>
      <div className="pgrid">
        {profiles.map((c) => (
          <ProfileCard col={c} key={c.name} />
        ))}
      </div>
    </div>
  )
}
