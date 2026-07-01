# M7a «Витрины» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save a query result as a named, reusable VIEW (live) or TABLE (snapshot), surfaced in the rail + autocomplete and queryable from other tabs, created via a «+ витрина» button on the Explore result panel.

**Architecture:** A mart is an extended `Dataset` (`kind: 'view' | 'table'` + `martSql`), so the rail, `buildSqlSchema` autocomplete, and source-profiler pick it up with no new machinery. Pure DDL builders + name validation live in `core/mart.ts` (TDD); side-effect orchestration (exec DDL → describe → store) lives in `features/useMartActions.ts`; the UI is a result-panel button/form + a rail «ВИТРИНЫ» section (by-eye).

**Tech Stack:** React 19 + TS 6, Zustand 5, DuckDB-WASM (`@duckdb/duckdb-wasm@1.32.0`), Vitest 4 (node env). Spec: `docs/superpowers/specs/2026-07-01-quackbook-m7a-marts-design.md`.

## Global Constraints

- **0 new dependencies.** Everything reuses the existing stack.
- **Determinism:** never `Math.random` / `Date.now` / `new Date` (they throw in the toolchain). No new ids are minted in M7a — marts are keyed by their user-given name.
- **TDD boundary:** logic + store are red→green (Vitest node, `src/**/*.test.ts`). Presentation (form, rail section, CSS) is verified by eye — no jsdom/RTL.
- **Gate every task:** `npm run lint` (0 errors) + `npm run build` (full `tsc -b`) + `npm test` all green before commit.
- **Firewall:** SQL views/tables are in scope (join/union/SQL composition). Do NOT build: derived columns in the schema editor, a visual join/mart builder, persistence (OPFS), an EXPLAIN/plan tab.
- **Mart identity:** name must match `^[A-Za-z_][A-Za-z0-9_]*$` (latin/digit/underscore, not leading digit) so it needs no quoting in hand-written SQL or autocomplete.
- **Commits:** message via bash here-doc (`git commit -F- <<'EOF' … EOF`), ending with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Branch: `m7a-marts` (already created off `main`, spec commit `d1e53da`).

## File Structure

- **Create** `src/core/mart.ts` — pure DDL builders (`buildCreateMart`, `buildDropMart`) + `validateMartName`. No React, no DuckDB, no store.
- **Create** `src/core/mart.test.ts` — unit tests for the above.
- **Create** `src/features/useMartActions.ts` — orchestration factory `useMartActions(client)` → `{ createMart, refreshMart, dropMart }` (side effects: exec DDL, describe, store).
- **Create** `src/features/mart.integration.test.ts` — node DuckDB integration over `public/demo/*` + a synthetic table, exercising create(view/table)/query/collision/refresh/drop through `useMartActions`.
- **Modify** `src/state/session.ts` — extend `Dataset.kind` union + add `martSql?`; add `removeDataset` action.
- **Modify** `src/state/session.test.ts` — test for `removeDataset`.
- **Modify** `src/components/ResultPanel.tsx` — «+ витрина» button + inline create form.
- **Modify** `src/features/Rail.tsx` — split sources vs marts; add «ВИТРИНЫ» section.
- **Modify** `src/index.css` — styles for the create form + the rail marts section.

---

### Task 1: `core/mart.ts` — DDL builders + name validation (TDD)

**Files:**
- Create: `src/core/mart.ts`
- Test: `src/core/mart.test.ts`

**Interfaces:**
- Consumes: `quoteIdent`, `isInternalTable` from `src/core/sql.ts` (`quoteIdent(name): string` double-quotes + escapes; `isInternalTable(name): boolean` is true for `_qb_raw_*` / `_qb_result_*`).
- Produces: `type MartKind = 'view' | 'table'`; `buildCreateMart(name: string, sql: string, kind: MartKind): string`; `buildDropMart(name: string, kind: MartKind): string`; `validateMartName(name: string, taken: string[]): string | null`.

- [ ] **Step 1: Write the failing tests**

