# M6 «Quality of life» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lower the entry barrier and sharpen ergonomics of shipped quackbook v1 with four firewall-clean QoL additions: onboarding + demo data (from the user's MIT SQL cookbook), an About modal, query-result export (CSV/Parquet), and schema-aware SQL autocomplete.

**Architecture:** Deepen existing surfaces only — no routes. A welcome screen replaces the empty Explore state; About is a topbar «?» overlay. Demo data is bundled under `public/demo/` and loaded on click through the *existing* file pipeline (`loadOneFile`). Export reuses DuckDB `COPY`. Autocomplete feeds `@codemirror/lang-sql`'s `schema` option (already a dep) via a CM6 `Compartment`.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 4 (node env), `@duckdb/duckdb-wasm@1.32.0`, `apache-arrow@17`, `@codemirror/lang-sql@6.10.0` (present), Zustand 5.

## Global Constraints

- **Zero new dependencies.** `@codemirror/lang-sql@6.10.0` is already in `dependencies`.
- **Determinism:** ids only via the store `seq` counter. **Never** `Math.random` / `Date.now` / `new Date` (they throw in this toolchain).
- **TDD boundary:** logic (pure functions, store actions, DB plumbing) → red→green Vitest (node env, `src/**/*.test.ts`). Presentation (welcome/About/buttons/popup) → by eye via `npm run dev` (CLAUDE.md: no jsdom/RTL).
- **Gate every task:** `npm run lint` (0 errors) + `npm run build` (full `tsc -b && vite build`) + `npm test`. Lint has one pre-existing known TanStack `useVirtualizer` warning — 0 *errors* is the bar.
- **Surgical edits**, follow existing patterns. Commit messages end with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (apply via bash here-doc on Windows, not PowerShell `@'...'@`).
- **Firewall (CLAUDE.md) — do NOT build:** dashboard-grid/canvas/drag-resize/multi-column, visual join-builder, per-cell edit/derived columns, OPFS persistence, share-by-URL/permissions, EXPLAIN tab. welcome/About are **states/overlay, not routes**.
- **Deterministic table names:** demo files load to `payments` (`payments.csv`) and `users` (`users.parquet`) via `tableNameFromFilename` in a fresh session.
- Branch: `m6-qol` (off `main`). Spec: `docs/superpowers/specs/2026-06-30-quackbook-m6-qol-design.md`.

---

# Slice 1 — Demo data + Onboarding

## Task 1: Demo-data assets (build-time data-prep)

Produce the bundled demo files. The cookbook is MIT (`github.com/cosmiksoul/sql-product-analytics-cookbook`); we redistribute `payments.csv` verbatim and a typed Parquet conversion of `users.csv`.

**Files:**
- Download (temp): cookbook `data/payments.csv`, `data/users.csv`
- Create: `public/demo/payments.csv`, `public/demo/users.parquet`, `public/demo/DATA-LICENSE`
- Create: `scripts/convertUsers.mjs` (reproducibility, committed)
- Modify: `.gitignore` (track the demo parquet)

**Interfaces:**
- Produces: `public/demo/payments.csv` (columns `UserID,DateUTC,RevenueUSD,PaymentAttemptID,RenewalType`), `public/demo/users.parquet` (typed: `UserID` BIGINT, `DateUTC` TIMESTAMP, `ControlOrTest` VARCHAR, `PhotoCount` INTEGER, `MaritalStatus` VARCHAR). Consumed by Tasks 3/5 tests and Task 4 runtime.

- [ ] **Step 1: Download the two CSVs**

```bash
mkdir -p public/demo scripts
curl -fsSL https://raw.githubusercontent.com/cosmiksoul/sql-product-analytics-cookbook/main/data/payments.csv -o public/demo/payments.csv
curl -fsSL https://raw.githubusercontent.com/cosmiksoul/sql-product-analytics-cookbook/main/data/users.csv   -o scripts/users_raw.csv
```
Expected: `public/demo/payments.csv` (~322 KB) and `scripts/users_raw.csv` (~3.75 MB) exist. Verify the header of each begins with `UserID,`.

- [ ] **Step 2: Write the Parquet conversion script**

Create `scripts/convertUsers.mjs` (plain ESM — eslint only lints `**/*.{ts,tsx}`, so this is untouched by the gate; `tsc -b` excludes it too). The node-DuckDB bootstrap mirrors the proven `src/db/nodeDuckDB.ts`.

```js
// One-off: converts scripts/users_raw.csv -> public/demo/users.parquet with
// explicit types. Run: `node scripts/convertUsers.mjs`. Committed for reproducibility.
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

const db = await createNodeDuckDB()
const csv = fs.readFileSync(path.resolve('scripts/users_raw.csv'))
await db.registerFileBuffer('users_raw.csv', new Uint8Array(csv))
const conn = await db.connect()
await conn.query(
  `COPY (
     SELECT CAST(UserID AS BIGINT) AS UserID,
            CAST(replace(DateUTC, ' UTC', '') AS TIMESTAMP) AS DateUTC,
            ControlOrTest,
            CAST(PhotoCount AS INTEGER) AS PhotoCount,
            MaritalStatus
     FROM read_csv_auto('users_raw.csv', all_varchar = true)
   ) TO 'users.parquet' (FORMAT PARQUET)`,
)
await conn.close()
const buf = await db.copyFileToBuffer('users.parquet')
fs.mkdirSync('public/demo', { recursive: true })
fs.writeFileSync('public/demo/users.parquet', buf)
await db.terminate()
console.log('wrote public/demo/users.parquet', buf.length, 'bytes')
```

- [ ] **Step 3: Run the conversion**

