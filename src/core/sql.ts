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