Create `src/core/mart.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildCreateMart, buildDropMart, validateMartName } from './mart'

describe('buildCreateMart', () => {
  it('builds a VIEW', () => {
    expect(buildCreateMart('rev', 'SELECT 1', 'view')).toBe(
      'CREATE OR REPLACE VIEW "rev" AS SELECT 1',
    )
  })
  it('builds a TABLE', () => {
    expect(buildCreateMart('rev', 'SELECT 1', 'table')).toBe(
      'CREATE OR REPLACE TABLE "rev" AS SELECT 1',
    )
  })
  it('strips a trailing semicolon + whitespace from the query', () => {
    expect(buildCreateMart('rev', 'SELECT 1;  ', 'view')).toBe(
      'CREATE OR REPLACE VIEW "rev" AS SELECT 1',
    )
  })
  it('quotes the name', () => {
    expect(buildCreateMart('a"b', 'SELECT 1', 'table')).toBe(
      'CREATE OR REPLACE TABLE "a""b" AS SELECT 1',
    )
  })
})

describe('buildDropMart', () => {
  it('drops a view / table idempotently', () => {
    expect(buildDropMart('rev', 'view')).toBe('DROP VIEW IF EXISTS "rev"')
    expect(buildDropMart('rev', 'table')).toBe('DROP TABLE IF EXISTS "rev"')
  })
})

describe('validateMartName', () => {
  it('rejects an empty / whitespace name', () => {
    expect(validateMartName('   ', [])).toBeTruthy()
  })
  it('rejects a leading digit', () => {
    expect(validateMartName('1rev', [])).toBeTruthy()
  })
  it('rejects non-identifier characters', () => {
    expect(validateMartName('rev-1', [])).toBeTruthy()
    expect(validateMartName('моя', [])).toBeTruthy()
  })
  it('rejects an internal (_qb_*) name', () => {
    expect(validateMartName('_qb_raw_x', [])).toBeTruthy()
  })
  it('rejects a name already taken by a dataset/mart', () => {
    expect(validateMartName('payments', ['payments'])).toBeTruthy()
  })
  it('accepts a fresh simple identifier', () => {
    expect(validateMartName('rev_by_day', ['payments'])).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/mart.test.ts`
Expected: FAIL — `Failed to resolve import "./mart"` / functions not defined.

- [ ] **Step 3: Write the implementation**

Create `src/core/mart.ts`:

```ts
import { quoteIdent, isInternalTable } from './sql'

export type MartKind = 'view' | 'table'

/** Strip a trailing `;` (+ surrounding whitespace): `CREATE … AS <select>;`
 *  with the semicolon inside is invalid SQL. */
function stripTrailingSemicolon(sql: string): string {
  return sql.trim().replace(/;\s*$/, '').trim()
}

/** DDL: (re)create a mart as a live VIEW or a snapshot TABLE over a query. */
export function buildCreateMart(name: string, sql: string, kind: MartKind): string {
  const object = kind === 'view' ? 'VIEW' : 'TABLE'
  return `CREATE OR REPLACE ${object} ${quoteIdent(name)} AS ${stripTrailingSemicolon(sql)}`
}

/** DDL: drop a mart (idempotent). */
export function buildDropMart(name: string, kind: MartKind): string {
  const object = kind === 'view' ? 'VIEW' : 'TABLE'
  return `DROP ${object} IF EXISTS ${quoteIdent(name)}`
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Validate a mart name. Returns an inline error message (Russian) or null when
 * valid. Rules: non-empty after trim; a simple identifier (latin/digit/_, not
 * leading digit) so it needs no quoting in hand-written SQL / autocomplete;
 * not an internal quackbook table; not already taken by a dataset/mart.
 */
export function validateMartName(name: string, taken: string[]): string | null {
  const n = name.trim()
  if (n === '') return 'Введите имя витрины'
  if (!NAME_RE.test(n)) return 'Только латиница, цифры и _ (не с цифры)'
  if (isInternalTable(n)) return 'Это имя зарезервировано'
  if (taken.includes(n)) return `Имя «${n}» уже занято`
  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/mart.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Full gate + commit**

Run: `npm run lint && npm run build && npm test`
Expected: lint 0 errors, build OK, all tests pass.

```bash
git add src/core/mart.ts src/core/mart.test.ts
git commit -F- <<'EOF'
feat(m7a): mart DDL builders + name validation (core/mart.ts)

