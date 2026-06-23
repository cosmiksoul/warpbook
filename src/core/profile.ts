/** How a column is profiled (drives which card body renders). */
export type ColumnKind = 'numeric' | 'categorical' | 'range' | 'highCardinality'

/** A categorical column profiles into at most TOP_K top values (with bars). */
export interface TopValue {
  value: string // string rendering (boolean -> 'true'/'false'); null bucket excluded
  count: number
  frac: number // count / max(count) in the set -> bar width 0..1
}

/** One equi-width numeric histogram bin. */
export interface HistogramBin {
  lo: number
  hi: number
  count: number
}

/** The full per-column profile rendered by a ProfileCard. */
export interface ColumnProfile {
  name: string
  type: string // DuckDB column_type verbatim (badge)
  distinct: number // approx_unique
  nullCount: number
  kind: ColumnKind
  // categorical (incl. boolean):
  top?: TopValue[]
  moreDistinct?: number // distinct - top.length, for "+N ещё"
  // numeric:
  histogram?: HistogramBin[]
  stats?: { min: number; median: number; max: number }
  // range (date/timestamp/time):
  range?: { min: string; median: string; max: string }
}

/** Distinct-count threshold: VARCHAR with approx_unique <= this is categorical. */
export const THRESHOLD_DISTINCT = 50
/** How many top values a categorical card shows. */
export const TOP_K = 7
/** Equi-width bins for a numeric histogram. */
export const HISTOGRAM_BINS = 12

/**
 * Classify a column from its DuckDB type + approx distinct count. numeric ->
 * histogram + min/median/max; boolean/low-card VARCHAR -> categorical top
 * values; high-card VARCHAR/other -> highCardinality (distinct + null only);
 * date/timestamp/time -> range (min/median/max only, no binning in v1).
 */
export function classifyColumn(
  columnType: string,
  approxUnique: number,
  threshold: number,
): ColumnKind {
  const t = columnType.toUpperCase()
  if (
    /^(BIGINT|INTEGER|INT|SMALLINT|TINYINT|HUGEINT|UBIGINT|UINTEGER|USMALLINT|UTINYINT|UHUGEINT|DOUBLE|FLOAT|REAL|DECIMAL|NUMERIC)\b/.test(
      t,
    )
  )
    return 'numeric'
  if (/^BOOL/.test(t)) return 'categorical'
  if (/^(DATE|TIMESTAMP|TIME)\b/.test(t)) return 'range'
  if (/^VARCHAR\b/.test(t)) {
    return approxUnique <= threshold ? 'categorical' : 'highCardinality'
  }
  return 'highCardinality'
}
