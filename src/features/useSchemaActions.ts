import { arrowToRows } from '../core/arrowToRows'
import {
  buildMaterializeDDL,
  buildNullLossQuery,
  interpretNullLoss,
} from '../core/castBuilder'
import { suggestTypes } from '../core/schemaTypes'
import type { DuckDBClient } from '../db/duckdbClient'
import { useSession } from '../state/session'

/**
 * Apply orchestration for CSV schema typing. The store stays pure (no db
 * calls); all side effects live here: build DDL -> exec -> loss query ->
 * describe -> setApplied. Any DuckDB error is routed to the rail via
 * setSchemaError (spec line 144), not thrown. "типы" (applyInferred) =
 * setColumnConfig(suggested) then apply.
 */
export function useSchemaActions(client: DuckDBClient) {
  async function apply(table: string): Promise<void> {
    const ds = useSession.getState().datasets.find((d) => d.table === table)
    if (!ds || ds.kind !== 'csv' || !ds.rawTable || !ds.schemaConfig) return
    try {
      // 1. re-materialize the typed table from the immutable raw table.
      await client.exec(buildMaterializeDDL(table, ds.rawTable, ds.schemaConfig))

      // 2. count N -> NULL losses in one pass (skip when nothing to count).
      const loss = buildNullLossQuery(ds.rawTable, ds.schemaConfig)
      let losses: Record<string, number> = {}
      if (loss.sql) {
        const row = arrowToRows(await client.query(loss.sql)).rows[0] ?? {}
        losses = interpretNullLoss(row, loss.columns)
      }

      // 3. read back the applied schema + commit to the store.
      const columns = await client.describeTable(table)
      useSession.getState().setApplied(table, columns, losses)
    } catch (e) {
      useSession.getState().setSchemaError(table, String(e))
    }
  }

  async function applyInferred(table: string): Promise<void> {
    const ds = useSession.getState().datasets.find((d) => d.table === table)
    if (!ds || !ds.suggested || ds.suggested.length === 0) return
    useSession.getState().setColumnConfig(table, suggestTypes(ds.suggested))
    await apply(table)
  }

  return { apply, applyInferred }
}
