import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { arrowToRows } from '../core/arrowToRows'
import { buildSelectStar } from '../core/sql'
import { createClient, type DuckDBClient } from './duckdbClient'
import { createNodeDuckDB } from './nodeDuckDB'

let db: AsyncDuckDB
let client: DuckDBClient

beforeAll(async () => {
  db = await createNodeDuckDB()
  client = createClient(db)
})

afterAll(async () => {
  await db.terminate()
})

describe('DuckDB client (node integration)', () => {
  it('loads a CSV as an all-VARCHAR table and queries it', async () => {
    const csv = 'country,n\nDE,12840\nPL,9610\n'
    await client.registerFile('events.csv', new TextEncoder().encode(csv))
    await client.loadCsvAllVarchar('events.csv', 'events')

    const result = arrowToRows(await client.query(buildSelectStar('events')))
    expect(result.numRows).toBe(2)
    expect(result.rows).toEqual([
      { country: 'DE', n: '12840' }, // all_varchar => numeric-looking stays a STRING
      { country: 'PL', n: '9610' },
    ])
  })

  it('describes a table with DuckDB type names', async () => {
    const cols = await client.describeTable('events')
    expect(cols.map((c) => c.name)).toEqual(['country', 'n'])
    // all_varchar baseline => both columns are VARCHAR
    expect(cols.every((c) => c.type === 'VARCHAR')).toBe(true)
  })

  it('joins a CSV and a Parquet across one in-memory DB', async () => {
    // Build a tiny Parquet in DuckDB itself, export bytes, re-register it.
    const conn = await db.connect()
    await conn.query(
      `COPY (SELECT 'DE' AS country, 'Germany' AS label) TO 'labels.parquet' (FORMAT parquet)`,
    )
    await conn.close()
    const buf = await db.copyFileToBuffer('labels.parquet')
    await client.registerFile('labels2.parquet', buf)
    await client.loadParquet('labels2.parquet', 'labels')

    const result = arrowToRows(
      await client.query(
        `SELECT e.country, l.label, e.n FROM "events" e JOIN "labels" l ON e.country = l.country`,
      ),
    )
    expect(result.rows).toEqual([{ country: 'DE', label: 'Germany', n: '12840' }])
  })
})
