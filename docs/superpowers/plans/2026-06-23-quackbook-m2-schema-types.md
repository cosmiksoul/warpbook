# M2 «Схема и типы» — Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (- [ ]) syntax.

**Goal:** Превратить сырые `all_varchar` CSV-таблицы M1 в безопасно типизированные через one-click «типы» и ручной per-column поповер, со счётчиком N→NULL на колонке.

**Architecture:** Четыре зоны (`db/` — единственный, кто говорит с DuckDB; `core/` — чистые строкобилдеры под TDD; `state/` — Zustand-стор; `features/`+`components/` — React UI). На load CSV создаём ДВЕ таблицы: неизменную сырую `_qb_raw_<t>` (all_varchar) как источник каста и `<t>` (типизируемую копию). Apply = `CREATE OR REPLACE TABLE <t> AS SELECT <TRY_CAST-касты> FROM _qb_raw_<t>`. Чистые билдеры и стор-действия TDD-first; оркестрация side-effect'ов в `features/useSchemaActions.ts`; презентация (CSS, поповер) — глазами.

**Tech Stack:** React 19 + TS 6 + Vite 8; Vitest 4 (node env, `include: src/**/*.test.ts`); `@duckdb/duckdb-wasm@1.32.0` (движок 1.5.4) + `apache-arrow@17.0.0`; Zustand 5. Новых внешних зависимостей нет.

**Источник истины:** `docs/superpowers/specs/2026-06-23-quackbook-m2-schema-types-design.md` (+ дорожная карта `2026-06-22-quackbook-delivery-design.md`, продукт `docs/scope-quackbook-v1.md`). Ветка: `m2-schema-types` (уже создана и активна).

**Каждый коммит заканчивается трейлером:**
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```
В примерах коммитов ниже трейлер показан явно в каждом `git commit` — добавляй его всегда. Используй bash here-doc для многострочного сообщения (Windows: НЕ PowerShell `@'...'@` в Bash-инструменте — см. память проекта).

**Сборка двумя срезами:** Срез 1 (Tasks 1–10) — типизация-ядро + one-click «типы» + чистка raw на Reset. Срез 2 (Tasks 11–15) — ручной per-column поповер + стейджинг + «применить» + ≥1-include-гард. Каждый срез заканчивается gate (`npm run lint && npm run build && npm test`) и демо-чекпойнтом. **Каждая задача с кодом заканчивается `npm run build && npm run lint` перед коммитом** (память проекта: vitest пропускает полный type-check).

---

## Спека-консистентные решения (зафиксированы здесь, чтобы исполнитель не додумывал)

1. **RTL-тесты не пишем.** В репо нет jsdom/`@testing-library` (см. `package.json` — только `vitest`, без `jsdom`), а vitest `include` — только `src/**/*.test.ts` (не `.tsx`). M1 прецедент: UI проверяется глазами, логика — TDD. Спека (строка 155) просит «точечно RTL» как nice-to-have; добавлять jsdom-инфру под три теста противоречит CLAUDE.md rule 2 (простота). **Поведение «типы»/«применить»/⚠ проверяем глазами** (как в M1), а вся отделимая логика (билдеры + стор-действия) покрыта node-тестами. Это явное расхождение со строкой 155 спеки — простейший спека-консистентный вариант.

2. **Тесты `db`-смоука кладём в `src/db/*.test.ts`** (не в fixtures/) — vitest их подхватывает только так. «Грязный» CSV-фикстуру для смоука строим **строкой прямо в тесте** (как M1 строит `'country,n\n…'`), а заодно кладём файл `fixtures/dirty.csv` для ручной демо-приёмки.

3. **`exec(sql)` в `duckdbClient`** добавляем как явный метод для DDL (отделяет «выполнить, результат не нужен» от `query`). Внутри — тот же `run`, но возвращает `void`. Это прямо из таблицы архитектуры спеки (строка 60, `+exec(sql)`).

4. **`sniffCsv` возвращает Arrow `Table`** (как `query`), `parseInferredColumns(arrow)` парсит его в `core/`. Используем `DESCRIBE SELECT * FROM read_csv_auto(<file>, sample_size = -1)` — это даёт колонки `column_name`/`column_type` (тот же формат, что `describeTable` уже парсит) и инференс родных типов. Спека (строка 177, «открытая мелочь») допускает либо `sniff_csv`, либо `DESCRIBE SELECT … auto_detect`; берём `DESCRIBE`-вариант как самый простой и переиспользующий существующий парс. `sample_size = -1` — сознательный full-file inference (точность важнее стоимости на локальных v1-файлах), отличный от приведённого в спеке `auto_detect`-примера; это в рамках латитьюда строки 177. Поддержку `sample_size = -1` и `try_strptime` подтверждаем на смоук-тесте Среза 1 (риск из строк 177/180) — если падает, **стоп, не костыляй** (CLAUDE.md rule 4), сообщи: фолбэк `auto_detect` без `sample_size` / `strptime` в `TRY`-обёртке.

5. **Голое каст-выражение строим прямо, без regex-снятия алиаса.** `buildCastValue(cfg)` (без алиаса) — единый источник; `buildCastExpr` = `buildCastValue(cfg) + ' AS ' + quoteIdent(cfg.name)`; `buildNullLossQuery` подставляет `buildCastValue(cfg)` в `CASE`. Это убирает хрупкий `.replace(/ AS "…"$/, '')`, который ломается на rename-имени с встроенной `"` (quoteIdent экранирует её как `""`, и `[^"]*` обрывается на первой внутренней кавычке).

6. **Reset дропает и `<t>`, и `_qb_raw_<t>`** (спека строка 114). `Shell.handleReset` дропает обе таблицы для CSV-датасетов через `buildDropTable(rawTableName(d.table))` (Task 9). `_qb_raw_*` в стор не кладутся (их создаёт `loadCsvAllVarchar` напрямую в DuckDB), поэтому имя raw восстанавливаем из `d.table`.

7. **UI гарантирует ≥1 включённую колонку** (спека строка 130, под which `buildMaterializeDDL` кидает). Поповер `SchemaColumnEditor` дизейблит «включить колонку», если эта колонка — последняя включённая (Task 11), а кнопка «применить» дизейблится с подсказкой, если включённых нет (Task 13). Билдер-throw остаётся последней страховкой.

8. **Ошибки DDL/запроса из DuckDB → текст в поверхности рейла** (спека строка 144). `apply`/`applyInferred` оборачиваем в try/catch; ошибку кладём в стор (`schemaError` на датасете) и рендерим в шапке схемы (Task 7/9). Зеркалит M1 tab-error.

---

## File Structure

| Файл | Статус | Ответственность |
|---|---|---|
| `src/core/sql.ts` | расширить | `+rawTableName(table)` → `_qb_raw_<t>`; `+isInternalTable(name)`; `+buildSniffCsv(virtualFile)`; `+buildLoadCsvRaw(virtualFile, rawTable)`; `+buildCloneTable(dest, src)`. Переиспользуем `quoteIdent`/`quoteLiteral`. |
| `src/core/sql.test.ts` | расширить | Тесты новых билдеров/хелперов. |
| `src/core/schemaTypes.ts` | **новый** | Тип `ColType`, `ColumnConfig`; `mapDuckDBType(t)`; `parseInferredColumns(arrow)`; `suggestTypes(inferred)`; `baselineConfig(columns)`. |
| `src/core/schemaTypes.test.ts` | **новый** | Маппинг типов, парс инференса, фолбэк VARCHAR, baseline. |
| `src/core/castBuilder.ts` | **новый** | `buildCastValue(cfg)` (без алиаса); `buildCastExpr(cfg)`; `buildMaterializeDDL(table, rawTable, cfgs)`; `buildNullLossQuery(rawTable, cfgs)` + `interpretNullLoss(row, columns)`. Чистые строкобилдеры. |
| `src/core/castBuilder.test.ts` | **новый** | Каждый тип; формат/без; запятая; nullstr; rename; VARCHAR-passthrough; include/exclude; ≥1 колонка (throw); present-условие; пропуск VARCHAR; rename-with-quote в loss; интерпретация `l0…ln`. |
| `src/db/duckdbClient.ts` | расширить | `+exec(sql)`; `+sniffCsv(virtualFile)`; `loadCsvAllVarchar` переписан на raw+typed (создаёт `_qb_raw_<t>` и `<t>` через `buildCloneTable`). |
| `src/db/duckdbClient.dirty.test.ts` | **новый** | Node-смоук: грязный CSV → raw all_varchar → материализация типов → `DESCRIBE` новые типы → loss-запрос даёт ожидаемые потери. |
| `src/state/session.ts` | расширить | `Dataset` += `rawTable?`, `suggested?`, `schemaConfig?`, `dirty?`, `schemaError?`; `columns[].nullLoss?`. Действия `setColumnConfig`, `stageColumn`, `resetColumn`, `setApplied`, `setSchemaError`. На load — baseline `schemaConfig`. |
| `src/state/session.test.ts` | расширить | Новые действия (чистые): setColumnConfig, stageColumn(dirty), resetColumn, setApplied(columns+losses, dirty=false), setSchemaError. |
| `src/features/loadFiles.ts` | расширить | CSV-ветка: получить `rawTable`, `suggested`, baseline `schemaConfig`. Parquet-ветка не трогаем. |
| `src/features/useSchemaActions.ts` | **новый** | Оркестрация: `apply(table)` (build DDL → `db.exec` → loss-query → `db.query` → `describeTable` → `setApplied`; ошибки → `setSchemaError`); `applyInferred(table)` (= setColumnConfig(suggested)+apply). Side-effects только здесь. |
| `src/features/Rail.tsx` | расширить | Шапка схемы CSV: кнопка «типы» + «применить» (когда dirty, дизейбл при 0 include) + строка ошибки; per-column маркеры ✎ (открыть поповер) и ⚠ N. Фильтр `isInternalTable`. Поповер `SchemaColumnEditor`. |
| `src/features/Shell.tsx` | расширить | Прокинуть `client` в `<Rail client={client} />`; `handleReset` дропает и `_qb_raw_<t>` для CSV-датасетов. |
| `src/components/SchemaColumnEditor.tsx` | **новый** | Поповер правки колонки (тип/rename/include + условно date-формат/разделитель/nullstr); дизейбл include для последней включённой. |
| `src/index.css` | расширить | Стили шапки схемы, маркеров ✎/⚠, поповера, строки ошибки. |
| `fixtures/dirty.csv` | **новый** | Демо-фикстура: запятые-десятичные, плохие даты, токен `NA`. |

> `src/features/Explore.tsx` НЕ трогаем — `useSchemaActions` берёт `client` из пропса по цепочке Shell→Rail; через Explore ничего не идёт.

---

# СРЕЗ 1 — типизация-ядро + one-click

## Task 1: `core/sql.ts` — имена сырых таблиц + sniff/raw-load/clone билдеры

**Files:**
- Modify: `src/core/sql.ts`
- Test: `src/core/sql.test.ts`

- [ ] **Step 1: Write the failing test**

Дописать в конец `src/core/sql.test.ts` (и расширить верхний импорт из `./sql`, добавив `rawTableName, isInternalTable, buildSniffCsv, buildLoadCsvRaw, buildCloneTable`):

```ts
describe('rawTableName', () => {
  it('prefixes the immutable raw cast-source table name', () => {
    expect(rawTableName('events')).toBe('_qb_raw_events')
  })
})

describe('isInternalTable', () => {
  it('flags raw tables as internal', () => {
    expect(isInternalTable('_qb_raw_events')).toBe(true)
  })
  it('treats user tables as not internal', () => {
    expect(isInternalTable('events')).toBe(false)
    expect(isInternalTable('raw_events')).toBe(false)
  })
})

describe('buildLoadCsvRaw', () => {
  it('creates the immutable all-VARCHAR raw table from a registered CSV', () => {
    expect(buildLoadCsvRaw('events.csv', '_qb_raw_events')).toBe(
      `CREATE OR REPLACE TABLE "_qb_raw_events" AS SELECT * FROM read_csv_auto('events.csv', all_varchar = true)`,
    )
  })
})

describe('buildSniffCsv', () => {
  it('describes the inferred (native-typed) schema of a registered CSV', () => {
    expect(buildSniffCsv('events.csv')).toBe(
      `DESCRIBE SELECT * FROM read_csv_auto('events.csv', sample_size = -1)`,
    )
  })
})

describe('buildCloneTable', () => {
  it('clones a source table into a fresh dest table (quoted idents)', () => {
    expect(buildCloneTable('events', '_qb_raw_events')).toBe(
      'CREATE OR REPLACE TABLE "events" AS SELECT * FROM "_qb_raw_events"',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/sql.test.ts`
Expected: FAIL — `rawTableName is not a function`.

- [ ] **Step 3: Write minimal implementation**

Добавить в конец `src/core/sql.ts`:

```ts
/** Internal prefix for the immutable all-VARCHAR cast-source table (model A). */
const RAW_PREFIX = '_qb_raw_'

