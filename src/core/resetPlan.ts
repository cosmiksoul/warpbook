import { buildDropTable, rawTableName, resultTempName } from './sql'
import { buildDropMart, type MartKind } from './mart'

interface ResetDataset {
  table: string
  kind: 'csv' | 'parquet' | MartKind
}

/**
 * Полная очистка каталога DuckDB на Reset: таблицы файлов (+ immutable raw для
 * csv), витрины — своим DROP (VIEW нельзя дропнуть как TABLE), и материализованные
 * снапшоты результатов всех открытых табов. Каждый statement идемпотентен (IF EXISTS).
 */
export function buildResetStatements(datasets: ResetDataset[], tabIds: string[]): string[] {
  const stmts: string[] = []
  for (const d of datasets) {
    if (d.kind === 'view' || d.kind === 'table') {
      stmts.push(buildDropMart(d.table, d.kind))
    } else {
      stmts.push(buildDropTable(d.table))
      if (d.kind === 'csv') stmts.push(buildDropTable(rawTableName(d.table)))
    }
  }
  for (const id of tabIds) stmts.push(buildDropTable(resultTempName(id)))
  return stmts
}
