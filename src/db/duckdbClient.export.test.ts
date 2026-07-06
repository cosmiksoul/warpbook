import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { arrowToRows } from '../core/arrowToRows'
import { createClient, type DuckDBClient } from './duckdbClient'
import { createNodeDuckDB } from './nodeDuckDB'

let db: AsyncDuckDB
let client: DuckDBClient

beforeAll(async () => {
  db = await createNodeDuckDB()
  client = createClient(db)
  await client.exec(`CREATE OR REPLACE TABLE t AS SELECT * FROM (VALUES (1,'a'),(2,'b'),(3,'c')) v(n, label)`)
})
afterAll(async () => { await db.terminate() })

describe('exportQuery', () => {
  it('exports CSV with header + rows (and tolerates a trailing semicolon)', async () => {
    const bytes = await client.exportQuery('SELECT * FROM t ORDER BY n;', 'csv')
    const text = new TextDecoder().decode(bytes)
    expect(text.split('\n')[0].trim()).toBe('n,label')
    expect(text).toContain('1,a')
    expect(text).toContain('3,c')
  })

  it('exports valid, re-readable Parquet', async () => {
    const bytes = await client.exportQuery('SELECT * FROM t', 'parquet')
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('PAR1')
    await client.registerFile('rt.parquet', bytes)
    await client.loadParquet('rt.parquet', 'rt')
    const c = arrowToRows(await client.query('SELECT count(*) AS c FROM rt')).rows[0].c
    expect(Number(c)).toBe(3)
  })

  it('параллельные экспорты не коллидируют по виртуальному файлу', async () => {
    const [a, b] = await Promise.all([
      client.exportQuery('SELECT 1 AS x', 'csv'),
      client.exportQuery('SELECT 2 AS x', 'csv'),
    ])
    expect(new TextDecoder().decode(a)).toContain('1')
    expect(new TextDecoder().decode(b)).toContain('2')
  })
})
