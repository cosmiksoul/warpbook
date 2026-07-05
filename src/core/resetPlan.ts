import { buildDropTable, rawTableName, resultTempName } from './sql'
import { buildDropMart, type MartKind } from './mart'

interface ResetDataset {
  table: string
  kind: 'csv' | 'parquet' | MartKind
}

/**
 * DROP-ы одного датасета: таблица файла (+ immutable raw для csv), витрина —
 * своим DROP (VIEW нельзя дропнуть как TABLE). Каждый statement идемпотентен
 * (IF EXISTS). Используется Reset-ом и удалением источника из рейла.
 */
export function buildDropDatasetStatements(d: ResetDataset): string[] {
  if (d.kind === 'view' || d.kind === 'table') return [buildDropMart(d.table, d.kind)]
  const stmts = [buildDropTable(d.table)]
  if (d.kind === 'csv') stmts.push(buildDropTable(rawTableName(d.table)))
  return stmts
}

/**
 * Полная очистка каталога DuckDB на Reset: все датасеты + материализованные
 * снапшоты результатов всех открытых табов.
 */
export function buildResetStatements(datasets: ResetDataset[], tabIds: string[]): string[] {
  const stmts = datasets.flatMap(buildDropDatasetStatements)
  for (const id of tabIds) stmts.push(buildDropTable(resultTempName(id)))
  return stmts
}
