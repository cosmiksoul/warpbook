import { quoteIdent, quoteLiteral } from './sql'
import type { ColumnConfig } from './schemaTypes'

/**
 * Build the BARE cast expression for ONE column from the raw (all_varchar)
 * table — no alias. Every cast is TRY_CAST/try_strptime: failures become NULL,
 * never errors. Used directly inside the loss query's CASE, and wrapped with an
 * alias by buildCastExpr for the materialize SELECT list.
 */
export function buildCastValue(cfg: ColumnConfig): string {
  let v = quoteIdent(cfg.origName)
  if (cfg.nullToken != null) {
    v = `nullif(${v}, ${quoteLiteral(cfg.nullToken)})`
  }

  switch (cfg.type) {
    case 'VARCHAR':
      return v
    case 'BIGINT':
    case 'DOUBLE': {
      const num = cfg.decimalSep === ',' ? `replace(${v}, ',', '.')` : v
      return `TRY_CAST(${num} AS ${cfg.type})`
    }
    case 'DATE':
      return cfg.dateFormat
        ? `CAST(try_strptime(${v}, ${quoteLiteral(cfg.dateFormat)}) AS DATE)`
        : `TRY_CAST(${v} AS DATE)`
    case 'TIMESTAMP':
      return cfg.dateFormat
        ? `try_strptime(${v}, ${quoteLiteral(cfg.dateFormat)})`
        : `TRY_CAST(${v} AS TIMESTAMP)`
    case 'BOOLEAN':
      return `TRY_CAST(${v} AS BOOLEAN)`
  }
}

/** Bare cast expression aliased to the column's target name. */
export function buildCastExpr(cfg: ColumnConfig): string {
  return `${buildCastValue(cfg)} AS ${quoteIdent(cfg.name)}`
}

/**
 * Build the re-materialization DDL: replace the typed table with a SELECT of
 * cast expressions (included columns only, source order preserved) over the
 * immutable raw table. Throws if no column is included — an empty SELECT is
 * invalid SQL (the UI guarantees >= 1 included column).
 */
export function buildMaterializeDDL(
  table: string,
  rawTable: string,
  cfgs: ColumnConfig[],
): string {
  const included = cfgs.filter((c) => c.include)
  if (included.length === 0) {
    throw new Error('buildMaterializeDDL: at least one column must be included')
  }
  const selectList = included.map(buildCastExpr).join(', ')
  return `CREATE OR REPLACE TABLE ${quoteIdent(table)} AS SELECT ${selectList} FROM ${quoteIdent(rawTable)}`
}

/**
 * Build a single-pass query that counts, per included NON-VARCHAR column, how
 * many present raw values become NULL after the cast (the "N -> NULL" loss).
 * present := NOT NULL AND <> '' (AND <> nullToken when set: a token-NULL is an
 * intentional NULL, not a cast loss). VARCHAR columns are skipped (no cast).
 * The CASE uses buildCastValue (bare, no alias) directly — no string surgery,
 * correct for any rename target including names with embedded quotes.
 * Returns { sql: '', columns: [] } when nothing needs counting.
 */
export function buildNullLossQuery(
  rawTable: string,
  cfgs: ColumnConfig[],
): { sql: string; columns: string[] } {
  const counted = cfgs.filter((c) => c.include && c.type !== 'VARCHAR')
  if (counted.length === 0) return { sql: '', columns: [] }

  const parts = counted.map((cfg, i) => {
    const orig = quoteIdent(cfg.origName)
    let present = `${orig} IS NOT NULL AND ${orig} <> ''`
    if (cfg.nullToken != null) {
      present += ` AND ${orig} <> ${quoteLiteral(cfg.nullToken)}`
    }
    const cast = buildCastValue(cfg)
    return `sum(CASE WHEN ${present} AND (${cast}) IS NULL THEN 1 ELSE 0 END) AS l${i}`
  })

  return {
    sql: `SELECT ${parts.join(', ')} FROM ${quoteIdent(rawTable)}`,
    columns: counted.map((c) => c.name),
  }
}

/** Interpret the l0..ln result row into a { columnName: lostCount } map. */
export function interpretNullLoss(
  row: Record<string, unknown>,
  columns: string[],
): Record<string, number> {
  const out: Record<string, number> = {}
  columns.forEach((name, i) => {
    out[name] = Number(row[`l${i}`] ?? 0)
  })
  return out
}
