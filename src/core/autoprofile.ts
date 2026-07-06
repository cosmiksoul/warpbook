import type { ColumnProfile } from './profile'
import { HISTOGRAM_BINS, TOP_K, THRESHOLD_DISTINCT } from './profile'
import type { TextBlock, WidgetBlock } from './report'
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

/** Блок без id: id минтит стор (appendBlocks) — генератор чистый. */
export type DraftBlock = Omit<TextBlock, 'id'> | Omit<WidgetBlock, 'id'>

function isEligible(c: ColumnProfile): boolean {
  if (c.kind === 'numeric') return c.stats != null && c.stats.min < c.stats.max
  if (c.kind === 'categorical') return c.distinct >= 2 && c.distinct <= THRESHOLD_DISTINCT
  return false // range, highCardinality
}

function skipReason(c: ColumnProfile): string {
  if (c.kind === 'highCardinality') return 'высокая кардинальность'
  if (c.kind === 'range') return 'дата/время'
  if (c.kind === 'numeric') return 'нет размаха значений'
  return 'одно значение'
}

/**
 * Черновик профиля: заголовок -> null-карта (всегда) -> по элигибельным колонкам
 * (порядок схемы, ≤ PROFILE_CELL_CAP) гистограмма или top-K -> хвост «без своей
 * ячейки» с причинами (за капом / причина неэлигибельности).
 */
export function buildProfileDraft(input: {
  table: string
  fileName: string
  rowCount: number
  columns: ColumnProfile[]
}): DraftBlock[] {
  const { table, fileName, rowCount, columns } = input
  const blocks: DraftBlock[] = [
    {
      type: 'text',
      markdown: `## Профиль: ${fileName}\n\n\`${table}\` · ${rowCount} строк · ${columns.length} колонок`,
    },
    {
      type: 'widget',
      title: 'null-карта',
      sql: buildNullMapSql(table, columns.map((c) => c.name)),
      datasetNames: [table],
      vizType: 'table',
      caption: '',
    },
  ]

  const eligible = columns.filter(isEligible)
  const picked = new Set(eligible.slice(0, PROFILE_CELL_CAP))
  for (const c of picked) {
    blocks.push(
      c.kind === 'numeric'
        ? { type: 'widget', title: `${c.name} — распределение`, sql: buildHistogramCellSql(table, c.name), datasetNames: [table], vizType: 'chart', caption: '' }
        : { type: 'widget', title: `${c.name} — топ значений`, sql: buildTopKSql(table, c.name), datasetNames: [table], vizType: 'chart', caption: '' },
    )
  }

  const left = columns.filter((c) => !picked.has(c))
  if (left.length > 0) {
    const items = left.map((c) => `\`${c.name}\` (${eligible.includes(c) ? 'за капом' : skipReason(c)})`)
    blocks.push({ type: 'text', markdown: `Без своей ячейки остались: ${items.join(', ')}.` })
  }
  return blocks
}
