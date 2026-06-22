import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import type { Table } from 'apache-arrow'
import { arrowToRows, type ResultColumn } from '../core/arrowToRows'
import { buildDescribe, buildLoadCsv, buildLoadParquet } from '../core/sql'

export interface DuckDBClient {
  /** Register raw file bytes under a virtual filename DuckDB can read. */
  registerFile(name: string, data: Uint8Array): Promise<void>
  /** Materialize a registered CSV as an all-VARCHAR baseline table. */
  loadCsvAllVarchar(virtualName: string, tableName: string): Promise<void>
  /** Materialize a registered Parquet file as a typed table. */
  loadParquet(virtualName: string, tableName: string): Promise<void>
  /** Column names + DuckDB type names for a loaded table. */
  describeTable(tableName: string): Promise<ResultColumn[]>
  /** Run a query and return the Arrow result table. */
  query(sql: string): Promise<Table>
}

export function createClient(db: AsyncDuckDB): DuckDBClient {
  async function run(sql: string): Promise<Table> {
    const conn = await db.connect()
    try {
      return await conn.query(sql)
    } finally {
      await conn.close()
    }
  }

  return {
    async registerFile(name, data) {
      await db.registerFileBuffer(name, data)
    },
    async loadCsvAllVarchar(virtualName, tableName) {
      await run(buildLoadCsv(virtualName, tableName))
    },
    async loadParquet(virtualName, tableName) {
      await run(buildLoadParquet(virtualName, tableName))
    },
    async describeTable(tableName) {
      const result = arrowToRows(await run(buildDescribe(tableName)))
      return result.rows.map((r) => ({
        name: String(r.column_name),
        type: String(r.column_type),
      }))
    },
    query: run,
  }
}
