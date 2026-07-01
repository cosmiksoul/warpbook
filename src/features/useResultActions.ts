import { arrowToRows, type ResultColumn } from '../core/arrowToRows'
import { buildResultTempDDL, buildDropTable, resultTempName } from '../core/sql'
import { buildWindowSql, buildCountSql, DEFAULT_VIEW } from '../core/resultQuery'
import type { DuckDBClient } from '../db/duckdbClient'
import { useSession } from '../state/session'

export function useResultActions(client: DuckDBClient) {
  async function countMatches(table: string, columns: string[], view = DEFAULT_VIEW): Promise<number> {
    const rows = arrowToRows(await client.query(buildCountSql(table, columns, view))).rows
    return Number(rows[0]?.n ?? 0)
  }

  // Materialize the result snapshot, count, load page 1. Non-SELECT -> raw fallback.
  async function runQuery(tabId: string, sql: string): Promise<void> {
    const seq = useSession.getState().nextWindowSeq()
    const t0 = performance.now()
    const table = resultTempName(tabId)
    try {
      await client.exec(buildResultTempDDL(tabId, sql))
    } catch {
      // Not materializable (non-SELECT: PRAGMA/EXPLAIN/DDL) -> current direct path.
      try {
        const raw = arrowToRows(await client.query(sql))
        if (useSession.getState().nextWindowSeq() >= seq) useSession.getState().setRawResult(tabId, raw, performance.now() - t0)
      } catch (e) {
        useSession.getState().setTabError(tabId, String(e))
      }
      return
    }
    try {
      const columns: ResultColumn[] = await client.describeTable(table)
      const rowCount = await countMatches(table, columns.map((c) => c.name))
      useSession.getState().setResultMeta(tabId, { columns, rowCount, ms: performance.now() - t0 })
      await fetchWindow(tabId, seq)
    } catch (e) {
      useSession.getState().setTabError(tabId, String(e))
    }
  }

  // Fetch the current page window for a tab's view; recount when filters/search set.
  async function fetchWindow(tabId: string, seqIn?: number): Promise<void> {
    const st = useSession.getState()
    const tab = st.tabs.find((t) => t.id === tabId)
    if (!tab || tab.mode !== 'paged' || !tab.columns) return
    const seq = seqIn ?? st.nextWindowSeq()
    const table = resultTempName(tabId)
    const cols = tab.columns.map((c) => c.name)
    const view = tab.view ?? DEFAULT_VIEW
    st.setWindowLoading(tabId, true)
    try {
      const hasFilter = view.search.trim() !== '' || view.filters.length > 0
      const rowCount = hasFilter ? await countMatches(table, cols, view) : (tab.meta?.rows ?? tab.rowCount)
      const win = arrowToRows(await client.query(buildWindowSql(table, cols, view)))
      // latest-wins: only apply if no newer fetch started
      if ((useSession.getState().tabs.find((t) => t.id === tabId)?.windowSeq ?? 0) <= seq) {
        useSession.setState((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, windowSeq: seq } : t)) }))
        useSession.getState().setWindow(tabId, win, { rowCount })
      }
    } catch (e) {
      useSession.getState().setTabError(tabId, String(e))
    }
  }

  async function dropResult(tabId: string): Promise<void> {
    try { await client.exec(buildDropTable(resultTempName(tabId))) } catch { /* fire-and-forget */ }
  }

  return { runQuery, fetchWindow, dropResult }
}
