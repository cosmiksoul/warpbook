import { HISTOGRAM_BINS, TOP_K } from './profile'
import { quoteIdent, quoteLiteral } from './sql'

/** Максимум пер-колоночных ячеек в черновике (null-карта не считается). */
export const PROFILE_CELL_CAP = 8

/**
 * Null-карта таблицы long-формой: по строке на колонку (имя, счётчик null, %),
 * сортировка «худшие сверху». greatest(count,1) — guard деления на 0 строк.
 */
export function buildNullMapSql(table: string, columns: string[]): string {
  const t = quoteIdent(table)
  const parts = columns.map(
    (c) =>
      `SELECT ${quoteLiteral(c)} AS "колонка", ` +
      `count(*) FILTER (WHERE ${quoteIdent(c)} IS NULL) AS "null", ` +
      `round(100.0 * count(*) FILTER (WHERE ${quoteIdent(c)} IS NULL) / greatest(count(*), 1), 1) AS "%" ` +
      `FROM ${t}`,
  )
  return `SELECT * FROM (\n  ${parts.join('\n  UNION ALL\n  ')}\n) ORDER BY "null" DESC, "колонка"`
}

/**
 * Гистограмма ячейкой: САМОДОСТАТОЧНЫЙ SQL — min/max берутся CTE, не зашиты
 * константами (ячейка переживает смену данных и редактируется). Лейбл бакета —
 * ::VARCHAR (нижняя граница): buildChartSpec увидит нечисловой X и включит
 * xNumericStrings → бары в порядке бакетов. ORDER BY min(col) — числовой.
 */
export function buildHistogramCellSql(table: string, col: string): string {
  const t = quoteIdent(table)
  const c = quoteIdent(col)
  const n = HISTOGRAM_BINS
  return [
    `WITH s AS (SELECT min(${c}) AS lo, max(${c}) AS hi FROM ${t} WHERE ${c} IS NOT NULL)`,
    `SELECT round(s.lo + floor(least((${c} - s.lo) / nullif(s.hi - s.lo, 0) * ${n}, ${n - 1})) * (s.hi - s.lo) / ${n}, 2)::VARCHAR AS "от",`,
    `       count(*) AS "строк"`,
    `FROM ${t}, s`,
    `WHERE ${c} IS NOT NULL`,
    `GROUP BY 1 ORDER BY min(${c})`,
  ].join('\n')
}

/** Top-K значений категориальной колонки (NULL-бакет исключён, tiebreak по значению). */
export function buildTopKSql(table: string, col: string): string {
  const t = quoteIdent(table)
  const c = quoteIdent(col)
  return `SELECT ${c} AS "значение", count(*) AS "строк"\nFROM ${t}\nWHERE ${c} IS NOT NULL\nGROUP BY 1 ORDER BY 2 DESC, 1 LIMIT ${TOP_K}`
}