buildCreateMart (CREATE OR REPLACE VIEW|TABLE … AS <select>, trailing ; stripped),
buildDropMart (DROP … IF EXISTS), validateMartName (^[A-Za-z_][A-Za-z0-9_]*$,
no internal/collision). Pure core, TDD.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: `Dataset` extension + `removeDataset` store action (TDD)

**Files:**
- Modify: `src/state/session.ts` (Dataset interface ~lines 13-29; `SessionState` action list ~line 63; action impl ~line 138)
- Test: `src/state/session.test.ts`

**Interfaces:**
- Produces: `Dataset.kind` widened to `'csv' | 'parquet' | 'view' | 'table'`; new optional `Dataset.martSql?: string`; store action `removeDataset(table: string): void`.
- Consumes: nothing new.

Note: widening `kind` is type-safe — every existing `Dataset.kind` use is a `=== 'csv'` check or a ternary (Rail badge, loadFiles, useSchemaActions, demoData, Shell), none an exhaustive switch. `kind === 'csv'` stays the only trigger for the schema editor, so marts never show it.

- [ ] **Step 1: Write the failing test**

Add to `src/state/session.test.ts` (in the same describe block as the other report/dataset tests — a `beforeEach` already resets the store):

```ts
  it('removeDataset drops the matching dataset and keeps the rest', () => {
    const s = useSession.getState()
    s.addDataset({ table: 'a', fileName: 'a.csv', bytes: 1, kind: 'csv', columns: [] })
    s.addDataset({
      table: 'm', fileName: 'm', bytes: 0, kind: 'view', columns: [], martSql: 'SELECT 1',
    })
    s.removeDataset('a')
    expect(useSession.getState().datasets.map((d) => d.table)).toEqual(['m'])
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/state/session.test.ts -t removeDataset`
Expected: FAIL — `s.removeDataset is not a function` (and a TS error on `kind: 'view'` if run via build).

- [ ] **Step 3: Extend the `Dataset` interface**

In `src/state/session.ts`, change the `kind` field and add `martSql` (interface starts ~line 13):

```ts
export interface Dataset {
  table: string
  fileName: string
  bytes: number
  kind: 'csv' | 'parquet' | 'view' | 'table'
  columns: { name: string; type: string; nullLoss?: number }[]
  // --- M7a: a mart (kind 'view'|'table') is a saved query; martSql is its
  // source SELECT (used to refresh a snapshot TABLE). Files have no martSql.
  martSql?: string
  // --- M2, only for kind === 'csv' ---
  rawTable?: string
  suggested?: { name: string; type: ColumnConfig['type'] }[]
  schemaConfig?: ColumnConfig[]
  schemaError?: string | null
  // --- M3 profile (source target), in-memory cache ---
  profile?: ColumnProfile[]
  rowCount?: number
  profiling?: boolean
  profileError?: string | null
}
```

- [ ] **Step 4: Declare + implement `removeDataset`**

In the `SessionState` interface, next to `addDataset` (~line 63):

```ts
  addDataset: (dataset: Dataset) => void
  removeDataset: (table: string) => void
```

In the store implementation, right after the `addDataset` impl (~line 139):

```ts
  addDataset: (dataset) =>
    set((s) => ({ datasets: [...s.datasets, dataset] })),
  removeDataset: (table) =>
    set((s) => ({ datasets: s.datasets.filter((d) => d.table !== table) })),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/state/session.test.ts -t removeDataset`
Expected: PASS.

- [ ] **Step 6: Full gate + commit**

Run: `npm run lint && npm run build && npm test`
Expected: all green (build confirms the widened `kind` breaks nothing).

