import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { arrowToRows } from '../core/arrowToRows'
import {
  buildMaterializeDDL,
  buildNullLossQuery,
  interpretNullLoss,
} from '../core/castBuilder'
import type { ColumnConfig } from '../core/schemaTypes'
import { rawTableName } from '../core/sql'
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

// 4 data rows: revenue uses a comma decimal, signup has bad dates,
// the 'NA' token marks intentional NULLs.
const DIRTY =
  'id,revenue,signup\n' +
  '1,"1234,50",2024-01-15\n' +
  '2,"NA",2024-02-30\n' + // 2024-02-30 is not a real date -> cast loss
  '3,"99,9",2024-03-01\n' +
  '4,"12,00",bad\n' // 'bad' -> cast loss

describe('dirty CSV: raw baseline -> typed materialization -> N->NULL losses', () => {
  it('loads raw all_varchar + typed copy on csv load', async () => {
    await client.registerFile('dirty.csv', new TextEncoder().encode(DIRTY))
    await client.loadCsvAllVarchar('dirty.csv', 'dirty')

    // raw table is all VARCHAR
    const raw = await client.describeTable(rawTableName('dirty'))
    expect(raw.every((c) => c.type === 'VARCHAR')).toBe(true)
    // typed table baseline is the same all_varchar copy
    const typed = await client.describeTable('dirty')
    expect(typed.map((c) => c.name)).toEqual(['id', 'revenue', 'signup'])
    expect(typed.every((c) => c.type === 'VARCHAR')).toBe(true)
  })

  it('materializes typed columns and counts cast losses honestly', async () => {
    const cfgs: ColumnConfig[] = [
      { origName: 'id', name: 'id', type: 'BIGINT', include: true },
      {
        origName: 'revenue',
        name: 'revenue',
        type: 'DOUBLE',
        include: true,
        decimalSep: ',',
        nullToken: 'NA',
      },
      {
        origName: 'signup',
        name: 'signup',
        type: 'DATE',
        include: true,
      },
    ]

    await client.exec(buildMaterializeDDL('dirty', rawTableName('dirty'), cfgs))

    const typed = await client.describeTable('dirty')
    expect(typed).toEqual([
      { name: 'id', type: 'BIGINT' },
      { name: 'revenue', type: 'DOUBLE' },
      { name: 'signup', type: 'DATE' },
    ])

    const loss = buildNullLossQuery(rawTableName('dirty'), cfgs)
    const row = arrowToRows(await client.query(loss.sql)).rows[0]
    const losses = interpretNullLoss(row, loss.columns)
    // id: all valid -> 0; revenue: 'NA' excluded as token -> 0 loss;
    // signup: 2024-02-30 and 'bad' fail -> 2 lost.
    expect(losses).toEqual({ id: 0, revenue: 0, signup: 2 })
  })

  it('exposes the inferred (native) schema via sniffCsv', async () => {
    const inferred = arrowToRows(await client.sniffCsv('dirty.csv'))
    expect(inferred.rows.map((r) => String(r.column_name))).toEqual([
      'id',
      'revenue',
      'signup',
    ])
  })
})