/** Name of the immutable raw cast-source table for a user table. */
export function rawTableName(table: string): string {
  return `${RAW_PREFIX}${table}`
}

/** True for tables quackbook owns internally (filtered from sources/schema). */
export function isInternalTable(name: string): boolean {
  return name.startsWith(RAW_PREFIX)
}

/** DDL: materialize a registered CSV as the immutable all-VARCHAR raw table. */
export function buildLoadCsvRaw(virtualFile: string, rawTable: string): string {
  return `CREATE OR REPLACE TABLE ${quoteIdent(rawTable)} AS SELECT * FROM read_csv_auto(${quoteLiteral(virtualFile)}, all_varchar = true)`
}

/** Introspection: DuckDB's inferred (native) schema for a registered CSV. */
export function buildSniffCsv(virtualFile: string): string {
  return `DESCRIBE SELECT * FROM read_csv_auto(${quoteLiteral(virtualFile)}, sample_size = -1)`
}

/** DDL: (re)create `dest` as a verbatim SELECT * copy of `src` (both quoted). */
export function buildCloneTable(dest: string, src: string): string {
  return `CREATE OR REPLACE TABLE ${quoteIdent(dest)} AS SELECT * FROM ${quoteIdent(src)}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/sql.test.ts`
Expected: PASS (старые тесты + 5 новых describe).

- [ ] **Step 5: Build + lint gate**

Run: `npm run build && npm run lint`
Expected: оба зелёные.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/core/sql.ts src/core/sql.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(core): raw-table naming + sniff/raw-load/clone SQL builders for M2

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `core/schemaTypes.ts` — типы, маппинг, инференс, baseline

**Files:**
- Create: `src/core/schemaTypes.ts`
- Test: `src/core/schemaTypes.test.ts`

- [ ] **Step 1: Write the failing test**

Создать `src/core/schemaTypes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  baselineConfig,
  mapDuckDBType,
  parseInferredColumns,
  suggestTypes,
  type ColumnConfig,
} from './schemaTypes'
import type { QueryResult, ResultColumn } from './arrowToRows'

describe('mapDuckDBType', () => {
  it('maps integer family to BIGINT', () => {
    expect(mapDuckDBType('BIGINT')).toBe('BIGINT')
    expect(mapDuckDBType('INTEGER')).toBe('BIGINT')
    expect(mapDuckDBType('HUGEINT')).toBe('BIGINT')
  })
  it('maps real/decimal family to DOUBLE', () => {
    expect(mapDuckDBType('DOUBLE')).toBe('DOUBLE')
    expect(mapDuckDBType('FLOAT')).toBe('DOUBLE')
    expect(mapDuckDBType('DECIMAL(18,3)')).toBe('DOUBLE')
  })
  it('maps date/timestamp/boolean', () => {
    expect(mapDuckDBType('DATE')).toBe('DATE')
    expect(mapDuckDBType('TIMESTAMP')).toBe('TIMESTAMP')
    expect(mapDuckDBType('TIMESTAMP WITH TIME ZONE')).toBe('TIMESTAMP')
    expect(mapDuckDBType('BOOLEAN')).toBe('BOOLEAN')
  })
  it('falls back to VARCHAR for anything else', () => {
    expect(mapDuckDBType('VARCHAR')).toBe('VARCHAR')
    expect(mapDuckDBType('UUID')).toBe('VARCHAR')
    expect(mapDuckDBType('BLOB')).toBe('VARCHAR')
  })
})

// parseInferredColumns reads a DESCRIBE-shaped result: rows with
// column_name / column_type, exactly like duckdbClient.describeTable consumes.
function fakeDescribe(
  pairs: { column_name: string; column_type: string }[],
): QueryResult {
  return {
    columns: [
      { name: 'column_name', type: 'Utf8' },
      { name: 'column_type', type: 'Utf8' },
    ],
    rows: pairs,
    numRows: pairs.length,
  }
}

describe('parseInferredColumns', () => {
  it('maps a DESCRIBE result to {name, type: ColType}', () => {
    const r = fakeDescribe([
      { column_name: 'id', column_type: 'BIGINT' },
      { column_name: 'revenue', column_type: 'DECIMAL(18,3)' },
      { column_name: 'name', column_type: 'VARCHAR' },
      { column_name: 'signup', column_type: 'DATE' },
    ])
    expect(parseInferredColumns(r)).toEqual([
      { name: 'id', type: 'BIGINT' },
      { name: 'revenue', type: 'DOUBLE' },
      { name: 'name', type: 'VARCHAR' },
      { name: 'signup', type: 'DATE' },
    ])
  })
})

describe('suggestTypes', () => {
  it('builds a full per-column config from inferred types', () => {
    const cfgs: ColumnConfig[] = suggestTypes([
      { name: 'id', type: 'BIGINT' },
      { name: 'name', type: 'VARCHAR' },
    ])
    expect(cfgs).toEqual([
      { origName: 'id', name: 'id', type: 'BIGINT', include: true },
      { origName: 'name', name: 'name', type: 'VARCHAR', include: true },
    ])
  })
})

describe('baselineConfig', () => {
  it('keeps every column as VARCHAR (the untyped M1 state)', () => {
    const columns: ResultColumn[] = [
      { name: 'id', type: 'VARCHAR' },
      { name: 'name', type: 'VARCHAR' },
    ]
    expect(baselineConfig(columns)).toEqual([
      { origName: 'id', name: 'id', type: 'VARCHAR', include: true },
      { origName: 'name', name: 'name', type: 'VARCHAR', include: true },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/schemaTypes.test.ts`
Expected: FAIL — cannot find module `./schemaTypes`.

- [ ] **Step 3: Write minimal implementation**

Создать `src/core/schemaTypes.ts`:

```ts
import type { QueryResult, ResultColumn } from './arrowToRows'

/** The six target types quackbook can cast a column to. */
export type ColType =
  | 'VARCHAR'
  | 'BIGINT'
  | 'DOUBLE'
  | 'DATE'
  | 'TIMESTAMP'
  | 'BOOLEAN'

export interface ColumnConfig {
  origName: string // name in the raw table (immutable)
  name: string // target name (rename); defaults to origName
  type: ColType
  include: boolean // false => column not emitted into the typed table
  dateFormat?: string // strptime pattern for DATE/TIMESTAMP (optional)
  decimalSep?: ',' // ',' => decimal comma (for BIGINT/DOUBLE)
  nullToken?: string // string value treated as NULL
}

/** Map a DuckDB type name into quackbook's six-type set (fallback VARCHAR). */
export function mapDuckDBType(duckType: string): ColType {
  const t = duckType.toUpperCase()
  if (/^(BIGINT|INTEGER|INT|SMALLINT|TINYINT|HUGEINT|UBIGINT|UINTEGER|USMALLINT|UTINYINT)\b/.test(t))
    return 'BIGINT'
  if (/^(DOUBLE|FLOAT|REAL|DECIMAL|NUMERIC)\b/.test(t)) return 'DOUBLE'
  if (/^DATE\b/.test(t)) return 'DATE'
  if (/^TIMESTAMP\b/.test(t)) return 'TIMESTAMP'
  if (/^BOOL/.test(t)) return 'BOOLEAN'
  return 'VARCHAR'
}

/** Parse a DESCRIBE-shaped result (column_name/column_type) into typed columns. */
export function parseInferredColumns(
  result: QueryResult,
): { name: string; type: ColType }[] {
  return result.rows.map((r) => ({
    name: String(r.column_name),
    type: mapDuckDBType(String(r.column_type)),
  }))
}

/** Turn inferred {name,type} into a full editable ColumnConfig per column. */
export function suggestTypes(
  inferred: { name: string; type: ColType }[],
): ColumnConfig[] {
  return inferred.map((c) => ({
    origName: c.name,
    name: c.name,
    type: c.type,
    include: true,
  }))
}

/** Baseline config: every column stays VARCHAR (the untyped M1 state). */
export function baselineConfig(columns: ResultColumn[]): ColumnConfig[] {
  return columns.map((c) => ({
    origName: c.name,
    name: c.name,
    type: 'VARCHAR' as ColType,
    include: true,
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/schemaTypes.test.ts`
Expected: PASS.

- [ ] **Step 5: Build + lint gate**

Run: `npm run build && npm run lint`
Expected: оба зелёные.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/core/schemaTypes.ts src/core/schemaTypes.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(core): ColumnConfig + DuckDB type mapping, infer parse, baseline config

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `core/castBuilder.ts` — `buildCastValue` + `buildCastExpr` (одна колонка)

**Files:**
- Create: `src/core/castBuilder.ts`
- Test: `src/core/castBuilder.test.ts`

- [ ] **Step 1: Write the failing test**

Создать `src/core/castBuilder.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildCastExpr, buildCastValue } from './castBuilder'
import type { ColumnConfig } from './schemaTypes'

const base = (over: Partial<ColumnConfig>): ColumnConfig => ({
  origName: 'c',
  name: 'c',
  type: 'VARCHAR',
  include: true,
  ...over,
})

describe('buildCastValue (bare cast expression, no alias)', () => {
  it('VARCHAR passes the value through (no cast)', () => {
    expect(buildCastValue(base({ type: 'VARCHAR' }))).toBe('"c"')
  })
  it('BIGINT uses TRY_CAST', () => {
    expect(buildCastValue(base({ origName: 'n', type: 'BIGINT' }))).toBe(
      'TRY_CAST("n" AS BIGINT)',
    )
  })
  it('DOUBLE with decimal comma replaces , with . before casting', () => {
    expect(
      buildCastValue(base({ origName: 'rev', type: 'DOUBLE', decimalSep: ',' })),
    ).toBe(`TRY_CAST(replace("rev", ',', '.') AS DOUBLE)`)
  })
  it('DATE with format casts try_strptime result to DATE', () => {
    expect(
      buildCastValue(base({ origName: 'd', type: 'DATE', dateFormat: '%d.%m.%Y' })),
    ).toBe(`CAST(try_strptime("d", '%d.%m.%Y') AS DATE)`)
  })
  it('nullToken wraps the value in nullif before casting', () => {
    expect(
      buildCastValue(base({ origName: 'n', type: 'BIGINT', nullToken: 'NA' })),
    ).toBe(`TRY_CAST(nullif("n", 'NA') AS BIGINT)`)
  })
})

describe('buildCastExpr (cast value + target-name alias)', () => {
  it('VARCHAR passthrough, aliased to target name', () => {
    expect(buildCastExpr(base({ type: 'VARCHAR' }))).toBe('"c" AS "c"')
  })
  it('renames via the target name alias', () => {
    expect(buildCastExpr(base({ type: 'VARCHAR', name: 'label' }))).toBe(
      '"c" AS "label"',
    )
  })
  it('BIGINT uses TRY_CAST', () => {
    expect(buildCastExpr(base({ origName: 'n', name: 'n', type: 'BIGINT' }))).toBe(
      'TRY_CAST("n" AS BIGINT) AS "n"',
    )
  })
  it('DOUBLE with decimal comma replaces , with . before casting', () => {
    expect(
      buildCastExpr(
        base({ origName: 'rev', name: 'rev', type: 'DOUBLE', decimalSep: ',' }),
      ),
    ).toBe(`TRY_CAST(replace("rev", ',', '.') AS DOUBLE) AS "rev"`)
  })
  it('DOUBLE without comma casts directly', () => {
    expect(
      buildCastExpr(base({ origName: 'rev', name: 'rev', type: 'DOUBLE' })),
    ).toBe('TRY_CAST("rev" AS DOUBLE) AS "rev"')
  })
  it('DATE without format uses TRY_CAST', () => {
    expect(buildCastExpr(base({ origName: 'd', name: 'd', type: 'DATE' }))).toBe(
      'TRY_CAST("d" AS DATE) AS "d"',
    )
  })
  it('DATE with format casts try_strptime result to DATE', () => {
    expect(
      buildCastExpr(
        base({ origName: 'd', name: 'd', type: 'DATE', dateFormat: '%d.%m.%Y' }),
      ),
    ).toBe(`CAST(try_strptime("d", '%d.%m.%Y') AS DATE) AS "d"`)
  })
  it('TIMESTAMP without format uses TRY_CAST', () => {
    expect(
      buildCastExpr(base({ origName: 'ts', name: 'ts', type: 'TIMESTAMP' })),
    ).toBe('TRY_CAST("ts" AS TIMESTAMP) AS "ts"')
  })
  it('TIMESTAMP with format uses try_strptime directly', () => {
    expect(
      buildCastExpr(
        base({
          origName: 'ts',
          name: 'ts',
          type: 'TIMESTAMP',
          dateFormat: '%Y-%m-%d %H:%M',
        }),
      ),
    ).toBe(`try_strptime("ts", '%Y-%m-%d %H:%M') AS "ts"`)
  })
  it('BOOLEAN uses TRY_CAST', () => {
    expect(
      buildCastExpr(base({ origName: 'b', name: 'b', type: 'BOOLEAN' })),
    ).toBe('TRY_CAST("b" AS BOOLEAN) AS "b"')
  })
  it('nullToken applies to VARCHAR passthrough too', () => {
    expect(
      buildCastExpr(base({ origName: 's', name: 's', type: 'VARCHAR', nullToken: 'NA' })),
    ).toBe(`nullif("s", 'NA') AS "s"`)
  })
  it('escapes identifiers and literals (incl. quote in rename target)', () => {
    expect(
      buildCastExpr(
        base({ origName: 'we"ird', name: 'o"k', type: 'BIGINT', nullToken: "o'NA" }),
      ),
    ).toBe(`TRY_CAST(nullif("we""ird", 'o''NA') AS BIGINT) AS "o""k"`)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/castBuilder.test.ts`
Expected: FAIL — `buildCastValue is not a function` (module not found).

- [ ] **Step 3: Write minimal implementation**

Создать `src/core/castBuilder.ts`:

```ts
import { quoteIdent, quoteLiteral } from './sql'
import type { ColumnConfig } from './schemaTypes'

/**
 * Build the BARE cast expression for ONE column from the raw (all_varchar)
 * table — no alias. Every cast is TRY_CAST/try_strptime: failures become NULL,
 * never errors. Used directly inside the loss query's CASE, and wrapped with an
 * alias by buildCastExpr for the materialize SELECT list.
 */
export function buildCastValue(cfg: ColumnConfig): string {
  let v = quoteIdent(cfg.origName)
  if (cfg.nullToken != null) {
    v = `nullif(${v}, ${quoteLiteral(cfg.nullToken)})`
  }

  switch (cfg.type) {
    case 'VARCHAR':
      return v
    case 'BIGINT':
    case 'DOUBLE': {
      const num = cfg.decimalSep === ',' ? `replace(${v}, ',', '.')` : v
      return `TRY_CAST(${num} AS ${cfg.type})`
    }
    case 'DATE':
      return cfg.dateFormat
        ? `CAST(try_strptime(${v}, ${quoteLiteral(cfg.dateFormat)}) AS DATE)`
        : `TRY_CAST(${v} AS DATE)`
    case 'TIMESTAMP':
      return cfg.dateFormat
        ? `try_strptime(${v}, ${quoteLiteral(cfg.dateFormat)})`
        : `TRY_CAST(${v} AS TIMESTAMP)`
    case 'BOOLEAN':
      return `TRY_CAST(${v} AS BOOLEAN)`
  }
}

/** Bare cast expression aliased to the column's target name. */
export function buildCastExpr(cfg: ColumnConfig): string {
  return `${buildCastValue(cfg)} AS ${quoteIdent(cfg.name)}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/castBuilder.test.ts`
Expected: PASS.

- [ ] **Step 5: Build + lint gate**

Run: `npm run build && npm run lint`
Expected: оба зелёные.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/core/castBuilder.ts src/core/castBuilder.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(core): buildCastValue/buildCastExpr (per-column TRY_CAST/strptime, nullstr, decimal sep)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `core/castBuilder.ts` — `buildMaterializeDDL`

**Files:**
- Modify: `src/core/castBuilder.ts`
- Test: `src/core/castBuilder.test.ts`

- [ ] **Step 1: Write the failing test**

Дописать в `src/core/castBuilder.test.ts` (расширить импорт: `import { buildCastExpr, buildCastValue, buildMaterializeDDL } from './castBuilder'`):

```ts
describe('buildMaterializeDDL', () => {
  it('CREATE OR REPLACE from the raw table with only included columns, order kept', () => {
    const cfgs: ColumnConfig[] = [
      { origName: 'id', name: 'id', type: 'BIGINT', include: true },
      { origName: 'skip', name: 'skip', type: 'VARCHAR', include: false },
      { origName: 'name', name: 'label', type: 'VARCHAR', include: true },
    ]
    expect(buildMaterializeDDL('events', '_qb_raw_events', cfgs)).toBe(
      'CREATE OR REPLACE TABLE "events" AS SELECT ' +
        'TRY_CAST("id" AS BIGINT) AS "id", "name" AS "label" ' +
        'FROM "_qb_raw_events"',
    )
  })
  it('throws when no column is included (empty SELECT is invalid)', () => {
    expect(() =>
      buildMaterializeDDL('events', '_qb_raw_events', [
        { origName: 'a', name: 'a', type: 'VARCHAR', include: false },
      ]),
    ).toThrow(/at least one/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/castBuilder.test.ts`
Expected: FAIL — `buildMaterializeDDL is not a function`.

- [ ] **Step 3: Write minimal implementation**

Добавить в `src/core/castBuilder.ts` (после `buildCastExpr`); расширить верхний импорт из `./sql` до `import { quoteIdent, quoteLiteral } from './sql'` (если ещё нет `quoteIdent` — он уже импортирован для `buildCastValue`):

```ts
/**
 * Build the re-materialization DDL: replace the typed table with a SELECT of
 * cast expressions (included columns only, source order preserved) over the
 * immutable raw table. Throws if no column is included — an empty SELECT is
 * invalid SQL (the UI guarantees >= 1 included column).
 */
export function buildMaterializeDDL(
  table: string,
  rawTable: string,
  cfgs: ColumnConfig[],
): string {
  const included = cfgs.filter((c) => c.include)
  if (included.length === 0) {
    throw new Error('buildMaterializeDDL: at least one column must be included')
  }
  const selectList = included.map(buildCastExpr).join(', ')
  return `CREATE OR REPLACE TABLE ${quoteIdent(table)} AS SELECT ${selectList} FROM ${quoteIdent(rawTable)}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/castBuilder.test.ts`
Expected: PASS.

- [ ] **Step 5: Build + lint gate**

Run: `npm run build && npm run lint`
Expected: оба зелёные.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/core/castBuilder.ts src/core/castBuilder.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(core): buildMaterializeDDL (CREATE OR REPLACE from raw, include/order/throw)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `core/castBuilder.ts` — `buildNullLossQuery` + `interpretNullLoss`

**Files:**
- Modify: `src/core/castBuilder.ts`
- Test: `src/core/castBuilder.test.ts`

- [ ] **Step 1: Write the failing test**

Дописать в `src/core/castBuilder.test.ts` (расширить импорт: `import { buildCastExpr, buildCastValue, buildMaterializeDDL, buildNullLossQuery, interpretNullLoss } from './castBuilder'`):

```ts
describe('buildNullLossQuery', () => {
  it('one pass over the raw table, one loss column per non-VARCHAR included column', () => {
    const cfgs: ColumnConfig[] = [
      { origName: 'name', name: 'name', type: 'VARCHAR', include: true }, // skipped: no cast
      { origName: 'n', name: 'n', type: 'BIGINT', include: true },
      { origName: 'rev', name: 'rev', type: 'DOUBLE', include: true, decimalSep: ',' },
      { origName: 'skip', name: 'skip', type: 'BIGINT', include: false }, // excluded
    ]
    const { sql, columns } = buildNullLossQuery('_qb_raw_events', cfgs)
    expect(columns).toEqual(['n', 'rev'])
    expect(sql).toBe(
      'SELECT ' +
        `sum(CASE WHEN "n" IS NOT NULL AND "n" <> '' AND (TRY_CAST("n" AS BIGINT)) IS NULL THEN 1 ELSE 0 END) AS l0, ` +
        `sum(CASE WHEN "rev" IS NOT NULL AND "rev" <> '' AND (TRY_CAST(replace("rev", ',', '.') AS DOUBLE)) IS NULL THEN 1 ELSE 0 END) AS l1 ` +
        'FROM "_qb_raw_events"',
    )
  })
  it('adds a nullToken exclusion to the present condition (token NULL is intentional, not a loss)', () => {
    const cfgs: ColumnConfig[] = [
      { origName: 'n', name: 'n', type: 'BIGINT', include: true, nullToken: 'NA' },
    ]
    const { sql } = buildNullLossQuery('_qb_raw_t', cfgs)
    expect(sql).toBe(
      'SELECT ' +
        `sum(CASE WHEN "n" IS NOT NULL AND "n" <> '' AND "n" <> 'NA' AND (TRY_CAST(nullif("n", 'NA') AS BIGINT)) IS NULL THEN 1 ELSE 0 END) AS l0 ` +
        'FROM "_qb_raw_t"',
    )
  })
  it('uses the bare cast value even for a renamed target whose name contains a quote', () => {
    const cfgs: ColumnConfig[] = [
      { origName: 'we"ird', name: 'o"k', type: 'BIGINT', include: true },
    ]
    const { sql, columns } = buildNullLossQuery('_qb_raw_t', cfgs)
    expect(columns).toEqual(['o"k'])
    // no trailing `AS "o""k"` leaks into the CASE expression
    expect(sql).toBe(
      'SELECT ' +
        `sum(CASE WHEN "we""ird" IS NOT NULL AND "we""ird" <> '' AND (TRY_CAST("we""ird" AS BIGINT)) IS NULL THEN 1 ELSE 0 END) AS l0 ` +
        'FROM "_qb_raw_t"',
    )
  })
  it('returns no-op (empty sql, no columns) when nothing to count', () => {
    const cfgs: ColumnConfig[] = [
      { origName: 'name', name: 'name', type: 'VARCHAR', include: true },
    ]
    expect(buildNullLossQuery('_qb_raw_t', cfgs)).toEqual({ sql: '', columns: [] })
  })
})

describe('interpretNullLoss', () => {
  it('maps the l0..ln result row to per-column losses', () => {
    const row = { l0: 3n, l1: 0n }
    expect(interpretNullLoss(row, ['n', 'rev'])).toEqual({ n: 3, rev: 0 })
  })
  it('coerces null/undefined cells to 0', () => {
    expect(interpretNullLoss({ l0: null }, ['x'])).toEqual({ x: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/castBuilder.test.ts`
Expected: FAIL — `buildNullLossQuery is not a function`.

- [ ] **Step 3: Write minimal implementation**

Добавить в `src/core/castBuilder.ts`:

```ts
/**
 * Build a single-pass query that counts, per included NON-VARCHAR column, how
 * many present raw values become NULL after the cast (the "N -> NULL" loss).
 * present := NOT NULL AND <> '' (AND <> nullToken when set: a token-NULL is an
 * intentional NULL, not a cast loss). VARCHAR columns are skipped (no cast).
 * The CASE uses buildCastValue (bare, no alias) directly — no string surgery,
 * correct for any rename target including names with embedded quotes.
 * Returns { sql: '', columns: [] } when nothing needs counting.
 */
export function buildNullLossQuery(
  rawTable: string,
  cfgs: ColumnConfig[],
): { sql: string; columns: string[] } {
  const counted = cfgs.filter((c) => c.include && c.type !== 'VARCHAR')
  if (counted.length === 0) return { sql: '', columns: [] }

  const parts = counted.map((cfg, i) => {
    const orig = quoteIdent(cfg.origName)
    let present = `${orig} IS NOT NULL AND ${orig} <> ''`
    if (cfg.nullToken != null) {
      present += ` AND ${orig} <> ${quoteLiteral(cfg.nullToken)}`
    }
    const cast = buildCastValue(cfg)
    return `sum(CASE WHEN ${present} AND (${cast}) IS NULL THEN 1 ELSE 0 END) AS l${i}`
  })

  return {
    sql: `SELECT ${parts.join(', ')} FROM ${quoteIdent(rawTable)}`,
    columns: counted.map((c) => c.name),
  }
}

/** Interpret the l0..ln result row into a { columnName: lostCount } map. */
export function interpretNullLoss(
  row: Record<string, unknown>,
  columns: string[],
): Record<string, number> {
  const out: Record<string, number> = {}
  columns.forEach((name, i) => {
    out[name] = Number(row[`l${i}`] ?? 0)
  })
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/castBuilder.test.ts`
Expected: PASS (все describe Task 3/4/5).

- [ ] **Step 5: Build + lint gate**

Run: `npm run build && npm run lint`
Expected: оба зелёные.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/core/castBuilder.ts src/core/castBuilder.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(core): buildNullLossQuery + interpretNullLoss (one-pass N->NULL counter)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `db/duckdbClient.ts` — `exec`, `sniffCsv`, raw+typed CSV load + смоук

**Files:**
- Modify: `src/db/duckdbClient.ts`
- Create: `src/db/duckdbClient.dirty.test.ts`
- Create: `fixtures/dirty.csv`

- [ ] **Step 1: Write the failing test**

Создать `fixtures/dirty.csv` (демо-фикстура для ручной приёмки — числа с запятой, плохие даты, токен `NA`):

```
id,revenue,signup,note
1,"1234,50",2024-01-15,ok
2,"NA",2024-02-30,bad-date
3,"99,9",not-a-date,NA
4,"12,00",2024-03-01,ok
```

Создать `src/db/duckdbClient.dirty.test.ts` (Node-смоук; строим грязный CSV строкой, как M1):

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/duckdbClient.dirty.test.ts`
Expected: FAIL — `client.exec is not a function` / `client.sniffCsv is not a function`.

- [ ] **Step 3: Write minimal implementation**

Заменить содержимое `src/db/duckdbClient.ts` на:

```ts
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import type { Table } from 'apache-arrow'
import { arrowToRows, type ResultColumn } from '../core/arrowToRows'
import {
  buildCloneTable,
  buildDescribe,
  buildLoadCsvRaw,
  buildLoadParquet,
  buildSniffCsv,
  rawTableName,
} from '../core/sql'

export interface DuckDBClient {
  /** Register raw file bytes under a virtual filename DuckDB can read. */
  registerFile(name: string, data: Uint8Array): Promise<void>
  /**
   * Materialize a registered CSV as TWO tables (model A): an immutable
   * all-VARCHAR raw cast-source (_qb_raw_<t>) plus a typed table (<t>),
   * initially an all_varchar copy of the raw baseline.
   */
  loadCsvAllVarchar(virtualName: string, tableName: string): Promise<void>
  /** Materialize a registered Parquet file as a typed table (no raw, M1 behavior). */
  loadParquet(virtualName: string, tableName: string): Promise<void>
  /** DuckDB's inferred (native-typed) schema of a registered CSV. */
  sniffCsv(virtualName: string): Promise<Table>
  /** Column names + DuckDB type names for a loaded table. */
  describeTable(tableName: string): Promise<ResultColumn[]>
  /** Run a statement whose result is not needed (DDL: CREATE OR REPLACE, ...). */
  exec(sql: string): Promise<void>
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
      const raw = rawTableName(tableName)
      await run(buildLoadCsvRaw(virtualName, raw))
      await run(buildCloneTable(tableName, raw))
    },
    async loadParquet(virtualName, tableName) {
      await run(buildLoadParquet(virtualName, tableName))
    },
    async sniffCsv(virtualName) {
      return run(buildSniffCsv(virtualName))
    },
    async describeTable(tableName) {
      const result = arrowToRows(await run(buildDescribe(tableName)))
      return result.rows.map((r) => ({
        name: String(r.column_name),
        type: String(r.column_type),
      }))
    },
    async exec(sql) {
      await run(sql)
    },
    query: run,
  }
}
```

> Примечание: `buildLoadCsv` в `sql.ts` больше не используется приложением (его заменил `buildLoadCsvRaw` + `buildCloneTable`), но остаётся экспортирован и покрыт собственным тестом `sql.test.ts` (строки 72–78) — не unused. Оставляем как есть в Срезе 1 (хирургическая правка, CLAUDE.md rule 3); удаление билдера+теста — отдельное решение, не в скоупе M2.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/duckdbClient.dirty.test.ts src/db/duckdbClient.test.ts`
Expected: PASS обоих. Существующий `duckdbClient.test.ts` всё ещё зелёный: `loadCsvAllVarchar('events.csv','events')` теперь дополнительно создаёт `_qb_raw_events`, но `SELECT * FROM "events"` по-прежнему отдаёт те же all_varchar строки.

> Если `try_strptime`/`sample_size = -1` упадут на этой сборке DuckDB-WASM — это сигнал из «открытых рисков» спеки (строки 180/177). Тогда: останови, не костыляй (CLAUDE.md rule 4), сообщи — фолбэк `strptime` в `TRY`-обёртке / `auto_detect` без `sample_size`.

- [ ] **Step 5: Build + lint gate**

Run: `npm run build && npm run lint`
Expected: оба зелёные.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/db/duckdbClient.ts src/db/duckdbClient.dirty.test.ts fixtures/dirty.csv
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(db): exec + sniffCsv; CSV load creates raw+typed (model A); dirty smoke test

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `state/session.ts` — поля M2 + действия типа/dirty

**Files:**
- Modify: `src/state/session.ts`
- Test: `src/state/session.test.ts`

> Этот срез — две действия из четырёх (`setColumnConfig`, `stageColumn`) + расширение `Dataset` + `setSchemaError`. Reset-зависимые `resetColumn`/`setApplied` — в Task 8 (отдельный red→green-цикл).

- [ ] **Step 1: Write the failing test**

Дописать в конец `src/state/session.test.ts` (расширить верхний импорт: к существующему `import { useSession, type Dataset } from './session'` добавить `import type { ColumnConfig } from '../core/schemaTypes'`):

```ts
const csvDs = (table: string): Dataset => ({
  table,
  fileName: `${table}.csv`,
  bytes: 10,
  kind: 'csv',
  columns: [
    { name: 'id', type: 'VARCHAR' },
    { name: 'rev', type: 'VARCHAR' },
  ],
  rawTable: `_qb_raw_${table}`,
  suggested: [
    { name: 'id', type: 'BIGINT' },
    { name: 'rev', type: 'DOUBLE' },
  ],
  schemaConfig: [
    { origName: 'id', name: 'id', type: 'VARCHAR', include: true },
    { origName: 'rev', name: 'rev', type: 'VARCHAR', include: true },
  ],
  dirty: false,
})

describe('session: schema config — setColumnConfig / stageColumn (M2)', () => {
  it('setColumnConfig replaces the whole config and clears dirty (used by "типы")', () => {
    useSession.getState().reset()
    const s = useSession.getState()
    s.addDataset(csvDs('events'))
    const next: ColumnConfig[] = [
      { origName: 'id', name: 'id', type: 'BIGINT', include: true },
      { origName: 'rev', name: 'rev', type: 'DOUBLE', include: true },
    ]
    s.setColumnConfig('events', next)
    const d = useSession.getState().datasets[0]
    expect(d.schemaConfig).toEqual(next)
    expect(d.dirty).toBe(false)
  })

  it('stageColumn edits one column by origName and marks dirty', () => {
    useSession.getState().reset()
    const s = useSession.getState()
    s.addDataset(csvDs('events'))
    s.stageColumn('events', {
      origName: 'rev',
      name: 'revenue',
      type: 'DOUBLE',
      include: true,
      decimalSep: ',',
    })
    const d = useSession.getState().datasets[0]
    expect(d.dirty).toBe(true)
    expect(d.schemaConfig).toEqual([
      { origName: 'id', name: 'id', type: 'VARCHAR', include: true },
      { origName: 'rev', name: 'revenue', type: 'DOUBLE', include: true, decimalSep: ',' },
    ])
  })

  it('setSchemaError stores a per-dataset error message', () => {
    useSession.getState().reset()
    const s = useSession.getState()
    s.addDataset(csvDs('events'))
    s.setSchemaError('events', 'boom')
    expect(useSession.getState().datasets[0].schemaError).toBe('boom')
    s.setSchemaError('events', null)
    expect(useSession.getState().datasets[0].schemaError).toBeNull()
  })
})
```

> `csvDs` и `useSession.getState().reset()` также используются Task 8 — определены здесь один раз, в Task 8 переиспользуются.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/state/session.test.ts`
Expected: FAIL — `setColumnConfig is not a function`.

- [ ] **Step 3: Write minimal implementation**

В `src/state/session.ts`:

(a) Заменить строку импорта `import type { QueryResult, ResultColumn } from '../core/arrowToRows'` на:
```ts
import type { QueryResult } from '../core/arrowToRows'
import type { ColumnConfig } from '../core/schemaTypes'
```

(b) Заменить `interface Dataset { … }` целиком на:
```ts
export interface Dataset {
  table: string
  fileName: string
  bytes: number
  kind: 'csv' | 'parquet'
  columns: { name: string; type: string; nullLoss?: number }[]
  // --- M2, only for kind === 'csv' ---
  rawTable?: string
  suggested?: { name: string; type: ColumnConfig['type'] }[]
  schemaConfig?: ColumnConfig[]
  dirty?: boolean
  schemaError?: string | null
}
```

> `columns` сужается с `ResultColumn[]` до структурно-совместимого `{ name; type; nullLoss? }[]`. `ResultColumn` (`{name,type}`) присваивается ему без ошибок, так что `loadOneFile`/`describeTable` остаются совместимы; импорт `ResultColumn` в `session.ts` больше не нужен (удалён в шаге (a)).

(c) Добавить сигнатуры в `interface SessionState` (после `setTabError`):
```ts
  setColumnConfig: (table: string, cfgs: ColumnConfig[]) => void
  stageColumn: (table: string, cfg: ColumnConfig) => void
  setSchemaError: (table: string, message: string | null) => void
```

(d) Добавить реализацию внутрь `create(...)` (после `setTabError`):
```ts
  setColumnConfig: (table, cfgs) =>
    set((s) => ({
      datasets: s.datasets.map((d) =>
        d.table === table ? { ...d, schemaConfig: cfgs, dirty: false } : d,
      ),
    })),
  stageColumn: (table, cfg) =>
    set((s) => ({
      datasets: s.datasets.map((d) =>
        d.table === table
          ? {
              ...d,
              dirty: true,
              schemaConfig: (d.schemaConfig ?? []).map((c) =>
                c.origName === cfg.origName ? cfg : c,
              ),
            }
          : d,
      ),
    })),
  setSchemaError: (table, message) =>
    set((s) => ({
      datasets: s.datasets.map((d) =>
        d.table === table ? { ...d, schemaError: message } : d,
      ),
    })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/state/session.test.ts`
Expected: PASS (M1 тесты + новые M2 describe).

- [ ] **Step 5: Build + lint gate**

Run: `npm run build && npm run lint`
Expected: оба зелёные.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/state/session.ts src/state/session.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(state): Dataset schema fields + setColumnConfig/stageColumn/setSchemaError

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `state/session.ts` — `resetColumn` + `setApplied`

**Files:**
- Modify: `src/state/session.ts`
- Test: `src/state/session.test.ts`

- [ ] **Step 1: Write the failing test**

Дописать в конец `src/state/session.test.ts` (переиспользует `csvDs` из Task 7):

```ts
describe('session: schema config — resetColumn / setApplied (M2)', () => {
  it('resetColumn returns a column to its suggested config and marks dirty', () => {
    useSession.getState().reset()
    const s = useSession.getState()
    s.addDataset(csvDs('events'))
    s.stageColumn('events', { origName: 'rev', name: 'x', type: 'VARCHAR', include: false })
    s.resetColumn('events', 'rev')
    const d = useSession.getState().datasets[0]
    expect(d.schemaConfig?.find((c) => c.origName === 'rev')).toEqual({
      origName: 'rev',
      name: 'rev',
      type: 'DOUBLE',
      include: true,
    })
    expect(d.dirty).toBe(true)
  })

  it('setApplied updates columns + per-column nullLoss and clears dirty', () => {
    useSession.getState().reset()
    const s = useSession.getState()
    s.addDataset(csvDs('events'))
    s.stageColumn('events', { origName: 'rev', name: 'rev', type: 'DOUBLE', include: true })
    s.setApplied(
      'events',
      [
        { name: 'id', type: 'BIGINT' },
        { name: 'rev', type: 'DOUBLE' },
      ],
      { rev: 3 },
    )
    const d = useSession.getState().datasets[0]
    expect(d.dirty).toBe(false)
    expect(d.columns).toEqual([
      { name: 'id', type: 'BIGINT', nullLoss: 0 },
      { name: 'rev', type: 'DOUBLE', nullLoss: 3 },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/state/session.test.ts`
Expected: FAIL — `resetColumn is not a function`.

- [ ] **Step 3: Write minimal implementation**

В `src/state/session.ts`:

(a) Добавить сигнатуры в `interface SessionState` (после `setSchemaError`):
```ts
  resetColumn: (table: string, origName: string) => void
  setApplied: (
    table: string,
    columns: { name: string; type: string }[],
    losses: Record<string, number>,
  ) => void
```

(b) Добавить реализацию внутрь `create(...)` (после `setSchemaError`):
```ts
  resetColumn: (table, origName) =>
    set((s) => ({
      datasets: s.datasets.map((d) => {
        if (d.table !== table) return d
        const suggested = d.suggested?.find((c) => c.name === origName)
        const restored: ColumnConfig = suggested
          ? { origName, name: origName, type: suggested.type, include: true }
          : { origName, name: origName, type: 'VARCHAR', include: true }
        return {
          ...d,
          dirty: true,
          schemaConfig: (d.schemaConfig ?? []).map((c) =>
            c.origName === origName ? restored : c,
          ),
        }
      }),
    })),
  setApplied: (table, columns, losses) =>
    set((s) => ({
      datasets: s.datasets.map((d) =>
        d.table === table
          ? {
              ...d,
              dirty: false,
              schemaError: null,
              columns: columns.map((c) => ({
                name: c.name,
                type: c.type,
                nullLoss: losses[c.name] ?? 0,
              })),
            }
          : d,
      ),
    })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/state/session.test.ts`
Expected: PASS (M1 + все M2 describe).

- [ ] **Step 5: Build + lint gate**

Run: `npm run build && npm run lint`
Expected: оба зелёные.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/state/session.ts src/state/session.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(state): resetColumn (to suggested) + setApplied (columns+losses, clear dirty)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `features/loadFiles.ts` — инференс/baseline + Reset дропает raw

**Files:**
- Modify: `src/features/loadFiles.ts`
- Modify: `src/features/Shell.tsx`

Презентации тут нет — это side-effect-оркестрация загрузки и reset. Чистая логика (инференс-парс, baseline) уже под TDD (Task 2); смоук покрывает раздел raw+typed (Task 6).

- [ ] **Step 1: Реализовать инференс + baseline на load CSV**

Заменить содержимое `src/features/loadFiles.ts` на:

```ts
import { arrowToRows } from '../core/arrowToRows'
import { baselineConfig, parseInferredColumns } from '../core/schemaTypes'
import { rawTableName, tableNameFromFilename, uniqueTableName } from '../core/sql'
import type { DuckDBClient } from '../db/duckdbClient'
import type { Dataset } from '../state/session'

/**
 * Register + materialize one file as a Dataset. CSV -> raw all_varchar source
 * (_qb_raw_<t>) + typed copy (<t>, all_varchar baseline) + sniff inference
 * (suggested types) + baseline schemaConfig (M1 state until "типы"/"применить").
 * Parquet -> native types, no raw, no schema config (untouched by M2).
 * Throws on a per-file failure (caller reports it).
 */
export async function loadOneFile(
  client: DuckDBClient,
  file: File,
  takenTableNames: string[],
): Promise<Dataset> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  await client.registerFile(file.name, bytes)
  const kind: Dataset['kind'] = file.name.toLowerCase().endsWith('.parquet')
    ? 'parquet'
    : 'csv'
  const table = uniqueTableName(tableNameFromFilename(file.name), takenTableNames)

  if (kind === 'parquet') {
    await client.loadParquet(file.name, table)
    const columns = await client.describeTable(table)
    return { table, fileName: file.name, bytes: file.size, kind, columns }
  }

  await client.loadCsvAllVarchar(file.name, table)
  const columns = await client.describeTable(table)
  // Inference is best-effort: a sniff failure must not block the all_varchar
  // baseline (spec line 142). Empty suggested => "типы" no-op.
  let suggested: Dataset['suggested'] = []
  try {
    suggested = parseInferredColumns(arrowToRows(await client.sniffCsv(file.name)))
  } catch {
    suggested = []
  }
  return {
    table,
    fileName: file.name,
    bytes: file.size,
    kind,
    columns,
    rawTable: rawTableName(table),
    suggested,
    schemaConfig: baselineConfig(columns),
    dirty: false,
    schemaError: null,
  }
}
```

- [ ] **Step 2: Reset дропает и raw-таблицу для CSV (спека строка 114)**

В `src/features/Shell.tsx`:

(a) Расширить импорт `../core/sql`:
```tsx
import { buildDropTable, rawTableName } from '../core/sql'
```

(b) Заменить тело `handleReset` на версию, дропающую обе таблицы для CSV:
```tsx
  async function handleReset() {
    for (const d of useSession.getState().datasets) {
      try {
        await client.query(buildDropTable(d.table))
        if (d.kind === 'csv') {
          await client.query(buildDropTable(rawTableName(d.table)))
        }
      } catch {
        // ignore — table may already be gone
      }
    }
    reset()
  }
```

- [ ] **Step 3: Build + lint gate**

Run: `npm run build && npm run lint`
Expected: оба зелёные (`loadOneFile` сигнатура не изменилась; `handleReset` локален Shell).

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: все зелёные (логика чистых частей уже покрыта; смоук — raw+typed).

- [ ] **Step 5: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/features/loadFiles.ts src/features/Shell.tsx
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat: CSV load computes sniff inference + baseline config; Reset drops raw table

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `features/useSchemaActions.ts` + кнопка «типы» + ⚠/ошибка в рейле

**Files:**
- Create: `src/features/useSchemaActions.ts`
- Modify: `src/features/Rail.tsx`
- Modify: `src/features/Shell.tsx` (прокинуть `client` в `<Rail/>`)
- Modify: `src/index.css` (стили шапки схемы + ⚠ + строка ошибки)

Оркестрация (side-effects) — глазами/демо; чистые части уже под TDD.

- [ ] **Step 1: Реализовать оркестрацию apply (с обработкой ошибок → рейл)**

Создать `src/features/useSchemaActions.ts`:

```ts
import { arrowToRows } from '../core/arrowToRows'
import {
  buildMaterializeDDL,
  buildNullLossQuery,
  interpretNullLoss,
} from '../core/castBuilder'
import { suggestTypes } from '../core/schemaTypes'
import type { DuckDBClient } from '../db/duckdbClient'
import { useSession } from '../state/session'

/**
 * Apply orchestration for CSV schema typing. The store stays pure (no db
 * calls); all side effects live here: build DDL -> exec -> loss query ->
 * describe -> setApplied. Any DuckDB error is routed to the rail via
 * setSchemaError (spec line 144), not thrown. "типы" (applyInferred) =
 * setColumnConfig(suggested) then apply.
 */
export function useSchemaActions(client: DuckDBClient) {
  async function apply(table: string): Promise<void> {
    const ds = useSession.getState().datasets.find((d) => d.table === table)
    if (!ds || ds.kind !== 'csv' || !ds.rawTable || !ds.schemaConfig) return
    try {
      // 1. re-materialize the typed table from the immutable raw table.
      await client.exec(buildMaterializeDDL(table, ds.rawTable, ds.schemaConfig))

      // 2. count N -> NULL losses in one pass (skip when nothing to count).
      const loss = buildNullLossQuery(ds.rawTable, ds.schemaConfig)
      let losses: Record<string, number> = {}
      if (loss.sql) {
        const row = arrowToRows(await client.query(loss.sql)).rows[0] ?? {}
        losses = interpretNullLoss(row, loss.columns)
      }

      // 3. read back the applied schema + commit to the store.
      const columns = await client.describeTable(table)
      useSession.getState().setApplied(table, columns, losses)
    } catch (e) {
      useSession.getState().setSchemaError(table, String(e))
    }
  }

  async function applyInferred(table: string): Promise<void> {
    const ds = useSession.getState().datasets.find((d) => d.table === table)
    if (!ds || !ds.suggested || ds.suggested.length === 0) return
    useSession.getState().setColumnConfig(table, suggestTypes(ds.suggested))
    await apply(table)
  }

  return { apply, applyInferred }
}
```

- [ ] **Step 2: Прокинуть client в Rail из Shell**

В `src/features/Shell.tsx` заменить `<Rail />` на:
```tsx
        <Rail client={client} />
```

- [ ] **Step 3: Кнопка «типы» + ⚠ + строка ошибки в рейле**

В `src/features/Rail.tsx`:

(a) Расширить импорты (добавить новые строки рядом с существующими):
```tsx
import type { DuckDBClient } from '../db/duckdbClient'
import { useSchemaActions } from './useSchemaActions'
```

(b) Изменить сигнатуру компонента:
```tsx
export function Rail({ client }: { client: DuckDBClient }) {
```
и сразу внутри тела (рядом с селекторами стора):
```tsx
  const { applyInferred } = useSchemaActions(client)
```

(c) Полностью заменить блок `{shownDatasets.map((ds) => { … })}` (строки 60–90 текущего файла) на версию с кнопкой «типы» (только CSV с suggested), per-column ⚠ и строкой ошибки:

```tsx
      {shownDatasets.map((ds) => {
        const used = new Set(
          activeTab
            ? detectUsedColumns(
                activeTab.sql,
                ds.columns.map((c) => c.name),
              )
            : [],
        )
        const canType = ds.kind === 'csv' && (ds.suggested?.length ?? 0) > 0
        return (
          <div className="schema-block" key={ds.table}>
            <div className="rail-section-label schema-head">
              <span>
                Схема · {ds.fileName}{' '}
                <span className="schema-count">
                  {used.size}/{ds.columns.length}
                </span>
              </span>
              {canType && (
                <button
                  className="schema-btn"
                  onClick={() => void applyInferred(ds.table)}
                  title="применить предложенные типы одним кликом"
                >
                  типы
                </button>
              )}
            </div>
            {ds.schemaError && (
              <div className="schema-error" role="alert">
                {ds.schemaError}
              </div>
            )}
            <ul className="schema">
              {ds.columns.map((c) => (
                <li
                  className={used.has(c.name) ? 'schema-col used' : 'schema-col'}
                  key={c.name}
                >
                  <span className="col-name">{c.name}</span>
                  <span className="col-meta">
                    <span className="col-type">{c.type}</span>
                    {c.nullLoss != null && c.nullLoss > 0 && (
                      <span className="col-warn" title={`${c.nullLoss} → NULL`}>
                        ⚠ {c.nullLoss}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
```

- [ ] **Step 4: Стили (дописать в конец `src/index.css`)**

```css
/* --- M2 schema typing --- */
.schema-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.schema-btn {
  border: 1px solid #34555a; background: #11262a; color: #e9eeea;
  padding: 2px 9px; border-radius: 6px; cursor: pointer; font-size: 11px;
}
.schema-btn:hover { background: #1d363b; }
.schema-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.schema-error {
  color: #e88; background: #2a1414; border: 1px solid #5a2c2c;
  border-radius: 6px; padding: 5px 8px; font-size: 11px; margin: 4px 0;
}
.col-meta { display: inline-flex; align-items: center; gap: 8px; }
.col-warn { color: #e3a95c; font-size: 10.5px; white-space: nowrap; cursor: help; }
```

- [ ] **Step 5: Build + lint gate**

Run: `npm run build && npm run lint`
Expected: оба зелёные. (`void applyInferred(...)` гасит floating-promise; `client` теперь required-проп Rail — Shell его передаёт.)

- [ ] **Step 6: Ручная проверка (глазами) — демо Среза 1**

Run: `npm run dev`. Сценарий (критерий демо Среза 1, спека строка 162):
1. Брось `fixtures/dirty.csv` → в рейле схема, все колонки `VARCHAR`, кнопка «типы».
2. Жми «типы» → колонки получают типы (`id BIGINT`, `revenue DOUBLE`, `signup DATE`), на `signup` маркер ⚠ N с тултипом «N → NULL».
3. Открой таб по `dirty` → `SELECT * FROM "dirty"` → грид уже в правильных типах (числа/даты, не строки).
4. Reset → в рейле чисто; reload → пустое состояние.

- [ ] **Step 7: Commit (конец Среза 1)**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/features/useSchemaActions.ts src/features/Rail.tsx src/features/Shell.tsx src/index.css
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat: one-click "типы" + apply orchestration (errors -> rail) + N->NULL marker (slice 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Срез 1 — gate + деплой-демо чекпойнт

- [ ] **Полный gate**

Run: `npm run lint && npm run build && npm test`
Expected: lint 0 ошибок; build зелёный; все тесты зелёные (sql, schemaTypes, castBuilder, arrowToRows, pruning, chartSpec, session, db smoke + dirty smoke).

**Демо (задеплоено/деплоируемо):** грязный CSV → «типы» → типы появились, ⚠ на лоссовых колонках, запрос типизированной таблицы; ошибка DDL (если есть) видна строкой в шапке схемы. Деплой триггерится мерджем ветки в `main` (см. финальную задачу); промежуточно демо проверяется через `npm run dev`.

---

# СРЕЗ 2 — ручной редактор

## Task 11: `components/SchemaColumnEditor.tsx` — поповер правки колонки

**Files:**
- Create: `src/components/SchemaColumnEditor.tsx`

Поповер — чистая презентация на локальном стейте + колбэки; логика (cfg→DDL) уже под TDD. Проверяется глазами. `canDisableInclude=false` дизейблит снятие галки на последней включённой колонке — UI-гарантия ≥1 include (спека строка 130).

- [ ] **Step 1: Реализовать поповер**

Создать `src/components/SchemaColumnEditor.tsx`:

```tsx
import { useState } from 'react'
import type { ColType, ColumnConfig } from '../core/schemaTypes'

const TYPES: ColType[] = [
  'VARCHAR',
  'BIGINT',
  'DOUBLE',
  'DATE',
  'TIMESTAMP',
  'BOOLEAN',
]

interface Props {
  config: ColumnConfig
  /** When false, the include checkbox cannot be unchecked (last included col). */
  canDisableInclude: boolean
  onStage: (cfg: ColumnConfig) => void
  onReset: (origName: string) => void
  onClose: () => void
}

export function SchemaColumnEditor({
  config,
  canDisableInclude,
  onStage,
  onReset,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<ColumnConfig>(config)

  const set = (patch: Partial<ColumnConfig>) =>
    setDraft((d) => ({ ...d, ...patch }))

  const isNumeric = draft.type === 'BIGINT' || draft.type === 'DOUBLE'
  const isTemporal = draft.type === 'DATE' || draft.type === 'TIMESTAMP'

  function save() {
    onStage(draft)
    onClose()
  }

  return (
    <div className="col-editor" role="dialog" aria-label={`правка ${config.origName}`}>
      <div className="col-editor-head">
        <span className="col-editor-orig">{config.origName}</span>
        <button className="col-editor-x" onClick={onClose} aria-label="закрыть">
          ×
        </button>
      </div>

      <label className="col-editor-row">
        <span>имя</span>
        <input
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>

      <label className="col-editor-row">
        <span>тип</span>
        <select
          value={draft.type}
          onChange={(e) => set({ type: e.target.value as ColType })}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="col-editor-row checkbox">
        <input
          type="checkbox"
          checked={draft.include}
          disabled={draft.include && !canDisableInclude}
          onChange={(e) => set({ include: e.target.checked })}
        />
        <span>включить колонку</span>
      </label>

      {isNumeric && (
        <label className="col-editor-row checkbox">
          <input
            type="checkbox"
            checked={draft.decimalSep === ','}
            onChange={(e) => set({ decimalSep: e.target.checked ? ',' : undefined })}
          />
          <span>десятичная запятая</span>
        </label>
      )}

      {isTemporal && (
        <label className="col-editor-row">
          <span>формат</span>
          <input
            placeholder="%d.%m.%Y (опц.)"
            value={draft.dateFormat ?? ''}
            onChange={(e) => set({ dateFormat: e.target.value || undefined })}
          />
        </label>
      )}

      <label className="col-editor-row">
        <span>nullstr</span>
        <input
          placeholder="напр. NA (опц.)"
          value={draft.nullToken ?? ''}
          onChange={(e) => set({ nullToken: e.target.value || undefined })}
        />
      </label>

      <div className="col-editor-actions">
        <button className="link" onClick={() => onReset(config.origName)}>
          сбросить
        </button>
        <button className="schema-btn" onClick={save}>
          применить к колонке
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build + lint gate**

Run: `npm run build && npm run lint`
Expected: оба зелёные.

- [ ] **Step 3: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/components/SchemaColumnEditor.tsx
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(ui): SchemaColumnEditor popover (type/rename/include/format/sep/nullstr)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Рейл — маркер ✎, открытие поповера, стейджинг

**Files:**
- Modify: `src/features/Rail.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Подключить поповер + ✎ + stage/reset**

В `src/features/Rail.tsx`:

(a) Расширить импорты:
```tsx
import { useState } from 'react'
import { SchemaColumnEditor } from '../components/SchemaColumnEditor'
```

(b) Внутри `Rail`, рядом с `applyInferred`, добавить селекторы действий + локальный стейт открытого редактора:
```tsx
  const stageColumn = useSession((s) => s.stageColumn)
  const resetColumn = useSession((s) => s.resetColumn)
  const [editing, setEditing] = useState<{ table: string; origName: string } | null>(null)
```

(c) Внутри `{shownDatasets.map((ds) => { … })}` заменить блок `<ul className="schema"> … </ul>` (тело `ds.columns.map`) на версию с ✎, поповером и счётчиком включённых (для UI-гарантии ≥1):

```tsx
            <ul className="schema">
              {(() => {
                const includedCount =
                  ds.schemaConfig?.filter((c) => c.include).length ?? 0
                return ds.columns.map((c) => {
                  const cfg = ds.schemaConfig?.find((x) => x.origName === c.name)
                  const open =
                    editing?.table === ds.table && editing?.origName === c.name
                  // Allow un-including only when >1 column is currently included.
                  const canDisableInclude = includedCount > 1
                  return (
                    <li
                      className={used.has(c.name) ? 'schema-col used' : 'schema-col'}
                      key={c.name}
                    >
                      <span className="col-name">{c.name}</span>
                      <span className="col-meta">
                        <span className="col-type">{c.type}</span>
                        {c.nullLoss != null && c.nullLoss > 0 && (
                          <span className="col-warn" title={`${c.nullLoss} → NULL`}>
                            ⚠ {c.nullLoss}
                          </span>
                        )}
                        {cfg && (
                          <button
                            className="col-edit"
                            aria-label={`правка ${c.name}`}
                            onClick={() =>
                              setEditing(
                                open ? null : { table: ds.table, origName: c.name },
                              )
                            }
                          >
                            ✎
                          </button>
                        )}
                      </span>
                      {open && cfg && (
                        <SchemaColumnEditor
                          config={cfg}
                          canDisableInclude={canDisableInclude}
                          onStage={(next) => stageColumn(ds.table, next)}
                          onReset={(orig) => {
                            resetColumn(ds.table, orig)
                            setEditing(null)
                          }}
                          onClose={() => setEditing(null)}
                        />
                      )}
                    </li>
                  )
                })
              })()}
            </ul>
```

- [ ] **Step 2: Стили ✎ + поповера (дописать в конец `src/index.css`)**

```css
.col-edit {
  border: 0; background: transparent; color: #5c7975; cursor: pointer;
  font-size: 12px; padding: 0 2px; line-height: 1;
}
.col-edit:hover { color: #e3a95c; }
.schema-col { position: relative; }
.col-editor {
  position: absolute; right: 0; top: 100%; z-index: 10; width: 280px;
  background: #0d1c1f; border: 1px solid #34555a; border-radius: 10px;
  padding: 12px; margin-top: 4px; display: flex; flex-direction: column; gap: 9px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
}
.col-editor-head { display: flex; align-items: center; justify-content: space-between; }
.col-editor-orig { font-family: ui-monospace, monospace; color: #e9eeea; font-size: 13px; }
.col-editor-x { border: 0; background: transparent; color: #5c7975; cursor: pointer; font-size: 16px; }
.col-editor-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #8da6a2; }
.col-editor-row > span:first-child { width: 56px; flex: 0 0 56px; }
.col-editor-row input[type='text'], .col-editor-row input:not([type]), .col-editor-row select {
  flex: 1; background: #11262a; border: 1px solid #1d363b; border-radius: 6px;
  color: #e9eeea; padding: 5px 8px; font-size: 12px;
}
.col-editor-row.checkbox { gap: 8px; }
.col-editor-row.checkbox > span:first-child { width: auto; flex: none; }
.col-editor-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 2px; }
.col-editor-actions .link {
  border: 0; background: transparent; color: #8da6a2; cursor: pointer;
  font-size: 12px; text-decoration: underline;
}
```

- [ ] **Step 3: Build + lint gate**

Run: `npm run build && npm run lint`
Expected: оба зелёные.

- [ ] **Step 4: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/features/Rail.tsx src/index.css
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(ui): per-column ✎ marker opens editor popover, stages config (>=1 include guard)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Рейл — кнопка «применить» (когда dirty, дизейбл при 0 include)

**Files:**
- Modify: `src/features/Rail.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Добавить «применить» в шапку схемы**

В `src/features/Rail.tsx`:

(a) Добавить `apply` к деструктуризации `useSchemaActions`:
```tsx
  const { applyInferred, apply } = useSchemaActions(client)
```

(b) Внутри `{shownDatasets.map((ds) => { … })}`, рядом с `const canType = …`, добавить флаг наличия включённых:
```tsx
        const hasIncluded =
          (ds.schemaConfig?.filter((c) => c.include).length ?? 0) > 0
```

(c) В блоке `<div className="rail-section-label schema-head">…</div>` заменить группу `{canType && ( <button…типы…/> )}` на «применить» (когда dirty) + «типы», обёрнутые в `.schema-actions`:

```tsx
              <span className="schema-actions">
                {ds.dirty && (
                  <button
                    className="schema-btn apply"
                    disabled={!hasIncluded}
                    onClick={() => void apply(ds.table)}
                    title={
                      hasIncluded
                        ? 'ре-материализовать таблицу из текущей конфигурации'
                        : 'нужна хотя бы одна включённая колонка'
                    }
                  >
                    применить
                  </button>
                )}
                {canType && (
                  <button
                    className="schema-btn"
                    onClick={() => void applyInferred(ds.table)}
                    title="применить предложенные типы одним кликом"
                  >
                    типы
                  </button>
                )}
              </span>
```

- [ ] **Step 2: Стили (дописать в конец `src/index.css`)**

```css
.schema-actions { display: inline-flex; gap: 6px; }
.schema-btn.apply { background: #e3a95c; color: #15201a; border-color: #e3a95c; font-weight: 600; }
.schema-btn.apply:hover { background: #efb86c; }
.schema-btn.apply:disabled { background: #5a4a30; border-color: #5a4a30; }
```

- [ ] **Step 3: Build + lint gate**

Run: `npm run build && npm run lint`
Expected: оба зелёные.

- [ ] **Step 4: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/features/Rail.tsx src/index.css
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(ui): "применить" button (visible when dirty, disabled at 0 included) re-materializes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Рейл — защитный фильтр внутренних raw-таблиц из источников/схемы

**Files:**
- Modify: `src/features/Rail.tsx`

> Контекст: `_qb_raw_*` в `datasets` не попадают (их кладёт `loadCsvAllVarchar` напрямую в DuckDB; `loadOneFile` добавляет в стор только `<t>`), так что источники/схема уже чисты. Но если запрос пользователя руками сошлётся на `_qb_raw_*`, рейл не должен показывать её как источник. Эта задача — защитный инвариант, трассируемый к спеке (строки 23/178: «`_qb_raw_*` фильтруются из источников/схемы»). Фильтр уже под TDD в Task 1 (`isInternalTable`).

- [ ] **Step 1: Применить фильтр в рейле**

В `src/features/Rail.tsx`:

(a) Добавить НОВУЮ строку импорта (в Rail.tsx нет существующего импорта из `../core/sql` — добавь отдельной строкой рядом с импортом из `../core/pruning`):
```tsx
import { isInternalTable } from '../core/sql'
```

(b) Заменить строку селектора датасетов:
```tsx
  const datasets = useSession((s) => s.datasets)
```
на отфильтрованную:
```tsx
  const allDatasets = useSession((s) => s.datasets)
  const datasets = allDatasets.filter((d) => !isInternalTable(d.table))
```

- [ ] **Step 2: Build + lint gate**

Run: `npm run build && npm run lint`
Expected: оба зелёные.

- [ ] **Step 3: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/features/Rail.tsx
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
chore(ui): defensively filter internal raw tables from rail sources/schema

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Финальная проверка вехи M2

**Files:** —

- [ ] **Step 1: Полный gate**

Run: `npm run lint && npm run build && npm test`
Expected: lint 0 ошибок; build зелёный (DuckDB-бандлы в `dist/assets/`); все тесты зелёные:
- `src/core/sql.test.ts` (M1 + raw/sniff/load/clone билдеры)
- `src/core/schemaTypes.test.ts`
- `src/core/castBuilder.test.ts` (включая rename-with-quote в loss)
- `src/core/arrowToRows.test.ts`, `src/core/pruning.test.ts`, `src/core/chartSpec.test.ts` (M1, без изменений)
- `src/state/session.test.ts` (M1 + M2 действия)
- `src/db/duckdbClient.test.ts` (M1 смоук), `src/db/duckdbClient.dirty.test.ts` (M2 смоук)

- [ ] **Step 2: Сквозная ручная приёмка (критерий вехи, спека строка 167)**

Run: `npm run dev`. Сценарий:
1. Лоадер → пусто.
2. Брось `fixtures/dirty.csv` → схема, все `VARCHAR`, кнопка «типы».
3. Жми «типы» → таблица типизируется (`id BIGINT`, `revenue DOUBLE`, `signup DATE`); на колонках с неудачными кастами — ⚠ N (`signup ⚠ 2`).
4. ✎ на `revenue` → поповер: смени тип/формат/decimal/nullstr/include; «применить к колонке» → схема стала dirty, появилась кнопка «применить».
5. Жми «применить» → схема ре-материализуется, типы и ⚠ обновились.
6. Открой таб по `dirty` (`SELECT * FROM "dirty"`) → Run → результат уже в правильных типах.
7. Сбрось колонку (✎ → «сбросить») → вернулась к suggested, dirty.
8. Попробуй снять include у последней включённой колонки → чекбокс дизейблен (≥1-гард).
9. (Опц.) Введи невалидный strptime-формат → «применить» → текст ошибки в шапке схемы, приложение не падает.
10. Reset → всё чисто (типизированные И raw таблицы дропнуты); hard-reload → пустое состояние (всё в памяти — ожидаемо).

- [ ] **Step 3: Завершение ветки**

Перейти к **superpowers:finishing-a-development-branch** (тесты зелёные → опции merge/PR). Это смерджит `m2-schema-types` в `main` и триггерит деплой на Pages. После деплоя — проверить демо-сценарий на Pages-URL (критерий: «на задеплоенном Pages-URL всё работает; reload → пустое состояние»).

---

## Покрытие спека (self-review)

- Type set VARCHAR/BIGINT/DOUBLE/DATE/TIMESTAMP/BOOLEAN → Task 2 (`ColType`). ✓
- `core/schemaTypes`: `ColumnConfig`, `parseInferredColumns`, `suggestTypes`, DuckDB-маппинг (incl. DECIMAL→DOUBLE) → Task 2. ✓
- `core/castBuilder`: `buildCastValue`/`buildCastExpr` (VARCHAR passthrough, nullif, replace для запятой, try_strptime+CAST для DATE, try_strptime для TIMESTAMP, AS quoteIdent, экранирование rename-имени с `"`) → Task 3. ✓
- `buildMaterializeDDL` (include/order, ≥1 throw, CREATE OR REPLACE из raw) → Task 4. ✓
- `buildNullLossQuery` (один проход, present = NOT NULL AND <> '' [+nullToken], пропуск VARCHAR, l<i>, голое каст-значение без regex) + `interpretNullLoss` → Task 5. ✓
- `sql.ts`: `rawTableName`, `isInternalTable`, `buildCloneTable` (вместо slice-хака) → Tasks 1, 14. ✓
- Модель A: raw `_qb_raw_<t>` + typed `<t>` на load (через `buildCloneTable`); apply = CREATE OR REPLACE из raw; Parquet untouched → Tasks 6, 9. ✓
- `db`: `exec`, `sniffCsv`, CSV-load переписан на raw+typed; `describeTable` переиспользуется → Task 6. ✓
- Reset дропает и `<t>`, и `_qb_raw_<t>` (спека строка 114) → Task 9. ✓
- Стор-действия (чистые) `setColumnConfig`/`stageColumn` (Task 7) + `resetColumn`/`setApplied` (Task 8) + `setSchemaError` (Task 7); оркестрация в `useSchemaActions` → Tasks 7, 8, 10. ✓
- «типы» = applyInferred = setColumnConfig(suggested)+apply → Task 10. ✓
- Ошибка DDL/запроса → текст в рейле (спека строка 144): try/catch в `apply`/`applyInferred` → `setSchemaError` → рендер `.schema-error` → Tasks 10. ✓
- UI-гарантия ≥1 включённой колонки (спека строка 130): дизейбл include на последней (Task 12) + дизейбл «применить» при 0 include (Task 13). ✓
- UI: «типы», «применить» (когда dirty), ✎/⚠, поповер `SchemaColumnEditor`, CSV-only → Tasks 10–13. ✓
- Срезы 1/2 с демо-чекпойнтами → структура плана. ✓
- Firewall (per-cell, derived columns, Parquet typing, multiple null tokens, DECIMAL(p,s), profile/SUMMARIZE, key-hint) — **не строим**. ✓
- Расхождение: RTL-тесты заменены проверкой глазами (нет jsdom-инфры; CLAUDE.md rule 2) — зафиксировано в «Спека-консистентные решения». ✓

**Файлы плана (абсолютные пути):** план реализуется в репозитории `C:\Users\cosmi\Projects\quackbook` на ветке `m2-schema-types`; источник истины — `C:\Users\cosmi\Projects\quackbook\docs\superpowers\specs\2026-06-23-quackbook-m2-schema-types-design.md`.
