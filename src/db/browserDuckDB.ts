import * as duckdb from '@duckdb/duckdb-wasm'
// Vite rewrites each ?url import to a hashed asset whose final URL already
// includes `base` — no manual BASE_URL concatenation needed.
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'

// Only mvp + eh => single-threaded. NO `coi` entry => selectBundle can never
// pick the SharedArrayBuffer/threaded bundle, which GitHub Pages cannot serve
// (no COOP/COEP headers).
const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
}

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null

/**
 * Lazily instantiate ONE shared single-threaded DuckDB-WASM instance.
 * The module-level promise makes React 18/19 StrictMode double-invokes safe.
 */
export function getBrowserDuckDB(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES)
      const worker = new Worker(bundle.mainWorker!)
      const logger = new duckdb.ConsoleLogger()
      const db = new duckdb.AsyncDuckDB(logger, worker)
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
      return db
    })()
  }
  return dbPromise
}
