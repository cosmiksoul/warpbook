import type { ColumnProfile } from '../core/profile'

/** Compact number formatting: 12840 -> "12 840" (narrow no-break space). */
function fmt(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n)
}

/** A numeric stat is shown as the value when finite, else an em-dash placeholder. */
function stat(n: number): string {
  return Number.isFinite(n) ? String(n) : '—'
}

export function ProfileCard({ col }: { col: ColumnProfile }) {
  const hasNull = col.nullCount > 0
  // An all-null numeric has neither stats nor histogram (spec line 93).
  const allNullNumeric = col.kind === 'numeric' && !col.stats
  return (
    <div className="pcard">
      <div className="pc-head">
        <span className="pc-name">{col.name}</span>
        <span className="pc-type">{col.type}</span>
        <span className={hasNull ? 'pc-distinct pc-null' : 'pc-distinct'}>
          {hasNull ? `null · ${fmt(col.nullCount)}` : `${fmt(col.distinct)} distinct`}
        </span>
      </div>
      <div className="pc-rows">
        {col.kind === 'categorical' && col.top && (
          <>
            {col.top.map((t) => (
              <div className="pc-row" key={t.value}>
                <span className="pv" title={t.value}>{t.value}</span>
                <div className="pt">
                  <div className="pf" style={{ width: `${Math.round(t.frac * 100)}%` }} />
                </div>
                <span className="pn">{fmt(t.count)}</span>
              </div>
            ))}
            {col.moreDistinct != null && col.moreDistinct > 0 && (
              <div className="pc-more">+{fmt(col.moreDistinct)} ещё</div>
            )}
          </>
        )}

        {col.kind === 'numeric' && (
          <>
            {col.histogram && col.histogram.length > 0 && (
              <Histo bins={col.histogram.map((b) => b.count)} />
            )}
            {col.stats && (
              <div className="pstats">
                <span><span className="k">min</span> {stat(col.stats.min)}</span>
                <span><span className="k">median</span> {stat(col.stats.median)}</span>
                <span><span className="k">max</span> {stat(col.stats.max)}</span>
              </div>
            )}
            {allNullNumeric && <div className="pc-more">все значения NULL</div>}
          </>
        )}

        {col.kind === 'range' && col.range && (
          <div className="pstats">
            <span><span className="k">min</span> {col.range.min}</span>
            <span><span className="k">median</span> {col.range.median}</span>
            <span><span className="k">max</span> {col.range.max}</span>
          </div>
        )}

        {col.kind === 'highCardinality' && (
          <div className="pc-more">≈{fmt(col.distinct)} distinct · высокая кардинальность</div>
        )}
      </div>
    </div>
  )
}

/** CSS bar histogram: bar heights are counts normalized to the tallest bin. */
function Histo({ bins }: { bins: number[] }) {
  const max = Math.max(...bins, 0)
  return (
    <div className="histo">
      {bins.map((n, i) => (
        <div
          className="hb"
          key={i}
          style={{ height: `${max > 0 ? Math.max(4, Math.round((n / max) * 100)) : 4}%` }}
        />
      ))}
    </div>
  )
}
