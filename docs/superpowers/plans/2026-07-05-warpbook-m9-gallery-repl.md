# M9 «Витрина + REPL» — план имплементации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Порог входа в демку → ноль: витрина сэмпл-датасетов (welcome + модал из рейла), psql-история ↑/↓ и dot-команды `.tables`/`.schema`/`.help` в SQL-редакторе.

**Architecture:** Каталог сэмплов — чистые данные в `core/sampleCatalog.ts`; загрузка — обобщение существующего `loadDemoData`-пайплайна (`fetch → File → loadOneFile → addDataset → applyInferred`); история — чистый ring-буфер в core + слайс в zustand-сторе + keymap в CodeMirror; dot-команды — парсер+билдеры в core, перехват в начале `runQuery` ДО движка, вывод через существующий raw-путь (`setRawResult`).

**Tech Stack:** React 19 + TS, zustand 5, CodeMirror 6, DuckDB-WASM (`@duckdb/duckdb-wasm` 1.32.0 — не трогать), Vitest (node env).

**Спека:** `docs/superpowers/specs/2026-07-05-warpbook-m9-gallery-repl-design.md` (решения пользователя внутри).

## Global Constraints

- **0 новых npm-зависимостей.** `package.json` в диффе не меняется.
- Гейт КАЖДОЙ задачи перед коммитом: `npm test` зелёный, `npm run build` зелёный (полный type-check), `npm run lint` — 0 ошибок / 0 варнингов.
- UI-строки — русские, в нижнем регистре в духе существующего интерфейса («грузим…», «✓ загружено»).
- Имена демо-таблиц — с префиксом `demo_` (решение M8): `demo_penguins`, `demo_taxi`, `demo_titanic`.
- Цвета — только токены из `index.css` (`var(--accent)` cyan — интерактив, `var(--accent-2)` magenta — ховеры, `var(--text-dim)`/`var(--text-faint)`); без новых хардкод-хексов.
- Firewall: никакого dashboard-грида, визуального join-builder, per-cell правки, OPFS, EXPLAIN.
- Коммиты: `type(scope): описание`, в конце `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; multi-line сообщения на Windows — через bash here-doc (`git commit -F - <<'EOF' … EOF`).
- CSS-презентация тестами не покрывается (проверка глазами) — TDD только для core-логики и редьюсеров.

---

### Task 1: Данные сэмплов (`prepSamples.mjs` + артефакты + DATA-LICENSE)

⚠ Задача требует СЕТИ (скачивание исходников). По паттерну M6 Task 1 её исполняет контроллер инлайн; артефакты коммитятся, дальнейшие задачи от сети не зависят.

**Files:**
- Create: `scripts/prepSamples.mjs`
- Create: `public/samples/penguins.csv`, `public/samples/titanic.csv`, `public/samples/taxi.parquet` (артефакты скрипта)
- Modify: `DATA-LICENSE`

**Interfaces:**
- Produces: три файла в `public/samples/`; ожидаемые колонки: penguins `species,island,bill_length_mm,bill_depth_mm,flipper_length_mm,body_mass_g,sex,year`; titanic `PassengerId,Survived,Pclass,Name,Sex,Age,SibSp,Parch,Ticket,Fare,Cabin,Embarked`; taxi `tpep_pickup_datetime,tpep_dropoff_datetime,passenger_count,trip_distance,payment_type,fare_amount,tip_amount,total_amount`. Если фактические имена колонок отличаются — СТОП, обнови seed-SQL в Task 2 под факт и скажи об этом в отчёте.

- [ ] **Step 1: Написать скрипт**

```js
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
```

- [ ] **Step 2: Запустить и проверить**

Run: `node scripts/prepSamples.mjs`
Expected: penguins ~344 rows / ~13 КБ; titanic ~60 КБ; taxi ~0.3–0.7 МБ; лог `taxi columns:` показывает 8 колонок с типами (pickup/dropoff — TIMESTAMP). Если сеть недоступна — СТОП, отдай задачу контроллеру.

- [ ] **Step 3: DATA-LICENSE**

Добавить в конец `DATA-LICENSE`:

```
## public/samples/penguins.csv
Palmer Penguins (Horst, Hill, Gorman) — CC0 1.0.
https://github.com/allisonhorst/palmerpenguins (NA заменены на пустые поля).

## public/samples/titanic.csv
Классический Titanic-набор (public domain), зеркало:
https://github.com/datasciencedojo/datasets

## public/samples/taxi.parquet
NYC TLC Yellow Taxi Trip Records, январь 2024 — открытые данные NYC.
https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page
Срез: 8 колонок, reservoir-сэмпл 20 000 строк (сид 42), см. scripts/prepSamples.mjs.
```

- [ ] **Step 4: Гейт и коммит**

Run: `npm test`, `npm run build`, `npm run lint` — всё зелёное (артефакты кода не трогают).

```bash
git add scripts/prepSamples.mjs public/samples DATA-LICENSE
git commit -m "chore(samples): данные витрины M9 — penguins/titanic/taxi + prepSamples.mjs"
```

---

### Task 2: Каталог сэмплов `core/sampleCatalog.ts` (TDD)

**Files:**
- Create: `src/core/sampleCatalog.ts`
- Test: `src/core/sampleCatalog.test.ts`

**Interfaces:**
- Consumes: `tableNameFromFilename` из `./sql`, `EXAMPLE_QUERIES` из `./exampleQueries`.
- Produces: `Sample`, `SAMPLES`, `sampleTables(s)`, `sampleLoaded(s, loadedTables)` — используются Task 3/4/5.

- [ ] **Step 1: Красный тест**

```ts
// src/core/sampleCatalog.test.ts
import { describe, it, expect } from 'vitest'
import { SAMPLES, sampleLoaded, sampleTables } from './sampleCatalog'