Run: `node scripts/convertUsers.mjs`
Expected: prints `wrote public/demo/users.parquet <N> bytes`; `public/demo/users.parquet` exists and is far smaller than 3.75 MB (hundreds of KB). Then remove the temp CSV: `rm scripts/users_raw.csv`.

- [ ] **Step 4: Write DATA-LICENSE (attribution)**

Create `public/demo/DATA-LICENSE`:
```
Demo datasets (payments.csv, users.parquet) are derived from
"SQL 101: Рецепты продуктового аналитика" by cosmiksoul.
Source: https://github.com/cosmiksoul/sql-product-analytics-cookbook
License: MIT. users.parquet is a typed Parquet conversion of the original users.csv.
```

- [ ] **Step 5: Track the demo parquet in git**

`.gitignore` has `*.parquet` + `!fixtures/metrics.parquet`. Add the demo exception right after it:
```
!fixtures/metrics.parquet
!public/demo/users.parquet
```
(`payments.csv`, `DATA-LICENSE`, and `sample-report.json` are not ignored — no extra rule needed.)

- [ ] **Step 6: Verify build picks up the assets, then commit**

Run: `npm run build`
Expected: build OK; `dist/demo/payments.csv` and `dist/demo/users.parquet` are copied (Vite copies `public/` verbatim).

```bash
git add public/demo/payments.csv public/demo/users.parquet public/demo/DATA-LICENSE scripts/convertUsers.mjs .gitignore
git commit -F- <<'EOF'
feat(demo): bundle cookbook demo data (payments.csv + typed users.parquet)

MIT-licensed datasets from the user's SQL product-analytics cookbook. users.csv
converted to a typed Parquet (scripts/convertUsers.mjs) to shrink 3.75MB -> ~hundreds KB.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

## Task 2: `seedTabs` store action

**Files:**
- Modify: `src/state/session.ts` (interface ~line 71, impl after `openBlankTab` ~line 180)
- Test: `src/state/session.seedTabs.test.ts`

**Interfaces:**
- Produces: `seedTabs(specs: { title: string; sql: string }[]): void` — appends one tab per spec (`datasetTable: null`, deterministic `tab-<seq>` ids), activates the first appended tab. Consumed by Task 4 (`seedExampleTabs`).

- [ ] **Step 1: Write the failing test**

Create `src/state/session.seedTabs.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useSession } from './session'

