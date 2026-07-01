import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import { createNodeDuckDB } from '../db/nodeDuckDB'
import { createClient, type DuckDBClient } from '../db/duckdbClient'
import { useSession } from '../state/session'
import { useResultActions } from './useResultActions'

let db: AsyncDuckDB
let client: DuckDBClient

beforeAll(async () => {
  db = await createNodeDuckDB()
  client = createClient(db)
  await client.exec(`CREATE OR REPLACE TABLE nums AS SELECT i AS id, i % 3 AS grp FROM range(250) t(i)`)
}, 60_000)
afterAll(async () => { await db.terminate() })
beforeEach(() => { useSession.getState().reset() })

function newTab(sql: string): string {
  const s = useSession.getState()
  s.openBlankTab()
  const id = useSession.getState().activeTabId!
  s.updateTabSql(id, sql)
  return id
}

describe('useResultActions over real DuckDB', () => {
  it('runQuery materializes, counts, and loads page 1 window', async () => {
    const { runQuery } = useResultActions(client)
    const id = newTab('SELECT * FROM nums')
    await runQuery(id, 'SELECT * FROM nums')
    const t = useSession.getState().tabs.find((x) => x.id === id)!
    expect(t.mode).toBe('paged')
    expect(t.rowCount).toBe(250)
    expect(t.window!.rows.length).toBe(50) // default page size
    expect(t.columns!.map((c) => c.name)).toEqual(['id', 'grp'])
  })

  it('fetchWindow honors page + filter (filtered count + page rows)', async () => {
    const { runQuery, fetchWindow } = useResultActions(client)
    const id = newTab('SELECT * FROM nums')
    await runQuery(id, 'SELECT * FROM nums')
    useSession.getState().patchView(id, { filters: [{ col: 'grp', type: 'number', min: 0, max: 0 }] })
    await fetchWindow(id)
    const t = useSession.getState().tabs.find((x) => x.id === id)!
    expect(t.rowCount).toBe(84) // 0,3,6,... in [0,250)
    useSession.getState().patchView(id, { page: 2, pageSize: 50 })
    await fetchWindow(id)
    expect(useSession.getState().tabs.find((x) => x.id === id)!.window!.rows.length).toBe(34) // 84-50
  })

  it('non-SELECT falls back to raw mode', async () => {
    const { runQuery } = useResultActions(client)
    const id = newTab('PRAGMA version')
    await runQuery(id, 'PRAGMA version')
    expect(useSession.getState().tabs.find((x) => x.id === id)!.mode).toBe('raw')
  })

  it('dropResult removes the result table', async () => {
    const { runQuery, dropResult } = useResultActions(client)
    const id = newTab('SELECT * FROM nums')
    await runQuery(id, 'SELECT * FROM nums')
    await dropResult(id)
    await expect(client.query(`SELECT * FROM "_qb_result_${id}"`)).rejects.toThrow()
  })

  it('filter→clear restores the unfiltered total (pager total must not be polluted)', async () => {
    const { runQuery, fetchWindow } = useResultActions(client)
    const id = newTab('SELECT * FROM nums')
    await runQuery(id, 'SELECT * FROM nums')
    // Apply filter: grp = 0 → 84 rows (0,3,6,...,249 → 84 multiples of 3 in [0,250))
    useSession.getState().patchView(id, { filters: [{ col: 'grp', type: 'number', min: 0, max: 0 }] })
    await fetchWindow(id)
    expect(useSession.getState().tabs.find((x) => x.id === id)!.rowCount).toBe(84)
    // Clear all filters — rowCount must return to the unfiltered total (250)
    useSession.getState().patchView(id, { filters: [], search: '', page: 1 })
    await fetchWindow(id)
    expect(useSession.getState().tabs.find((x) => x.id === id)!.rowCount).toBe(250)
  })
})