describe('SAMPLES manifest', () => {
  it('4 записи с уникальными id, cookbook — featured и первая', () => {
    expect(SAMPLES.map((s) => s.id)).toEqual(['cookbook', 'penguins', 'taxi', 'titanic'])
    expect(new Set(SAMPLES.map((s) => s.id)).size).toBe(4)
    expect(SAMPLES[0].featured).toBe(true)
  })
  it('все таблицы demo_-префиксные', () => {
    for (const s of SAMPLES) for (const t of sampleTables(s)) expect(t).toMatch(/^demo_/)
  })
  it('каждый seed-запрос ссылается на таблицу своего сэмпла', () => {
    for (const s of SAMPLES) {
      const tables = sampleTables(s)
      for (const tab of s.seedTabs) {
        expect(tables.some((t) => tab.sql.includes(t))).toBe(true)
      }
    }
  })
  it('у каждого сэмпла есть blurb, sizeLabel и хотя бы один seed-таб', () => {
    for (const s of SAMPLES) {
      expect(s.blurb.length).toBeGreaterThan(0)
      expect(s.sizeLabel.length).toBeGreaterThan(0)
      expect(s.seedTabs.length).toBeGreaterThan(0)
    }
  })
})

describe('sampleLoaded', () => {
  const penguins = SAMPLES.find((s) => s.id === 'penguins')!
  const cookbook = SAMPLES.find((s) => s.id === 'cookbook')!
  it('true, когда все таблицы сэмпла загружены', () => {
    expect(sampleLoaded(penguins, ['demo_penguins', 'other'])).toBe(true)
  })
  it('false, когда есть не все таблицы мульти-файлового сэмпла', () => {
    expect(sampleLoaded(cookbook, ['demo_payments'])).toBe(false)
    expect(sampleLoaded(cookbook, ['demo_payments', 'demo_users'])).toBe(true)
  })
  it('регистронезависимо (каталог DuckDB case-insensitive)', () => {
    expect(sampleLoaded(penguins, ['DEMO_PENGUINS'])).toBe(true)
  })
  it('false на пустом сторе', () => {
    expect(sampleLoaded(penguins, [])).toBe(false)
  })
})
```

Run: `npx vitest run src/core/sampleCatalog.test.ts` — FAIL (модуля нет).

- [ ] **Step 2: Реализация**

```ts
// src/core/sampleCatalog.ts
import { tableNameFromFilename } from './sql'
import { EXAMPLE_QUERIES } from './exampleQueries'

export interface SampleFile { path: string; name: string } // path под BASE_URL; name задаёт имя таблицы
export interface SampleSeedTab { title: string; sql: string }
export interface Sample {
  id: 'cookbook' | 'penguins' | 'taxi' | 'titanic'
  title: string
  blurb: string
  sizeLabel: string
  files: SampleFile[]
  seedTabs: SampleSeedTab[]
  featured?: boolean
  credit?: string
}

/** Витрина демо-датасетов: cookbook (featured) + три классических сэмпла.
 *  Имена таблиц через demo_-префикс файла (решение M8). Seed-SQL написан
 *  VARCHAR-устойчиво (CAST) — работает и до применения типов. */
export const SAMPLES: Sample[] = [
  {
    id: 'cookbook',
    title: 'SQL 101: продуктовая аналитика',
    blurb: 'платежи и юзеры дейтинг-приложения из учебника — 2 готовых рецепта',
    sizeLabel: '~1.3 МБ',
    files: [
      { path: 'demo/payments.csv', name: 'demo_payments.csv' },
      { path: 'demo/users.parquet', name: 'demo_users.parquet' },
    ],
    seedTabs: EXAMPLE_QUERIES,
    featured: true,
    credit: '«SQL 101: Рецепты продуктового аналитика» · MIT',
  },
  {
    id: 'penguins',
    title: 'пингвины Палмера',
    blurb: 'три вида: клювы, ласты, масса — и честные NULL’ы для профиля',
    sizeLabel: '~13 КБ',
    files: [{ path: 'samples/penguins.csv', name: 'demo_penguins.csv' }],
    seedTabs: [
      {
        title: 'Пингвины по видам',
        sql: `SELECT species,
       count(*) AS birds,
       round(avg(CAST(body_mass_g AS DOUBLE))) AS avg_mass_g
FROM demo_penguins
GROUP BY species
ORDER BY birds DESC;`,
      },
    ],
    credit: 'palmerpenguins · CC0',
  },
  {
    id: 'taxi',
    title: 'такси Нью-Йорка',
    blurb: '20 тыс. поездок жёлтого такси, январь-2024: время, деньги, чаевые',
    sizeLabel: '~0.5 МБ',
    files: [{ path: 'samples/taxi.parquet', name: 'demo_taxi.parquet' }],
    seedTabs: [
      {
        title: 'Поездки по дням',
        sql: `SELECT strftime(CAST(tpep_pickup_datetime AS DATE), '%Y-%m-%d') AS day,
       count(*) AS trips,
       round(sum(total_amount), 2) AS revenue
FROM demo_taxi
GROUP BY day
ORDER BY day;`,
      },
    ],
    credit: 'NYC TLC · открытые данные',
  },
  {
    id: 'titanic',
    title: 'титаник',
    blurb: '891 пассажир: класс, пол, возраст — и кто выжил',
    sizeLabel: '~60 КБ',
    files: [{ path: 'samples/titanic.csv', name: 'demo_titanic.csv' }],
    seedTabs: [
      {
        title: 'Выживаемость по классам',
        sql: `SELECT Pclass AS class,
       count(*) AS passengers,
       round(100.0 * avg(CAST(Survived AS DOUBLE)), 1) AS survived_pct
FROM demo_titanic
GROUP BY Pclass
ORDER BY Pclass;`,
      },
    ],
    credit: 'классический датасет · public domain',
  },
]

/** Имена таблиц, которые даст загрузка файлов сэмпла. */
export function sampleTables(s: Sample): string[] {
  return s.files.map((f) => tableNameFromFilename(f.name))
}

