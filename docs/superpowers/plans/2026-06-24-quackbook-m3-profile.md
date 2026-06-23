# M3 «Профиль значений» — Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (- [ ]) syntax.

**Goal:** По клику видеть, что внутри колонок — сетка карточек: distinct-каунты, топ-значения категориальных (с барами), мини-гистограммы числовых (+ min/median/max), маркеры null. Два таргета: **таблица-источник** (вход из рейла, понять сырьё до запроса) и **результат запроса** (вход из панели, понять что вернул join/group by).

**Architecture:** Четыре зоны как в M1/M2 (`db/` — единственный, кто говорит с DuckDB; `core/` — чистые строкобилдеры/интерпретаторы под TDD; `state/` — Zustand-стор; `features/`+`components/` — React UI). Профайлер-ядро `core/profile.ts` — чистые функции, не знают про DuckDB: классификация колонок + строители запросов (`buildNullCountQuery`/`buildTopValuesQuery`/`buildHistogramQuery`) и интерпретаторы их результатов (`interpret*`). Оркестрация side-effect'ов — в `features/useProfileActions.ts` (зеркало `useSchemaActions`): общее ядро `profileRelation(name)` работает **по имени таблицы** и переиспользуется обоими таргетами, возвращая `{ profiles, rowCount }`. Источник → профилируем `Dataset.table` напрямую. Результат → материализуем SQL в обычную (catalog-global) внутреннюю таблицу `CREATE OR REPLACE TABLE _qb_result_<tabId> AS <select>`, затем тот же `profileRelation` по имени этой таблицы. Кэш на датасете (источник: `profile` + `rowCount`) и на табе (результат: `resultProfile` + `resultRowCount`); инвалидация — `setApplied` (источник) и `updateTabSql` (результат). Каждый таргет несёт число строк → подпись панели «… · N строк» (спека строка 138). Презентация (CSS, карточки) — глазами.

**Tech Stack:** React 19 + TS 6 + Vite 8; Vitest 4 (node env, `include: src/**/*.test.ts`); `@duckdb/duckdb-wasm@1.32.0` (движок 1.5.4) + `apache-arrow@17.0.0`; Zustand 5. Новых внешних зависимостей нет.

**Источник истины:** `docs/superpowers/specs/2026-06-24-quackbook-m3-profile-design.md` (+ дорожная карта `2026-06-22-quackbook-delivery-design.md`, продукт `docs/scope-quackbook-v1.md`). Ветка: `m3-profile` (создать перед Task 1; оба среза мержатся одной веткой).

**Каждый коммит заканчивается трейлером:**
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```
В примерах коммитов ниже трейлер показан явно в каждом `git commit` — добавляй его всегда. Используй bash here-doc для многострочного сообщения (Windows: НЕ PowerShell `@'...'@` в Bash-инструменте — см. память проекта).

**Per-task gate (память проекта — `build-gate-every-task`):** **каждая задача с кодом перед коммитом прогоняет ВСЕ ТРИ:** `npm run lint && npm run build && npm test`. Per-file `npx vitest run <file>` остаётся для быстрой red/green-обратной связи внутри задачи (Step 2/Step 4), но финальный gate (Step 5) — полный набор, чтобы локальная правка не сломала соседний тест-файл незаметно до конца среза.

**Сборка двумя срезами:** **Срез 1 (Tasks 1–8b)** — профиль источника: весь профайлер-кор + стор-состояние источника + view/target в сторе + `useProfileActions` (`profileRelation`/`profile`) + unit-тест оркестратора + UI (`ProfilePanel`/`ProfileCard`, кнопка в рейле, source-вид в панели и достижимость без активного таба) + node-смоук. **Срез 2 (Tasks 9–13)** — профиль результата: confirm-спайк обычной (не TEMP) внутренней таблицы → `core/sql` result-билдеры → стор-состояние результата → `profileResult` + unit-тест оркестратора → UI-вид «профиль» в панели → node-смоук. Каждый срез заканчивается gate (`npm run lint && npm run build && npm test`) и демо-чекпойнтом.

**Дефолты (из спеки):** `THRESHOLD_DISTINCT = 50`, `TOP_K = 7`, `HISTOGRAM_BINS = 12`.

---

## Спека-консистентные решения (зафиксированы здесь, чтобы исполнитель не додумывал)

1. **RTL/jsdom-тесты не пишем** — как в M1/M2. В репо нет jsdom/`@testing-library`, vitest `include` — только `src/**/*.test.ts` (не `.tsx`). Карточки/CSS проверяются глазами; вся отделимая логика (классификация, билдеры, интерпретаторы, **оркестраторы через стор-стаб клиента**) — node-TDD. Это прямое продолжение прецедента M2 (та же причина — CLAUDE.md rule 2, простота).

2. **Тесты `db`-смоука — в `src/db/*.test.ts`** (vitest подхватывает только так), зеркало `duckdbClient.dirty.test.ts`. Грязные/смоук-данные строим строкой прямо в тесте (как M1/M2). Каждый describe-блок смоука **самодостаточен** (создаёт свою таблицу в своём `it`), не зависит от порядка исполнения соседних describe.

3. **Новых методов `duckdbClient` НЕ добавляем.** Профиль строится из готовых примитивов `query`/`exec`/`describeTable`. `SUMMARIZE`, null-каунт, top-values, гистограммы — обычные `query`; материализация результата — `exec`. Спека (строка 153) это допускает явно.

4. **`null_percentage` из `SUMMARIZE` НЕ используем** — спайк показал, что Decimal через наш `arrowToRows` декодится криво (строка `"1667"` вместо `16.67`). Null-каунты берём отдельным чистым проходом `count(*) FILTER (WHERE "col" IS NULL)` (спека строки 30, 82). Этот же проход даёт `total` (число строк) — `interpretNullCounts` возвращает `{ total, nulls }`, оба нужны. Это не дублирование «на будущее», а единственный корректный путь.

5. **Гистограммы — ручная equi-width floor-арифметика**, НЕ `width_bucket`/`histogram(col,N)` (их нет в сборке — спека строка 31). `least(BINS-1, floor((c - lo) / ((hi - lo) / BINS)))::INT` даёт чистые `{bucket:Int32, n:Int64}`. Вырожденный `hi == lo` → гистограмму опускаем (деление на ноль). BigInt-каунты → `Number()`.

6. **min/max/median из `SUMMARIZE` приходят строками** (гетерогенные колонки). Для `numeric` парсим `Number(...)`; для `range` (DATE/TIMESTAMP/TIME) оставляем строкой (биннинг дат вне v1). approx_unique — Int64→BigInt → `Number()`. **`approx_unique` приблизителен (HLL `approx_count_distinct`)** — в смоуке НЕ проверяем точным равенством (на 6 строках `country` HLL вернул `2`, а `count(DISTINCT)` — `3`); проверяем робастные факты (`kind`, `nullCount`, `top[0]`) и при необходимости — нижнюю границу (спека строка 180).

7. **Histogram — только в карточках профиля.** `Chart.tsx`/`chartSpec.ts` НЕ трогаем (спека строки 18, 147; firewall). Осознанное прочтение скоупа: берём done-when.

8. **Вид `view` поднимается из `ResultPanel` в стор** (`exploreView`), потому что профиль-вид переключают ДВА места: кнопка рейла (источник) и таб панели (результат). Это требует прокинуть активный таб в `ResultPanel` (сейчас он получает только `result/meta/error`) — добавляем пропы `tabId`/`sql`/`client` из `Explore`. Хирургично: единственное изменение сигнатуры, трассируется к спеке (строки 123, 133).

9. **Внутренняя result-таблица — ОБЫЧНАЯ (catalog-global), НЕ TEMP.** Эмпирически проверено против реального node-движка DuckDB-WASM 1.32: `DuckDBClient.run()` открывает **новое соединение на каждый `query`/`exec`** (`db.connect()` … `finally { conn.close() }`). DuckDB-`TEMP`-таблица **локальна для соединения** → `CREATE … TEMP TABLE` на соединении A, `SUMMARIZE` на соединении B → `Catalog Error: Table … does not exist`. Поэтому материализуем результат в обычную таблицу `_qb_result_<tabId>` (`CREATE OR REPLACE TABLE … AS <select>`, без слова `TEMP`) — она каталог-глобальна и переживает межвызовные соединения (тот же механизм, что у `_qb_raw_*`/`buildLoadCsvRaw`, который и так работает). Явный DROP не нужен: следующий `CREATE OR REPLACE` перезатирает на таб, таблица живёт сессию и **скрыта из рейла** через расширение `isInternalTable` на `_qb_result_*` (спека строка 106). Спайк (Task 9) подтверждает именно этот вариант (обычная таблица) до продакшен-кода.

10. **Профиль результата материализует SQL ровно один раз** в `_qb_result_<tabId>` с настоящими выведенными DuckDB-типами — поэтому осмысленнее, чем профиль нетипизированного CSV-источника (спека строка 101). Число строк результата (`total` из null-каунт-прохода) кэшируется на табе и показывается в подписи.

11. **Подпись panel-вида несёт число строк** (спека строка 138): источник → «профиль источника · `<fileName>` · N строк»; результат → «профиль результата · `<имя таба>` · N строк». `rowCount` проброшен через `profileRelation` → `setProfile`/`setResultProfile` → подпись. Пустая таблица (`rowCount === 0`) → отдельная плашка «таблица пуста · 0 строк» вместо карточек (спека строка 94).

---

## File Structure

| Файл | Статус | Ответственность |
|---|---|---|
| `src/core/profile.ts` | **новый** | Типы профиля (`ColumnKind`, `TopValue`, `HistogramBin`, `ColumnProfile`); `classifyColumn`; `parseSummarize`; `buildNullCountQuery`/`interpretNullCounts`; `buildTopValuesQuery`/`interpretTopValues`; `buildHistogramQuery`/`interpretHistogram`; константы `THRESHOLD_DISTINCT`/`TOP_K`/`HISTOGRAM_BINS`. Чистые функции, без DuckDB. |
| `src/core/profile.test.ts` | **новый** | TDD каждой чистой функции (классификация, парс SUMMARIZE, билдеры/интерпретаторы; вырожденный `hi==lo`, пустые бины, нормализация `frac`, all-null numeric, пустой top). |
| `src/core/sql.ts` | расширить (slice 2) | `+resultTempName(tabId)` → `_qb_result_<tabId>`; `+buildResultTempDDL(tabId, sql)` (обычная `CREATE OR REPLACE TABLE`, strip хвостового `;`); расширить `isInternalTable` на `_qb_result_*`. |
| `src/core/sql.test.ts` | расширить (slice 2) | Тесты `resultTempName`, `buildResultTempDDL` (обычная TABLE, strip `;`), `isInternalTable('_qb_result_*')`. |
| `src/state/session.ts` | расширить | `Dataset` += `profile?`/`rowCount?`/`profiling?`/`profileError?`; `Tab` += `resultProfile?`/`resultRowCount?`/`resultProfiling?`/`resultProfileError?`; `exploreView`/`profileTarget` на сессии. Действия: `setProfile(table, profiles, rowCount)`/`setProfiling`/`setProfileError` (источник); `setResultProfile(tabId, profiles, rowCount)`/`setResultProfiling`/`setResultProfileError` (результат); `setExploreView`/`setProfileTarget`. Инвалидация: `setApplied` чистит `profile`+`rowCount`; `updateTabSql` чистит `resultProfile`+`resultRowCount`. |
| `src/state/session.test.ts` | расширить | Новые действия (чистые, вкл. персист `rowCount`) + инвалидация (setApplied→profile/rowCount=undefined; updateTabSql→resultProfile/resultRowCount=undefined). |
| `src/features/useProfileActions.ts` | **новый** | Оркестрация: `profileRelation(client, name)` → `{ profiles, rowCount }` (общее ядро); `profile(table)` (источник); `profileResult(tabId, sql)` (материализация result-таблицы + `profileRelation`). Side-effects только здесь; ошибка → в стор, не throw. |
| `src/features/useProfileActions.test.ts` | **новый** | Node-unit оркестраторов (`profile`/`profileResult`) на стаб-`DuckDBClient` (`exec`/`query` = `vi.fn`) + реальный `useSession`: кэш-no-op, пустой SQL no-op, маршрутизация ошибки в стор, вызов `buildResultTempDDL` в `exec`. Без DuckDB. |
| `src/db/duckdbClient.profile.test.ts` | **новый** | Node-смоук (зеркало `duckdbClient.dirty.test.ts`): на реальной таблице прогнать весь конвейер `profileRelation`-уровня и проверить `ColumnProfile[]`+`rowCount`; slice 2 — то же через `CREATE OR REPLACE TABLE _qb_result_* AS <select>`. Каждый describe самодостаточен. |
| `src/components/ProfilePanel.tsx` | **новый** | Рендер `ColumnProfile[]`+`rowCount` активного таргета (источник: `Dataset.profile`/`rowCount`; результат: `Tab.resultProfile`/`resultRowCount`); подпись по таргету c «N строк»; пустая таблица → «0 строк» плашка; состояния profiling/error; сетка `.pgrid`. |
| `src/components/ProfileCard.tsx` | **новый** | Одна карточка: шапка (имя/бейдж/distinct/null), categorical (бары топ-значений + «+N ещё»), numeric (мини-гистограмма + min/median/max, all-null → null-метка, median NaN → «—»), range (min/median/max), highCardinality (≈N distinct). |
| `src/components/ResultPanel.tsx` | расширить (slice 2) | Третий вид «профиль» рядом с таблица/график; `view` поднят в стор (`exploreView`); читает `profileTarget`; кнопка «профиль» → `setProfileTarget({kind:'result',tabId})` + `setExploreView('profile')` + `profileResult`. Source-only без результата: тулбар показан, таблица/график disabled, «профиль» активна (спека строка 133). Принимает пропы `tabId`/`sql`/`client`. |
| `src/features/Explore.tsx` | расширить (slice 1+2) | Прокинуть `tabId={tab.id}`/`sql`/`client` в `<ResultPanel/>`; при `!tab && exploreView==='profile' && profileTarget?.kind==='source'` рендерить `<ProfilePanel/>` (source-профиль достижим без открытого таба — спека строки 130, 133). |
| `src/features/Rail.tsx` | расширить (slice 1) | В каждом schema-блоке кнопка «профиль источника» → `setProfileTarget({kind:'source',table})` + `setExploreView('profile')` + `profile(table)`. |
| `src/index.css` | расширить | Порт стилей профиля из мокапа (`.psub/.pgrid/.pcard/.pc-*/.pt/.pf/.histo/.hb/.pstats/.profbtn`) на литеральную палитру репо. |

> `src/components/Chart.tsx` / `src/core/chartSpec.ts` — **НЕ трогаем** (firewall, решение 7).

---

# СРЕЗ 1 — профиль источника

## Task 1: `core/profile.ts` — типы + `classifyColumn`

**Files:**
- Create: `src/core/profile.ts`
- Test: `src/core/profile.test.ts`

- [ ] **Step 0: Создать ветку** (один раз, до Task 1)

```bash
git -C /c/Users/cosmi/Projects/quackbook checkout -b m3-profile
```

- [ ] **Step 1: Write the failing test**

Создать `src/core/profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { classifyColumn, THRESHOLD_DISTINCT } from './profile'

