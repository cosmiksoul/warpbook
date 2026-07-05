// scripts/prepSamples.mjs — one-off: скачивает и готовит сэмплы витрины M9.
// Run: `node scripts/prepSamples.mjs`. Committed for reproducibility.
// penguins: NA -> пустое поле (иначе read_csv_auto отдал бы VARCHAR-колонки);
// taxi: reservoir-сэмпл 20k строк января-2024 с фиксированным сидом.
import * as duckdb from '@duckdb/duckdb-wasm'
import { createRequire } from 'node:module'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { Worker } from 'node:worker_threads'

const require = createRequire(import.meta.url)

async function createNodeDuckDB() {
  const distDir = path.dirname(require.resolve('@duckdb/duckdb-wasm'))
  const wasmPath = path.resolve(distDir, 'duckdb-eh.wasm')
  const workerPath = path.resolve(distDir, 'duckdb-node-eh.worker.cjs')
  const nodeCjsPath = path.resolve(distDir, 'duckdb-node.cjs')
  const nodeWorker = new Worker(nodeCjsPath, {
    workerData: { mod: workerPath, name: 'duckdb', type: 'classic' },
  })
  const listeners = {}
  const workerShim = {
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn) },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn) },
    postMessage(data, transfer) { nodeWorker.postMessage(data, transfer) },
    terminate() { return nodeWorker.terminate() },
  }
  nodeWorker.on('message', (data) => (listeners['message'] ?? []).forEach((fn) => fn({ data, type: 'message' })))
  nodeWorker.on('error', (err) => (listeners['error'] ?? []).forEach((fn) => fn(err)))
  nodeWorker.on('exit', () => (listeners['close'] ?? []).forEach((fn) => fn({})))
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), workerShim)
  await db.instantiate(wasmPath, null)
  return db
}

async function download(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

fs.mkdirSync('public/samples', { recursive: true })

// --- penguins: NA -> '' (только целые поля; в файле нет квотированных запятых)
const penguinsRaw = new TextDecoder().decode(
  await download('https://raw.githubusercontent.com/allisonhorst/palmerpenguins/main/inst/extdata/penguins.csv'),
)
const penguins = penguinsRaw
  .split('\n')
  .map((line, i) => (i === 0 ? line : line.split(',').map((f) => (f === 'NA' ? '' : f)).join(',')))
  .join('\n')
fs.writeFileSync('public/samples/penguins.csv', penguins)
console.log('penguins.csv:', penguins.split('\n').filter(Boolean).length - 1, 'rows,',
  fs.statSync('public/samples/penguins.csv').size, 'bytes')

// --- titanic: как есть (квотированные имена с запятыми — не трогаем)
const titanic = await download('https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv')
fs.writeFileSync('public/samples/titanic.csv', titanic)
console.log('titanic.csv:', fs.statSync('public/samples/titanic.csv').size, 'bytes')

// --- taxi: январь-2024, 8 колонок, reservoir 20k, детерминированный сид
const tripdata = await download('https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_2024-01.parquet')
console.log('yellow_tripdata_2024-01.parquet:', tripdata.length, 'bytes downloaded')
const db = await createNodeDuckDB()
await db.registerFileBuffer('trip.parquet', tripdata)
const conn = await db.connect()
await conn.query(
  `COPY (
     SELECT tpep_pickup_datetime, tpep_dropoff_datetime, passenger_count,
            trip_distance, payment_type, fare_amount, tip_amount, total_amount
     FROM read_parquet('trip.parquet')
     WHERE tpep_pickup_datetime >= TIMESTAMP '2024-01-01'
       AND tpep_pickup_datetime <  TIMESTAMP '2024-02-01'
       AND total_amount BETWEEN 0 AND 500
     USING SAMPLE 20000 ROWS (reservoir, 42)
   ) TO 'taxi.parquet' (FORMAT PARQUET)`,
)
const described = await conn.query(`DESCRIBE SELECT * FROM read_parquet('taxi.parquet')`)
console.log('taxi columns:', described.toArray().map((r) => `${r.column_name}:${r.column_type}`).join(', '))
await conn.close()
const buf = await db.copyFileToBuffer('taxi.parquet')
fs.writeFileSync('public/samples/taxi.parquet', buf)
await db.terminate()
console.log('taxi.parquet:', buf.length, 'bytes')