describe('seedTabs', () => {
  beforeEach(() => useSession.getState().reset())

  it('appends tabs with deterministic ids and activates the first', () => {
    useSession.getState().seedTabs([
      { title: 'A', sql: 'SELECT 1' },
      { title: 'B', sql: 'SELECT 2' },
    ])
    const { tabs, activeTabId, seq } = useSession.getState()
    expect(tabs.map((t) => t.id)).toEqual(['tab-1', 'tab-2'])
    expect(tabs.map((t) => t.title)).toEqual(['A', 'B'])
    expect(tabs[0].sql).toBe('SELECT 1')
    expect(tabs[0].datasetTable).toBeNull()
    expect(activeTabId).toBe('tab-1')
    expect(seq).toBe(2)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/state/session.seedTabs.test.ts`
Expected: FAIL (`seedTabs is not a function`).

- [ ] **Step 3: Add to the `SessionState` interface**

In `src/state/session.ts`, after `openBlankTab: () => void` (line ~67) add:
```ts
  seedTabs: (specs: { title: string; sql: string }[]) => void
```

- [ ] **Step 4: Implement the action**

In `src/state/session.ts`, after the `openBlankTab` action (ends ~line 180) add:
```ts
  seedTabs: (specs) =>
    set((s) => {
      let seq = s.seq
      const created: Tab[] = specs.map((spec) => {
        seq += 1
        return {
          id: `tab-${seq}`,
          title: spec.title,
          datasetTable: null,
          sql: spec.sql,
          result: null,
          meta: null,
          error: null,
        }
      })
      return {
        tabs: [...s.tabs, ...created],
        activeTabId: created[0]?.id ?? s.activeTabId,
        seq,
      }
    }),
```

- [ ] **Step 5: Run to verify it passes + gate**

Run: `npx vitest run src/state/session.seedTabs.test.ts` → PASS
Run: `npm run lint && npm run build && npm test` → all green.

- [ ] **Step 6: Commit**

```bash
git add src/state/session.ts src/state/session.seedTabs.test.ts
git commit -F- <<'EOF'
feat(store): seedTabs — append preset query tabs with deterministic ids

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

## Task 3: Example queries + integration guard

The 4 BigQuery recipes ported to DuckDB, with **explicit casts** so they run whether `payments` is typed or all-VARCHAR. A node integration test runs every query against the real demo files — this is the empirical guard for the porting.

**Files:**
- Create: `src/core/exampleQueries.ts`
- Test: `src/core/exampleQueries.integration.test.ts`

**Interfaces:**
- Produces: `EXAMPLE_QUERIES: { title: string; sql: string }[]`. Consumed by Task 4 (`seedExampleTabs`).
- Consumes: `public/demo/*` (Task 1), `createNodeDuckDB`/`createClient`/`arrowToRows`.

- [ ] **Step 1: Write the example queries**

Create `src/core/exampleQueries.ts`:
```ts
// 4 product-analytics recipes from the cookbook, ported BigQuery -> DuckDB, over
// the demo tables `users` (parquet, typed) + `payments` (csv). payments columns
// are cast explicitly so a recipe runs whether or not payments has been typed;
// payments.DateUTC carries a trailing " UTC" that auto-typing leaves as VARCHAR,
// so it is parsed in-query (the book's data-quality theme).
export const EXAMPLE_QUERIES: { title: string; sql: string }[] = [
  {
    title: 'DAU — дневная аудитория',
    sql: `SELECT CAST(DateUTC AS DATE) AS day, count(DISTINCT UserID) AS dau
FROM users
GROUP BY 1
ORDER BY 1;`,
  },
  {
    title: 'Выручка по дням (накопительно)',
    sql: `SELECT day,
       sum(daily_revenue) OVER (ORDER BY day) AS cumulative_revenue,
       daily_revenue
FROM (
  SELECT CAST(CAST(replace(DateUTC, ' UTC', '') AS TIMESTAMP) AS DATE) AS day,
         sum(CAST(RevenueUSD AS DOUBLE)) AS daily_revenue
  FROM payments
  GROUP BY 1
)
ORDER BY day;`,
  },
  {
    title: 'ARPU vs ARPPU',
    sql: `SELECT
  round(sum(CAST(p.RevenueUSD AS DOUBLE)) / (SELECT count(DISTINCT UserID) FROM users), 2) AS arpu,
  round(sum(CAST(p.RevenueUSD AS DOUBLE)) / count(DISTINCT p.UserID), 2) AS arppu
FROM payments p;`,
  },
  {
    title: 'A/B-uplift: конверсия в оплату',
    sql: `SELECT u.ControlOrTest AS variant,
       count(DISTINCT u.UserID) AS users,
       count(DISTINCT p.UserID) AS payers,
       round(100.0 * count(DISTINCT p.UserID) / count(DISTINCT u.UserID), 2) AS conversion_pct
FROM users u
LEFT JOIN payments p ON CAST(p.UserID AS BIGINT) = u.UserID
GROUP BY 1
ORDER BY 1;`,
  },
]
```

- [ ] **Step 2: Write the integration test (must pass — the guard)**

Create `src/core/exampleQueries.integration.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import { createNodeDuckDB } from '../db/nodeDuckDB'
import { createClient, type DuckDBClient } from '../db/duckdbClient'
import { arrowToRows } from './arrowToRows'
import { EXAMPLE_QUERIES } from './exampleQueries'

let db: AsyncDuckDB
let client: DuckDBClient

beforeAll(async () => {
  db = await createNodeDuckDB()
  client = createClient(db)
  const demo = resolve(import.meta.dirname, '../../public/demo')
  await client.registerFile('payments.csv', new Uint8Array(readFileSync(resolve(demo, 'payments.csv'))))
  await client.loadCsvAllVarchar('payments.csv', 'payments') // all-VARCHAR; queries cast
  await client.registerFile('users.parquet', new Uint8Array(readFileSync(resolve(demo, 'users.parquet'))))
  await client.loadParquet('users.parquet', 'users')
}, 60_000)

afterAll(async () => { await db.terminate() })

describe('example queries run on the bundled demo data', () => {
  for (const q of EXAMPLE_QUERIES) {
    it(`returns rows: ${q.title}`, async () => {
      const res = arrowToRows(await client.query(q.sql))
      expect(res.numRows).toBeGreaterThan(0)
    })
  }
})
```

- [ ] **Step 3: Run the integration test**

Run: `npx vitest run src/core/exampleQueries.integration.test.ts`
Expected: all 4 PASS. **If any fails**, fix that query's DuckDB SQL (likely the `DateUTC` parse or a cast) until it returns rows — the real data is the source of truth, not the SQL on paper.

- [ ] **Step 4: Gate + commit**

Run: `npm run lint && npm run build && npm test` → green.
```bash
git add src/core/exampleQueries.ts src/core/exampleQueries.integration.test.ts
git commit -F- <<'EOF'
feat(demo): 4 DuckDB-ported cookbook recipes + integration guard on demo data

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

## Task 4: `demoData.ts` orchestrator

**Files:**
- Create: `src/features/demoData.ts`

**Interfaces:**
- Consumes: `loadOneFile` (`src/features/loadFiles.ts`), `useSession` store, `tableNameFromFilename` (`src/core/sql.ts`), `deserializeReport` (`src/core/report.ts`), `EXAMPLE_QUERIES` (Task 3), `seedTabs` (Task 2).
- Produces: `loadDemoData(client, applyInferred): Promise<void>`, `seedExampleTabs(): void`, `loadSampleReport(): Promise<void>`. Consumed by Task 6 (WelcomeScreen).
- `applyInferred` is `useSchemaActions(client).applyInferred` — `(table: string) => Promise<void>`.

Presentation/integration glue — verified by eye (Task 6), no unit test (fetch/File are browser-only; the SQL is already guarded by Task 3).

- [ ] **Step 1: Implement the orchestrator**

Create `src/features/demoData.ts`:
```ts
import { useSession } from '../state/session'
import { loadOneFile } from './loadFiles'
import { deserializeReport } from '../core/report'
import { tableNameFromFilename } from '../core/sql'
import { EXAMPLE_QUERIES } from '../core/exampleQueries'
import type { DuckDBClient } from '../db/duckdbClient'

const BASE = import.meta.env.BASE_URL
const DEMO_FILES = [
  { path: 'demo/payments.csv', name: 'payments.csv' },
  { path: 'demo/users.parquet', name: 'users.parquet' },
]

/** Load the bundled demo files through the normal file pipeline. Idempotent:
 *  skips a file whose table already exists. payments (csv) gets inferred typing. */
export async function loadDemoData(
  client: DuckDBClient,
  applyInferred: (table: string) => Promise<void>,
): Promise<void> {
  for (const f of DEMO_FILES) {
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

/** Seed the example recipe tabs (first becomes active). */
export function seedExampleTabs(): void {
  useSession.getState().seedTabs(EXAMPLE_QUERIES)
}

/** Load the prebuilt sample report and switch to Report mode. */
export async function loadSampleReport(): Promise<void> {
  const res = await fetch(`${BASE}demo/sample-report.json`)
  if (!res.ok) throw new Error(`sample-report.json: HTTP ${res.status}`)
  const doc = deserializeReport(await res.text())
  useSession.getState().loadReport(doc)
  useSession.getState().setMode('report')
}
```

- [ ] **Step 2: Gate**

Run: `npm run lint && npm run build && npm test` → green (sample-report.json is added in Task 5; `loadSampleReport` only fetches it at runtime, so the build is fine now).

- [ ] **Step 3: Commit**

```bash
git add src/features/demoData.ts
git commit -F- <<'EOF'
feat(demo): demoData orchestrator (load data / seed tabs / open sample report)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

## Task 5: Prebuilt sample report

**Files:**
- Create: `public/demo/sample-report.json`
- Test: `src/core/sampleReport.test.ts`

**Interfaces:**
- Produces: `public/demo/sample-report.json` (a serialized `ReportDoc`). Consumed by Task 4 (`loadSampleReport`) at runtime.
- Block shape (`src/core/report.ts`): `TextBlock {type:'text',id,markdown}`, `WidgetBlock {type:'widget',id,title,sql,datasetNames:string[],vizType:'table'|'chart',caption}`. Widget SQL strings are single-line (valid JSON).

- [ ] **Step 1: Write the failing test**

Create `src/core/sampleReport.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deserializeReport, neededDatasets } from './report'

describe('sample-report.json', () => {
  const json = readFileSync(
    resolve(import.meta.dirname, '../../public/demo/sample-report.json'),
    'utf8',
  )

  it('deserializes to a non-empty report', () => {
    const doc = deserializeReport(json)
    expect(doc.version).toBe(1)
    expect(doc.blocks.length).toBeGreaterThan(0)
  })

  it('references only the demo tables', () => {
    const doc = deserializeReport(json)
    expect(neededDatasets(doc).every((t) => t === 'users' || t === 'payments')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/core/sampleReport.test.ts`
Expected: FAIL (file not found / cannot read `public/demo/sample-report.json`).

- [ ] **Step 3: Author the report**

Create `public/demo/sample-report.json` (widget SQL mirrors the Task 3 recipes — single-line so JSON is valid; `blk-<n>` ids so `loadReport` advances `seq` correctly):
```json
{
  "version": 1,
  "blocks": [
    { "type": "text", "id": "blk-1", "markdown": "# Демо: продуктовая аналитика\n\nПример нарративного отчёта в quackbook на данных учебника «SQL 101: Рецепты продуктового аналитика». Виджеты ниже пересчитываются по загруженным таблицам `users` и `payments`." },
    { "type": "widget", "id": "blk-2", "title": "Дневная аудитория (DAU)", "sql": "SELECT CAST(DateUTC AS DATE) AS day, count(DISTINCT UserID) AS dau FROM users GROUP BY 1 ORDER BY 1;", "datasetNames": ["users"], "vizType": "chart", "caption": "Уникальные пользователи по дням." },
    { "type": "text", "id": "blk-3", "markdown": "## Выручка\n\nНакопительная выручка по дням (платежи)." },
    { "type": "widget", "id": "blk-4", "title": "Накопительная выручка", "sql": "SELECT day, sum(daily_revenue) OVER (ORDER BY day) AS cumulative_revenue, daily_revenue FROM (SELECT CAST(CAST(replace(DateUTC, ' UTC', '') AS TIMESTAMP) AS DATE) AS day, sum(CAST(RevenueUSD AS DOUBLE)) AS daily_revenue FROM payments GROUP BY 1) ORDER BY day;", "datasetNames": ["payments"], "vizType": "chart", "caption": "" },
    { "type": "widget", "id": "blk-5", "title": "A/B: конверсия в оплату", "sql": "SELECT u.ControlOrTest AS variant, count(DISTINCT u.UserID) AS users, count(DISTINCT p.UserID) AS payers, round(100.0 * count(DISTINCT p.UserID) / count(DISTINCT u.UserID), 2) AS conversion_pct FROM users u LEFT JOIN payments p ON CAST(p.UserID AS BIGINT) = u.UserID GROUP BY 1 ORDER BY 1;", "datasetNames": ["users", "payments"], "vizType": "table", "caption": "Конверсия по группам A/B." },
    { "type": "text", "id": "blk-6", "markdown": "Данные: [SQL 101 — Рецепты продуктового аналитика](https://github.com/cosmiksoul/sql-product-analytics-cookbook) (MIT)." }
  ]
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/core/sampleReport.test.ts` → PASS.

- [ ] **Step 5: Add the report's widget SQL to the integration guard**

Append to `src/core/exampleQueries.integration.test.ts` (after the existing `describe`), so the report's widget SQL is also run on real data:
```ts
import { deserializeReport } from './report'

describe('sample-report widget SQL runs on the demo data', () => {
  const json = readFileSync(
    resolve(import.meta.dirname, '../../public/demo/sample-report.json'),
    'utf8',
  )
  const widgets = deserializeReport(json).blocks.filter((b) => b.type === 'widget')
  for (const w of widgets) {
    it(`returns rows: ${w.type === 'widget' ? w.title : ''}`, async () => {
      if (w.type !== 'widget') return
      const res = arrowToRows(await client.query(w.sql))
      expect(res.numRows).toBeGreaterThan(0)
    })
  }
})
```

- [ ] **Step 6: Run + gate + commit**

Run: `npx vitest run src/core/exampleQueries.integration.test.ts src/core/sampleReport.test.ts` → green.
Run: `npm run lint && npm run build && npm test` → green.
```bash
git add public/demo/sample-report.json src/core/sampleReport.test.ts src/core/exampleQueries.integration.test.ts
git commit -F- <<'EOF'
feat(demo): prebuilt sample report + validity/run guards

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

## Task 6: WelcomeScreen + Shell wiring

**Files:**
- Create: `src/components/WelcomeScreen.tsx`
- Modify: `src/features/Shell.tsx` (replace `explore-empty`), `src/index.css` (welcome styles)

**Interfaces:**
- Consumes: `loadDemoData`/`seedExampleTabs`/`loadSampleReport` (Task 4), `useSchemaActions` (`src/features/useSchemaActions.ts`).
- `<WelcomeScreen client={DuckDBClient} />`.

By eye (presentation). Verify against the dark theme; the dropzone already lives in the rail for actual file loading.

- [ ] **Step 1: Implement WelcomeScreen**

Create `src/components/WelcomeScreen.tsx`:
```tsx
import { useState } from 'react'
import type { DuckDBClient } from '../db/duckdbClient'
import { useSchemaActions } from '../features/useSchemaActions'
import { loadDemoData, seedExampleTabs, loadSampleReport } from '../features/demoData'

export function WelcomeScreen({ client }: { client: DuckDBClient }) {
  const { applyInferred } = useSchemaActions(client)
  const [busy, setBusy] = useState<null | 'data' | 'report'>(null)

  async function onData() {
    setBusy('data')
    try {
      await loadDemoData(client, applyInferred)
      seedExampleTabs()
    } catch (e) {
      alert('Не удалось загрузить демо-данные: ' + String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onReport() {
    setBusy('report')
    try {
      await loadDemoData(client, applyInferred)
      await loadSampleReport()
    } catch (e) {
      alert('Не удалось открыть пример отчёта: ' + String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="welcome">
      <h1 className="welcome-title">Аналитический ноутбук в браузере</h1>
      <p className="welcome-lead">
        Брось CSV или Parquet в панель слева — и работай: пиши SQL с JOIN/UNION,
        смотри профиль значений, закрепляй результаты виджетами и собирай
        нарративный отчёт. Всё локально, без бэкенда.
      </p>
      <ol className="welcome-steps">
        <li><b>Данные.</b> CSV/Parquet → схема и типы в рейле слева.</li>
        <li><b>Исследование.</b> SQL → таблица, график, профиль значений.</li>
        <li><b>Отчёт.</b> Закрепи виджеты, впиши текст, выгрузи в HTML/PDF.</li>
      </ol>
      <div className="welcome-actions">
        <button className="welcome-cta" disabled={busy !== null} onClick={onData}>
          {busy === 'data' ? 'Грузим…' : 'Загрузить демо-данные'}
        </button>
        <button className="welcome-cta ghost" disabled={busy !== null} onClick={onReport}>
          {busy === 'report' ? 'Грузим…' : 'Открыть пример отчёта'}
        </button>
      </div>
      <p className="welcome-credit">
        Демо-данные из учебника{' '}
        <a href="https://github.com/cosmiksoul/sql-product-analytics-cookbook" target="_blank" rel="noopener noreferrer">
          «SQL 101: Рецепты продуктового аналитика»
        </a>{' '}
        · MIT. Запросы в книге на BigQuery — примеры в демо адаптированы под DuckDB.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Wire into Shell**

In `src/features/Shell.tsx`, add the import:
```tsx
import { WelcomeScreen } from '../components/WelcomeScreen'
```
Replace the empty-state block (currently):
```tsx
              <div className="explore-empty">
                Брось файлы в панель слева, чтобы начать.
              </div>
```
with:
```tsx
              <WelcomeScreen client={client} />
```

- [ ] **Step 3: Style (by eye)**

Add to `src/index.css` (reuse tokens — `--surface`, `--accent`, `--text`, `--radius`):
```css
/* --- M6 welcome --- */
.welcome { max-width: 640px; margin: 6vh auto 0; padding: 0 24px; display: flex; flex-direction: column; gap: 16px; }
.welcome-title { font-size: 26px; font-weight: 700; color: var(--text); }
.welcome-lead { color: var(--text-dim); line-height: 1.6; font-size: 15px; }
.welcome-steps { color: var(--text-dim); line-height: 1.7; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
.welcome-steps b { color: var(--text); }
.welcome-actions { display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap; }
.welcome-cta { background: var(--accent); color: var(--bg); border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: 9px 16px; font-weight: 600; cursor: pointer; }
.welcome-cta:hover { background: var(--accent-2); }
.welcome-cta.ghost { background: var(--surface); color: var(--text); border-color: var(--border); }
.welcome-cta.ghost:hover { background: var(--surface-2); }
.welcome-cta:disabled { opacity: .55; cursor: progress; }
.welcome-credit { color: var(--text-faint); font-size: 12.5px; line-height: 1.5; margin-top: 8px; }
.welcome-credit a { color: var(--accent); }
```

- [ ] **Step 4: Verify by eye + gate**

Run: `npm run dev` — with no datasets, Explore shows the welcome screen. Click «Загрузить демо-данные» → `users`+`payments` appear in the rail, 4 query tabs seeded, first runnable (⌘↵). Click «Открыть пример отчёта» (after Reset) → loads data + switches to a populated Report. Then:
Run: `npm run lint && npm run build && npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add src/components/WelcomeScreen.tsx src/features/Shell.tsx src/index.css
git commit -F- <<'EOF'
feat(onboarding): welcome screen with demo-data + sample-report CTAs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

# Slice 2 — About

## Task 7: About modal + topbar «?»

**Files:**
- Create: `src/components/AboutModal.tsx`
- Modify: `src/features/Shell.tsx` (topbar «?» + `aboutOpen` state), `src/index.css` (modal styles)

By eye (presentation).

- [ ] **Step 1: Implement AboutModal**

Create `src/components/AboutModal.tsx`:
```tsx
import { useEffect } from 'react'

export function AboutModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="О quackbook" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" aria-label="закрыть" onClick={onClose}>✕</button>
        <h2>quackbook</h2>
        <p>Браузерный аналитический ноутбук: данные → SQL и профиль значений → нарративный отчёт с экспортом. Без бэкенда.</p>
        <h3>Как устроено</h3>
        <p>DuckDB-WASM в Web Worker (Apache Arrow). Всё исполняется в браузере, статика на GitHub Pages — данные никуда не уходят.</p>
        <h3>Ограничения v1</h3>
        <ul>
          <li>только локально загруженные файлы (CSV / Parquet);</li>
          <li>перезагрузка страницы очищает данные (без персиста);</li>
          <li>экспорт самодостаточный: HTML / PDF / CSV / Parquet.</li>
        </ul>
        <h3>Данные демо</h3>
        <p>Из учебника «SQL 101: Рецепты продуктового аналитика» (MIT).</p>
        <p className="modal-foot">
          MIT ·{' '}
          <a href="https://github.com/cosmiksoul/sql-product-analytics-cookbook" target="_blank" rel="noopener noreferrer">учебник</a>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into Shell**

In `src/features/Shell.tsx`:
- add imports:
```tsx
import { useState } from 'react'
import { AboutModal } from '../components/AboutModal'
```
- add state inside `Shell` (top of component):
```tsx
  const [aboutOpen, setAboutOpen] = useState(false)
```
- in the `topbar-right`, before the `pill-local` span, add:
```tsx
          <button className="about-btn" title="о quackbook" aria-label="о quackbook" onClick={() => setAboutOpen(true)}>?</button>
```
- before the closing `</div>` of `.shell` (after `<Toast />`), add:
```tsx
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
```

- [ ] **Step 3: Style (by eye)**

Add to `src/index.css`:
```css
/* --- M6 about modal --- */
.about-btn { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--border); background: var(--surface); color: var(--text-dim); cursor: pointer; font-size: 14px; line-height: 1; }
.about-btn:hover { background: var(--surface-2); color: var(--text); }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: grid; place-items: center; z-index: 60; padding: 24px; }
.modal { position: relative; max-width: 480px; width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px 24px; box-shadow: var(--shadow-card); color: var(--text-dim); line-height: 1.55; }
.modal h2 { color: var(--text); font-size: 20px; margin-bottom: 6px; }
.modal h3 { color: var(--text); font-size: 13px; text-transform: uppercase; letter-spacing: .04em; margin: 16px 0 4px; }
.modal ul { padding-left: 18px; display: flex; flex-direction: column; gap: 2px; }
.modal a { color: var(--accent); }
.modal-x { position: absolute; top: 12px; right: 12px; border: 0; background: transparent; color: var(--text-faint); font-size: 16px; cursor: pointer; }
.modal-x:hover { color: var(--text); }
.modal-foot { margin-top: 16px; font-size: 12.5px; color: var(--text-faint); }
```

- [ ] **Step 4: Verify by eye + gate**

Run: `npm run dev` — «?» in the topbar opens the modal; Esc / click-outside / ✕ close it.
Run: `npm run lint && npm run build && npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add src/components/AboutModal.tsx src/features/Shell.tsx src/index.css
git commit -F- <<'EOF'
feat(about): About/architecture modal via topbar «?»

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

# Slice 3 — Export query result

## Task 8: `duckdbClient.exportQuery`

**Files:**
- Modify: `src/db/duckdbClient.ts` (interface + impl)
- Test: `src/db/duckdbClient.export.test.ts`

**Interfaces:**
- Produces: `exportQuery(sql: string, format: 'csv' | 'parquet'): Promise<Uint8Array>`. Consumed by Task 9 (`downloadResult`).
- Mechanism: `COPY (<sql sans trailing ;>) TO '<vfs>' (FORMAT CSV, HEADER | PARQUET)` → `db.copyFileToBuffer` → `db.dropFile`.

- [ ] **Step 1: Write the failing test**

Create `src/db/duckdbClient.export.test.ts`:
```ts
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
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/db/duckdbClient.export.test.ts`
Expected: FAIL (`exportQuery is not a function`).

- [ ] **Step 3: Add to the interface**

In `src/db/duckdbClient.ts`, in the `DuckDBClient` interface (after `query`, ~line 31) add:
```ts
  /** Run a query and return its FULL result serialized as CSV or Parquet bytes. */
  exportQuery(sql: string, format: 'csv' | 'parquet'): Promise<Uint8Array>
```

- [ ] **Step 4: Implement**

In `src/db/duckdbClient.ts`, in the returned object (after `query: run,`, ~line 69) add:
```ts
    async exportQuery(sql, format) {
      const ext = format === 'parquet' ? 'parquet' : 'csv'
      const fname = `qb-export.${ext}`
      const select = sql.trim().replace(/;\s*$/, '').trim()
      const fmt = format === 'parquet' ? 'PARQUET' : 'CSV, HEADER'
      await run(`COPY (${select}) TO '${fname}' (FORMAT ${fmt})`)
      const buf = await db.copyFileToBuffer(fname)
      await db.dropFile(fname)
      return buf
    },
```

- [ ] **Step 5: Run to verify it passes + gate**

Run: `npx vitest run src/db/duckdbClient.export.test.ts` → PASS.
Run: `npm run lint && npm run build && npm test` → green.

- [ ] **Step 6: Commit**

```bash
git add src/db/duckdbClient.ts src/db/duckdbClient.export.test.ts
git commit -F- <<'EOF'
feat(export): duckdbClient.exportQuery — full result to CSV/Parquet bytes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

## Task 9: `downloadResult` + ResultPanel buttons

**Files:**
- Create: `src/features/exportResult.ts`
- Modify: `src/components/ResultPanel.tsx` (export buttons), `src/index.css`

**Interfaces:**
- Consumes: `exportQuery` (Task 8).
- Produces: `downloadResult(client, sql, format): Promise<void>`.

By eye (DOM download). Firefox-safe anchor pattern mirrors `src/features/exportReport.ts`.

- [ ] **Step 1: Implement downloadResult**

Create `src/features/exportResult.ts`:
```ts
import type { DuckDBClient } from '../db/duckdbClient'

const MIME: Record<'csv' | 'parquet', string> = {
  csv: 'text/csv',
  parquet: 'application/octet-stream',
}

/** Export the FULL result of `sql` and trigger a browser download. */
export async function downloadResult(
  client: DuckDBClient,
  sql: string,
  format: 'csv' | 'parquet',
): Promise<void> {
  const bytes = await client.exportQuery(sql, format)
  const blob = new Blob([bytes], { type: MIME[format] })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `quackbook-result.${format}`
  document.body.appendChild(a) // Firefox needs the anchor in the DOM
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
```

- [ ] **Step 2: Add buttons to ResultPanel**

In `src/components/ResultPanel.tsx`:
- add import:
```tsx
import { downloadResult } from '../features/exportResult'
```
- inside the component body (before `return`), add a handler:
```tsx
  async function exportResult(format: 'csv' | 'parquet') {
    try {
      await downloadResult(client, sql, format)
    } catch (e) {
      setToast('Экспорт не удался: ' + String(e))
    }
  }
```
- in the header, immediately after the `{result && ( <button className="pin-btn" ... /> )}` block (closes ~line 97), add:
```tsx
        {result && (
          <div className="export-group">
            <button className="export-btn" title="скачать полный результат в CSV" onClick={() => void exportResult('csv')}>CSV</button>
            <button className="export-btn" title="скачать полный результат в Parquet" onClick={() => void exportResult('parquet')}>Parquet</button>
          </div>
        )}
```

- [ ] **Step 3: Style (by eye)**

Add to `src/index.css`:
```css
/* --- M6 result export --- */
.export-group { display: inline-flex; gap: 6px; }
.export-btn { background: var(--surface); color: var(--text-dim); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 3px 9px; cursor: pointer; font-size: 12px; }
.export-btn:hover { background: var(--surface-2); color: var(--text); }
```

- [ ] **Step 4: Verify by eye + gate**

Run: `npm run dev` — load demo, run a query, click CSV and Parquet → files download; reopen the CSV (header + rows), re-load the Parquet into quackbook to confirm validity. Bad SQL path can't arise (buttons show only with a result), but a forced error surfaces a toast.
Run: `npm run lint && npm run build && npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add src/features/exportResult.ts src/components/ResultPanel.tsx src/index.css
git commit -F- <<'EOF'
feat(export): CSV/Parquet result download buttons in the result panel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

# Slice 4 — Schema-aware autocomplete

## Task 10: `buildSqlSchema`

**Files:**
- Create: `src/core/sqlSchema.ts`
- Test: `src/core/sqlSchema.test.ts`

**Interfaces:**
- Produces: `buildSqlSchema(datasets: Dataset[]): Record<string, string[]>` — `table -> column names`, excluding internal `_qb_*` tables. Consumed by Task 11.
- Consumes: `Dataset` (`src/state/session.ts`), `isInternalTable` (`src/core/sql.ts`).

- [ ] **Step 1: Write the failing test**

Create `src/core/sqlSchema.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { Dataset } from '../state/session'
import { buildSqlSchema } from './sqlSchema'

const ds = (table: string, cols: string[]): Dataset => ({
  table,
  fileName: `${table}.csv`,
  bytes: 0,
  kind: 'csv',
  columns: cols.map((name) => ({ name, type: 'VARCHAR' })),
})

describe('buildSqlSchema', () => {
  it('maps each dataset table to its column names', () => {
    expect(buildSqlSchema([ds('users', ['UserID', 'DateUTC'])])).toEqual({
      users: ['UserID', 'DateUTC'],
    })
  })

  it('excludes internal _qb_ tables', () => {
    expect(buildSqlSchema([ds('users', ['a']), ds('_qb_raw_users', ['a'])])).toEqual({
      users: ['a'],
    })
  })

  it('returns {} for no datasets', () => {
    expect(buildSqlSchema([])).toEqual({})
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/core/sqlSchema.test.ts`
Expected: FAIL (cannot find `./sqlSchema`).

- [ ] **Step 3: Implement**

Create `src/core/sqlSchema.ts`:
```ts
import type { Dataset } from '../state/session'
import { isInternalTable } from './sql'

/**
 * Build a @codemirror/lang-sql schema namespace from loaded datasets:
 * `{ tableName: [columnName, ...] }`. Internal quackbook tables (_qb_*) are
 * excluded so completion only offers user-facing tables/columns.
 */
export function buildSqlSchema(datasets: Dataset[]): Record<string, string[]> {
  const schema: Record<string, string[]> = {}
  for (const d of datasets) {
    if (isInternalTable(d.table)) continue
    schema[d.table] = d.columns.map((c) => c.name)
  }
  return schema
}
```

- [ ] **Step 4: Run to verify it passes + gate**

Run: `npx vitest run src/core/sqlSchema.test.ts` → PASS.
Run: `npm run lint && npm run build && npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add src/core/sqlSchema.ts src/core/sqlSchema.test.ts
git commit -F- <<'EOF'
feat(editor): buildSqlSchema — lang-sql namespace from loaded datasets

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

## Task 11: SqlEditor schema prop + Explore wiring

**Files:**
- Modify: `src/components/SqlEditor.tsx` (schema prop + CM6 `Compartment`), `src/features/Explore.tsx` (build + pass schema)

By eye (editor behavior). Logic in `buildSqlSchema` is already tested.

- [ ] **Step 1: SqlEditor — accept `schema`, reconfigure via Compartment**

In `src/components/SqlEditor.tsx`:
- change the state import to include `Compartment`:
```tsx
import { EditorState, Prec, Compartment } from '@codemirror/state'
```
- extend `Props`:
```tsx
interface Props {
  value: string
  onChange: (value: string) => void
  onRun: (sql: string) => void
  schema?: Record<string, string[]>
}
```
- in the component signature, destructure `schema`:
```tsx
export function SqlEditor({ value, onChange, onRun, schema }: Props) {
```
- add a compartment + a latest-schema ref near the `cb` ref (after line ~25):
```tsx
  const schemaComp = useRef(new Compartment())
  const schemaRef = useRef(schema)
  // eslint-disable-next-line react-hooks/refs
  schemaRef.current = schema
```
- in the mount-once `extensions` array, **replace** the bare `sql(),` line with:
```tsx
        schemaComp.current.of(sql({ schema: schemaRef.current ?? {} })),
```
- add a reconfigure effect **after** the existing value-sync `useEffect` (after line ~72):
```tsx
  // Reconfigure the SQL language with the latest schema when datasets change.
  useEffect(() => {
    const v = view.current
    if (!v) return
    v.dispatch({ effects: schemaComp.current.reconfigure(sql({ schema: schema ?? {} })) })
  }, [schema])
```

- [ ] **Step 2: Explore — build the schema and pass it down**

In `src/features/Explore.tsx`:
- add imports:
```tsx
import { useMemo } from 'react'
import { buildSqlSchema } from '../core/sqlSchema'
```
- read datasets + memoize the schema (after the existing `useSession` selectors, ~line 17):
```tsx
  const datasets = useSession((s) => s.datasets)
  const schema = useMemo(() => buildSqlSchema(datasets), [datasets])
```
- pass it to `SqlEditor` (the JSX ~line 63):
```tsx
        <SqlEditor
          key={tab.id}
          value={tab.sql}
          onChange={(v) => updateTabSql(tab.id, v)}
          onRun={run}
          schema={schema}
        />
```

- [ ] **Step 3: Verify by eye + gate**

Run: `npm run dev` — load demo data, open a query tab, type `SEL` → keyword completion; type a table name then `.` (e.g. `users.`) → column completions for that table; typing a bare table name offers `users`/`payments`. Loading a new file updates completions without remounting.
Run: `npm run lint && npm run build && npm test` → green (watch for the `react-hooks/refs` lint on `schemaRef.current` — the inline `eslint-disable` mirrors the existing `cb.current` pattern).

- [ ] **Step 4: Commit**

```bash
git add src/components/SqlEditor.tsx src/features/Explore.tsx
git commit -F- <<'EOF'
feat(editor): schema-aware SQL autocomplete (lang-sql schema via CM6 Compartment)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Final verification (whole milestone)

- [ ] `npm run lint` → 0 errors (1 known useVirtualizer warning OK).
- [ ] `npm run build` → green (full `tsc`).
- [ ] `npm test` → green, including the demo integration guard (`exampleQueries.integration`, `sampleReport`) and `exportQuery`/`seedTabs`/`sqlSchema` unit tests.
- [ ] By eye (`npm run dev`): welcome → demo load → seeded tabs run → sample report opens → result export (CSV/Parquet) downloads → About modal → autocomplete (table + `table.` columns).

---

## Plan Self-Review

**Spec coverage:** Pillar 1 onboarding → Task 6; Pillar 2 demo (format/bridge/recipes/report/credit) → Tasks 1,3,4,5,6; Pillar 3 export → Tasks 8,9; Pillar 4 autocomplete → Tasks 10,11; About → Task 7; data-prep → Task 1; `.gitignore`/DATA-LICENSE → Task 1. All spec sections mapped.

**Placeholder scan:** every code step shows full code; SQL is concrete; the only "fix until it passes" is Task 3 Step 3, which is a real empirical loop against committed data (the test is the spec), not a placeholder.

**Type consistency:** `seedTabs(specs: {title,sql}[])` (Task 2) ↔ called with `EXAMPLE_QUERIES: {title,sql}[]` (Tasks 3/4). `exportQuery(sql,format)` (Task 8) ↔ `downloadResult` (Task 9). `buildSqlSchema(datasets): Record<string,string[]>` (Task 10) ↔ `SqlEditor` prop `schema?: Record<string,string[]>` ↔ `sql({ schema })` (Task 11). `WidgetBlock` shape in sample-report.json (Task 5) matches `src/core/report.ts`. `applyInferred: (table)=>Promise<void>` (Task 4) matches `useSchemaActions` return.

Issues found: none. Ready for execution.