/** Все таблицы сэмпла уже в сторе (регистронезависимо — как каталог DuckDB). */
export function sampleLoaded(s: Sample, loadedTables: string[]): boolean {
  const have = new Set(loadedTables.map((t) => t.toLowerCase()))
  return sampleTables(s).every((t) => have.has(t.toLowerCase()))
}
```

⚠ Если Task 1 показал другие имена колонок — поправь seed-SQL здесь (тест «ссылается на таблицу» не зависит от колонок).

- [ ] **Step 3: Зелёный + гейт**

Run: `npx vitest run src/core/sampleCatalog.test.ts` — PASS. Затем `npm test`, `npm run build`, `npm run lint`.

- [ ] **Step 4: Коммит**

```bash
git add src/core/sampleCatalog.ts src/core/sampleCatalog.test.ts
git commit -m "feat(samples): каталог витрины — SAMPLES + sampleLoaded (TDD)"
```

---

### Task 3: Загрузчик `features/sampleData.ts` (поглощает `demoData.ts`)

**Files:**
- Create: `src/features/sampleData.ts`
- Delete: `src/features/demoData.ts`
- Modify: `src/components/WelcomeScreen.tsx` (только импорты/вызовы — UI меняет Task 4)

**Interfaces:**
- Consumes: `loadOneFile` (`./loadFiles`), `SAMPLES`/`sampleLoaded`/`Sample` (`../core/sampleCatalog`), store-экшены `addDataset`/`seedTabs`/`loadReport`/`setMode`, `applyInferred` (из `useSchemaActions`, прокидывается параметром).
- Produces: `loadSample(client, applyInferred, sample)`, `seedSampleTabs(sample)`, `loadSampleReport()`, `confirmReplaceReport()`, `cookbookSample` — используются Task 4/5.

- [ ] **Step 1: Проверить потребителей**

Run: `rg -l "demoData" src`
Expected: только `src/components/WelcomeScreen.tsx`. Если всплыли другие (например, тесты) — обнови их импорты по той же схеме, что WelcomeScreen ниже, и упомяни в отчёте.

- [ ] **Step 2: Написать `sampleData.ts`**

```ts
// src/features/sampleData.ts
import { useSession } from '../state/session'
import { loadOneFile } from './loadFiles'
import { deserializeReport } from '../core/report'
import { tableNameFromFilename } from '../core/sql'
import { SAMPLES, type Sample } from '../core/sampleCatalog'
import type { DuckDBClient } from '../db/duckdbClient'

const BASE = import.meta.env.BASE_URL

export const cookbookSample: Sample = SAMPLES.find((s) => s.id === 'cookbook')!

/** Загрузить файлы сэмпла штатным пайплайном. Идемпотентно: таблица уже
 *  в сторе → файл скипается. CSV получает инференс типов. */
