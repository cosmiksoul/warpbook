/** Quote a SQL identifier (double-quote, escaping embedded double-quotes). */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/** Quote a SQL string literal (single-quote, escaping embedded single-quotes). */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Build `SELECT * FROM <table> LIMIT <limit>`; table identifier is quoted. */
export function buildSelectAll(table: string, limit = 100): string {
  return `SELECT * FROM ${quoteIdent(table)} LIMIT ${limit}`
}

/** Derive a safe SQL identifier from a file name (strip extension, sanitize). */
export function tableNameFromFilename(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '') // strip last extension
  let ident = base.replace(/[^A-Za-z0-9_]/g, '_') // invalid chars -> _
  if (ident === '') return 'table'
  if (/^[0-9]/.test(ident)) ident = `_${ident}` // identifiers cannot start with a digit
  return ident
}

/** Make `desired` unique against `taken` by appending _1, _2, ... */
export function uniqueTableName(desired: string, taken: string[]): string {
  if (!taken.includes(desired)) return desired
  let i = 1
  while (taken.includes(`${desired}_${i}`)) i++
  return `${desired}_${i}`
}

/** `SELECT * FROM <table>` (unbounded) — the seed query for a dataset tab. */
export function buildSelectStar(table: string): string {
  return `SELECT * FROM ${quoteIdent(table)}`
}

/** DDL: materialize a registered CSV as an all-VARCHAR baseline table. */
export function buildLoadCsv(virtualFile: string, table: string): string {
  return `CREATE OR REPLACE TABLE ${quoteIdent(table)} AS SELECT * FROM read_csv_auto(${quoteLiteral(virtualFile)}, all_varchar = true)`
}

/** DDL: materialize a registered Parquet file as a typed table. */
export function buildLoadParquet(virtualFile: string, table: string): string {
  return `CREATE OR REPLACE TABLE ${quoteIdent(table)} AS SELECT * FROM read_parquet(${quoteLiteral(virtualFile)})`
}

/** Introspection: DuckDB DESCRIBE gives DuckDB type names (VARCHAR, DATE, ...). */
export function buildDescribe(table: string): string {
  return `DESCRIBE ${quoteIdent(table)}`
}

/** Reset helper: drop a table if present. */
export function buildDropTable(table: string): string {
  return `DROP TABLE IF EXISTS ${quoteIdent(table)}`
}
