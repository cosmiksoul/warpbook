import type { QueryResult, ResultColumn } from './arrowToRows'

/** The six target types quackbook can cast a column to. */
export type ColType =
  | 'VARCHAR'
  | 'BIGINT'
  | 'DOUBLE'
  | 'DATE'
  | 'TIMESTAMP'
  | 'BOOLEAN'

export interface ColumnConfig {
  origName: string // name in the raw table (immutable)
  name: string // target name (rename); defaults to origName
  type: ColType
  include: boolean // false => column not emitted into the typed table
  dateFormat?: string // strptime pattern for DATE/TIMESTAMP (optional)
  decimalSep?: ',' // ',' => decimal comma (for BIGINT/DOUBLE)
  nullToken?: string // string value treated as NULL
}

/** Map a DuckDB type name into quackbook's six-type set (fallback VARCHAR). */
export function mapDuckDBType(duckType: string): ColType {
  const t = duckType.toUpperCase()
  if (/^(BIGINT|INTEGER|INT|SMALLINT|TINYINT|HUGEINT|UBIGINT|UINTEGER|USMALLINT|UTINYINT)\b/.test(t))
    return 'BIGINT'
  if (/^(DOUBLE|FLOAT|REAL|DECIMAL|NUMERIC)\b/.test(t)) return 'DOUBLE'
  if (/^DATE\b/.test(t)) return 'DATE'
  if (/^TIMESTAMP\b/.test(t)) return 'TIMESTAMP'
  if (/^BOOL/.test(t)) return 'BOOLEAN'
  return 'VARCHAR'
}

/** Parse a DESCRIBE-shaped result (column_name/column_type) into typed columns. */
export function parseInferredColumns(
  result: QueryResult,
): { name: string; type: ColType }[] {
  return result.rows.map((r) => ({
    name: String(r.column_name),
    type: mapDuckDBType(String(r.column_type)),
  }))
}

/** Turn inferred {name,type} into a full editable ColumnConfig per column. */
export function suggestTypes(
  inferred: { name: string; type: ColType }[],
): ColumnConfig[] {
  return inferred.map((c) => ({
    origName: c.name,
    name: c.name,
    type: c.type,
    include: true,
  }))
}

/** Baseline config: every column stays VARCHAR (the untyped M1 state). */
export function baselineConfig(columns: ResultColumn[]): ColumnConfig[] {
  return columns.map((c) => ({
    origName: c.name,
    name: c.name,
    type: 'VARCHAR' as ColType,
    include: true,
  }))
}
