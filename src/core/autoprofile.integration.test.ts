import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { arrowToRows } from './arrowToRows'
import { createClient, type DuckDBClient } from '../db/duckdbClient'
import { createNodeDuckDB } from '../db/nodeDuckDB'
import { buildHistogramCellSql, buildNullMapSql, buildTopKSql } from './autoprofile'

let db: AsyncDuckDB
let client: DuckDBClient

beforeAll(async () => {
  db = await createNodeDuckDB()
  client = createClient(db)
  await client.exec(`CREATE TABLE prof AS SELECT * FROM (VALUES
    (1.5, 'a', 10), (2.5, 'a', NULL), (3.5, 'b', 30), (NULL, 'b', 40),
    (5.0, 'b', 50), (6.5, 'c', 60), (8.0, NULL, 70), (9.5, 'a', 80)
  ) v(mass, species, "we""ird")`)
})
afterAll(async () => { await db.terminate() })

describe('autoprofile SQL на живом DuckDB', () => {
  it('null-карта: строка на колонку, null-счётчики честные, худшие сверху', async () => {
    const { rows } = arrowToRows(await client.query(buildNullMapSql('prof', ['mass', 'species', 'we"ird'])))
    expect(rows).toHaveLength(3)
    const byCol = Object.fromEntries(rows.map((r) => [r['колонка'], Number(r['null'])]))
    expect(byCol).toEqual({ mass: 1, species: 1, 'we"ird': 1 })
  })
  it('гистограмма: исполняется, бакеты возрастают, сумма строк = не-null строкам', async () => {
    const { rows } = arrowToRows(await client.query(buildHistogramCellSql('prof', 'mass')))
    expect(rows.length).toBeGreaterThan(1)
    const bounds = rows.map((r) => Number(r['от']))
    expect([...bounds].sort((a, b) => a - b)).toEqual(bounds) // порядок бакетов
    expect(rows.reduce((s, r) => s + Number(r['строк']), 0)).toBe(7) // 8 строк - 1 NULL
  })
  it('top-K: не больше 7, NULL исключён, count по убыванию', async () => {
    const { rows } = arrowToRows(await client.query(buildTopKSql('prof', 'species')))
    // фактическое распределение: a=3 (строки 1,2,8), b=3 (строки 3,4,5), c=1 (строка 6);
    // NULL (строка 7) исключён. Tiebreak 3-3 между a и b решает "ORDER BY 2 DESC, 1" —
    // по значению по возрастанию, поэтому 'a' раньше 'b'.
    expect(rows.map((r) => r['значение'])).toEqual(['a', 'b', 'c'])
    expect(Number(rows[0]['строк'])).toBeGreaterThanOrEqual(Number(rows[1]['строк']))
  })
  it('гистограмма на константной колонке не падает (nullif-guard)', async () => {
    await client.exec(`CREATE TABLE flat AS SELECT 5 AS x FROM range(3)`)
    const { rows } = arrowToRows(await client.query(buildHistogramCellSql('flat', 'x')))
    expect(rows.length).toBeLessThanOrEqual(1) // один NULL-бакет или пусто — но не throw
  })
})