```bash
git add src/state/session.ts src/state/session.test.ts
git commit -F- <<'EOF'
feat(m7a): Dataset gains kind 'view'|'table' + martSql; add removeDataset

A mart is an extended Dataset (kind discriminant + source SQL for refresh).
removeDataset backs mart deletion. kind==='csv' stays the only schema-editor
trigger, so marts never show it. TDD for removeDataset.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: `useMartActions` orchestration + node integration test

**Files:**
- Create: `src/features/useMartActions.ts`
- Create: `src/features/mart.integration.test.ts`

**Interfaces:**
- Consumes: `buildCreateMart`, `buildDropMart`, `validateMartName`, `MartKind` (Task 1); `Dataset`, `useSession`, `addDataset`, `removeDataset` (Task 2); `DuckDBClient` (`exec(sql): Promise<void>`, `describeTable(name): Promise<{name;type}[]>`, `query(sql): Promise<Table>`); `setToast` (existing store action).
- Produces: `useMartActions(client: DuckDBClient)` → `{ createMart(name, sql, kind): Promise<string | null>; refreshMart(name): Promise<void>; dropMart(name): Promise<void> }`. `createMart` returns an error string (shown inline) or null on success.

- [ ] **Step 1: Write the failing integration test**

Create `src/features/mart.integration.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import { createNodeDuckDB } from '../db/nodeDuckDB'
import { createClient, type DuckDBClient } from '../db/duckdbClient'
import { arrowToRows } from '../core/arrowToRows'
import { useSession } from '../state/session'
import { useMartActions } from './useMartActions'

let db: AsyncDuckDB
let client: DuckDBClient

beforeAll(async () => {
  db = await createNodeDuckDB()
  client = createClient(db)
  const demo = resolve(import.meta.dirname, '../../public/demo')
  await client.registerFile('payments.csv', new Uint8Array(readFileSync(resolve(demo, 'payments.csv'))))
  await client.loadCsvAllVarchar('payments.csv', 'payments')
}, 60_000)

afterAll(async () => { await db.terminate() })
beforeEach(() => { useSession.getState().reset() }) // clean store per test; DuckDB objects persist