describe('classifyColumn', () => {
  it('numeric for integer/real/decimal families', () => {
    expect(classifyColumn('BIGINT', 100, THRESHOLD_DISTINCT)).toBe('numeric')
    expect(classifyColumn('HUGEINT', 100, THRESHOLD_DISTINCT)).toBe('numeric')
    expect(classifyColumn('DOUBLE', 100, THRESHOLD_DISTINCT)).toBe('numeric')
    expect(classifyColumn('FLOAT', 5, THRESHOLD_DISTINCT)).toBe('numeric')
    expect(classifyColumn('INTEGER', 9999, THRESHOLD_DISTINCT)).toBe('numeric')
    expect(classifyColumn('DECIMAL(18,3)', 7, THRESHOLD_DISTINCT)).toBe('numeric')
  })
  it('boolean is categorical regardless of distinct', () => {
    expect(classifyColumn('BOOLEAN', 2, THRESHOLD_DISTINCT)).toBe('categorical')
  })
  it('varchar under threshold is categorical, over threshold is highCardinality', () => {
    expect(classifyColumn('VARCHAR', 12, 50)).toBe('categorical')
    expect(classifyColumn('VARCHAR', 50, 50)).toBe('categorical') // <= threshold
    expect(classifyColumn('VARCHAR', 51, 50)).toBe('highCardinality')
  })
  it('date/timestamp/time are range', () => {
    expect(classifyColumn('DATE', 365, THRESHOLD_DISTINCT)).toBe('range')
    expect(classifyColumn('TIMESTAMP', 1000, THRESHOLD_DISTINCT)).toBe('range')
    expect(classifyColumn('TIMESTAMP WITH TIME ZONE', 1000, THRESHOLD_DISTINCT)).toBe('range')
    expect(classifyColumn('TIME', 24, THRESHOLD_DISTINCT)).toBe('range')
  })
  it('anything else is highCardinality', () => {
    expect(classifyColumn('UUID', 9, THRESHOLD_DISTINCT)).toBe('highCardinality')
    expect(classifyColumn('BLOB', 9, THRESHOLD_DISTINCT)).toBe('highCardinality')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/profile.test.ts`
Expected: FAIL — cannot find module `./profile`.

- [ ] **Step 3: Write minimal implementation**

Создать `src/core/profile.ts`:

```ts
/** How a column is profiled (drives which card body renders). */
export type ColumnKind = 'numeric' | 'categorical' | 'range' | 'highCardinality'

/** A categorical column profiles into at most TOP_K top values (with bars). */
export interface TopValue {
  value: string // string rendering (boolean -> 'true'/'false'); null bucket excluded
  count: number
  frac: number // count / max(count) in the set -> bar width 0..1
}

/** One equi-width numeric histogram bin. */
export interface HistogramBin {
  lo: number
  hi: number
  count: number
}

/** The full per-column profile rendered by a ProfileCard. */
export interface ColumnProfile {
  name: string
  type: string // DuckDB column_type verbatim (badge)
  distinct: number // approx_unique
  nullCount: number
  kind: ColumnKind
  // categorical (incl. boolean):
  top?: TopValue[]
  moreDistinct?: number // distinct - top.length, for "+N ещё"
  // numeric:
  histogram?: HistogramBin[]
  stats?: { min: number; median: number; max: number }
  // range (date/timestamp/time):
  range?: { min: string; median: string; max: string }
}

/** Distinct-count threshold: VARCHAR with approx_unique <= this is categorical. */
export const THRESHOLD_DISTINCT = 50
/** How many top values a categorical card shows. */
export const TOP_K = 7
/** Equi-width bins for a numeric histogram. */
export const HISTOGRAM_BINS = 12

/**
 * Classify a column from its DuckDB type + approx distinct count. numeric ->
 * histogram + min/median/max; boolean/low-card VARCHAR -> categorical top
 * values; high-card VARCHAR/other -> highCardinality (distinct + null only);
 * date/timestamp/time -> range (min/median/max only, no binning in v1).
 */
export function classifyColumn(
  columnType: string,
  approxUnique: number,
  threshold: number,
): ColumnKind {
  const t = columnType.toUpperCase()
  if (
    /^(BIGINT|INTEGER|INT|SMALLINT|TINYINT|HUGEINT|UBIGINT|UINTEGER|USMALLINT|UTINYINT|UHUGEINT|DOUBLE|FLOAT|REAL|DECIMAL|NUMERIC)\b/.test(
      t,
    )
  )
    return 'numeric'
  if (/^BOOL/.test(t)) return 'categorical'
  if (/^(DATE|TIMESTAMP|TIME)\b/.test(t)) return 'range'
  if (/^VARCHAR\b/.test(t)) {
    return approxUnique <= threshold ? 'categorical' : 'highCardinality'
  }
  return 'highCardinality'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/profile.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gate (lint + build + test)**

Run: `npm run lint && npm run build && npm test`
Expected: lint 0; build зелёный; ВЕСЬ набор зелёный.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/core/profile.ts src/core/profile.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(core): profile types + classifyColumn (numeric/categorical/range/highCard)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `core/profile.ts` — `parseSummarize`

**Files:**
- Modify: `src/core/profile.ts`
- Test: `src/core/profile.test.ts`

- [ ] **Step 1: Write the failing test**

Дописать в `src/core/profile.test.ts` (расширить верхний импорт: `import { classifyColumn, parseSummarize, THRESHOLD_DISTINCT } from './profile'`; и добавить импорт типа: `import type { QueryResult } from './arrowToRows'`):

```ts
// SUMMARIZE returns column_name/column_type (Utf8), min/max/q50 (STRINGS),
// approx_unique (Int64 -> BigInt). null_percentage (Decimal) is IGNORED.
function fakeSummarize(
  rows: Record<string, unknown>[],
): QueryResult {
  return {
    columns: [
      { name: 'column_name', type: 'Utf8' },
      { name: 'column_type', type: 'Utf8' },
      { name: 'min', type: 'Utf8' },
      { name: 'max', type: 'Utf8' },
      { name: 'approx_unique', type: 'Int64' },
      { name: 'q50', type: 'Utf8' },
    ],
    rows,
    numRows: rows.length,
  }
}

describe('parseSummarize', () => {
  it('maps each row to {name,type,approxUnique,min,max,median}; counts as Number, stats as strings', () => {
    const r = fakeSummarize([
      { column_name: 'rev', column_type: 'DOUBLE', min: '0.99', max: '312.0', approx_unique: 240n, q50: '14.5' },
      { column_name: 'country', column_type: 'VARCHAR', min: 'AE', max: 'ZW', approx_unique: 12n, q50: null },
    ])
    expect(parseSummarize(r)).toEqual([
      { name: 'rev', type: 'DOUBLE', approxUnique: 240, min: '0.99', max: '312.0', median: '14.5' },
      { name: 'country', type: 'VARCHAR', approxUnique: 12, min: 'AE', max: 'ZW', median: null },
    ])
  })
  it('coerces a missing/null approx_unique to 0 and a null min/max to null', () => {
    const r = fakeSummarize([
      { column_name: 'x', column_type: 'BIGINT', min: null, max: null, approx_unique: null, q50: null },
    ])
    expect(parseSummarize(r)).toEqual([
      { name: 'x', type: 'BIGINT', approxUnique: 0, min: null, max: null, median: null },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/profile.test.ts`
Expected: FAIL — `parseSummarize is not a function`.

- [ ] **Step 3: Write minimal implementation**

Добавить в `src/core/profile.ts` (верхний импорт-тип в начале файла: `import type { QueryResult } from './arrowToRows'`):

```ts
/** One column's raw SUMMARIZE facts (stats kept as strings, count as Number). */
export interface SummarizeColumn {
  name: string
  type: string
  approxUnique: number
  min: string | null
  max: string | null
  median: string | null // SUMMARIZE q50
}

/** Coerce a possibly-null SUMMARIZE stat cell to a trimmed string or null. */
function toStatString(v: unknown): string | null {
  return v == null ? null : String(v)
}

/**
 * Parse a SUMMARIZE result into per-column facts. approx_unique is Int64
 * (BigInt) -> Number; min/max/q50 stay strings (heterogeneous columns).
 * null_percentage (Decimal) is intentionally NOT read — it decodes wrong via
 * arrowToRows; null counts come from a separate clean pass (buildNullCountQuery).
 */
export function parseSummarize(result: QueryResult): SummarizeColumn[] {
  return result.rows.map((r) => ({
    name: String(r.column_name),
    type: String(r.column_type),
    approxUnique: Number(r.approx_unique ?? 0),
    min: toStatString(r.min),
    max: toStatString(r.max),
    median: toStatString(r.q50),
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/profile.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gate (lint + build + test)**

Run: `npm run lint && npm run build && npm test`
Expected: всё зелёное.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/core/profile.ts src/core/profile.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(core): parseSummarize (count->Number, stats as strings, ignore null_percentage)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `core/profile.ts` — `buildNullCountQuery` + `interpretNullCounts`

**Files:**
- Modify: `src/core/profile.ts`
- Test: `src/core/profile.test.ts`

> Зеркало `buildNullLossQuery`/`interpretNullLoss` (`castBuilder.ts`): один проход, позиционные алиасы `n0..nk`, отдельная колонка `total` (число строк — нужно подписи панели), чистые Int64. Спека строки 30, 82, 138.

- [ ] **Step 1: Write the failing test**

Дописать в `src/core/profile.test.ts` (расширить импорт: добавить `buildNullCountQuery, interpretNullCounts`):

```ts
describe('buildNullCountQuery', () => {
  it('one pass: total + a FILTERed null count per column, quoted idents', () => {
    expect(buildNullCountQuery('events', ['country', 'rev'])).toBe(
      'SELECT count(*) AS total, ' +
        'count(*) FILTER (WHERE "country" IS NULL) AS n0, ' +
        'count(*) FILTER (WHERE "rev" IS NULL) AS n1 ' +
        'FROM "events"',
    )
  })
  it('escapes identifiers with embedded quotes', () => {
    expect(buildNullCountQuery('_qb_raw_t', ['we"ird'])).toBe(
      'SELECT count(*) AS total, ' +
        'count(*) FILTER (WHERE "we""ird" IS NULL) AS n0 ' +
        'FROM "_qb_raw_t"',
    )
  })
  it('still selects total when there are no columns', () => {
    expect(buildNullCountQuery('events', [])).toBe('SELECT count(*) AS total FROM "events"')
  })
})

describe('interpretNullCounts', () => {
  it('maps total + n0..nk (BigInt) into Number total and per-column counts', () => {
    const row = { total: 48210n, n0: 0n, n1: 3n }
    expect(interpretNullCounts(row, ['country', 'rev'])).toEqual({
      total: 48210,
      nulls: { country: 0, rev: 3 },
    })
  })
  it('coerces null/undefined cells to 0', () => {
    expect(interpretNullCounts({ total: null, n0: null }, ['x'])).toEqual({
      total: 0,
      nulls: { x: 0 },
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/profile.test.ts`
Expected: FAIL — `buildNullCountQuery is not a function`.

- [ ] **Step 3: Write minimal implementation**

Добавить в `src/core/profile.ts` (верхний импорт: `import { quoteIdent } from './sql'`):

```ts
/**
 * Build a single-pass query that returns total row count plus, per column, the
 * number of NULLs via count(*) FILTER (WHERE "col" IS NULL). A dedicated clean
 * pass instead of SUMMARIZE's null_percentage (which decodes wrong). The total
 * doubles as the relation's row count (panel caption «N строк»). Columns map to
 * positional aliases n0..nk (idents quoted/escaped).
 */
export function buildNullCountQuery(table: string, columns: string[]): string {
  const parts = ['count(*) AS total']
  columns.forEach((col, i) => {
    parts.push(`count(*) FILTER (WHERE ${quoteIdent(col)} IS NULL) AS n${i}`)
  })
  return `SELECT ${parts.join(', ')} FROM ${quoteIdent(table)}`
}

/** Interpret the {total, n0..nk} row (BigInt) into total + {col: nullCount}. */
export function interpretNullCounts(
  row: Record<string, unknown>,
  columns: string[],
): { total: number; nulls: Record<string, number> } {
  const nulls: Record<string, number> = {}
  columns.forEach((col, i) => {
    nulls[col] = Number(row[`n${i}`] ?? 0)
  })
  return { total: Number(row.total ?? 0), nulls }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/profile.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gate (lint + build + test)**

Run: `npm run lint && npm run build && npm test`
Expected: всё зелёное.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/core/profile.ts src/core/profile.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(core): buildNullCountQuery + interpretNullCounts (one-pass FILTERed null pass + total)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `core/profile.ts` — `buildTopValuesQuery` + `interpretTopValues`

**Files:**
- Modify: `src/core/profile.ts`
- Test: `src/core/profile.test.ts`

- [ ] **Step 1: Write the failing test**

Дописать в `src/core/profile.test.ts` (расширить импорт: добавить `buildTopValuesQuery, interpretTopValues`):

```ts
describe('buildTopValuesQuery', () => {
  it('GROUP BY a non-null column ORDER BY count DESC LIMIT k, quoted ident', () => {
    expect(buildTopValuesQuery('events', 'country', 7)).toBe(
      'SELECT "country" AS v, count(*) AS c FROM "events" ' +
        'WHERE "country" IS NOT NULL GROUP BY "country" ORDER BY c DESC LIMIT 7',
    )
  })
})

describe('interpretTopValues', () => {
  it('normalizes frac by the max count, casts BigInt to Number, stringifies values', () => {
    const rows = [
      { v: 'DE', c: 12840n },
      { v: 'PL', c: 9610n },
      { v: 'RU', c: 6420n },
    ]
    expect(interpretTopValues(rows)).toEqual([
      { value: 'DE', count: 12840, frac: 1 },
      { value: 'PL', count: 9610, frac: 9610 / 12840 },
      { value: 'RU', count: 6420, frac: 0.5 },
    ])
  })
  it('renders boolean values as true/false strings', () => {
    expect(interpretTopValues([{ v: true, c: 3n }, { v: false, c: 1n }])).toEqual([
      { value: 'true', count: 3, frac: 1 },
      { value: 'false', count: 1, frac: 1 / 3 },
    ])
  })
  it('returns [] for an empty result (empty table)', () => {
    expect(interpretTopValues([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/profile.test.ts`
Expected: FAIL — `buildTopValuesQuery is not a function`.

- [ ] **Step 3: Write minimal implementation**

Добавить в `src/core/profile.ts`:

```ts
/**
 * Build a top-K query for a categorical column: group non-null values, order by
 * frequency, cap at k. v/c aliases feed interpretTopValues. ident is quoted.
 */
export function buildTopValuesQuery(table: string, col: string, k: number): string {
  const c = quoteIdent(col)
  return (
    `SELECT ${c} AS v, count(*) AS c FROM ${quoteIdent(table)} ` +
    `WHERE ${c} IS NOT NULL GROUP BY ${c} ORDER BY c DESC LIMIT ${k}`
  )
}

/** Render value (boolean -> 'true'/'false'), Number(count), frac = count/max. */
export function interpretTopValues(rows: Record<string, unknown>[]): TopValue[] {
  const counts = rows.map((r) => Number(r.c ?? 0))
  const maxCount = Math.max(...counts, 0)
  return rows.map((r, i) => ({
    value: String(r.v),
    count: counts[i],
    frac: maxCount > 0 ? counts[i] / maxCount : 0,
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/profile.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gate (lint + build + test)**

Run: `npm run lint && npm run build && npm test`
Expected: всё зелёное.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/core/profile.ts src/core/profile.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(core): buildTopValuesQuery + interpretTopValues (top-K, frac-by-max, bool render)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `core/profile.ts` — `buildHistogramQuery` + `interpretHistogram`

**Files:**
- Modify: `src/core/profile.ts`
- Test: `src/core/profile.test.ts`

> Ручная equi-width floor-арифметика (спека строки 5, 31): `least(BINS-1, floor((c - lo) / ((hi - lo) / BINS)))::INT`. Вырожденный `hi == lo` → билдер возвращает `null` (опускаем гистограмму). `interpretHistogram` добивает пустые бины нулями и считает границы каждого бина.

- [ ] **Step 1: Write the failing test**

Дописать в `src/core/profile.test.ts` (расширить импорт: добавить `buildHistogramQuery, interpretHistogram`):

```ts
describe('buildHistogramQuery', () => {
  it('equi-width floor bucketing with least() clamp, quoted ident', () => {
    expect(buildHistogramQuery('events', 'rev', 0, 300, 12)).toBe(
      'SELECT least(12 - 1, floor(("rev" - 0) / ((300 - 0) / 12)))::INT AS bucket, count(*) AS n ' +
        'FROM "events" WHERE "rev" IS NOT NULL GROUP BY bucket ORDER BY bucket',
    )
  })
  it('returns null for a degenerate range (hi == lo) -> histogram omitted', () => {
    expect(buildHistogramQuery('events', 'rev', 5, 5, 12)).toBeNull()
  })
})

describe('interpretHistogram', () => {
  it('fills empty buckets with zero and computes each bin lo/hi', () => {
    // rows for buckets 0 and 2 only; lo=0, hi=300, bins=3 -> width 100.
    const rows = [
      { bucket: 0, n: 10n },
      { bucket: 2, n: 4n },
    ]
    expect(interpretHistogram(rows, 0, 300, 3)).toEqual([
      { lo: 0, hi: 100, count: 10 },
      { lo: 100, hi: 200, count: 0 },
      { lo: 200, hi: 300, count: 4 },
    ])
  })
  it('clamps an overflow bucket index into the last bin (least() guards SQL too)', () => {
    const rows = [{ bucket: 3, n: 2n }] // bins=3 -> only 0..2 valid; 3 -> last bin
    expect(interpretHistogram(rows, 0, 300, 3)).toEqual([
      { lo: 0, hi: 100, count: 0 },
      { lo: 100, hi: 200, count: 0 },
      { lo: 200, hi: 300, count: 2 },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/profile.test.ts`
Expected: FAIL — `buildHistogramQuery is not a function`.

- [ ] **Step 3: Write minimal implementation**

Добавить в `src/core/profile.ts`:

```ts
/**
 * Build a manual equi-width histogram query (width_bucket/histogram(col,N) are
 * absent in this build): bucket = least(BINS-1, floor((c - lo)/((hi-lo)/BINS))).
 * Returns null for a degenerate range (hi == lo) — the caller omits the
 * histogram and shows only min/median/max. Idents quoted; lo/hi are numbers.
 */
export function buildHistogramQuery(
  table: string,
  col: string,
  lo: number,
  hi: number,
  bins: number,
): string | null {
  if (hi === lo) return null
  const c = quoteIdent(col)
  return (
    `SELECT least(${bins} - 1, floor((${c} - ${lo}) / ((${hi} - ${lo}) / ${bins})))::INT AS bucket, ` +
    `count(*) AS n FROM ${quoteIdent(table)} WHERE ${c} IS NOT NULL GROUP BY bucket ORDER BY bucket`
  )
}

/**
 * Turn sparse {bucket, n} rows into a dense bins-long HistogramBin[]: empty
 * buckets get count 0, each bin's lo/hi are computed from the equi-width step.
 * Bucket indices are clamped into [0, bins-1] (the SQL least() already does this).
 */
export function interpretHistogram(
  rows: Record<string, unknown>[],
  lo: number,
  hi: number,
  bins: number,
): HistogramBin[] {
  const width = (hi - lo) / bins
  const counts = new Array<number>(bins).fill(0)
  for (const r of rows) {
    let b = Number(r.bucket ?? 0)
    if (b < 0) b = 0
    if (b > bins - 1) b = bins - 1
    counts[b] += Number(r.n ?? 0)
  }
  return counts.map((count, i) => ({
    lo: lo + i * width,
    hi: lo + (i + 1) * width,
    count,
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/profile.test.ts`
Expected: PASS (весь `profile.test.ts`).

- [ ] **Step 5: Full gate (lint + build + test)**

Run: `npm run lint && npm run build && npm test`
Expected: всё зелёное.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/core/profile.ts src/core/profile.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(core): buildHistogramQuery + interpretHistogram (manual equi-width, hi==lo omit)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `state/session.ts` — состояние профиля источника (+ rowCount) + инвалидация на `setApplied`

**Files:**
- Modify: `src/state/session.ts`
- Test: `src/state/session.test.ts`

> Источник кэшируется на датасете (спека строки 114–116): профили + число строк. Инвалидация — `setApplied` (ре-материализация) **очищает `profile` и `rowCount`** датасета.

- [ ] **Step 1: Write the failing test**

Дописать в конец `src/state/session.test.ts` (расширить верхний импорт типами: к существующим добавить `import type { ColumnProfile } from '../core/profile'`):

```ts
const profileFixture: ColumnProfile[] = [
  { name: 'id', type: 'BIGINT', distinct: 4, nullCount: 0, kind: 'numeric' },
]

describe('session: source profile state (M3)', () => {
  it('setProfiling toggles the per-dataset flag', () => {
    useSession.getState().reset()
    const s = useSession.getState()
    s.addDataset(csvDs('events'))
    s.setProfiling('events', true)
    expect(useSession.getState().datasets[0].profiling).toBe(true)
  })

  it('setProfile stores profiles + rowCount, clears flag + error', () => {
    useSession.getState().reset()
    const s = useSession.getState()
    s.addDataset(csvDs('events'))
    s.setProfiling('events', true)
    s.setProfile('events', profileFixture, 48210)
    const d = useSession.getState().datasets[0]
    expect(d.profile).toEqual(profileFixture)
    expect(d.rowCount).toBe(48210)
    expect(d.profiling).toBe(false)
    expect(d.profileError).toBeNull()
  })

  it('setProfileError stores the message and clears the flag', () => {
    useSession.getState().reset()
    const s = useSession.getState()
    s.addDataset(csvDs('events'))
    s.setProfiling('events', true)
    s.setProfileError('events', 'boom')
    const d = useSession.getState().datasets[0]
    expect(d.profileError).toBe('boom')
    expect(d.profiling).toBe(false)
  })

  it('setApplied invalidates a cached source profile + rowCount (re-materialized table)', () => {
    useSession.getState().reset()
    const s = useSession.getState()
    s.addDataset(csvDs('events'))
    s.setProfile('events', profileFixture, 48210)
    s.setApplied('events', [{ name: 'id', type: 'BIGINT' }], {})
    const d = useSession.getState().datasets[0]
    expect(d.profile).toBeUndefined()
    expect(d.rowCount).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/state/session.test.ts`
Expected: FAIL — `setProfiling is not a function`.

- [ ] **Step 3: Write minimal implementation**

В `src/state/session.ts`:

(a) Расширить верхний импорт-тип:
```ts
import type { ColumnProfile } from '../core/profile'
```

(b) Добавить поля в `interface Dataset` (после `schemaError`):
```ts
  // --- M3 profile (source target), in-memory cache ---
  profile?: ColumnProfile[]
  rowCount?: number // relation row count (panel caption «N строк»)
  profiling?: boolean
  profileError?: string | null
```

(c) Добавить сигнатуры в `interface SessionState` (после `setApplied`):
```ts
  setProfile: (table: string, profile: ColumnProfile[], rowCount: number) => void
  setProfiling: (table: string, profiling: boolean) => void
  setProfileError: (table: string, message: string | null) => void
```

(d) В реализации `setApplied` (внутри объекта-патча датасета) добавить очистку профиля — заменить блок возврата на:
```ts
          ? {
              ...d,
              dirty: false,
              schemaError: null,
              profile: undefined, // re-materialized table -> stale profile
              rowCount: undefined,
              columns: columns.map((c) => ({
                name: c.name,
                type: c.type,
                nullLoss: losses[c.name] ?? 0,
              })),
            }
```

(e) Добавить реализацию внутрь `create(...)` (после `setApplied`):
```ts
  setProfile: (table, profile, rowCount) =>
    set((s) => ({
      datasets: s.datasets.map((d) =>
        d.table === table
          ? { ...d, profile, rowCount, profiling: false, profileError: null }
          : d,
      ),
    })),
  setProfiling: (table, profiling) =>
    set((s) => ({
      datasets: s.datasets.map((d) =>
        d.table === table ? { ...d, profiling } : d,
      ),
    })),
  setProfileError: (table, message) =>
    set((s) => ({
      datasets: s.datasets.map((d) =>
        d.table === table ? { ...d, profileError: message, profiling: false } : d,
      ),
    })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/state/session.test.ts`
Expected: PASS (M1/M2 + новые M3 describe; существующий `setApplied`-тест M2 всё ещё зелёный — он не проверяет `profile`).

- [ ] **Step 5: Full gate (lint + build + test)**

Run: `npm run lint && npm run build && npm test`
Expected: всё зелёное.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/state/session.ts src/state/session.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(state): source profile cache (setProfile w/ rowCount/setProfiling/setProfileError) + setApplied invalidation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `features/useProfileActions.ts` — `profileRelation` + `profile` + node-смоук

**Files:**
- Create: `src/features/useProfileActions.ts`
- Create: `src/db/duckdbClient.profile.test.ts`

> Оркестрация (side-effects) — зеркало `useSchemaActions`; ядро `profileRelation(name)` чисто переиспользуемо и возвращает `{ profiles, rowCount }`. Чистые билдеры/интерпретаторы уже под TDD (Tasks 1–5). Конвейер проверяем интеграционным смоуком на реальном DuckDB (зеркало `duckdbClient.dirty.test.ts`). **Unit-покрытие оркестратора `profile` (кэш/ошибка) — в Task 8a** (`useProfileActions.test.ts`, через стор-стаб клиента), чтобы red→green закрыл и его guard-ветки.

- [ ] **Step 1: Write the failing test (node-смоук)**

Создать `src/db/duckdbClient.profile.test.ts`:

```ts
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { profileRelation } from '../features/useProfileActions'
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

// A real typed table: numeric (rev), categorical (country), with NULLs.
const CSV =
  'country,rev\n' +
  'DE,10\n' +
  'DE,20\n' +
  'DE,30\n' +
  'PL,40\n' +
  'PL,\n' + // null rev
  'RU,50\n'

describe('profileRelation over a real table (source path)', () => {
  it('classifies columns and fills distinct/null/top/histogram from DuckDB', async () => {
    await client.registerFile('p.csv', new TextEncoder().encode(CSV))
    // native-typed load (rev becomes BIGINT, country VARCHAR)
    await client.exec(
      `CREATE OR REPLACE TABLE p AS SELECT * FROM read_csv_auto('p.csv')`,
    )

    const { profiles, rowCount } = await profileRelation(client, 'p')
    const byName = Object.fromEntries(profiles.map((p) => [p.name, p]))

    // row count flows out for the panel caption
    expect(rowCount).toBe(6)

    // country: categorical, no nulls, DE is the top value with count 3.
    // NOTE: distinct comes from approx_unique (HLL) — NOT asserted exactly
    // (on 6 rows approx_count_distinct(country) returns 2, count(DISTINCT)=3).
    expect(byName.country.kind).toBe('categorical')
    expect(byName.country.nullCount).toBe(0)
    expect(byName.country.top?.[0]).toMatchObject({ value: 'DE', count: 3, frac: 1 })

    // rev: numeric, 1 null, histogram present (hi != lo), stats parsed as numbers
    expect(byName.rev.kind).toBe('numeric')
    expect(byName.rev.nullCount).toBe(1)
    expect(byName.rev.histogram && byName.rev.histogram.length).toBeGreaterThan(0)
    expect(byName.rev.stats?.min).toBe(10)
    expect(byName.rev.stats?.max).toBe(50)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/duckdbClient.profile.test.ts`
Expected: FAIL — cannot find module `../features/useProfileActions` (или `profileRelation` is not a function).

- [ ] **Step 3: Write minimal implementation**

Создать `src/features/useProfileActions.ts`:

```ts
import { arrowToRows } from '../core/arrowToRows'
import {
  buildHistogramQuery,
  buildNullCountQuery,
  buildTopValuesQuery,
  classifyColumn,
  interpretHistogram,
  interpretNullCounts,
  interpretTopValues,
  parseSummarize,
  type ColumnProfile,
  HISTOGRAM_BINS,
  THRESHOLD_DISTINCT,
  TOP_K,
} from '../core/profile'
import { quoteIdent } from '../core/sql'
import type { DuckDBClient } from '../db/duckdbClient'
import { useSession } from '../state/session'

/** A relation's full profile: per-column profiles + its row count. */
export interface RelationProfile {
  profiles: ColumnProfile[]
  rowCount: number
}

/**
 * The shared profiler core: profile a relation BY NAME (a real table or a
 * materialized result table). Pure side effects (queries) live here, no store.
 * Pipeline (spec lines 79-86): SUMMARIZE -> one null-count pass (also yields
 * the row count) -> classify -> per categorical a top-K query -> per numeric a
 * histogram query (omitted when hi == lo) -> assemble ColumnProfile[]. Counts
 * are Number()-ed; min/max/median parsed to numbers for numeric, kept strings
 * for range. Returns the column profiles + the relation row count (caption).
 */
export async function profileRelation(
  client: DuckDBClient,
  name: string,
): Promise<RelationProfile> {
  // 1. SUMMARIZE -> per-column facts (stats are strings, approx_unique Number).
  const summary = parseSummarize(
    arrowToRows(await client.query(`SUMMARIZE ${quoteIdent(name)}`)),
  )
  const colNames = summary.map((c) => c.name)

  // 2. one clean null-count pass (+ total row count).
  const ncRow = arrowToRows(await client.query(buildNullCountQuery(name, colNames))).rows[0] ?? {}
  const { total, nulls } = interpretNullCounts(ncRow, colNames)

  // 3..5. classify + per-kind detail query.
  const profiles: ColumnProfile[] = []
  for (const col of summary) {
    const kind = classifyColumn(col.type, col.approxUnique, THRESHOLD_DISTINCT)
    const base: ColumnProfile = {
      name: col.name,
      type: col.type,
      distinct: col.approxUnique,
      nullCount: nulls[col.name] ?? 0,
      kind,
    }

    if (kind === 'categorical') {
      const top = interpretTopValues(
        arrowToRows(await client.query(buildTopValuesQuery(name, col.name, TOP_K))).rows,
      )
      base.top = top
      base.moreDistinct = Math.max(0, col.approxUnique - top.length)
    } else if (kind === 'numeric') {
      const lo = col.min == null ? NaN : Number(col.min)
      const hi = col.max == null ? NaN : Number(col.max)
      // all-null numeric -> min/max null -> lo/hi NaN -> no stats, no histogram
      // (the card shows an explicit null marker — spec line 93).
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        const median = col.median == null ? NaN : Number(col.median)
        base.stats = { min: lo, median, max: hi } // median may be NaN; card renders «—»
        const histSql = buildHistogramQuery(name, col.name, lo, hi, HISTOGRAM_BINS)
        if (histSql) {
          base.histogram = interpretHistogram(
            arrowToRows(await client.query(histSql)).rows,
            lo,
            hi,
            HISTOGRAM_BINS,
          )
        }
      }
    } else if (kind === 'range') {
      base.range = { min: col.min ?? '', median: col.median ?? '', max: col.max ?? '' }
    }
    // highCardinality: distinct + nullCount only.

    profiles.push(base)
  }
  return { profiles, rowCount: total }
}

/**
 * Source-target orchestration: profile a dataset table, cache into the store.
 * Errors go to the store (setProfileError), never thrown — mirrors useSchemaActions.
 */
export function useProfileActions(client: DuckDBClient) {
  async function profile(table: string): Promise<void> {
    const st = useSession.getState()
    const ds = st.datasets.find((d) => d.table === table)
    if (!ds || ds.profile) return // cached -> no-op
    st.setProfiling(table, true)
    try {
      const { profiles, rowCount } = await profileRelation(client, table)
      useSession.getState().setProfile(table, profiles, rowCount)
    } catch (e) {
      useSession.getState().setProfileError(table, String(e))
    }
  }

  return { profile }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/duckdbClient.profile.test.ts`
Expected: PASS — реальный DuckDB подтверждает классификацию + null/top/histogram + rowCount.

> Если `SUMMARIZE`/`least()/floor()`-гистограмма упадут на этой сборке — это сигнал из «проверенных фактов» спеки (строки 24–34). Тогда останови, не костыляй (CLAUDE.md rule 4), сообщи расхождение.

- [ ] **Step 5: Full gate (lint + build + test)**

Run: `npm run lint && npm run build && npm test`
Expected: всё зелёное.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/features/useProfileActions.ts src/db/duckdbClient.profile.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(features): profileRelation core ({profiles,rowCount}) + profile(table) orchestration + node smoke

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8a: `state/session.ts` — `exploreView`/`profileTarget` + инертные result-поля `Tab` (TDD) + unit `profile`

**Files:**
- Modify: `src/state/session.ts`
- Modify: `src/state/session.test.ts`
- Create: `src/features/useProfileActions.test.ts`

> Логика-задача (TDD), коммитится отдельно — отделена от презентации (Task 8b) ради гранулярности/обозримости коммита. Вводит общий вид/таргет в стор (нужны обоим срезам — спека строки 122–124), инертные result-поля `Tab` (чтобы Task 8b `ProfilePanel` собирался изолированно; провод результата — Срез 2) и unit-покрытие оркестратора `profile` через стаб-клиент (red→green guard-веток).

### Step 1: `exploreView`/`profileTarget` + result-поля `Tab` в сторе (TDD)

- [ ] **1a. Failing test** — дописать в `src/state/session.test.ts`:

```ts
describe('session: explore view + profile target (M3, shared)', () => {
  it('defaults to table view and no profile target', () => {
    useSession.getState().reset()
    const s = useSession.getState()
    expect(s.exploreView).toBe('table')
    expect(s.profileTarget).toBeNull()
  })
  it('setExploreView / setProfileTarget update the shared view selectors', () => {
    useSession.getState().reset()
    const s = useSession.getState()
    s.setExploreView('profile')
    s.setProfileTarget({ kind: 'source', table: 'events' })
    const after = useSession.getState()
    expect(after.exploreView).toBe('profile')
    expect(after.profileTarget).toEqual({ kind: 'source', table: 'events' })
  })
})
```

- [ ] **1b. Run** `npx vitest run src/state/session.test.ts` → FAIL (`setExploreView is not a function`).

- [ ] **1c. Implement** в `src/state/session.ts`:

(i) Тип таргета — добавить экспортируемый тип (рядом с `Tab`):
```ts
export type ProfileTarget =
  | { kind: 'source'; table: string }
  | { kind: 'result'; tabId: string }
  | null
```

(ii) Добавить result-поля в `interface Tab` (после `error`) — инертны до Среза 2, нужны `ProfilePanel` (Task 8b) для изолированной сборки:
```ts
  // --- M3 profile (result target), in-memory cache (wired in slice 2) ---
  resultProfile?: ColumnProfile[]
  resultRowCount?: number
  resultProfiling?: boolean
  resultProfileError?: string | null
```
(импорт `ColumnProfile` в `session.ts` уже добавлен в Task 6.)

(iii) В `interface SessionState` (после `mode`):
```ts
  exploreView: 'table' | 'chart' | 'profile'
  profileTarget: ProfileTarget
```

(iv) В `interface SessionState` (после `setProfileError`):
```ts
  setExploreView: (view: 'table' | 'chart' | 'profile') => void
  setProfileTarget: (target: ProfileTarget) => void
```

(v) В `const initial`:
```ts
  exploreView: 'table' as const,
  profileTarget: null as ProfileTarget,
```

(vi) В `create(...)` (после `setProfileError`):
```ts
  setExploreView: (exploreView) => set({ exploreView }),
  setProfileTarget: (profileTarget) => set({ profileTarget }),
```

- [ ] **1d. Run** `npx vitest run src/state/session.test.ts` → PASS.

### Step 2: unit-тест оркестратора `profile` (стаб-клиент + реальный стор)

> `useProfileActions.test.ts` живёт в node-env (`include: src/**/*.test.ts`); стаб `DuckDBClient` с `vi.fn()` вместо реального DuckDB. `profileRelation` дёргает `client.query` несколько раз — мокаем по SQL-префиксу через мини-Arrow-стаб. Чтобы НЕ городить Arrow, мокаем `profileRelation` напрямую (`vi.mock`), оставляя под тестом только guard-логику оркестратора (кэш/флаги/ошибка) — именно её ветки до сих пор не покрыты.

- [ ] **2a. Failing test** — создать `src/features/useProfileActions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Dataset } from '../state/session'

// Mock the profiler core so the test exercises ONLY the orchestrator guards
// (cache no-op, profiling flag, error routing) without a real DuckDB.
const profileRelationMock = vi.fn()
vi.mock('./useProfileActions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useProfileActions')>()
  return { ...actual, profileRelation: profileRelationMock }
})

import { useProfileActions } from './useProfileActions'
import { useSession } from '../state/session'

const csvDs = (table: string): Dataset => ({
  table,
  fileName: `${table}.csv`,
  bytes: 10,
  kind: 'csv',
  columns: [{ name: 'id', type: 'BIGINT' }],
})

const fakeClient = {} as Parameters<typeof useProfileActions>[0]

beforeEach(() => {
  useSession.getState().reset()
  profileRelationMock.mockReset()
})

describe('useProfileActions.profile (source orchestrator)', () => {
  it('profiles an un-cached table and stores profiles + rowCount', async () => {
    useSession.getState().addDataset(csvDs('events'))
    profileRelationMock.mockResolvedValue({
      profiles: [{ name: 'id', type: 'BIGINT', distinct: 4, nullCount: 0, kind: 'numeric' }],
      rowCount: 42,
    })
    await useProfileActions(fakeClient).profile('events')
    const d = useSession.getState().datasets[0]
    expect(profileRelationMock).toHaveBeenCalledWith(fakeClient, 'events')
    expect(d.profile?.[0].name).toBe('id')
    expect(d.rowCount).toBe(42)
    expect(d.profiling).toBe(false)
  })

  it('is a no-op when the dataset already has a cached profile', async () => {
    useSession.getState().addDataset(csvDs('events'))
    useSession.getState().setProfile(
      'events',
      [{ name: 'id', type: 'BIGINT', distinct: 4, nullCount: 0, kind: 'numeric' }],
      7,
    )
    await useProfileActions(fakeClient).profile('events')
    expect(profileRelationMock).not.toHaveBeenCalled()
  })

  it('is a no-op for an unknown table', async () => {
    await useProfileActions(fakeClient).profile('nope')
    expect(profileRelationMock).not.toHaveBeenCalled()
  })

  it('routes a thrown error to setProfileError and does not throw', async () => {
    useSession.getState().addDataset(csvDs('events'))
    profileRelationMock.mockRejectedValue(new Error('boom'))
    await expect(useProfileActions(fakeClient).profile('events')).resolves.toBeUndefined()
    const d = useSession.getState().datasets[0]
    expect(d.profileError).toContain('boom')
    expect(d.profiling).toBe(false)
  })
})
```

- [ ] **2b. Run** `npx vitest run src/features/useProfileActions.test.ts` → FAIL.

> Это НАСТОЯЩИЙ красный: `profile` ещё вызывает `profileRelation` напрямую (импорт внутри модуля), а `vi.mock` спред-реэкспортит её — тест проверяет, что оркестратор зовёт ядро через экспорт и кладёт `{profiles, rowCount}` в стор по контракту `setProfile(table, profiles, rowCount)`. Если `profile` уже соответствует контракту (Task 7) — часть кейсов зелёные, но кейс «no-op when cached» и «error routing» должны быть зелёными ТОЛЬКО при корректных guard-ах. Если красный по причине «`profileRelation` импортируется не через границу модуля и `vi.mock` не перехватывает» — это сигнал привести вызов в `profile` к импорту из того же модуля (`import * as self`) ИЛИ переключить тест на стаб-`client` с Arrow-моками. Выбери стаб-клиент, если `vi.mock` self-модуля не ловится сборкой; не костыляй (CLAUDE.md rule 4).

- [ ] **2c. Implement (если красный по guard-логике)** — `profile` уже написан в Task 7; здесь правок кода обычно не требуется (тест валидирует существующие guard-ветки). Если `vi.mock` self-модуля не перехватывает — заменить в тесте мок-стратегию на стаб-`DuckDBClient`:

```ts
// Alternative when self-mock isn't intercepted: stub the client directly.
// profileRelation calls client.query (SUMMARIZE, null-count) + maybe top/histogram.
// For the guard tests we only need profile() to resolve/reject, so a query stub
// that throws (error case) or returns a minimal Arrow-less QueryResult shape is enough.
```
(Конкретику стаба согласуй с реальной сигнатурой `arrowToRows`/`Table`; если это раздувает тест — оставь `vi.mock`-вариант.)

- [ ] **2d. Run** `npx vitest run src/features/useProfileActions.test.ts` → PASS.

- [ ] **Step 3: Full gate (lint + build + test)**

Run: `npm run lint && npm run build && npm test`
Expected: всё зелёное (стор + оркестратор-unit + смоук).

- [ ] **Step 4: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/state/session.ts src/state/session.test.ts src/features/useProfileActions.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(state): shared exploreView/profileTarget + inert Tab result fields; unit-cover profile() orchestrator

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8b: `components/ProfilePanel.tsx` + `ProfileCard.tsx` + рейл-кнопка + source-достижимость + CSS

**Files:**
- Create: `src/components/ProfilePanel.tsx`
- Create: `src/components/ProfileCard.tsx`
- Modify: `src/features/Rail.tsx`
- Modify: `src/components/ResultPanel.tsx`
- Modify: `src/features/Explore.tsx`
- Modify: `src/index.css`

> Презентация — глазами (jsdom в репо нет; как в M1/M2). Логика профиля/оркестратор уже под TDD/смоук/unit (Tasks 1–8a). На этом шаге профиль-вид показывается для source-таргета: кнопка рейла переключает `exploreView`, панель рисует `ProfilePanel`. **Source-профиль достижим даже без открытого таба** (спека строки 130, 133): `Explore` при `!tab` и source-таргете рендерит `ProfilePanel` вместо плейсхолдера. Кнопку «профиль результата» + `profileResult` добавляет Срез 2.

### Step 1: `ProfileCard.tsx`

- [ ] Создать `src/components/ProfileCard.tsx`:

```tsx
import type { ColumnProfile } from '../core/profile'

/** Compact number formatting: 12840 -> "12 840" (narrow no-break space). */
function fmt(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n)
}

/** A numeric stat is shown as the value when finite, else an em-dash placeholder. */
function stat(n: number): string {
  return Number.isFinite(n) ? String(n) : '—'
}

export function ProfileCard({ col }: { col: ColumnProfile }) {
  const hasNull = col.nullCount > 0
  // An all-null numeric has neither stats nor histogram (spec line 93).
  const allNullNumeric = col.kind === 'numeric' && !col.stats
  return (
    <div className="pcard">
      <div className="pc-head">
        <span className="pc-name">{col.name}</span>
        <span className="pc-type">{col.type}</span>
        <span className={hasNull ? 'pc-distinct pc-null' : 'pc-distinct'}>
          {hasNull ? `null · ${fmt(col.nullCount)}` : `${fmt(col.distinct)} distinct`}
        </span>
      </div>
      <div className="pc-rows">
        {col.kind === 'categorical' && col.top && (
          <>
            {col.top.map((t) => (
              <div className="pc-row" key={t.value}>
                <span className="pv" title={t.value}>{t.value}</span>
                <div className="pt">
                  <div className="pf" style={{ width: `${Math.round(t.frac * 100)}%` }} />
                </div>
                <span className="pn">{fmt(t.count)}</span>
              </div>
            ))}
            {col.moreDistinct != null && col.moreDistinct > 0 && (
              <div className="pc-more">+{fmt(col.moreDistinct)} ещё</div>
            )}
          </>
        )}

        {col.kind === 'numeric' && (
          <>
            {col.histogram && col.histogram.length > 0 && (
              <Histo bins={col.histogram.map((b) => b.count)} />
            )}
            {col.stats && (
              <div className="pstats">
                <span><span className="k">min</span> {stat(col.stats.min)}</span>
                <span><span className="k">median</span> {stat(col.stats.median)}</span>
                <span><span className="k">max</span> {stat(col.stats.max)}</span>
              </div>
            )}
            {allNullNumeric && <div className="pc-more">все значения NULL</div>}
          </>
        )}

        {col.kind === 'range' && col.range && (
          <div className="pstats">
            <span><span className="k">min</span> {col.range.min}</span>
            <span><span className="k">median</span> {col.range.median}</span>
            <span><span className="k">max</span> {col.range.max}</span>
          </div>
        )}

        {col.kind === 'highCardinality' && (
          <div className="pc-more">≈{fmt(col.distinct)} distinct · высокая кардинальность</div>
        )}
      </div>
    </div>
  )
}

/** CSS bar histogram: bar heights are counts normalized to the tallest bin. */
function Histo({ bins }: { bins: number[] }) {
  const max = Math.max(...bins, 0)
  return (
    <div className="histo">
      {bins.map((n, i) => (
        <div
          className="hb"
          key={i}
          style={{ height: `${max > 0 ? Math.max(4, Math.round((n / max) * 100)) : 4}%` }}
        />
      ))}
    </div>
  )
}
```

### Step 2: `ProfilePanel.tsx`

- [ ] Создать `src/components/ProfilePanel.tsx`:

```tsx
import { useSession } from '../state/session'
import type { ColumnProfile } from '../core/profile'
import { ProfileCard } from './ProfileCard'

/** Compact number formatting for the caption row count. */
function fmt(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n)
}

/**
 * The shared profile view. Reads the active profileTarget from the store and
 * renders ColumnProfile[] of that target (source -> Dataset.profile; result ->
 * Tab.resultProfile) with its row count. Caption disambiguates the two targets
 * and carries «N строк» (spec line 138). An empty relation (0 rows) shows an
 * explicit notice instead of empty cards (spec line 94). profiling -> a
 * placeholder; error -> a message (no crash).
 */
export function ProfilePanel() {
  const target = useSession((s) => s.profileTarget)
  const datasets = useSession((s) => s.datasets)
  const tabs = useSession((s) => s.tabs)

  if (!target) {
    return <p className="result-empty">Нажми «профиль источника» в рейле.</p>
  }

  let profiles: ColumnProfile[] | undefined
  let rowCount: number | undefined
  let profiling = false
  let error: string | null | undefined
  let caption = ''

  if (target.kind === 'source') {
    const ds = datasets.find((d) => d.table === target.table)
    profiles = ds?.profile
    rowCount = ds?.rowCount
    profiling = ds?.profiling ?? false
    error = ds?.profileError
    caption = `профиль источника · ${ds?.fileName ?? target.table}`
  } else {
    const tab = tabs.find((t) => t.id === target.tabId)
    profiles = tab?.resultProfile
    rowCount = tab?.resultRowCount
    profiling = tab?.resultProfiling ?? false
    error = tab?.resultProfileError
    caption = `профиль результата · ${tab?.title ?? target.tabId}`
  }

  if (error) return <pre className="result-error">{error}</pre>
  if (profiling || !profiles) {
    return <p className="result-empty">считаю профиль…</p>
  }

  const rowsLabel = rowCount != null ? `${fmt(rowCount)} строк` : ''
  const fullCaption = rowsLabel ? `${caption} · ${rowsLabel}` : caption

  if (rowCount === 0) {
    return (
      <div className="view-profile">
        <div className="psub">{caption}</div>
        <p className="result-empty">таблица пуста · 0 строк</p>
      </div>
    )
  }

  return (
    <div className="view-profile">
      <div className="psub">{fullCaption}</div>
      <div className="pgrid">
        {profiles.map((c) => (
          <ProfileCard col={c} key={c.name} />
        ))}
      </div>
    </div>
  )
}
```

### Step 3: Кнопка «профиль источника» в рейле

- [ ] В `src/features/Rail.tsx`:

(a) Расширить импорты (новая строка):
```tsx
import { useProfileActions } from './useProfileActions'
```

(b) Внутри `Rail`, рядом с прочими селекторами:
```tsx
  const setExploreView = useSession((s) => s.setExploreView)
  const setProfileTarget = useSession((s) => s.setProfileTarget)
  const { profile } = useProfileActions(client)
```

(c) Внутри `{shownDatasets.map((ds) => { … })}`, перед закрывающим `</div>` блока `.schema-block` (после `<ul className="schema">…</ul>`), добавить кнопку:
```tsx
            <button
              className="profbtn"
              onClick={() => {
                setProfileTarget({ kind: 'source', table: ds.table })
                setExploreView('profile')
                void profile(ds.table)
              }}
              title="посмотреть распределения колонок источника"
            >
              ▦ профиль источника
            </button>
```

### Step 4: Показать `ProfilePanel` в панели результата (source-путь)

> `ResultPanel` сейчас держит `view` локально и знает только про table/chart. Полный лифт вида + кнопка «профиль результата» — Task 13. Здесь — минимально подключить чтение `exploreView==='profile'`, чтобы source-кнопка рейла что-то показывала. Делаем так, чтобы Task 13 достроил, а не переписал.

- [ ] В `src/components/ResultPanel.tsx`:

(a) Расширить импорты:
```tsx
import { useSession } from '../state/session'
import { ProfilePanel } from './ProfilePanel'
```

(b) Заменить локальный `view`-стейт на чтение из стора (лифт):
```tsx
  const view = useSession((s) => s.exploreView)
  const setView = useSession((s) => s.setExploreView)
```
(удалить строку `const [view, setView] = useState<'table' | 'chart'>('table')` и неиспользуемый импорт `useState`, если он больше нигде не нужен).

(c) В рендере: показать `ProfilePanel`, когда `view === 'profile'`. Перед строкой `{!error && showChart && …}` добавить:
```tsx
      {view === 'profile' && <ProfilePanel />}
```
и сузить остальные ветки, чтобы они не рендерились в profile-режиме — заменить четыре `{...}` строки рендера тела на:
```tsx
      {view !== 'profile' && error && <pre className="result-error">{error}</pre>}
      {view !== 'profile' && !error && showChart && <Chart spec={spec!} rows={result!.rows} />}
      {view !== 'profile' && !error && result && !showChart && <ResultGrid result={result} />}
      {view !== 'profile' && !error && !result && (
        <p className="result-empty">Запусти запрос (⌘↵), чтобы увидеть строки.</p>
      )}
```

> `showChart` использует `view === 'chart'` — остаётся корректным (в profile-режиме false). Кнопка «профиль» в тулбаре панели — Task 13. На этом шаге профиль-вид включается ТОЛЬКО кнопкой рейла.

### Step 5: Source-профиль достижим без открытого таба (`Explore`)

> Спека строки 130, 133: source-профиль работает «независимо от результата». Рейл рендерит schema-блок (и `profbtn`) даже без открытого таба (`shownDatasets` падает на `datasets[0]`, `activeTabId === null`), но `Explore` при `!tab` возвращает плейсхолдер ДО `ResultPanel` → клик «профиль источника» переключает вид, но профиль не виден. Чиним точечно: при `!tab && exploreView==='profile' && profileTarget.kind==='source'` рендерим `ProfilePanel`.

- [ ] В `src/features/Explore.tsx`:

(a) Расширить импорты:
```tsx
import { ProfilePanel } from '../components/ProfilePanel'
```

(b) Добавить селекторы рядом с прочими `useSession`:
```tsx
  const exploreView = useSession((s) => s.exploreView)
  const profileTarget = useSession((s) => s.profileTarget)
```

(c) Заменить ранний `if (!tab)`-плейсхолдер на ветку, которая в source-profile-режиме рисует `ProfilePanel`:
```tsx
  if (!tab) {
    return (
      <div className="explore">
        <TabStrip />
        {exploreView === 'profile' && profileTarget?.kind === 'source' ? (
          <section className="result-panel">
            <ProfilePanel />
          </section>
        ) : (
          <div className="explore-empty">
            Открой источник в рейле или нажми «+» для пустого запроса.
          </div>
        )}
      </div>
    )
  }
```

### Step 6: CSS (порт из мокапа на литеральную палитру)

- [ ] Дописать в конец `src/index.css`:

```css
/* --- M3 profile --- */
.profbtn {
  display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 8px;
  border: 1px solid #34555a; background: #11262a; color: #c8d6d2;
  padding: 7px 10px; border-radius: 8px; cursor: pointer; font-size: 12.5px;
}
.profbtn:hover { background: #1d363b; color: #e9eeea; }
.view-profile { padding: 4px 0; }
.psub { font-family: ui-monospace, monospace; font-size: 11px; color: #5c7975; padding: 4px 2px 12px; }
.pgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.pcard { border: 1px solid #1d363b; border-radius: 10px; background: #11221f; overflow: hidden; }
.pc-head {
  display: flex; align-items: center; gap: 8px; padding: 9px 13px;
  border-bottom: 1px solid #122a2e; background: #10211f;
}
.pc-name { font-family: ui-monospace, monospace; font-size: 13px; color: #e9eeea; }
.pc-type {
  font-family: ui-monospace, monospace; font-size: 9.5px; color: #5c7975;
  border: 1px solid #1d363b; border-radius: 4px; padding: 1px 5px;
}
.pc-distinct { margin-left: auto; font-family: ui-monospace, monospace; font-size: 10px; color: #8da6a2; }
.pc-distinct.pc-null { color: #e8826a; }
.pc-rows { padding: 10px 13px; display: flex; flex-direction: column; gap: 8px; }
.pc-row { display: grid; grid-template-columns: 70px 1fr 50px; align-items: center; gap: 9px; }
.pc-row .pv {
  font-family: ui-monospace, monospace; font-size: 12px; color: #e9eeea;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pc-row .pn { font-family: ui-monospace, monospace; font-size: 11px; color: #8da6a2; text-align: right; }
.pt { height: 8px; border-radius: 3px; background: #16302f; overflow: hidden; }
.pf { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #e3a95c, #cf933f); }
.pc-more { font-family: ui-monospace, monospace; font-size: 10.5px; color: #5c7975; }
.histo { display: flex; align-items: flex-end; gap: 3px; height: 72px; padding: 6px 0 4px; }
.histo .hb {
  flex: 1; background: linear-gradient(180deg, #e3a95c, #9a6f33);
  border-radius: 3px 3px 0 0; min-height: 4px; opacity: .9;
}
.pstats {
  display: flex; justify-content: space-between; font-family: ui-monospace, monospace;
  font-size: 10.5px; color: #8da6a2; border-top: 1px solid #122a2e; padding-top: 9px;
}
.pstats .k { color: #5c7975; }
```

- [ ] **Step 7: Full gate (lint + build + test)**

Run: `npm run lint && npm run build && npm test`
Expected: всё зелёное (`void profile(...)` гасит floating-promise; удалённый `useState` не оставляет unused-импорта).

- [ ] **Step 8: Ручная проверка (глазами) — демо source-пути**

Run: `npm run dev`. Сценарий:
1. Брось CSV (например `fixtures/dirty.csv` или любой с числовыми/категориальными колонками), типизируй («типы»).
2. В рейле жми «▦ профиль источника» → панель переключается на вид «профиль»; карточки: distinct-каунты, бары топ-значений категориальных, мини-гистограмма + min/median/max числовых, коралловый `null · N` где есть NULL; подпись «профиль источника · `<file>` · N строк».
3. **Без открытого таба:** брось CSV, НЕ открывай таб (или закрой все), жми «профиль источника» → профиль виден (а не «Открой источник…»).
4. Все-null числовая колонка → карточка с меткой «все значения NULL» (без гистограммы/stats).
5. Пустая таблица (0 строк) → плашка «таблица пуста · 0 строк».
6. Повторный клик по кнопке — мгновенно (кэш `profile`).
7. Жми «типы»/«применить» (ре-материализация) → профиль инвалидируется; снова «профиль источника» → пересчёт.

- [ ] **Step 9: Commit (конец Среза 1)**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/components/ProfilePanel.tsx src/components/ProfileCard.tsx src/features/Rail.tsx src/components/ResultPanel.tsx src/features/Explore.tsx src/index.css
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(ui): source profile cards + rail "профиль источника" + reachable w/o tab (slice 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Срез 1 — gate + демо-чекпойнт

- [ ] **Полный gate**

Run: `npm run lint && npm run build && npm test`
Expected: lint 0 ошибок; build зелёный; все тесты зелёные (profile, sql, schemaTypes, castBuilder, arrowToRows, pruning, chartSpec, session, useProfileActions + db smoke: dirty + profile).

**Демо (деплоируемо):** CSV → типы → «профиль источника» → карточки distinct/top-bars/histogram/min-median-max/null-маркеры; подпись «N строк»; source-профиль без таба; all-null/пустая таблица; повторный клик мгновенный; apply инвалидирует кэш. Деплой — мерджем ветки в `main` (финальная задача); промежуточно через `npm run dev`.

---

# СРЕЗ 2 — профиль результата

## Task 9: Confirm-спайк внутренней result-таблицы (throwaway) → удалить в той же задаче

**Files:**
- Create (затем DELETE): `src/db/duckdbClient.resultTemp.spike.test.ts`

> Спека (строки 110, 166). **Критично:** `DuckDBClient.run()` открывает новое соединение на каждый вызов (`db.connect()` … `finally { conn.close() }`), а DuckDB-`TEMP`-таблица локальна для соединения → `CREATE … TEMP` на одном соединении и `SUMMARIZE` на другом дадут `Catalog Error: … does not exist`. Поэтому материализуем результат в **обычную (catalog-global) таблицу** `_qb_result_*` (`CREATE OR REPLACE TABLE … AS <select>`, без `TEMP`) — тот же механизм, что у `_qb_raw_*`. Спайк подтверждает именно этот вариант до продакшен-кода и удаляется в этой же задаче (без коммита спайк-файла).

- [ ] **Step 1: Написать спайк**

Создать `src/db/duckdbClient.resultTemp.spike.test.ts`:

```ts
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { profileRelation } from '../features/useProfileActions'
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

describe('SPIKE: CREATE OR REPLACE TABLE _qb_result_* AS <select> -> profileRelation', () => {
  it('materializes a query result into a catalog-global table and profiles it across connections', async () => {
    const CSV = 'g,v\nA,1\nA,2\nB,3\n'
    await client.registerFile('s.csv', new TextEncoder().encode(CSV))
    await client.exec(`CREATE OR REPLACE TABLE s AS SELECT * FROM read_csv_auto('s.csv')`)

    // The exact pipeline the production code will use — REGULAR table (not TEMP),
    // because the client uses a fresh connection per call and TEMP is connection-local.
    await client.exec(
      `CREATE OR REPLACE TABLE _qb_result_spike AS ` +
        `SELECT g, sum(v) AS total FROM s GROUP BY g ORDER BY g`,
    )
    // profileRelation runs SUMMARIZE etc. on a DIFFERENT connection — must still see the table.
    const { profiles } = await profileRelation(client, '_qb_result_spike')
    const names = profiles.map((p) => p.name)
    expect(names).toEqual(['g', 'total'])
    // total is numeric with real inferred type (not a stringified CSV cell).
    const total = profiles.find((p) => p.name === 'total')!
    expect(total.kind).toBe('numeric')
    expect(total.stats?.min).toBe(2)
    expect(total.stats?.max).toBe(3)
  })
})
```

- [ ] **Step 2: Прогнать спайк**

Run: `npx vitest run src/db/duckdbClient.resultTemp.spike.test.ts`
Expected: PASS — обычная (не TEMP) result-таблица + конвейер работают на реальном DuckDB через разные соединения.

> Если упадёт даже с обычной таблицей — стоп, не костыляй (CLAUDE.md rule 4), сообщи: каталог-семантика неожиданно ведёт себя в этой сборке; обсудить фолбэк.

- [ ] **Step 3: Удалить спайк**

```bash
rm /c/Users/cosmi/Projects/quackbook/src/db/duckdbClient.resultTemp.spike.test.ts
```

- [ ] **Step 4: Подтвердить чистоту**

Run: `npm test`
Expected: спайк-файла больше нет; все тесты зелёные. (Спайк не коммитим — он был только для подтверждения.)

> Коммита в этой задаче нет — спайк создан, прогнан, удалён; рабочее дерево вернулось к состоянию после Task 8b.

---

## Task 10: `core/sql.ts` — `resultTempName` + `buildResultTempDDL` (обычная TABLE) + `isInternalTable('_qb_result_*')`

**Files:**
- Modify: `src/core/sql.ts`
- Test: `src/core/sql.test.ts`

> `buildResultTempDDL` эмитит **обычную** `CREATE OR REPLACE TABLE` (не TEMP) — см. решение 9 (TEMP не переживает per-call connections). Имя оставляем `_qb_result_<tabId>` (по-прежнему внутреннее/скрытое из рейла). Функция называется `buildResultTempDDL` исторически («temp» = эфемерная result-таблица), но DDL уже не TEMP.

- [ ] **Step 1: Write the failing test**

Дописать в конец `src/core/sql.test.ts` (расширить верхний импорт из `./sql`, добавив `resultTempName, buildResultTempDDL`; `isInternalTable` уже импортирован в M2):

```ts
describe('resultTempName', () => {
  it('prefixes the internal per-tab result table name', () => {
    expect(resultTempName('tab-3')).toBe('_qb_result_tab-3')
  })
})

describe('isInternalTable (result tables)', () => {
  it('flags result tables as internal too', () => {
    expect(isInternalTable('_qb_result_tab-3')).toBe(true)
  })
  it('still treats user tables as not internal', () => {
    expect(isInternalTable('result_x')).toBe(false)
  })
})

describe('buildResultTempDDL', () => {
  it('CREATE OR REPLACE TABLE (catalog-global, NOT TEMP) from the (trailing-; stripped) select', () => {
    expect(buildResultTempDDL('tab-3', 'SELECT 1')).toBe(
      'CREATE OR REPLACE TABLE "_qb_result_tab-3" AS SELECT 1',
    )
  })
  it('strips a trailing semicolon and surrounding whitespace from the select', () => {
    expect(buildResultTempDDL('tab-3', '  SELECT a FROM t ;  \n')).toBe(
      'CREATE OR REPLACE TABLE "_qb_result_tab-3" AS SELECT a FROM t',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/sql.test.ts`
Expected: FAIL — `resultTempName is not a function`.

- [ ] **Step 3: Write minimal implementation**

В `src/core/sql.ts`:

(a) Заменить `isInternalTable` на версию, ловящую оба префикса (добавить result-префикс):
```ts
/** Internal prefix for a per-tab materialized result table (M3). */
const RESULT_PREFIX = '_qb_result_'

/** True for tables quackbook owns internally (filtered from sources/schema). */
export function isInternalTable(name: string): boolean {
  return name.startsWith(RAW_PREFIX) || name.startsWith(RESULT_PREFIX)
}
```
(удалить старое одно-префиксное тело `isInternalTable`; `RAW_PREFIX`/`rawTableName` не трогаем.)

(b) Добавить в конец файла:
```ts
/** Internal name of the materialized result table for a tab. */
export function resultTempName(tabId: string): string {
  return `${RESULT_PREFIX}${tabId}`
}

/**
 * DDL: materialize a tab's query result into a REGULAR (catalog-global) internal
 * table so it can be profiled by name (reusing profileRelation). NOT a TEMP
 * table: DuckDBClient opens a fresh connection per call and a TEMP table is
 * connection-local, so SUMMARIZE on the next connection would not see it. A
 * regular CREATE OR REPLACE TABLE survives across connections (same mechanism as
 * _qb_raw_*) and is overwritten per tab. The table inherits DuckDB's real
 * inferred types. A trailing `;` (and surrounding whitespace) is stripped — a
 * CREATE ... AS <select>; with the semicolon inside would be invalid.
 */
export function buildResultTempDDL(tabId: string, sql: string): string {
  const select = sql.trim().replace(/;\s*$/, '')
  return `CREATE OR REPLACE TABLE ${quoteIdent(resultTempName(tabId))} AS ${select}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/sql.test.ts`
Expected: PASS (M1/M2 sql-тесты + новые M3 describe; существующий `isInternalTable`-тест M2 всё ещё зелёный).

- [ ] **Step 5: Full gate (lint + build + test)**

Run: `npm run lint && npm run build && npm test`
Expected: всё зелёное.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/core/sql.ts src/core/sql.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(core): resultTempName + buildResultTempDDL (regular table, strip trailing ;) + isInternalTable(_qb_result_*)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `state/session.ts` — состояние профиля результата (+ resultRowCount) + инвалидация на `updateTabSql`

**Files:**
- Modify: `src/state/session.ts`
- Test: `src/state/session.test.ts`

> Поля `Tab.resultProfile`/`resultRowCount`/`resultProfiling`/`resultProfileError` уже введены в Task 8a (инертны). Здесь добавляем действия + инвалидацию `updateTabSql` (спека строки 119–120).

- [ ] **Step 1: Write the failing test**

Дописать в конец `src/state/session.test.ts`:

```ts
describe('session: result profile state + invalidation (M3)', () => {
  it('setResultProfile / setResultProfiling / setResultProfileError act on the right tab', () => {
    useSession.getState().reset()
    const s = useSession.getState()
    s.openOrFocusTab('events')
    const id = useSession.getState().tabs[0].id
    s.setResultProfiling(id, true)
    expect(useSession.getState().tabs[0].resultProfiling).toBe(true)
    s.setResultProfile(id, profileFixture, 1234)
    let t = useSession.getState().tabs[0]
    expect(t.resultProfile).toEqual(profileFixture)
    expect(t.resultRowCount).toBe(1234)
    expect(t.resultProfiling).toBe(false)
    expect(t.resultProfileError).toBeNull()
    s.setResultProfileError(id, 'bad sql')
    t = useSession.getState().tabs[0]
    expect(t.resultProfileError).toBe('bad sql')
    expect(t.resultProfiling).toBe(false)
  })

  it('updateTabSql invalidates a cached result profile + rowCount (new SQL -> recompute)', () => {
    useSession.getState().reset()
    const s = useSession.getState()
    s.openOrFocusTab('events')
    const id = useSession.getState().tabs[0].id
    s.setResultProfile(id, profileFixture, 1234)
    s.updateTabSql(id, 'SELECT 2')
    const t = useSession.getState().tabs[0]
    expect(t.resultProfile).toBeUndefined()
    expect(t.resultRowCount).toBeUndefined()
  })
})
```

> `profileFixture` определён в Task 6's describe-блоке — это файл-уровневая `const`, переиспользуется.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/state/session.test.ts`
Expected: FAIL — `setResultProfile is not a function`.

- [ ] **Step 3: Write minimal implementation**

В `src/state/session.ts`:

(a) Добавить сигнатуры в `interface SessionState` (после `setProfileError`):
```ts
  setResultProfile: (tabId: string, profile: ColumnProfile[], rowCount: number) => void
  setResultProfiling: (tabId: string, profiling: boolean) => void
  setResultProfileError: (tabId: string, message: string | null) => void
```

(b) Заменить `updateTabSql` на версию, инвалидирующую кэш результата:
```ts
  updateTabSql: (id, sql) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? { ...t, sql, resultProfile: undefined, resultRowCount: undefined }
          : t,
      ),
    })),
```

(c) Добавить реализацию в `create(...)` (после `setProfileError`):
```ts
  setResultProfile: (tabId, profile, rowCount) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              resultProfile: profile,
              resultRowCount: rowCount,
              resultProfiling: false,
              resultProfileError: null,
            }
          : t,
      ),
    })),
  setResultProfiling: (tabId, resultProfiling) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, resultProfiling } : t)),
    })),
  setResultProfileError: (tabId, message) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, resultProfileError: message, resultProfiling: false } : t,
      ),
    })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/state/session.test.ts`
Expected: PASS (M1/M2/M3 + новые describe; существующий `updateTabSql`-тест M1 всё ещё зелёный — он не проверяет `resultProfile`).

- [ ] **Step 5: Full gate (lint + build + test)**

Run: `npm run lint && npm run build && npm test`
Expected: всё зелёное.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/state/session.ts src/state/session.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(state): result profile cache (setResultProfile w/ rowCount/...) + updateTabSql invalidation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `useProfileActions.profileResult` — unit (red→green) + node-смоук (result-таблица)

**Files:**
- Modify: `src/features/useProfileActions.ts`
- Modify: `src/features/useProfileActions.test.ts`
- Modify: `src/db/duckdbClient.profile.test.ts`

> Материализуем SQL в обычную result-таблицу (`buildResultTempDDL`), затем тот же `profileRelation` по имени этой таблицы (спека строки 99–104). Ошибка (невалидный SQL) → `setResultProfileError`. **Настоящий red→green — на unit-тесте оркестратора** (Step 1/2): `profileResult` несёт guard-логику (кэш-no-op, пустой-SQL-no-op, materialize+store, try/catch→error), которую обязаны покрыть. Смоук (Step 5) — отдельное green-доказательство пути данных, НЕ red-шаг задачи.

- [ ] **Step 1: Write the failing unit test (orchestrator)**

Дописать в `src/features/useProfileActions.test.ts` (расширить мок-границу — `client.exec` теперь дёргается; используем стаб-`client` с `vi.fn`):

```ts
describe('useProfileActions.profileResult (result orchestrator)', () => {
  it('materializes the SQL into the result table then stores profiles + rowCount', async () => {
    const exec = vi.fn().mockResolvedValue(undefined)
    const client = { exec } as unknown as Parameters<typeof useProfileActions>[0]
    useSession.getState().openOrFocusTab('events')
    const id = useSession.getState().tabs[0].id
    profileRelationMock.mockResolvedValue({
      profiles: [{ name: 'total', type: 'BIGINT', distinct: 2, nullCount: 0, kind: 'numeric' }],
      rowCount: 2,
    })

    await useProfileActions(client).profileResult(id, 'SELECT 1 AS total')

    // exec materialized the result table via buildResultTempDDL (regular TABLE).
    expect(exec).toHaveBeenCalledTimes(1)
    expect(exec.mock.calls[0][0]).toContain('CREATE OR REPLACE TABLE "_qb_result_')
    expect(exec.mock.calls[0][0]).not.toContain('TEMP')
    // profileRelation ran on the result table name.
    expect(profileRelationMock).toHaveBeenCalledWith(client, `_qb_result_${id}`)
    const t = useSession.getState().tabs[0]
    expect(t.resultProfile?.[0].name).toBe('total')
    expect(t.resultRowCount).toBe(2)
    expect(t.resultProfiling).toBe(false)
  })

  it('is a no-op when the tab already has a cached result profile', async () => {
    const exec = vi.fn()
    const client = { exec } as unknown as Parameters<typeof useProfileActions>[0]
    useSession.getState().openOrFocusTab('events')
    const id = useSession.getState().tabs[0].id
    useSession.getState().setResultProfile(id, [], 0)
    await useProfileActions(client).profileResult(id, 'SELECT 1')
    expect(exec).not.toHaveBeenCalled()
    expect(profileRelationMock).not.toHaveBeenCalled()
  })

  it('is a no-op for empty/whitespace SQL', async () => {
    const exec = vi.fn()
    const client = { exec } as unknown as Parameters<typeof useProfileActions>[0]
    useSession.getState().openOrFocusTab('events')
    const id = useSession.getState().tabs[0].id
    await useProfileActions(client).profileResult(id, '   \n  ')
    expect(exec).not.toHaveBeenCalled()
  })

  it('routes a thrown exec error to setResultProfileError and does not throw', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('bad sql'))
    const client = { exec } as unknown as Parameters<typeof useProfileActions>[0]
    useSession.getState().openOrFocusTab('events')
    const id = useSession.getState().tabs[0].id
    await expect(
      useProfileActions(client).profileResult(id, 'SELECT bogus'),
    ).resolves.toBeUndefined()
    const t = useSession.getState().tabs[0]
    expect(t.resultProfileError).toContain('bad sql')
    expect(t.resultProfiling).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/useProfileActions.test.ts`
Expected: FAIL — `profileResult is not a function` (genuine red — оркестратор ещё не написан).

- [ ] **Step 3: Реализовать `profileResult`**

Добавить в `src/features/useProfileActions.ts`:

(a) Расширить импорт из `'../core/sql'`:
```ts
import { buildResultTempDDL, quoteIdent, resultTempName } from '../core/sql'
```

(b) Внутри `useProfileActions`, рядом с `profile`, добавить и вернуть `profileResult`:
```ts
  async function profileResult(tabId: string, sql: string): Promise<void> {
    const st = useSession.getState()
    const tab = st.tabs.find((t) => t.id === tabId)
    if (!tab || tab.resultProfile) return // cached -> no-op
    if (!sql.trim()) return // nothing to materialize
    st.setResultProfiling(tabId, true)
    try {
      // materialize the query once into a regular (catalog-global) internal
      // table with DuckDB's real inferred types, then reuse profileRelation.
      await client.exec(buildResultTempDDL(tabId, sql))
      const { profiles, rowCount } = await profileRelation(client, resultTempName(tabId))
      useSession.getState().setResultProfile(tabId, profiles, rowCount)
    } catch (e) {
      useSession.getState().setResultProfileError(tabId, String(e))
    }
  }

  return { profile, profileResult }
```

> `quoteIdent` уже импортирован для `profileRelation`; добавление `buildResultTempDDL, resultTempName` к той же import-строке достаточно.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/useProfileActions.test.ts`
Expected: PASS (source + result оркестратор-юниты).

- [ ] **Step 5: Add a self-contained result-path smoke (green proof of the data path)**

Дописать в `src/db/duckdbClient.profile.test.ts` (расширить импорты: добавить `buildResultTempDDL` из `'../core/sql'`):

```ts
import { buildResultTempDDL } from '../core/sql'

describe('result path: materialize a query into a regular result table, then profile it', () => {
  // SELF-CONTAINED: recreate table p in this describe so it does NOT depend on
  // the source-path describe running first (no intra-file execution-order coupling).
  const RCSV =
    'country,rev\n' + 'DE,10\n' + 'DE,20\n' + 'DE,30\n' + 'PL,40\n' + 'PL,\n' + 'RU,50\n'

  beforeAll(async () => {
    await client.registerFile('rp.csv', new TextEncoder().encode(RCSV))
    await client.exec(`CREATE OR REPLACE TABLE rp AS SELECT * FROM read_csv_auto('rp.csv')`)
  })

  it('profiles the result table with real inferred types across connections', async () => {
    // buildResultTempDDL now emits a REGULAR CREATE OR REPLACE TABLE (not TEMP),
    // so the table survives the client's fresh-per-call connections.
    await client.exec(
      buildResultTempDDL('tabX', 'SELECT country, sum(rev) AS total FROM rp GROUP BY country'),
    )
    const { profiles } = await profileRelation(client, '_qb_result_tabX')
    const byName = Object.fromEntries(profiles.map((pr) => [pr.name, pr]))
    expect(profiles.map((pr) => pr.name).sort()).toEqual(['country', 'total'])
    // total is a real numeric (HUGEINT — DuckDB widens integer SUM to HUGEINT),
    // classifyColumn matches HUGEINT, so it is numeric (not a CSV string column).
    expect(byName.total.kind).toBe('numeric')
  })
})
```

> Этот describe самодостаточен (свой `beforeAll`, своя таблица `rp`) — не зависит от порядка исполнения относительно source-path describe (использует ту же общую `client`/`db` из файлового `beforeAll`).

- [ ] **Step 6: Full gate (lint + build + test)**

Run: `npm run lint && npm run build && npm test`
Expected: всё зелёное (unit-оркестратор + source/result смоук).

- [ ] **Step 7: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/features/useProfileActions.ts src/features/useProfileActions.test.ts src/db/duckdbClient.profile.test.ts
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(features): profileResult (materialize result table + reuse profileRelation) + unit + result smoke

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: `ResultPanel` вид «профиль» + source-only тулбар + проброс `tabId`/`sql`/`client`

**Files:**
- Modify: `src/components/ResultPanel.tsx`
- Modify: `src/features/Explore.tsx`

> Третий вид «профиль» рядом с таблица/график (спека строки 131–133). Доступен при наличии результата (как «график»). При показе **source-таргета без результата** (вход с рейла) тулбар всё равно показан: таблица/график disabled, «профиль» активна (спека строка 133). Презентация — глазами.

- [ ] **Step 1: Прокинуть `tabId`/`sql`/`client` в `ResultPanel`**

В `src/features/Explore.tsx` заменить рендер панели (в основной ветке с открытым `tab`):
```tsx
      <ResultPanel
        result={tab.result}
        meta={tab.meta}
        error={tab.error}
        tabId={tab.id}
        sql={tab.sql}
        client={client}
      />
```

- [ ] **Step 2: Кнопка «профиль» + source-only тулбар + вызов `profileResult` в `ResultPanel`**

В `src/components/ResultPanel.tsx`:

(a) Расширить импорты:
```tsx
import type { DuckDBClient } from '../db/duckdbClient'
import { useProfileActions } from '../features/useProfileActions'
```

(b) Расширить `Props`:
```tsx
interface Props {
  result: QueryResult | null
  meta: { ms: number; rows: number } | null
  error: string | null
  tabId: string
  sql: string
  client: DuckDBClient
}
```

(c) Сигнатура + хуки (view/setView уже подняты в Task 8b — здесь добавляем target/profileResult):
```tsx
export function ResultPanel({ result, meta, error, tabId, sql, client }: Props) {
  const view = useSession((s) => s.exploreView)
  const setView = useSession((s) => s.setExploreView)
  const profileTarget = useSession((s) => s.profileTarget)
  const setProfileTarget = useSession((s) => s.setProfileTarget)
  const { profileResult } = useProfileActions(client)
```

(d) Тулбар: показывать `.view-toggle` не только при `result`, но и когда показывается source-профиль без результата (спека строка 133). Заменить `{result && (` на условие, и пометить таблица/график `disabled` при `!result`:
```tsx
        {(result || (view === 'profile' && profileTarget?.kind === 'source')) && (
          <div className="view-toggle">
            <button
              className={view === 'table' ? 'on' : ''}
              disabled={!result}
              title={result ? '' : 'нет результата — запусти запрос'}
              onClick={() => setView('table')}
            >
              таблица
            </button>
            <button
              className={view === 'chart' ? 'on' : ''}
              disabled={!result || !spec}
              title={!result ? 'нет результата — запусти запрос' : spec ? '' : 'нет числовой колонки для графика'}
              onClick={() => setView('chart')}
            >
              график
            </button>
            <button
              className={view === 'profile' ? 'on' : ''}
              disabled={!result}
              title={result ? '' : 'нет результата — запусти запрос'}
              onClick={() => {
                setProfileTarget({ kind: 'result', tabId })
                setView('profile')
                void profileResult(tabId, sql)
              }}
            >
              профиль
            </button>
          </div>
        )}
```

> Кнопка «профиль» здесь профилирует РЕЗУЛЬТАТ (`disabled` без результата). При source-таргете без результата (вход с рейла) тулбар виден, «профиль» подсвечена `on` (это текущий `view`), таблица/график disabled — ровно «активна профиль, остальные disabled» из спеки строки 133. `ProfilePanel` рисует source-таргет по стору.

- [ ] **Step 3: Build-gate-aware — CSS не трогаем**

> `.view-toggle` уже стилизован (3 кнопки помещаются); `:disabled` уже визуально гасится глобальным стилем кнопок. Дополнительный CSS не требуется — `index.css` не трогаем и не добавляем в commit. Если на узком экране тесно — в полишинг (BACKLOG), не блокер.

- [ ] **Step 4: Full gate (lint + build + test)**

Run: `npm run lint && npm run build && npm test`
Expected: всё зелёное (UI-задача меняет сигнатуру `ResultPanel`/`Explore` и зовёт `profileResult` — полный набор ловит регрессии стора/оркестратора).

- [ ] **Step 5: Ручная проверка (глазами) — демо result-пути**

Run: `npm run dev`. Сценарий:
1. Открой таб, напиши агрегирующий запрос (`SELECT g, sum(v) AS total FROM t GROUP BY g`), запусти.
2. В тулбаре результата жми «профиль» → карточки результата: `total` как numeric с гистограммой/min-median-max, `g` как categorical с барами. Подпись «профиль результата · `<имя таба>` · N строк».
3. Переключайся таблица/график/профиль — состояние сохраняется (вид в сторе).
4. Поправь SQL → снова «профиль» → пересчёт (инвалидация `updateTabSql`).
5. Невалидный SQL → «профиль» → текст ошибки в панели, без краша.
6. Source-таргет без результата (с рейла, пустой таб): тулбар виден, «профиль» активна, таблица/график disabled.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/cosmi/Projects/quackbook add src/components/ResultPanel.tsx src/features/Explore.tsx
git -C /c/Users/cosmi/Projects/quackbook commit -m "$(cat <<'EOF'
feat(ui): result "профиль" view + source-only toolbar affordance (profileResult, profileTarget=result) (slice 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Финальная проверка вехи M3

**Files:** —

- [ ] **Step 1: Полный gate**

Run: `npm run lint && npm run build && npm test`
Expected: lint 0 ошибок; build зелёный (DuckDB-бандлы в `dist/assets/`); все тесты зелёные:
- `src/core/profile.test.ts` (classify incl. HUGEINT, parseSummarize, nullCount+total, topValues, histogram incl. hi==lo/empty bins/frac)
- `src/core/sql.test.ts` (M1/M2 + resultTempName/buildResultTempDDL (regular TABLE)/isInternalTable result)
- `src/state/session.test.ts` (M1/M2 + source profile+rowCount + view/target + result profile+rowCount + invalidations)
- `src/features/useProfileActions.test.ts` (profile + profileResult orchestrator guards)
- `src/core/schemaTypes.test.ts`, `src/core/castBuilder.test.ts`, `src/core/arrowToRows.test.ts`, `src/core/pruning.test.ts`, `src/core/chartSpec.test.ts` (без изменений)
- `src/db/duckdbClient.test.ts`, `src/db/duckdbClient.dirty.test.ts` (M1/M2 смоук), `src/db/duckdbClient.profile.test.ts` (M3 смоук source + result, оба describe самодостаточны)
- Спайк `duckdbClient.resultTemp.spike.test.ts` УДАЛЁН (его в наборе нет).

- [ ] **Step 2: Сквозная ручная приёмка (done-when скоупа, спека строки 10, 166)**

Run: `npm run dev`. Сценарий:
1. Брось CSV, типизируй → «профиль источника» в рейле → карточки: distinct-каунты, бары топ-значений, гистограммы числовых + min/median/max, маркеры null; подпись «N строк».
2. Source-профиль БЕЗ открытого таба → виден (а не «Открой источник…»).
3. Высоко-кардинальная VARCHAR-колонка (id/email) → карточка «≈N distinct, высокая кардинальность» без бара (не врём).
4. Все-null числовая → «все значения NULL»; пустая таблица → «таблица пуста · 0 строк».
5. DATE/TIMESTAMP-колонка → только min/median/max (range).
6. Открой таб с group by → запусти → «профиль» в панели → карточки результата с настоящими типами; подпись «профиль результата · `<таб>` · N строк».
7. Source-таргет без результата → тулбар виден, «профиль» активна, таблица/график disabled.
8. Правка SQL инвалидирует профиль результата; apply схемы инвалидирует профиль источника.
9. Невалидный SQL в профиле результата → ошибка в панели, без краша.
10. `_qb_result_*` НЕ появляется в источниках/схеме рейла.
11. Reset → чисто; hard-reload → пустое состояние (всё в памяти — ожидаемо).

- [ ] **Step 3: Завершение ветки**

Перейти к **superpowers:finishing-a-development-branch** (тесты зелёные → опции merge/PR). Это смерджит `m3-profile` в `main` и триггерит деплой на Pages. После деплоя — проверить демо-сценарий на Pages-URL.

---

## Покрытие спека (self-review)

- Модель данных профиля (`ColumnKind`/`TopValue`/`HistogramBin`/`ColumnProfile`) → Task 1. ✓
- `classifyColumn` (numeric incl. HUGEINT/UHUGEINT; boolean→categorical; varchar≤thr→categorical иначе highCard; date-timestamp-time→range; прочее→highCard) → Task 1. ✓
- `parseSummarize` (count→Number, min/max/q50 строками, null_percentage НЕ используем) → Task 2. ✓
- `buildNullCountQuery`/`interpretNullCounts` (отдельный FILTER-проход, total=число строк, Int64→Number) → Task 3. ✓
- `buildTopValuesQuery`/`interpretTopValues` (top-K, frac по максимуму, boolean→строка, пусто) → Task 4. ✓
- `buildHistogramQuery`/`interpretHistogram` (ручная equi-width floor+least, hi==lo→null/опускаем, пустые бины→0, границы бинов) → Task 5. ✓
- Состояние источника на датасете (profile+rowCount) + инвалидация `setApplied` → Task 6. ✓
- `profileRelation(name)` → `{profiles, rowCount}` (общее ядро: SUMMARIZE→null+total→classify→top/histogram, all-null numeric→null-метка, approx_unique НЕ проверяем точно) + `profile(table)` + node-смоук на реальной таблице → Task 7. ✓
- Общий `exploreView`/`profileTarget` + инертные result-поля `Tab` + unit-покрытие оркестратора `profile` (кэш/ошибка через стаб-клиент) → Task 8a. ✓
- `ProfilePanel`+`ProfileCard` (categorical bars/«+N ещё», numeric histo+min/median/max, median NaN→«—», all-null→«все значения NULL», range, highCard, null-маркер коралл), подпись по таргету c «N строк», пустая таблица→«0 строк», profiling/error; кнопка рейла «профиль источника»; source-достижимость без таба (`Explore`); source-вид в панели → Task 8b. ✓
- CSS-порт из мокапа (`.psub/.pgrid/.pcard/.pc-*/.pt/.pf/.histo/.hb/.pstats/.profbtn`) на литеральную палитру → Task 8b. ✓
- Confirm-спайк ОБЫЧНОЙ (не TEMP) result-таблицы (создан/прогнан/удалён в одной задаче; проверяет переживание per-call connections) → Task 9. ✓
- `resultTempName`/`buildResultTempDDL` (обычная `CREATE OR REPLACE TABLE`, strip хвостового `;`) + `isInternalTable('_qb_result_*')` → Task 10. ✓
- Состояние результата на табе (resultProfile+resultRowCount) + инвалидация `updateTabSql` → Task 11. ✓
- `profileResult(tabId, sql)` (материализация обычной result-таблицы + переиспользование `profileRelation`) + НАСТОЯЩИЙ red→green unit (кэш/пустой-SQL/materialize/error через стаб-клиент) + самодостаточный node-смоук пути данных → Task 12. ✓
- `ResultPanel` вид «профиль», `profileTarget=result`, source-only тулбар (таблица/график disabled, профиль активна — спека строка 133), проброс `tabId`/`sql`/`client` из `Explore` → Task 13. ✓
- Firewall (key-хинт; histogram в основном Chart/chartSpec; биннинг дат; grid/canvas) — **не строим**. ✓
- Расхождения (RTL→глазами; новых db-методов нет; вид поднят в стор с пробросом tabId/sql/client; result-таблица ОБЫЧНАЯ не TEMP из-за per-call connections; поля `Tab` результата введены в Task 8a для изолированной сборки) — зафиксированы в «Спека-консистентные решения».

> **Расхождение со спекой (зафиксировано):** спека строки 101–110 и решения называют result-таблицу `TEMP` (`CREATE OR REPLACE TEMP TABLE`). Эмпирически (node-движок 1.32) `TEMP` не переживает per-call connections `DuckDBClient` → `Catalog Error`. Реализуем **обычную** (catalog-global) `_qb_result_<tabId>` (решение 9). Поведение для пользователя идентично (таблица скрыта, перезатирается per tab, живёт сессию), но механизм другой. Спека/дизайн должны быть обновлены под обычную таблицу при следующей правке (трассируемость, CLAUDE.md rule 5).

**Файлы плана (абсолютные пути):** план реализуется в репозитории `C:\Users\cosmi\Projects\quackbook` на ветке `m3-profile`; источник истины — `C:\Users\cosmi\Projects\quackbook\docs\superpowers\specs\2026-06-24-quackbook-m3-profile-design.md`.