export async function loadSample(
  client: DuckDBClient,
  applyInferred: (table: string) => Promise<void>,
  sample: Sample,
): Promise<void> {
  for (const f of sample.files) {
    const table = tableNameFromFilename(f.name)
    if (useSession.getState().datasets.some((d) => d.table === table)) continue
    const res = await fetch(`${BASE}${f.path}`)
    if (!res.ok) throw new Error(`${f.path}: HTTP ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    const file = new File([bytes], f.name)
    const taken = useSession.getState().datasets.map((d) => d.table)
    const ds = await loadOneFile(client, file, taken)
    useSession.getState().addDataset(ds)
    if (ds.kind === 'csv') await applyInferred(ds.table)
  }
}

/** Стартовые табы сэмпла; уже существующие по title не дублируются
 *  (seedTabs в сторе аппендит без дедупа — дедуп здесь, по месту). */
export function seedSampleTabs(sample: Sample): void {
  const titles = new Set(useSession.getState().tabs.map((t) => t.title))
  const fresh = sample.seedTabs.filter((s) => !titles.has(s.title))
  if (fresh.length > 0) useSession.getState().seedTabs(fresh)
}

/** Гард перед заменой непустого отчёта примером. */
export function confirmReplaceReport(): boolean {
  return (
    useSession.getState().report.blocks.length === 0 ||
    confirm('Открыть пример отчёта? Текущий отчёт будет заменён — сохрани его в JSON, если он нужен.')
  )
}

/** Загрузить prebuilt-отчёт и перейти в режим отчёта (данные грузит вызыватель). */
export async function loadSampleReport(): Promise<void> {
  const res = await fetch(`${BASE}demo/sample-report.json`)
  if (!res.ok) throw new Error(`sample-report.json: HTTP ${res.status}`)
  const doc = deserializeReport(await res.text())
  useSession.getState().loadReport(doc)
  useSession.getState().setMode('report')
}
```

- [ ] **Step 3: Переключить WelcomeScreen, удалить demoData.ts**

В `WelcomeScreen.tsx`: заменить импорт `{ loadDemoData, seedExampleTabs, loadSampleReport }` из `../features/demoData` на

```ts
import { loadSample, seedSampleTabs, loadSampleReport, confirmReplaceReport, cookbookSample } from '../features/sampleData'
```

`onData`: `await loadDemoData(client, applyInferred); seedExampleTabs()` → `await loadSample(client, applyInferred, cookbookSample); seedSampleTabs(cookbookSample)`.
`onReport`: инлайновый `if (blocks.length > 0 && !confirm(…))` → `if (!confirmReplaceReport()) return`; `await loadDemoData(client, applyInferred)` → `await loadSample(client, applyInferred, cookbookSample)`.
Удалить файл: `git rm src/features/demoData.ts`.

- [ ] **Step 4: Гейт**

Run: `npm test`, `npm run build`, `npm run lint` — зелёные. Ручная проверка (`npm run dev`): welcome-кнопки «Загрузить демо-данные» и «Открыть пример отчёта» работают как раньше.

- [ ] **Step 5: Коммит**

```bash
git add -A src/features src/components/WelcomeScreen.tsx
git commit -m "refactor(samples): demoData -> sampleData поверх каталога, поведение welcome без изменений"
```

---

### Task 4: `SampleGallery` + welcome-витрина + CSS

**Files:**
- Create: `src/components/SampleGallery.tsx`
- Modify: `src/components/WelcomeScreen.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `SAMPLES`/`sampleLoaded` (core), `loadSample`/`seedSampleTabs` (features), `useSchemaActions(client).applyInferred`.
- Produces: `<SampleGallery client={…} />` — Task 5 переиспользует в модале.

- [ ] **Step 1: Компонент галереи**

```tsx
// src/components/SampleGallery.tsx
import { useState } from 'react'
import type { DuckDBClient } from '../db/duckdbClient'
import { useSession } from '../state/session'
import { useSchemaActions } from '../features/useSchemaActions'
import { loadSample, seedSampleTabs } from '../features/sampleData'
import { SAMPLES, sampleLoaded, type Sample } from '../core/sampleCatalog'

/** Витрина сэмплов: featured-карточка cookbook + три классических датасета.
 *  Клик грузит файлы штатным пайплайном и сидит стартовый таб с готовым
 *  запросом. Повторный клик невозможен — карточка гаснет в «✓ загружено». */
export function SampleGallery({ client }: { client: DuckDBClient }) {
  const { applyInferred } = useSchemaActions(client)
  const tables = useSession((s) => s.datasets).map((d) => d.table)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function onPick(sample: Sample) {
    setBusyId(sample.id)
    try {
      await loadSample(client, applyInferred, sample)
      seedSampleTabs(sample)
    } catch (e) {
      alert('Не удалось загрузить сэмпл: ' + String(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="sample-grid">
      {SAMPLES.map((s) => {
        const loaded = sampleLoaded(s, tables)
        const fmts = [...new Set(s.files.map((f) => (f.name.endsWith('.parquet') ? 'PQ' : 'CSV')))]
        return (
          <button
            key={s.id}
            className={'sample-card' + (s.featured ? ' featured' : '') + (loaded ? ' loaded' : '')}
            disabled={busyId !== null || loaded}
            onClick={() => void onPick(s)}
          >
            <span className="sample-head">
              <span className="sample-title">{s.title}</span>
              {fmts.map((f) => (
                <span className="sample-badge" key={f}>{f}</span>
              ))}
              <span className="sample-size">{s.sizeLabel}</span>
            </span>
            <span className="sample-blurb">{s.blurb}</span>
            {s.credit && <span className="sample-credit">{s.credit}</span>}
            <span className="sample-state">
              {busyId === s.id ? 'грузим…' : loaded ? '✓ загружено' : '▸ загрузить'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Welcome-экран → витрина**

В `WelcomeScreen.tsx`: удалить `onData`, стейт-ветку `busy === 'data'` (busy становится `boolean` только для отчёта) и кнопку «▸ Загрузить демо-данные»; удалить абзац `welcome-credit` (кредит теперь на карточке cookbook). Вместо кнопки в `welcome-actions`:

```tsx
<SampleGallery client={client} />
<div className="welcome-actions">
  <button className="welcome-cta ghost" disabled={busy} onClick={onReport}>
    {busy ? 'Грузим…' : 'Открыть пример отчёта'}
  </button>
</div>
```

(галерея над actions; импорт `SampleGallery` добавить, неиспользуемые импорты убрать).

- [ ] **Step 3: CSS**

В `index.css` рядом с welcome-стилями:

```css
/* Витрина сэмплов (welcome + модал) */
.sample-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 18px 0 14px; text-align: left; }
.sample-card { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; font: inherit; color: var(--text); }
.sample-card:hover:not(:disabled) { border-color: var(--accent); }
.sample-card.featured { grid-column: 1 / -1; }
.sample-card.loaded { opacity: .6; cursor: default; }
.sample-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.sample-title { font-weight: 600; }
.sample-badge { font-family: var(--font-mono); font-size: 10px; letter-spacing: .08em; color: var(--accent); border: 1px solid var(--border); padding: 1px 5px; border-radius: 3px; }
.sample-size { margin-left: auto; color: var(--text-faint); font-size: 12px; white-space: nowrap; }
.sample-blurb { color: var(--text-dim); font-size: 13px; }
.sample-credit { color: var(--text-faint); font-size: 11px; }
.sample-state { font-family: var(--font-mono); font-size: 12px; color: var(--accent); }
.sample-card.loaded .sample-state { color: var(--text-faint); }
@media (max-width: 720px) { .sample-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Гейт + глазами**

Run: `npm test`, `npm run build`, `npm run lint`. `npm run dev`: welcome показывает 4 карточки (cookbook во всю ширину), клик по «пингвинам» грузит файл, открывает таб «Пингвины по видам», RUN даёт агрегат; повторное открытие welcome невозможно (датасеты уже есть) — ок.

- [ ] **Step 5: Коммит**

```bash
git add src/components/SampleGallery.tsx src/components/WelcomeScreen.tsx src/index.css
git commit -m "feat(samples): витрина карточек на welcome вместо одной демо-кнопки"
```

---

### Task 5: Кнопка «сэмплы» в рейле + модал

**Files:**
- Create: `src/components/SamplesModal.tsx`
- Modify: `src/features/Rail.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `SampleGallery`, `loadSample`/`loadSampleReport`/`confirmReplaceReport`/`cookbookSample`, `useSchemaActions`; паттерн модала — как `AboutModal` (`modal-overlay`/`modal`/`modal-x`, Escape).

- [ ] **Step 1: Модал**

```tsx
// src/components/SamplesModal.tsx
import { useEffect, useState } from 'react'
import type { DuckDBClient } from '../db/duckdbClient'
import { useSchemaActions } from '../features/useSchemaActions'
import { loadSample, loadSampleReport, confirmReplaceReport, cookbookSample } from '../features/sampleData'
import { SampleGallery } from './SampleGallery'

export function SamplesModal({ client, onClose }: { client: DuckDBClient; onClose: () => void }) {
  const { applyInferred } = useSchemaActions(client)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function onReport() {
    if (!confirmReplaceReport()) return
    setBusy(true)
    try {
      await loadSample(client, applyInferred, cookbookSample)
      await loadSampleReport()
      onClose()
    } catch (e) {
      alert('Не удалось открыть пример отчёта: ' + String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal samples-modal" role="dialog" aria-modal="true" aria-label="Сэмплы" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" aria-label="закрыть" onClick={onClose}>✕</button>
        <h2>сэмплы</h2>
        <p className="samples-note">Демо-датасеты грузятся локально — как обычные файлы, данные никуда не уходят.</p>
        <SampleGallery client={client} />
        <p className="modal-foot">
          <button className="link-btn" disabled={busy} onClick={() => void onReport()}>
            {busy ? 'грузим…' : 'открыть пример отчёта →'}
          </button>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Кнопка в рейле**

В `Rail.tsx`: `const [samplesOpen, setSamplesOpen] = useState(false)`; сразу ПОСЛЕ `<CsvDropzone onFiles={onFiles} />`:

```tsx
<button className="rail-samples" onClick={() => setSamplesOpen(true)}>▸ сэмплы</button>
```

и в конце фрагмента (после `.rail-resize`): `{samplesOpen && <SamplesModal client={client} onClose={() => setSamplesOpen(false)} />}`. Импорт `SamplesModal` добавить.

- [ ] **Step 3: CSS**

```css
.rail-samples { display: block; width: 100%; margin: 6px 0 2px; padding: 4px 6px; background: none; border: none; text-align: left; font-family: var(--font-mono); font-size: 12px; color: var(--text-faint); cursor: pointer; }
.rail-samples:hover { color: var(--accent); }
.samples-modal { width: min(600px, calc(100vw - 32px)); }
.link-btn { background: none; border: none; padding: 0; font: inherit; color: var(--accent); cursor: pointer; }
.link-btn:hover { color: var(--accent-2); }
.samples-note { color: var(--text-dim); font-size: 13px; }
```

- [ ] **Step 4: Гейт + глазами**

Run: гейт-триада. `npm run dev`: после старта (данные уже есть) «▸ сэмплы» в рейле открывает модал; карточка загруженного сэмпла — «✓ загружено» и не кликается; «открыть пример отчёта →» с confirm при непустом отчёте; Escape/клик-мимо закрывают.

- [ ] **Step 5: Коммит**

```bash
git add src/components/SamplesModal.tsx src/features/Rail.tsx src/index.css
git commit -m "feat(samples): кнопка «сэмплы» в рейле + модал витрины"
```

---

### Task 6: История — ядро `core/queryHistory.ts` (TDD)

**Files:**
- Create: `src/core/queryHistory.ts`
- Test: `src/core/queryHistory.test.ts`

**Interfaces:**
- Produces: `HISTORY_CAP`, `HISTORY_KEY`, `pushHistory(list, sql)` (возвращает ТОТ ЖЕ массив, если пуш не нужен — стор использует это для no-op), `serializeHistory`, `deserializeHistory` — Task 7.

- [ ] **Step 1: Красный тест**

```ts
// src/core/queryHistory.test.ts
import { describe, it, expect } from 'vitest'
import { HISTORY_CAP, pushHistory, serializeHistory, deserializeHistory } from './queryHistory'

describe('pushHistory', () => {
  it('добавляет trimmed-запрос в конец', () => {
    expect(pushHistory(['a'], '  SELECT 1  ')).toEqual(['a', 'SELECT 1'])
  })
  it('скипает пустые и пробельные', () => {
    const list = ['a']
    expect(pushHistory(list, '   ')).toBe(list)
    expect(pushHistory(list, '')).toBe(list)
  })
  it('дедупит ТОЛЬКО подряд идущие', () => {
    const list = ['a', 'b']
    expect(pushHistory(list, 'b')).toBe(list)
    expect(pushHistory(list, 'a')).toEqual(['a', 'b', 'a'])
  })
  it('кап: старые отваливаются, свежие остаются', () => {
    const full = Array.from({ length: HISTORY_CAP }, (_, i) => `q${i}`)
    const next = pushHistory(full, 'new')
    expect(next).toHaveLength(HISTORY_CAP)
    expect(next[0]).toBe('q1')
    expect(next[next.length - 1]).toBe('new')
  })
})

describe('serialize/deserialize', () => {
  it('roundtrip', () => {
    expect(deserializeHistory(serializeHistory(['a', 'b']))).toEqual(['a', 'b'])
  })
  it('null/битый JSON/не-массив/смешанный массив → []', () => {
    expect(deserializeHistory(null)).toEqual([])
    expect(deserializeHistory('{oops')).toEqual([])
    expect(deserializeHistory('"str"')).toEqual([])
    expect(deserializeHistory('[1, "a"]')).toEqual([])
  })
})
```

Run: `npx vitest run src/core/queryHistory.test.ts` — FAIL.

- [ ] **Step 2: Реализация**

```ts
// src/core/queryHistory.ts
export const HISTORY_CAP = 200
export const HISTORY_KEY = 'quackbook.sqlHistory'

/** Пуш в историю: trim, скип пустых, дедуп подряд идущих, кап HISTORY_CAP.
 *  Если пушить нечего — возвращает ИСХОДНЫЙ массив (референс-равенство
 *  используется стором как признак no-op). */
export function pushHistory(list: string[], sql: string): string[] {
  const s = sql.trim()
  if (s === '') return list
  if (list[list.length - 1] === s) return list
  const next = [...list, s]
  return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next
}

export function serializeHistory(list: string[]): string {
  return JSON.stringify(list)
}

/** localStorage → string[]; всё битое/чужое → []. */
export function deserializeHistory(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')
      ? (parsed as string[])
      : []
  } catch {
    return []
  }
}
```

- [ ] **Step 3: Зелёный + гейт + коммит**

Run: `npx vitest run src/core/queryHistory.test.ts` — PASS; гейт-триада.

```bash
git add src/core/queryHistory.ts src/core/queryHistory.test.ts
git commit -m "feat(history): ring-буфер истории запросов — push/дедуп/кап/сериализация (TDD)"
```

---

### Task 7: История — слайс стора (TDD)

**Files:**
- Modify: `src/state/session.ts`
- Test: `src/state/session.history.test.ts` (новый)

**Interfaces:**
- Produces: `history: string[]` и `pushHistory(sql)` в `useSession` — Task 8.
- ВАЖНО: `history` инициализируется В `create()` (из localStorage), но НЕ добавляется в объект `initial` — `reset()` делает `set({ ...initial })` (zustand МЕРЖИТ), поэтому история сознательно переживает Reset (инструментальное состояние, как ширина рейла).

- [ ] **Step 1: Красный тест**

```ts
// src/state/session.history.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useSession } from './session'

beforeEach(() => {
  useSession.setState({ history: [], datasets: [], tabs: [], activeTabId: null })
})

describe('store history', () => {
  it('pushHistory добавляет и дедупит подряд', () => {
    useSession.getState().pushHistory('SELECT 1')
    useSession.getState().pushHistory('SELECT 1')
    useSession.getState().pushHistory('SELECT 2')
    expect(useSession.getState().history).toEqual(['SELECT 1', 'SELECT 2'])
  })
  it('пустой пуш — no-op (тот же референс)', () => {
    useSession.getState().pushHistory('SELECT 1')
    const before = useSession.getState().history
    useSession.getState().pushHistory('   ')
    expect(useSession.getState().history).toBe(before)
  })
  it('reset() НЕ трогает историю', () => {
    useSession.getState().pushHistory('SELECT 1')
    useSession.getState().reset()
    expect(useSession.getState().history).toEqual(['SELECT 1'])
  })
})
```

Run: `npx vitest run src/state/session.history.test.ts` — FAIL (нет `history`/`pushHistory`).

- [ ] **Step 2: Слайс в session.ts**

Импорт: `import { pushHistory as corePushHistory, serializeHistory, deserializeHistory, HISTORY_KEY } from '../core/queryHistory'`.

В `SessionState`: `history: string[]` и `pushHistory: (sql: string) => void`.

Перед `create` — гидрация (паттерн `loadPersistedReport`):

```ts
/** История запросов из localStorage (guard для node-окружения vitest). */
function loadPersistedHistory(): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    return deserializeHistory(localStorage.getItem(HISTORY_KEY))
  } catch {
    return []
  }
}
```

В `create((set, get) => ({ ...initial, … }))` — сразу после спреда `...initial` добавить поле и экшен (НЕ в `initial` — см. Interfaces):

```ts
  history: loadPersistedHistory(),
  pushHistory: (sql) =>
    set((s) => {
      const next = corePushHistory(s.history, sql)
      if (next === s.history) return {}
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(HISTORY_KEY, serializeHistory(next))
        } catch {
          // ignore — storage может быть недоступен/полон
        }
      }
      return { history: next }
    }),
```

- [ ] **Step 3: Зелёный + гейт + коммит**

Run: `npx vitest run src/state/session.history.test.ts` — PASS; гейт-триада (остальные стор-тесты не должны упасть — `history` не в `initial`, `reset` их не видит).

```bash
git add src/state/session.ts src/state/session.history.test.ts
git commit -m "feat(history): слайс истории в сторе — push + localStorage, переживает reset (TDD)"
```

---

### Task 8: История в редакторе (↑/↓) + пуш при RUN

**Files:**
- Modify: `src/components/SqlEditor.tsx`, `src/features/Explore.tsx`, `src/features/useResultActions.ts`

**Interfaces:**
- Consumes: `useSession` `history`/`pushHistory` (Task 7).
- Produces: проп `history?: string[]` у `SqlEditor` (M7b-ячейки его НЕ передают — стрелки там обычные); пуш истории в `runQuery` (Task 10 строится поверх).
- Поведение (спека): ↑ на первой строке без выделения — старее; ↓ на последней — новее; ↓ за самым свежим — возврат черновика; ввод текста руками выходит из режима истории; при открытом автокомплите стрелки принадлежат автокомплиту. Переключение таба сбрасывает указатель (SqlEditor смонтирован с `key={tab.id}` — ремоунт). Принятый нюанс: RUN кнопкой в тулбаре указатель не сбрасывает (редактор о ней не знает) — сброс происходит при Mod-Enter и любом ручном вводе; на UX не влияет.

- [ ] **Step 1: SqlEditor — навигация по истории**

Импорт: `completionStatus` добавить к импорту из `@codemirror/autocomplete`.

Пропсы: `interface Props { value: string; onChange: (value: string) => void; onRun: (sql: string) => void; schema?: Record<string, string[]>; history?: string[] }` и деструктурировать `history`.

Рефы рядом с `cb`:

```ts
  // История запросов (psql-стиль). Указатель: null = не в истории; иначе
  // смещение от свежего конца (0 = самый свежий). Черновик прячется при входе.
  const histRef = useRef<string[]>(history ?? [])
  // eslint-disable-next-line react-hooks/refs
  histRef.current = history ?? []
  const histPos = useRef<number | null>(null)
  const draftStash = useRef('')
  const navigating = useRef(false)
```

Хелперы внутри компонента (перед mount-эффектом):

```ts
  function setDoc(v: EditorView, text: string) {
    navigating.current = true
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: text },
      selection: { anchor: text.length },
    })
    navigating.current = false
  }

  function stepHistory(v: EditorView, dir: 1 | -1): boolean {
    const list = histRef.current
    if (list.length === 0) return false
    if (completionStatus(v.state) !== null) return false // стрелки — автокомплиту
    const sel = v.state.selection.main
    if (!sel.empty) return false
    const line = v.state.doc.lineAt(sel.head)
    if (dir === 1 && line.number !== 1) return false // старее — только с первой строки
    if (dir === -1 && line.number !== v.state.doc.lines) return false // новее — с последней
    const pos = histPos.current
    if (dir === 1) {
      const next = pos === null ? 0 : pos + 1
      if (next >= list.length) return true // упёрлись в самый старый — съесть нажатие
      if (pos === null) draftStash.current = v.state.doc.toString()
      histPos.current = next
      setDoc(v, list[list.length - 1 - next])
      return true
    }
    if (pos === null) return false // не в истории — обычный ArrowDown
    if (pos === 0) {
      histPos.current = null
      setDoc(v, draftStash.current)
      return true
    }
    histPos.current = pos - 1
    setDoc(v, list[list.length - 1 - histPos.current])
    return true
  }
```

В mount-эффекте: биндинг ПЕРЕД `keymap.of([...defaultKeymap, …])` (первый вернувший true съедает событие):

```ts
    const histNav = keymap.of([
      { key: 'ArrowUp', run: (v) => stepHistory(v, 1) },
      { key: 'ArrowDown', run: (v) => stepHistory(v, -1) },
    ])
```

— и вставить `histNav` в массив `extensions` между `runKey` и `keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap])`.

Выход из режима истории: в `runKey` перед вызовом `cb.current.onRun` добавить `histPos.current = null`; в `listener` (updateListener) — `if (u.docChanged && !navigating.current) histPos.current = null`.

- [ ] **Step 2: Прокинуть историю и пуш**

`Explore.tsx`: `const history = useSession((s) => s.history)` и `<SqlEditor … history={history} />`.

`useResultActions.ts`, первая строка `runQuery`:

```ts
    const st = useSession.getState()
    st.pushHistory(sql) // история — при каждом RUN, включая упавшие (как shell)
```

(существующая строка `const st = useSession.getState()` уже есть — просто добавить пуш после неё).

- [ ] **Step 3: Гейт + глазами**

Run: гейт-триада. `npm run dev`: выполнить 3 разных запроса → ↑ на первой строке листает назад (курсор в конце), ↓ на последней — вперёд и в черновик; ввод символа выходит из истории; при открытом автокомплите стрелки ходят по списку; после перезагрузки страницы история на месте; двойной RUN одного запроса не дублирует запись.

- [ ] **Step 4: Коммит**

```bash
git add src/components/SqlEditor.tsx src/features/Explore.tsx src/features/useResultActions.ts
git commit -m "feat(history): psql-стрелки в редакторе + пуш при каждом RUN"
```

---

### Task 9: Dot-команды — ядро `core/dotCommands.ts` (TDD)

**Files:**
- Create: `src/core/dotCommands.ts`
- Test: `src/core/dotCommands.test.ts`

**Interfaces:**
- Consumes: `Dataset` (тип из `../state/session`), `QueryResult` (`./arrowToRows`), `isInternalTable` (`./sql`).
- Produces: `parseDotCommand(input)`, `runDotCommand(cmd, datasets)` → `{ ok: true; result: QueryResult } | { ok: false; error: string }`, плюс билдеры `tablesRows`/`schemaRows`/`helpRows` — Task 10.

- [ ] **Step 1: Красный тест**

```ts
// src/core/dotCommands.test.ts
import { describe, it, expect } from 'vitest'
import { parseDotCommand, runDotCommand, tablesRows, schemaRows, helpRows } from './dotCommands'
import type { Dataset } from '../state/session'

const ds = (table: string, kind: Dataset['kind'] = 'csv'): Dataset => ({
  table, fileName: `${table}.csv`, bytes: 1, kind,
  columns: [{ name: 'a', type: 'VARCHAR' }, { name: 'b', type: 'BIGINT' }],
})

describe('parseDotCommand', () => {
  it('не dot-команда → null', () => {
    expect(parseDotCommand('SELECT 1')).toBeNull()
    expect(parseDotCommand('  SELECT .5')).toBeNull()
  })
  it('многострочный ввод → null (это SQL, не команда)', () => {
    expect(parseDotCommand('.tables\nSELECT 1')).toBeNull()
  })
  it('.tables / .help без аргументов, регистронезависимо', () => {
    expect(parseDotCommand(' .tables ')).toEqual({ kind: 'tables' })
    expect(parseDotCommand('.HELP')).toEqual({ kind: 'help' })
  })
  it('.schema с одним аргументом', () => {
    expect(parseDotCommand('.schema demo_users')).toEqual({ kind: 'schema', table: 'demo_users' })
  })
  it('.schema без аргумента / с двумя, .tables с аргументом, мусор → unknown', () => {
    expect(parseDotCommand('.schema')).toMatchObject({ kind: 'unknown' })
    expect(parseDotCommand('.schema a b')).toMatchObject({ kind: 'unknown' })
    expect(parseDotCommand('.tables x')).toMatchObject({ kind: 'unknown' })
    expect(parseDotCommand('.wat')).toMatchObject({ kind: 'unknown' })
  })
})

describe('билдеры', () => {
  it('tablesRows: name/kind/columns, _qb_* скрыты', () => {
    const r = tablesRows([ds('demo_users'), ds('_qb_raw_x'), ds('mart1', 'view')])
    expect(r.columns.map((c) => c.name)).toEqual(['name', 'kind', 'columns'])
    expect(r.rows.map((x) => x.name)).toEqual(['demo_users', 'mart1'])
    expect(r.rows[0]).toEqual({ name: 'demo_users', kind: 'csv', columns: 2 })
    expect(r.numRows).toBe(2)
  })
  it('schemaRows: column/type', () => {
    const r = schemaRows(ds('t'))
    expect(r.rows).toEqual([
      { column: 'a', type: 'VARCHAR' },
      { column: 'b', type: 'BIGINT' },
    ])
  })
  it('helpRows: есть все три команды', () => {
    const cmds = helpRows().rows.map((r) => r.command)
    expect(cmds).toEqual(expect.arrayContaining(['.tables', '.schema <таблица>', '.help']))
  })
})

describe('runDotCommand', () => {
  it('schema находит таблицу регистронезависимо', () => {
    const out = runDotCommand({ kind: 'schema', table: 'DEMO_USERS' }, [ds('demo_users')])
    expect(out.ok).toBe(true)
  })
  it('schema по отсутствующей таблице → ошибка с подсказкой', () => {
    const out = runDotCommand({ kind: 'schema', table: 'nope' }, [ds('demo_users')])
    expect(out).toEqual({ ok: false, error: 'нет таблицы nope — см. .tables' })
  })
  it('unknown → ошибка с .help', () => {
    const out = runDotCommand({ kind: 'unknown', raw: '.wat' }, [])
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('.help')
  })
})
```

Run: `npx vitest run src/core/dotCommands.test.ts` — FAIL.

- [ ] **Step 2: Реализация**

```ts
// src/core/dotCommands.ts
import type { Dataset } from '../state/session'
import type { QueryResult } from './arrowToRows'
import { isInternalTable } from './sql'

export type DotCommand =
  | { kind: 'tables' }
  | { kind: 'schema'; table: string }
  | { kind: 'help' }
  | { kind: 'unknown'; raw: string }

/**
 * Распознать dot-команду (в духе DuckDB CLI). null — это не команда, а SQL:
 * первый непробельный символ не «.», либо ввод многострочный. Неизвестная/
 * кривая точка-команда → unknown (исполнитель покажет подсказку про .help).
 */
export function parseDotCommand(input: string): DotCommand | null {
  const s = input.trim()
  if (!s.startsWith('.')) return null
  if (/[\r\n]/.test(s)) return null
  const m = /^\.(\S*)(?:\s+(.*))?$/.exec(s)
  if (!m) return null
  const cmd = (m[1] ?? '').toLowerCase()
  const arg = (m[2] ?? '').trim()
  if (cmd === 'tables' && arg === '') return { kind: 'tables' }
  if (cmd === 'help' && arg === '') return { kind: 'help' }
  if (cmd === 'schema' && arg !== '' && !/\s/.test(arg)) return { kind: 'schema', table: arg }
  return { kind: 'unknown', raw: s }
}

/** Псевдо-результат под raw-путь панели (все колонки — VARCHAR-условно). */
function pseudo(names: string[], rows: Record<string, unknown>[]): QueryResult {
  return { columns: names.map((name) => ({ name, type: 'VARCHAR' })), rows, numRows: rows.length }
}

export function tablesRows(datasets: Dataset[]): QueryResult {
  const rows = datasets
    .filter((d) => !isInternalTable(d.table))
    .map((d) => ({ name: d.table, kind: d.kind, columns: d.columns.length }))
  return pseudo(['name', 'kind', 'columns'], rows)
}

export function schemaRows(d: Dataset): QueryResult {
  return pseudo(['column', 'type'], d.columns.map((c) => ({ column: c.name, type: c.type })))
}

export function helpRows(): QueryResult {
  return pseudo(['command', 'description'], [
    { command: '.tables', description: 'список таблиц (источники и витрины)' },
    { command: '.schema <таблица>', description: 'колонки и типы таблицы' },
    { command: '.help', description: 'эта справка' },
    { command: '↑ / ↓', description: 'история запросов (курсор на первой/последней строке)' },
  ])
}

export type DotOutcome = { ok: true; result: QueryResult } | { ok: false; error: string }

/** Исполнить dot-команду по данным стора — движок не участвует. */
export function runDotCommand(cmd: DotCommand, datasets: Dataset[]): DotOutcome {
  switch (cmd.kind) {
    case 'tables':
      return { ok: true, result: tablesRows(datasets) }
    case 'help':
      return { ok: true, result: helpRows() }
    case 'schema': {
      const d = datasets.find(
        (x) => !isInternalTable(x.table) && x.table.toLowerCase() === cmd.table.toLowerCase(),
      )
      return d
        ? { ok: true, result: schemaRows(d) }
        : { ok: false, error: `нет таблицы ${cmd.table} — см. .tables` }
    }
    case 'unknown':
      return { ok: false, error: `неизвестная команда «${cmd.raw}» — попробуй .help` }
  }
}
```

- [ ] **Step 3: Зелёный + гейт + коммит**

Run: `npx vitest run src/core/dotCommands.test.ts` — PASS; гейт-триада.

```bash
git add src/core/dotCommands.ts src/core/dotCommands.test.ts
git commit -m "feat(repl): dot-команды .tables/.schema/.help — парсер и билдеры без движка (TDD)"
```

---

### Task 10: Перехват dot-команд в `runQuery`

**Files:**
- Modify: `src/features/useResultActions.ts`

**Interfaces:**
- Consumes: `parseDotCommand`/`runDotCommand` (Task 9), `setRawResult`/`setTabError` (стор), seq-механика runQuery (застолблена ДО перехвата — стейл-ран движка не перезапишет вывод команды).

- [ ] **Step 1: Вставить перехват**

Импорт: `import { parseDotCommand, runDotCommand } from '../core/dotCommands'`. Начало `runQuery` после Task 8 должно стать (вставка — блок между `const t0` и `const table`):

```ts
  async function runQuery(tabId: string, sql: string): Promise<void> {
    const st = useSession.getState()
    st.pushHistory(sql) // история — при каждом RUN, включая упавшие (как shell)
    const seq = st.nextWindowSeq()
    st.stampWindowSeq(tabId, seq) // застолбить run ДО первого await
    const t0 = performance.now()
    // Dot-команды (.tables/.schema/.help): исполняются из стора, синхронно,
    // ДО движка. Вывод — через raw-путь; seq уже застолблен, так что более
    // ранний медленный запрос этот вывод не перезапишет.
    const dot = parseDotCommand(sql)
    if (dot) {
      const out = runDotCommand(dot, useSession.getState().datasets)
      if (ownsRun(tabId, seq)) {
        if (out.ok) useSession.getState().setRawResult(tabId, out.result, performance.now() - t0)
        else useSession.getState().setTabError(tabId, out.error)
      }
      return
    }
    const table = resultTempName(tabId)
    …
```

(остальное тело `runQuery` без изменений).

- [ ] **Step 2: Гейт + глазами**

Run: гейт-триада (перехват — тонкая склейка поверх TDD-ядра Task 9; отдельного нового теста не требует). `npm run dev`: `.tables` → псевдо-таблица name/kind/columns (витрины видны, `_qb_*` нет); `.schema demo_users` → колонки+типы; `.schema nope` → ошибка «нет таблицы nope — см. .tables»; `.wat` → подсказка про `.help`; `.help` → 4 строки; обычный SELECT работает как раньше; dot-команды листаются стрелками из истории.

- [ ] **Step 3: Коммит**

```bash
git add src/features/useResultActions.ts
git commit -m "feat(repl): перехват dot-команд в runQuery — вывод raw-путём, движок не трогаем"
```

---

## Порядок и зависимости

1 (данные) → 2 (каталог) → 3 (загрузчик) → 4 (welcome) → 5 (модал) — витрина.
6 (core история) → 7 (стор) → 8 (редактор+пуш) — история.
9 (core dot) → 10 (перехват) — dot-команды; Task 10 редактирует ту же функцию, что Task 8 (`runQuery`) — исполнять СТРОГО после Task 8.

Витрина (1–5) и REPL (6–10) независимы между собой, внутри цепочек порядок обязателен.

## Definition of Done (спека)

- Визитёр без своего файла делает первый запрос < 30 сек (карточка → готовый таб → RUN).
- История переживает перезагрузку страницы; ↑/↓ работают psql-стилем; автокомплиту стрелки не мешают.
- `.schema demo_users` печатает колонки; `_qb_*` нигде не светятся.
- Гейт: `npm test` + `npm run build` + `npm run lint` 0/0; `git diff main -- package.json` пуст.