describe('useMartActions over real DuckDB', () => {
  it('creates a VIEW mart, stores it, and it is queryable from another statement', async () => {
    const { createMart } = useMartActions(client)
    const err = await createMart('rev_view', 'SELECT count(*) AS n FROM payments', 'view')
    expect(err).toBeNull()
    const ds = useSession.getState().datasets.find((d) => d.table === 'rev_view')
    expect(ds?.kind).toBe('view')
    expect(ds?.columns.map((c) => c.name)).toEqual(['n'])
    expect(arrowToRows(await client.query('SELECT * FROM rev_view')).numRows).toBe(1)
  })

  it('creates a TABLE (snapshot) mart', async () => {
    const { createMart } = useMartActions(client)
    expect(await createMart('rev_tbl', 'SELECT count(*) AS n FROM payments', 'table')).toBeNull()
    expect(useSession.getState().datasets.find((d) => d.table === 'rev_tbl')?.kind).toBe('table')
    expect(arrowToRows(await client.query('SELECT * FROM rev_tbl')).numRows).toBe(1)
  })

  it('rejects a colliding name and does not duplicate the store entry', async () => {
    const { createMart } = useMartActions(client)
    await createMart('dup', 'SELECT 1 AS n', 'view')
    const err = await createMart('dup', 'SELECT 2 AS n', 'view')
    expect(err).toBeTruthy()
    expect(useSession.getState().datasets.filter((d) => d.table === 'dup')).toHaveLength(1)
  })

  it('returns the DuckDB error (and stores nothing) when the query is invalid', async () => {
    const { createMart } = useMartActions(client)
    const err = await createMart('bad', 'SELECT * FROM no_such_table', 'view')
    expect(err).toBeTruthy()
    expect(useSession.getState().datasets.find((d) => d.table === 'bad')).toBeUndefined()
  })

  it('VIEW stays live; TABLE is a snapshot until refreshMart', async () => {
    const { createMart, refreshMart } = useMartActions(client)
    await client.exec('CREATE OR REPLACE TABLE src AS SELECT * FROM (VALUES (1)) t(x)')
    await createMart('v_live', 'SELECT count(*) AS c FROM src', 'view')
    await createMart('t_snap', 'SELECT count(*) AS c FROM src', 'table')
    await client.exec('CREATE OR REPLACE TABLE src AS SELECT * FROM (VALUES (1),(2)) t(x)')
    expect(Number(arrowToRows(await client.query('SELECT c FROM v_live')).rows[0].c)).toBe(2)
    expect(Number(arrowToRows(await client.query('SELECT c FROM t_snap')).rows[0].c)).toBe(1)
    await refreshMart('t_snap')
    expect(Number(arrowToRows(await client.query('SELECT c FROM t_snap')).rows[0].c)).toBe(2)
  })

  it('drops a mart from DuckDB and the store', async () => {
    const { createMart, dropMart } = useMartActions(client)
    await createMart('gone', 'SELECT 1 AS n', 'view')
    await dropMart('gone')
    expect(useSession.getState().datasets.find((d) => d.table === 'gone')).toBeUndefined()
    await expect(client.query('SELECT * FROM gone')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/mart.integration.test.ts`
Expected: FAIL — `Failed to resolve import "./useMartActions"`.

- [ ] **Step 3: Write the implementation**

Create `src/features/useMartActions.ts`:

```ts
import { buildCreateMart, buildDropMart, validateMartName, type MartKind } from '../core/mart'
import type { DuckDBClient } from '../db/duckdbClient'
import { useSession } from '../state/session'

/**
 * Mart orchestration (side effects), mirroring useSchemaActions/useProfileActions:
 * DDL via client.exec, schema via client.describeTable, state via add/removeDataset.
 * createMart returns an inline error string or null on success; refresh/drop route
 * failures to a toast (drop still removes from the store — DROP IF EXISTS).
 *
 * martSql is stored as `sql.trim()` (any trailing `;` kept as-is): it is only ever
 * fed back to buildCreateMart, which strips the semicolon — so no separate
 * normalize step is duplicated here.
 */
export function useMartActions(client: DuckDBClient) {
  async function createMart(name: string, sql: string, kind: MartKind): Promise<string | null> {
    const n = name.trim()
    const taken = useSession.getState().datasets.map((d) => d.table)
    const invalid = validateMartName(n, taken)
    if (invalid) return invalid
    try {
      await client.exec(buildCreateMart(n, sql, kind))
      const columns = await client.describeTable(n)
      useSession.getState().addDataset({
        table: n,
        fileName: n,
        bytes: 0,
        kind,
        columns,
        martSql: sql.trim(),
      })
      return null
    } catch (e) {
      return String(e)
    }
  }

  // Only a snapshot TABLE needs refreshing; a VIEW is always live. Re-materialize
  // from martSql, re-read the schema, replace the store entry (drops any stale
  // profile cache with the old dataset object).
  async function refreshMart(name: string): Promise<void> {
    const ds = useSession.getState().datasets.find((d) => d.table === name)
    if (!ds || ds.kind !== 'table' || ds.martSql == null) return
    try {
      await client.exec(buildCreateMart(name, ds.martSql, 'table'))
      const columns = await client.describeTable(name)
      useSession.getState().removeDataset(name)
      useSession.getState().addDataset({
        table: name, fileName: name, bytes: 0, kind: 'table', columns, martSql: ds.martSql,
      })
    } catch (e) {
      useSession.getState().setToast('Не удалось обновить витрину: ' + String(e))
    }
  }

  async function dropMart(name: string): Promise<void> {
    const ds = useSession.getState().datasets.find((d) => d.table === name)
    if (!ds || (ds.kind !== 'view' && ds.kind !== 'table')) return
    try {
      await client.exec(buildDropMart(name, ds.kind))
    } catch {
      // DROP IF EXISTS is idempotent; remove from the store regardless.
    }
    useSession.getState().removeDataset(name)
  }

  return { createMart, refreshMart, dropMart }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/mart.integration.test.ts`
Expected: PASS (6 tests). (First run is slow — cold WASM init; the suite has a 60s `beforeAll`.)

- [ ] **Step 5: Full gate + commit**

Run: `npm run lint && npm run build && npm test`
Expected: all green.

```bash
git add src/features/useMartActions.ts src/features/mart.integration.test.ts
git commit -F- <<'EOF'
feat(m7a): useMartActions (create/refresh/drop) + DuckDB integration test

createMart validates → exec CREATE OR REPLACE → describeTable → addDataset
(returns inline error or null). refreshMart re-materializes a snapshot TABLE.
dropMart DROP IF EXISTS → removeDataset. Integration test over demo payments +
a synthetic src proves view-is-live / table-is-snapshot / refresh / drop.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: ResultPanel «+ витрина» button + inline create form (by-eye)

**Files:**
- Modify: `src/components/ResultPanel.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `useMartActions(client).createMart` (Task 3); `MartKind` (Task 1); existing props `{ result, sql, client }`; existing store `setToast`.
- Produces: no exports; a UI affordance that calls `createMart(name, sql, kind)`.

Presentation task — verified by eye, no automated test. `sql` is the same prop pin/export already use (the active tab's query).

- [ ] **Step 1: Add imports + form state**

In `src/components/ResultPanel.tsx`, add to the imports:

```ts
import { useState } from 'react'
import { useMartActions } from '../features/useMartActions'
import type { MartKind } from '../core/mart'
```

Inside the component, after `const { profileResult } = useProfileActions(client)`:

```ts
  const { createMart } = useMartActions(client)
  const [martOpen, setMartOpen] = useState(false)
  const [martName, setMartName] = useState('')
  const [martKind, setMartKind] = useState<MartKind>('view')
  const [martErr, setMartErr] = useState<string | null>(null)

  async function submitMart() {
    const err = await createMart(martName, sql, martKind)
    if (err) { setMartErr(err); return }
    setToast(`витрина «${martName.trim()}» создана`)
    setMartOpen(false)
    setMartName('')
    setMartErr(null)
  }
```

- [ ] **Step 2: Add the button next to the export group**

In the header JSX, immediately after the `{result && (<div className="export-group">…</div>)}` block, add:

```tsx
        {result && (
          <button
            className="export-btn mart-open"
            title="сохранить результат как витрину (VIEW/TABLE)"
            onClick={() => { setMartOpen((v) => !v); setMartErr(null) }}
          >
            + витрина
          </button>
        )}
```

- [ ] **Step 3: Add the inline form below the header**

Immediately after the closing `</header>`, add:

```tsx
      {martOpen && (
        <div className="mart-form">
          <input
            className="mart-name"
            autoFocus
            placeholder="имя_витрины"
            value={martName}
            onChange={(e) => { setMartName(e.target.value); setMartErr(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') void submitMart() }}
          />
          <div className="mart-kind">
            <button
              className={martKind === 'view' ? 'on' : ''}
              onClick={() => setMartKind('view')}
              title="живая — пересчитывается при обращении"
            >
              VIEW
            </button>
            <button
              className={martKind === 'table' ? 'on' : ''}
              onClick={() => setMartKind('table')}
              title="снапшот — фиксирует результат"
            >
              TABLE
            </button>
          </div>
          <button className="mart-create" onClick={() => void submitMart()}>создать</button>
          <button className="mart-cancel" onClick={() => { setMartOpen(false); setMartErr(null) }}>отмена</button>
          <span className="mart-hint">латиница / цифры / _</span>
          {martErr && <span className="mart-err">{martErr}</span>}
        </div>
      )}
```

- [ ] **Step 4: Add styles**

Append to `src/index.css` (near the `.export-*` rules):

```css
.mart-form { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 10px; padding: 10px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.mart-name { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); padding: 4px 8px; font-size: 13px; font-family: var(--font-mono); min-width: 160px; }
.mart-kind { display: inline-flex; gap: 2px; background: var(--bg); border-radius: var(--radius-sm); padding: 3px; }
.mart-kind button { border: 0; background: transparent; color: var(--text-dim); cursor: pointer; padding: 2px 9px; font-size: 11px; border-radius: 4px; letter-spacing: .04em; }
.mart-kind button.on { background: var(--surface-2); color: var(--text); }
.mart-create { background: var(--accent); color: #15201a; border: 1px solid var(--accent); border-radius: var(--radius-sm); font-weight: 600; padding: 4px 12px; cursor: pointer; }
.mart-cancel { background: var(--surface-2); color: var(--text-dim); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px 10px; cursor: pointer; }
.mart-hint { color: var(--text-faint); font-size: 10.5px; }
.mart-err { color: var(--danger); font-size: 12px; }
```

- [ ] **Step 5: Gate, eyeball, commit**

Run: `npm run lint && npm run build`
Then `npm run dev`: run a query → «+ витрина» → enter a name, pick VIEW/TABLE → «создать» → toast appears, form closes, the mart shows up in the rail (Task 5 renders it; before Task 5 it is at least queryable and in autocomplete). Try an invalid name (`1x`, `payments`) → inline error, form stays open.

```bash
git add src/components/ResultPanel.tsx src/index.css
git commit -F- <<'EOF'
feat(m7a): «+ витрина» button + inline create form in the result panel

Name input + VIEW/TABLE toggle (default VIEW) + create/cancel, inline validation
error. Saves the active tab's query as a mart via createMart.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Rail «ВИТРИНЫ» section (by-eye)

**Files:**
- Modify: `src/features/Rail.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `useMartActions(client).refreshMart / dropMart` (Task 3); existing `profile` from `useProfileActions`, `setProfileTarget`, `setExploreView`; `Dataset` (Task 2).
- Produces: a rail section listing marts with profile / refresh (table only) / delete actions.

Presentation task — verified by eye. Marts are excluded from the file «Источники» list and from the schema-editor flow (they have no `schemaConfig`); they get their own managed section.

- [ ] **Step 1: Split sources vs marts + wire mart actions**

In `src/features/Rail.tsx`, add the import:

```ts
import { useMartActions } from './useMartActions'
```

After `const datasets = allDatasets.filter((d) => !isInternalTable(d.table))` (line ~26), add:

```ts
  const isMart = (d: Dataset): boolean => d.kind === 'view' || d.kind === 'table'
  const sources = datasets.filter((d) => !isMart(d))
  const marts = datasets.filter(isMart)
  const { refreshMart, dropMart } = useMartActions(client)
```

Then, so file sources and the schema-editor flow ignore marts, replace the three later uses of `datasets` that concern FILE sources with `sources`:
- the «Источники» list map: `{sources.map((d) => (` … and its empty-state check `{sources.length === 0 && (`;
- the pruning table-name list: `datasets.map((d) => d.table)` inside the `referenced` computation → `sources.map((d) => d.table)`;
- `const fallbackTable = activeTab?.datasetTable ?? datasets[0]?.table` → `?? sources[0]?.table`.

(Leave `buildSqlSchema(datasets)` in `Explore.tsx` untouched — autocomplete SHOULD include marts.)

- [ ] **Step 2: Render the «ВИТРИНЫ» section**

Immediately after the closing `</ul>` of the «Источники» list (before the `{shownDatasets.map(…)}` block), add:

```tsx
      {marts.length > 0 && (
        <>
          <div className="rail-section-label">Витрины</div>
          <ul className="sources marts">
            {marts.map((m) => (
              <li className="mart-row" key={m.table}>
                <div className="mart-head">
                  <span className="source-kind">{m.kind}</span>
                  <span className="source-name">{m.table}</span>
                  <div className="mart-actions">
                    <button
                      className="mart-act"
                      title="профиль витрины"
                      onClick={() => {
                        setProfileTarget({ kind: 'source', table: m.table })
                        setExploreView('profile')
                        void profile(m.table)
                      }}
                    >
                      <Icon name="profile" />
                    </button>
                    {m.kind === 'table' && (
                      <button className="mart-act" title="обновить снапшот" onClick={() => void refreshMart(m.table)}>↻</button>
                    )}
                    <button className="mart-act mart-del" title="удалить витрину" onClick={() => void dropMart(m.table)}>✕</button>
                  </div>
                </div>
                <ul className="mart-cols">
                  {m.columns.map((c) => (
                    <li className="mart-col" key={c.name}>
                      <span className="col-name">{c.name}</span>
                      <span className="col-type">{c.type === 'VARCHAR' ? 'STRING' : c.type}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
```

- [ ] **Step 3: Add styles**

Append to `src/index.css`:

```css
.marts { margin-bottom: 8px; }
.mart-row { padding: 4px 0; }
.mart-head { display: flex; align-items: center; gap: 6px; }
.mart-head .source-name { font-family: var(--font-mono); font-size: 12px; color: var(--text); }
.mart-actions { margin-left: auto; display: inline-flex; gap: 2px; }
.mart-act { border: 0; background: transparent; color: var(--text-faint); cursor: pointer; padding: 1px 5px; font-size: 12px; border-radius: 4px; }
.mart-act:hover { color: var(--text); background: var(--surface); }
.mart-del:hover { color: var(--danger); }
.mart-cols { list-style: none; margin: 2px 0 0; padding: 0 0 0 6px; }
.mart-col { display: flex; justify-content: space-between; padding: 1px 4px; }
.mart-col .col-name { color: var(--text-dim); font-size: 11.5px; }
.mart-col .col-type { color: var(--text-faint); font-size: 10.5px; }
```

- [ ] **Step 4: Gate, eyeball, commit**

Run: `npm run lint && npm run build`
Then `npm run dev`: create a VIEW mart and a TABLE mart → both appear under «ВИТРИНЫ» with a `view`/`table` badge + columns. In another tab type `SELECT * FROM <mart>` → autocomplete suggests the mart + its columns; run → rows. Click «профиль» → profile panel. On the TABLE mart click ↻ → no error. Click ✕ → mart disappears from the rail; a query against it now errors.

```bash
git add src/features/Rail.tsx src/index.css
git commit -F- <<'EOF'
feat(m7a): rail «ВИТРИНЫ» section (badge, columns, profile/refresh/delete)

Marts split out of «Источники» and the schema-editor flow into their own managed
section: VIEW/TABLE badge, column list, profile (reuses source-profile), refresh
(table only), delete. Autocomplete already includes marts via buildSqlSchema.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Self-Review

**Spec coverage:**
- VIEW|TABLE with choice → Task 1 (`buildCreateMart` kind) + Task 4 (toggle). ✓
- Session-scoped / ephemeral → nothing persists marts; `reset()` clears `datasets` (existing). ✓
- Mart = extended Dataset (`kind` + `martSql`) → Task 2. ✓
- `core/mart.ts` builders + validation → Task 1. ✓
- `useMartActions` create/refresh/drop → Task 3. ✓
- Store `removeDataset` → Task 2. ✓
- «+ витрина» button + form (name + VIEW/TABLE, inline error) → Task 4. ✓
- Rail «ВИТРИНЫ» section (badge, columns, profile/refresh/delete) → Task 5. ✓
- Autocomplete includes marts → free via `buildSqlSchema(datasets)` (untouched); noted in Task 5. ✓
- Tests: `core/mart.test.ts` (Task 1), `removeDataset` (Task 2), `mart.integration.test.ts` (Task 3). ✓
- Error handling (invalid/collision inline; exec fail returns error; refresh fail → toast; drop idempotent) → Task 3. ✓
- Firewall → SQL views only; no schema-editor derived cols / visual builder / persistence. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `MartKind = 'view'|'table'` used consistently across Tasks 1/3/4; `createMart(name,sql,kind): Promise<string|null>` matches its callers in Task 4; `Dataset.kind`/`martSql` from Task 2 used by Task 3's `addDataset` calls and Task 5's `isMart`; `describeTable` returns `{name;type}[]` assignable to `Dataset.columns`. Consistent.

## Execution Handoff

Execution will be **subagent-driven via background Workflows** (as with M2–M6): per task a fresh implementer → independent verifier (runs the full gate) → fix-loop, strictly sequential (shared working tree). Slices: (1) Tasks 1–2 core+store; (2) Task 3 orchestration+integration; (3) Tasks 4–5 UI.
