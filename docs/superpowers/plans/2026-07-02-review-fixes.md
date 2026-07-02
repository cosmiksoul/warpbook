# Review-Fixes Implementation Plan (внешнее ревью 2026-07-02)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть все CRITICAL/IMPORTANT находки внешнего ревью 2026-07-02: XSS через markdown, DECIMAL/DATE-рендеринг (значения ×1000 и epoch-millis), case-insensitive коллизии имён, гонку stale-результатов, утечки Reset/памяти, дыры фильтров и профиля, CI-гейт — плюс погасить тест-долг и мёртвый код.

**Architecture:** Точечные фиксы в существующих модулях. Вся новая логика — в `src/core/` под юнит-тестами (TDD); поведение против реального DuckDB-WASM пиннится интеграционными тестами через существующую инфраструктуру `src/db/nodeDuckDB.ts`. Компоненты меняются минимально (подключение готовых core-хелперов).

**Tech Stack:** React 19 + TypeScript + Zustand 5 + DuckDB-WASM (`@duckdb/duckdb-wasm` **1.32.0**, не менять) + marked 18 + Vitest 4 (node env). Без новых зависимостей.

## Global Constraints

- Гейт **каждой** задачи перед коммитом: `npm test` (все зелёные) **и** `npm run build` (полный type-check; vitest его не делает). Оба обязательны.
- TDD: сначала красный тест, потом минимальный код, потом рефактор (CLAUDE.md). Презентация (CSS/раскладка) тестами не покрывается.
- Хирургические правки: не трогать соседний код, не переформатировать, не «улучшать» попутно.
- Никаких новых npm-зависимостей (в т.ч. DOMPurify — XSS закрываем экранированием через renderer marked).
- Коммиты однострочные: `git commit -m "fix(scope): ..."` (multiline на этой машине требует bash here-doc — не нужно, пиши в одну строку).
- Порядок: Задача 2 — раньше Задач 10; Задача 6 — раньше Задачи 14. Остальные независимы, но рекомендован порядок по номерам.
- Если существующий тест утверждал старое (баговое) поведение — обнови его ожидание и скажи об этом в коммит-сообщении.

---

### Задача 1: CI гоняет тесты и линт перед деплоем

Сейчас `.github/workflows/deploy.yml` делает `npm ci → build → deploy`: 241 тест никогда не запускается в CI, регрессия уезжает на Pages молча.

**Files:**
- Modify: `.github/workflows/deploy.yml` (шаги между Install и Build)

**Interfaces:** ничего не производит для других задач.

- [ ] **Step 1: Добавить шаги lint и test**

После шага `Install dependencies` и перед шагом `Build` вставить:

```yaml
      - name: Lint
        run: npm run lint
      - name: Test
        run: npm test
```

Итоговая последовательность шагов: Checkout → Set up Node → Install dependencies → **Lint → Test** → Build → Setup Pages → Upload artifact → Deploy.

- [ ] **Step 2: Проверить YAML локально**

Run: `node -e "console.log(require('fs').readFileSync('.github/workflows/deploy.yml','utf8').includes('npm test') ? 'ok' : 'missing')"`
Expected: `ok`

- [ ] **Step 3: Гейт + коммит**

Run: `npm test` → все зелёные; `npm run build` → успех.

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: run lint and tests before deploy (review 2026-07-02, gate #1)"
```

---

### Задача 2: `stripTrailingSemicolon` — один экспортируемый хелпер

Логика `sql.trim().replace(/;\s*$/, '').trim()` живёт в 4 копиях: `core/sql.ts:105` (`buildResultTempDDL`), `core/resultQuery.ts:100` (`buildEffectiveSql`), `core/mart.ts:7-9` (приватный хелпер), `db/duckdbClient.ts:75` (`exportQuery`).

**Files:**
- Modify: `src/core/sql.ts` (добавить export + использовать в `buildResultTempDDL`)
- Modify: `src/core/resultQuery.ts:100`
- Modify: `src/core/mart.ts:5-9`
- Modify: `src/db/duckdbClient.ts:75`
- Test: `src/core/sql.test.ts`

**Interfaces:**
- Produces: `stripTrailingSemicolon(sql: string): string` из `src/core/sql.ts` — её используют Задача 10 (`buildWidgetSql`) и все 4 существующих места.

- [ ] **Step 1: Красный тест** — в `src/core/sql.test.ts` добавить:

```ts
describe('stripTrailingSemicolon', () => {
  it('strips a trailing semicolon and whitespace', () => {
    expect(stripTrailingSemicolon('SELECT 1;')).toBe('SELECT 1')
    expect(stripTrailingSemicolon('  SELECT 1 ;  ')).toBe('SELECT 1')
  })
  it('leaves a clean query untouched', () => {
    expect(stripTrailingSemicolon('SELECT 1')).toBe('SELECT 1')
  })
})
```

Добавить `stripTrailingSemicolon` в import из `./sql` в шапке теста.

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -- sql.test`
Expected: FAIL — `stripTrailingSemicolon` не экспортируется.

- [ ] **Step 3: Реализация** — в `src/core/sql.ts` (перед `buildResultTempDDL`):

```ts
/** Strip ONE trailing `;` (+ whitespace): wrapping `... AS <select>;` with the
 *  semicolon inside is invalid SQL. */
export function stripTrailingSemicolon(sql: string): string {
  return sql.trim().replace(/;\s*$/, '').trim()
}
```

В `buildResultTempDDL` заменить `const select = sql.trim().replace(/;\s*$/, '').trim()` на `const select = stripTrailingSemicolon(sql)`.

- [ ] **Step 4: Заменить остальные 3 копии**

1. `src/core/resultQuery.ts`: в import из `'./sql'` добавить `stripTrailingSemicolon`; в `buildEffectiveSql` заменить `const select = userSql.trim().replace(/;\s*$/, '').trim()` на `const select = stripTrailingSemicolon(userSql)`.
2. `src/core/mart.ts`: удалить приватную функцию `stripTrailingSemicolon` (строки 5–9), добавить её в import: `import { quoteIdent, isInternalTable, stripTrailingSemicolon } from './sql'`.
3. `src/db/duckdbClient.ts`: в import из `'../core/sql'`... там импорта из sql уже есть (`rawTableName` и билдеры) — добавить `stripTrailingSemicolon`; в `exportQuery` заменить `const select = sql.trim().replace(/;\s*$/, '').trim()` на `const select = stripTrailingSemicolon(sql)`.

- [ ] **Step 5: Гейт + коммит**

Run: `npm test` и `npm run build` — зелёные.

```bash
git add src/core/sql.ts src/core/sql.test.ts src/core/resultQuery.ts src/core/mart.ts src/db/duckdbClient.ts
git commit -m "refactor(core): consolidate stripTrailingSemicolon into one exported helper (4 copies)"
```

---

### Задача 3: XSS — экранировать сырой HTML в markdown (in-app + экспорт)

**CRITICAL.** `marked.parse()` пропускает сырой HTML как есть; результат вставляется через `dangerouslySetInnerHTML` (`TextBlockView.tsx:29-38`) и в экспортируемый HTML (`exportHtml.ts:53`). Отчёт — импортируемый формат (`Report.tsx` открывает произвольный .json), плюс автосейв в localStorage делает XSS персистентным. Фикс: свой инстанс `Marked` с renderer, экранирующим html-токены.

**Files:**
- Create: `src/core/markdown.ts`
- Create: `src/core/markdown.test.ts`
- Modify: `src/core/exportHtml.ts` (убрать локальный `escapeHtml` и import marked, использовать новый модуль)
- Modify: `src/components/TextBlockView.tsx`
- Test: `src/core/exportHtml.test.ts` (добавить XSS-кейс)

**Interfaces:**
- Produces: из `src/core/markdown.ts` — `renderMarkdown(markdown: string): string` и `escapeHtml(s: string): string` (переезжает сюда из exportHtml; exportHtml её ре-экспортирует для совместимости).

- [ ] **Step 1: Красный тест** — создать `src/core/markdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('renders normal markdown', () => {
    expect(renderMarkdown('**жирный**')).toContain('<strong>жирный</strong>')
  })
  it('renders lists', () => {
    expect(renderMarkdown('- пункт')).toContain('<li>пункт</li>')
  })
  it('escapes block-level raw HTML instead of passing it through', () => {
    const out = renderMarkdown('<img src=x onerror="alert(1)">')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })
  it('escapes inline raw HTML inside a paragraph', () => {
    const out = renderMarkdown('до <script>alert(1)</script> после')
    expect(out).not.toContain('<script>')
  })
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -- markdown.test`
Expected: FAIL — модуля `./markdown` нет.

- [ ] **Step 3: Реализация** — создать `src/core/markdown.ts`:

```ts
import { Marked } from 'marked'

// For element TEXT content / <pre> only — every call site is text, never an
// attribute, so not escaping single quotes is intentional and safe.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Отдельный инстанс marked: сырой HTML НЕ пропускается, а экранируется.
// Отчёт — импортируемый формат (открытие .json + localStorage + экспорт .html),
// поэтому текст блоков — недоверенный ввод (XSS, review 2026-07-02).
const md = new Marked({
  renderer: {
    html(token) {
      return escapeHtml(token.text)
    },
  },
})

/** Markdown -> HTML; сырой HTML внутри markdown экранирован. */
export function renderMarkdown(markdown: string): string {
  return md.parse(markdown, { async: false }) as string
}
```

Если тест остаётся красным из-за сигнатуры renderer — сверься с https://marked.js.org/using_pro#renderer : в marked ≥ 13 renderer-методы получают token-объект (`token.text`), возвращают строку.

- [ ] **Step 4: Зелёный**

Run: `npm test -- markdown.test`
Expected: PASS (4 теста).

- [ ] **Step 5: Подключить в exportHtml** — в `src/core/exportHtml.ts`:

1. Удалить `import { marked } from 'marked'`.
2. Удалить локальную функцию `escapeHtml` (строки 13–20 вместе с комментарием).
3. Добавить: `import { escapeHtml, renderMarkdown } from './markdown'` и ре-экспорт для существующих импортёров: `export { escapeHtml } from './markdown'`.
4. В `renderBlock` заменить `${marked.parse(b.markdown || '') as string}` на `${renderMarkdown(b.markdown || '')}`.

Проверить остальных импортёров: `npx grep` не нужен — используй поиск `escapeHtml` по `src/`; все импорты из `'./exportHtml'` продолжают работать через ре-экспорт.

- [ ] **Step 6: Подключить в TextBlockView** — в `src/components/TextBlockView.tsx`:

1. Заменить `import { marked } from 'marked'` на `import { renderMarkdown } from '../core/markdown'`.
2. Заменить строки 28–29 на:

```ts
  // Markdown может прийти из импортированного .json-отчёта — сырой HTML экранируется (renderMarkdown).
  const html = renderMarkdown(block.markdown || PLACEHOLDER)
```

- [ ] **Step 7: Пин экспорта** — в `src/core/exportHtml.test.ts` добавить тест (адаптируй импорты под существующие в файле):

```ts
it('экранирует сырой HTML текстового блока (XSS)', () => {
  const doc: ReportDoc = {
    version: 1,
    blocks: [{ type: 'text', id: 'blk-1', markdown: '<img src=x onerror="alert(1)">' }],
  }
  const html = buildReportHtml(doc, {})
  expect(html).not.toContain('<img src=x')
})
```

- [ ] **Step 8: Гейт + коммит**

Run: `npm test` и `npm run build` — зелёные. Убедись, что `from 'marked'` больше нигде не импортируется, кроме `src/core/markdown.ts` (поиск по `src/`).

```bash
git add src/core/markdown.ts src/core/markdown.test.ts src/core/exportHtml.ts src/core/exportHtml.test.ts src/components/TextBlockView.tsx
git commit -m "fix(security): escape raw HTML in markdown - XSS via imported report JSON (in-app + export)"
```

---

### Задача 4: DECIMAL со шкалой и DATE/TIMESTAMP в ячейках

**CRITICAL.** Arrow JS отдаёт DECIMAL как немасштабированный BigNum (`1.500` → `1500` — значения ×10^scale в гриде/графике/экспорте) и DATE/TIMESTAMP как epoch-миллисекунды (грид показывает `1744156800000`). Фикс на уровне `arrowToRows`: per-column конвертер (Decimal → number через масштабированную строку; Date/Timestamp → JS `Date`), `formatCell` учится рендерить `Date` в ISO.

**Files:**
- Modify: `src/core/arrowToRows.ts`
- Test: `src/core/arrowToRows.test.ts` (юнит: `scaleDecimalDigits`, `formatCell`)
- Create: `src/db/duckdbClient.cells.test.ts` (интеграция против реального DuckDB)
- Modify: места вызова `formatCell` — передать тип колонки (найди поиском `formatCell(` по `src/`; это `src/core/exportHtml.ts` (renderTable) и `src/components/ResultGrid.tsx`)

**Interfaces:**
- Produces: `scaleDecimalDigits(digits: string, scale: number): string` (export из arrowToRows); `formatCell(value: unknown, type?: string): string` — второй параметр НЕобязательный, это строка типа колонки (Arrow-строка `'Date32<DAY>'` или DuckDB-имя `'DATE'` — сравнение регистронезависимое по префиксу).
- Значения в `QueryResult.rows` меняют JS-тип: DECIMAL(scale>0) → `number`, DATE/TIMESTAMP → `Date`. Потребители (`Chart`/Observable Plot) работают с `Date`/`number` нативно.

- [ ] **Step 1: Красные юнит-тесты** — в `src/core/arrowToRows.test.ts` добавить:

```ts
describe('scaleDecimalDigits', () => {
  it('inserts the decimal point at scale', () => {
    expect(scaleDecimalDigits('1500', 3)).toBe('1.500')
  })
  it('pads small magnitudes with zeros', () => {
    expect(scaleDecimalDigits('7', 2)).toBe('0.07')
  })
  it('keeps the sign', () => {
    expect(scaleDecimalDigits('-7', 2)).toBe('-0.07')
  })
})

describe('formatCell', () => {
  it('null/undefined -> empty string', () => {
    expect(formatCell(null)).toBe('')
    expect(formatCell(undefined)).toBe('')
  })
  it('bigint -> string', () => {
    expect(formatCell(42n)).toBe('42')
  })
  it('Date + Date-type -> date only (ISO)', () => {
    expect(formatCell(new Date(Date.UTC(2025, 3, 9)), 'Date32<DAY>')).toBe('2025-04-09')
    expect(formatCell(new Date(Date.UTC(2025, 3, 9)), 'DATE')).toBe('2025-04-09')
  })
  it('Date + Timestamp-type -> datetime (ISO, UTC)', () => {
    expect(formatCell(new Date(Date.UTC(2025, 3, 9, 10, 30)), 'Timestamp<MICROSECOND>')).toBe('2025-04-09 10:30:00')
  })
})
```

Добавить `formatCell, scaleDecimalDigits` в import.

- [ ] **Step 2: Красный интеграционный тест** — создать `src/db/duckdbClient.cells.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import { createNodeDuckDB } from './nodeDuckDB'
import { createClient, type DuckDBClient } from './duckdbClient'
import { arrowToRows, formatCell } from '../core/arrowToRows'

let db: AsyncDuckDB
let client: DuckDBClient

beforeAll(async () => {
  db = await createNodeDuckDB()
  client = createClient(db)
}, 60_000)

afterAll(async () => {
  await db.terminate()
})

// Каждый it самодостаточен — без intra-file coupling (по образцу duckdbClient.profile.test.ts).
describe('cell decoding over real DuckDB (DECIMAL scale, DATE/TIMESTAMP)', () => {
  it('DECIMAL(18,3): 1.5 приходит как 1.5, а не 1500', async () => {
    const r = arrowToRows(await client.query('SELECT CAST(1.5 AS DECIMAL(18,3)) AS d'))
    expect(Number(r.rows[0].d)).toBeCloseTo(1.5)
  })

  it('отрицательный DECIMAL сохраняет знак и шкалу', async () => {
    const r = arrowToRows(await client.query('SELECT CAST(-0.07 AS DECIMAL(10,2)) AS d'))
    expect(Number(r.rows[0].d)).toBeCloseTo(-0.07)
  })

  it('SUM по DECIMAL масштабируется корректно (DECIMAL(38,x))', async () => {
    const r = arrowToRows(await client.query(
      'SELECT sum(x) AS s FROM (VALUES (CAST(1.25 AS DECIMAL(18,2))), (CAST(2.50 AS DECIMAL(18,2)))) t(x)'))
    expect(Number(r.rows[0].s)).toBeCloseTo(3.75)
  })

  it('DATE рендерится ISO-датой, не epoch-миллисекундами', async () => {
    const r = arrowToRows(await client.query("SELECT DATE '2025-04-09' AS day"))
    expect(formatCell(r.rows[0].day, r.columns[0].type)).toBe('2025-04-09')
  })

  it('TIMESTAMP рендерится ISO datetime', async () => {
    const r = arrowToRows(await client.query("SELECT TIMESTAMP '2025-04-09 10:30:00' AS ts"))
    expect(formatCell(r.rows[0].ts, r.columns[0].type)).toBe('2025-04-09 10:30:00')
  })

  it('HUGEINT остаётся точным (scale 0 не конвертируется в float)', async () => {
    const r = arrowToRows(await client.query('SELECT 170141183460469231731687303715884105727::HUGEINT AS h'))
    expect(formatCell(r.rows[0].h, r.columns[0].type)).toBe('170141183460469231731687303715884105727')
  })
})
```

Run: `npm test -- cells.test` → Expected: FAIL (текущие значения: 1500, epoch-millis).

- [ ] **Step 3: Реализация** — заменить содержимое `src/core/arrowToRows.ts` (интерфейсы и `dedupeColumnNames` не трогаем):

```ts
import { DataType, type Field, type Table } from 'apache-arrow'

export interface ResultColumn {
  name: string
  type: string
}

export interface QueryResult {
  columns: ResultColumn[]
  rows: Record<string, unknown>[]
  numRows: number
}

/** Unscaled decimal digits + scale -> plain decimal string: ('1500', 3) -> '1.500'. */
export function scaleDecimalDigits(digits: string, scale: number): string {
  const neg = digits.startsWith('-')
  let d = neg ? digits.slice(1) : digits
  d = d.padStart(scale + 1, '0')
  const i = d.length - scale
  const s = `${d.slice(0, i)}.${d.slice(i)}`
  return neg ? `-${s}` : s
}

/**
 * Format a cell value as a display string (null/undefined → '', bigint → string,
 * Date → ISO). `type` (строка типа колонки, Arrow или DuckDB) отличает
 * дату-без-времени от timestamp; сравнение регистронезависимое по префиксу.
 */
export function formatCell(value: unknown, type?: string): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) {
    const iso = value.toISOString() // DuckDB TIMESTAMP наивный; epoch-значения UTC
    const t = type?.toUpperCase() ?? ''
    return t.startsWith('DATE') ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ')
  }
  return String(value)
}

/** Disambiguate duplicate column names: ['id','id'] -> ['id','id_1']. */
export function dedupeColumnNames(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    return count === 0 ? name : `${name}_${count}`
  })
}

/**
 * Per-column converter for raw Arrow cell values. Arrow JS returns DECIMAL as an
 * UNSCALED BigNum (1.500 -> 1500) and DATE/TIMESTAMP as epoch millis — both are
 * wrong to display as-is. Decimal(scale>0) -> Number via the scaled string
 * (double-точность принята осознанно: правильный порядок величины важнее хвоста
 * >15 значащих цифр); scale 0 (HUGEINT) остаётся как есть (точность).
 * Date/Timestamp -> JS Date (Plot рисует нативно; formatCell рендерит ISO).
 */
function cellConverter(field: Field): (v: unknown) => unknown {
  const t = field.type
  if (DataType.isDecimal(t) && t.scale > 0) {
    const scale = t.scale
    return (v) => (v == null ? v : Number(scaleDecimalDigits(String(v), scale)))
  }
  if (DataType.isDate(t) || DataType.isTimestamp(t)) {
    return (v) => (v == null ? v : new Date(Number(v)))
  }
  return (v) => v
}

/**
 * Shape an Apache Arrow Table into plain column metadata + row objects.
 * Reads values by COLUMN INDEX (not row.toJSON()) so duplicate column names
 * from a JOIN do not collapse — names are deduped to keep every column.
 */
export function arrowToRows(table: Table): QueryResult {
  const fields = table.schema.fields
  const names = dedupeColumnNames(fields.map((f) => f.name))
  const columns = fields.map((f, i) => ({ name: names[i], type: String(f.type) }))
  const convert = fields.map((f) => cellConverter(f))
  const vectors = fields.map((_, i) => table.getChildAt(i))
  const rows: Record<string, unknown>[] = []
  for (let r = 0; r < table.numRows; r++) {
    const row: Record<string, unknown> = {}
    for (let c = 0; c < names.length; c++) {
      const v = vectors[c]?.get(r)
      row[names[c]] = v === undefined ? null : convert[c](v)
    }
    rows.push(row)
  }
  return { columns, rows, numRows: table.numRows }
}
```

- [ ] **Step 4: Передать тип колонки в formatCell на вызовах**

Найди поиском `formatCell(` по `src/` все вызовы (ожидаются: `src/core/exportHtml.ts` в `renderTable` и `src/components/ResultGrid.tsx` в рендере ячейки). В каждом месте у вызова уже есть объект колонки — добавь второй аргумент:

- `exportHtml.ts`: `formatCell(row[c.name])` → `formatCell(row[c.name], c.type)`
- `ResultGrid.tsx`: аналогично, `formatCell(<значение>)` → `formatCell(<значение>, <col>.type)` — имя переменной колонки возьми из контекста файла.

- [ ] **Step 5: Зелёный + прогон всего**

Run: `npm test`
Expected: PASS. Если какой-то существующий тест утверждал epoch-millis/немасштабированный decimal в ячейках — это и был баг: обнови ожидание теста.

- [ ] **Step 6: Гейт + коммит**

Run: `npm run build` — успех.

```bash
git add src/core/arrowToRows.ts src/core/arrowToRows.test.ts src/db/duckdbClient.cells.test.ts src/core/exportHtml.ts src/components/ResultGrid.tsx
git commit -m "fix(core): scale DECIMAL by type scale and decode DATE/TIMESTAMP to Date - grid/chart/export showed x1000 and epoch millis"
```

---

### Задача 5: Case-insensitive коллизии имён (каталог DuckDB регистронезависим)

**CRITICAL.** DuckDB резолвит идентификаторы регистронезависимо даже в кавычках, а `uniqueTableName` (`sql.ts:26`) и `validateMartName` (`mart.ts:36`) сравнивают регистрозависимо. Загрузка `Sales.csv` после `sales.csv` (или витрина `PAYMENTS` при таблице `payments`) молча затирает чужую таблицу через `CREATE OR REPLACE`.

**Files:**
- Modify: `src/core/sql.ts` (`uniqueTableName`)
- Modify: `src/core/mart.ts` (`validateMartName`)
- Test: `src/core/sql.test.ts`, `src/core/mart.test.ts`

**Interfaces:** сигнатуры не меняются.

- [ ] **Step 1: Красные тесты**

В `src/core/sql.test.ts` (в существующий `describe('uniqueTableName')` или рядом):

```ts
it('collides case-insensitively (DuckDB catalog is case-insensitive)', () => {
  expect(uniqueTableName('Sales', ['sales'])).toBe('Sales_1')
  expect(uniqueTableName('SALES', ['sales', 'Sales_1'])).toBe('SALES_2')
})
```

В `src/core/mart.test.ts`:

```ts
it('rejects a name that differs only by case', () => {
  expect(validateMartName('PAYMENTS', ['payments'])).toMatch(/занято/)
})
```

Run: `npm test -- sql.test mart.test` → Expected: FAIL (оба).

- [ ] **Step 2: Реализация**

`src/core/sql.ts` — заменить `uniqueTableName`:

```ts
/** Make `desired` unique against `taken` by appending _1, _2, ...
 *  Регистронезависимо: каталог DuckDB резолвит имена case-insensitively. */
export function uniqueTableName(desired: string, taken: string[]): string {
  const low = new Set(taken.map((t) => t.toLowerCase()))
  if (!low.has(desired.toLowerCase())) return desired
  let i = 1
  while (low.has(`${desired.toLowerCase()}_${i}`)) i++
  return `${desired}_${i}`
}
```

`src/core/mart.ts` — в `validateMartName` заменить `if (taken.includes(n))` на:

```ts
  if (taken.some((t) => t.toLowerCase() === n.toLowerCase())) return `Имя «${n}» уже занято`
```

- [ ] **Step 3: Гейт + коммит**

Run: `npm test` и `npm run build` — зелёные.

```bash
git add src/core/sql.ts src/core/sql.test.ts src/core/mart.ts src/core/mart.test.ts
git commit -m "fix(core): case-insensitive name collision checks - DuckDB catalog silently clobbered same-name-different-case tables"
```

---

### Задача 6: Latest-wins всерьёз — гонка stale-результатов

**CRITICAL.** В `useResultActions.ts:24` guard `nextWindowSeq() >= seq` **всегда true** (счётчик монотонный, `seq` смят из него же) и попутно мутирует счётчик; paged-путь (`setResultMeta`) вообще без guard. Медленный старый запуск перезаписывает результат нового — молча неверные данные. Плюс `nextWindowSeq` сидит на `seq` — счётчике id табов/блоков.

**Files:**
- Modify: `src/state/session.ts` (`fetchSeq` поле, `nextWindowSeq` на своём счётчике, новое действие `stampWindowSeq`)
- Modify: `src/features/useResultActions.ts` (полная переписка `runQuery`/`fetchWindow`)
- Test: `src/state/session.test.ts` (обновить тест `nextWindowSeq`), Create: `src/features/useResultActions.test.ts`

**Interfaces:**
- Produces: store-действие `stampWindowSeq(id: string, seq: number): void`; поле состояния `fetchSeq: number`. Семантика: `tab.windowSeq` — seq ПОСЛЕДНЕГО выданного запуска/фетча этого таба; писать результат в стор может только владелец текущего `windowSeq` (строгое равенство).
- Задача 14 удалит `setWindowLoading` — здесь мы перестаём его вызывать.

- [ ] **Step 1: Красный тест на гонку** — создать `src/features/useResultActions.test.ts`:

```ts
import { tableFromJSON } from 'apache-arrow'
import type { Table } from 'apache-arrow'
import { beforeEach, describe, expect, it } from 'vitest'
import { useResultActions } from './useResultActions'
import { useSession } from '../state/session'
import type { DuckDBClient } from '../db/duckdbClient'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** exec всегда падает (raw-фоллбэк); query отдаёт управляемые promises в порядке вызова. */
function rawClientWithQueue() {
  const queue: Array<ReturnType<typeof deferred<Table>>> = []
  const client = {
    exec: async () => { throw new Error('not materializable') },
    query: () => { const d = deferred<Table>(); queue.push(d); return d.promise },
  } as unknown as DuckDBClient
  return { client, queue }
}

beforeEach(() => { useSession.getState().reset() })

function openTab(): string {
  useSession.getState().openBlankTab()
  return useSession.getState().activeTabId!
}
const tab = () => useSession.getState().tabs[0]

describe('runQuery latest-wins (raw fallback path)', () => {
  it('discards a stale slow run that finishes after a newer one', async () => {
    const { client, queue } = rawClientWithQueue()
    const { runQuery } = useResultActions(client)
    const id = openTab()

    const runA = runQuery(id, 'PRAGMA a')
    const runB = runQuery(id, 'PRAGMA b')
    // exec-фоллбэк добирается до client.query только после microtask-а:
    await new Promise((r) => setTimeout(r, 0))
    expect(queue).toHaveLength(2)

    queue[1].resolve(tableFromJSON([{ n: 2 }])) // B (новый) финиширует первым
    await runB
    queue[0].resolve(tableFromJSON([{ n: 1 }])) // A (устаревший) доезжает после
    await runA

    expect(tab().window?.rows).toEqual([{ n: 2 }])
  })

  it('discards a stale error arriving after a newer successful run', async () => {
    const { client, queue } = rawClientWithQueue()
    const { runQuery } = useResultActions(client)
    const id = openTab()

    const runA = runQuery(id, 'PRAGMA a')
    const runB = runQuery(id, 'PRAGMA b')
    await new Promise((r) => setTimeout(r, 0))
    expect(queue).toHaveLength(2)

    queue[1].resolve(tableFromJSON([{ n: 2 }]))
    await runB
    queue[0].reject(new Error('stale boom'))
    await runA

    expect(tab().error).toBeNull()
    expect(tab().window?.rows).toEqual([{ n: 2 }])
  })
})

describe('runQuery paged path', () => {
  it('materializes, counts and loads page 1', async () => {
    const client = {
      exec: async () => undefined,
      describeTable: async () => [{ name: 'n', type: 'BIGINT' }],
      query: async (sql: string) =>
        sql.startsWith('SELECT count(*)')
          ? tableFromJSON([{ n: 3n }])
          : tableFromJSON([{ n: 1n }, { n: 2n }, { n: 3n }]),
    } as unknown as DuckDBClient
    const { runQuery } = useResultActions(client)
    const id = openTab()
    await runQuery(id, 'SELECT * FROM t')
    expect(tab().mode).toBe('paged')
    expect(tab().rowCount).toBe(3)
    expect(tab().window?.numRows).toBe(3)
    expect(tab().error).toBeNull()
  })
})
```

Run: `npm test -- useResultActions.test` → Expected: FAIL — первый тест видит `rows` = `[{ n: 1 }]` (stale перезаписал).

- [ ] **Step 2: Store: свой счётчик + stamp** — в `src/state/session.ts`:

1. В интерфейс `SessionState` после `seq: number` добавить: `fetchSeq: number // счётчик fetch/run seq — ОТДЕЛЬНО от id-счётчика`.
2. В интерфейс, после `nextWindowSeq: () => number`, добавить: `stampWindowSeq: (id: string, seq: number) => void`.
3. В `initial` добавить: `fetchSeq: 0,`.
4. Заменить реализацию `nextWindowSeq`:

```ts
  nextWindowSeq: () => { const n = get().fetchSeq + 1; set({ fetchSeq: n }); return n },
```

5. Добавить рядом:

```ts
  stampWindowSeq: (id, seq) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, windowSeq: seq } : t)) })),
```

6. В `src/state/session.test.ts` найти тест `'nextWindowSeq increments the store seq and returns it (race guard)'` (~строка 550) и заменить его тело:

```ts
  it('nextWindowSeq increments its own fetch counter, not the id seq', () => {
    const s = useSession.getState()
    const idSeqBefore = s.seq
    const a = s.nextWindowSeq()
    const b = useSession.getState().nextWindowSeq()
    expect(b).toBe(a + 1)
    expect(useSession.getState().seq).toBe(idSeqBefore) // id-счётчик не тронут
  })
```

- [ ] **Step 3: Переписать useResultActions** — заменить в `src/features/useResultActions.ts` функции `runQuery` и `fetchWindow` (импорты и `countMatches`/`dropResult` не трогаем):

```ts
  /** Владелец записи в стор — только последний выданный run/fetch этого таба. */
  function ownsRun(tabId: string, seq: number): boolean {
    return (useSession.getState().tabs.find((t) => t.id === tabId)?.windowSeq ?? 0) === seq
  }

  // Materialize the result snapshot, count, load page 1. Non-SELECT -> raw fallback.
  async function runQuery(tabId: string, sql: string): Promise<void> {
    const st = useSession.getState()
    const seq = st.nextWindowSeq()
    st.stampWindowSeq(tabId, seq) // застолбить run ДО первого await
    const t0 = performance.now()
    const table = resultTempName(tabId)
    try {
      await client.exec(buildResultTempDDL(tabId, sql))
    } catch {
      // Not materializable (non-SELECT: PRAGMA/EXPLAIN/DDL) -> direct path.
      try {
        const raw = arrowToRows(await client.query(sql))
        if (ownsRun(tabId, seq)) useSession.getState().setRawResult(tabId, raw, performance.now() - t0)
      } catch (e) {
        if (ownsRun(tabId, seq)) useSession.getState().setTabError(tabId, String(e))
      }
      return
    }
    try {
      const columns: ResultColumn[] = await client.describeTable(table)
      const rowCount = await countMatches(table, columns.map((c) => c.name))
      if (!ownsRun(tabId, seq)) return
      useSession.getState().setResultMeta(tabId, { columns, rowCount, ms: performance.now() - t0 })
      await fetchWindow(tabId, seq)
    } catch (e) {
      if (ownsRun(tabId, seq)) useSession.getState().setTabError(tabId, String(e))
    }
  }

  // Fetch the current page window for a tab's view; recount when filters/search set.
  async function fetchWindow(tabId: string, seqIn?: number): Promise<void> {
    const st = useSession.getState()
    const tab = st.tabs.find((t) => t.id === tabId)
    if (!tab || tab.mode !== 'paged' || !tab.columns) return
    const seq = seqIn ?? st.nextWindowSeq()
    if (seqIn === undefined) st.stampWindowSeq(tabId, seq) // standalone fetch тоже столбит
    const table = resultTempName(tabId)
    const cols = tab.columns.map((c) => c.name)
    const view = tab.view ?? DEFAULT_VIEW
    try {
      const hasFilter = view.search.trim() !== '' || view.filters.length > 0
      const rowCount = hasFilter ? await countMatches(table, cols, view) : (tab.meta?.rows ?? tab.rowCount)
      const win = arrowToRows(await client.query(buildWindowSql(table, cols, view)))
      if (ownsRun(tabId, seq)) useSession.getState().setWindow(tabId, win, { rowCount })
    } catch (e) {
      if (ownsRun(tabId, seq)) useSession.getState().setTabError(tabId, String(e))
    }
  }
```

Обрати внимание: вызовов `setWindowLoading` и инлайнового `useSession.setState` больше нет (мёртвый флаг удалит Задача 14).

- [ ] **Step 4: Зелёный**

Run: `npm test -- useResultActions.test session.test`
Expected: PASS (все).

- [ ] **Step 5: Гейт + коммит**

Run: `npm test` и `npm run build` — зелёные.

```bash
git add src/state/session.ts src/state/session.test.ts src/features/useResultActions.ts src/features/useResultActions.test.ts
git commit -m "fix(explore): real latest-wins guard for query runs - stale slow results/errors no longer overwrite newer ones; fetch seq off the id counter"
```

---

### Задача 7: `setWindow` чистит `error`; `updateTabSql` чистит `resultProfileError`

**IMPORTANT.** Ошибка window-фетча (`setTabError`) остаётся в `tab.error` навсегда: успешный последующий `setWindow` её не чистит, а `ResultPanel` прячет грид при любом `error` — таб «кирпич» до полного перезапуска. Попутно: `updateTabSql` инвалидирует `resultProfile`, но не `resultProfileError`.

**Files:**
- Modify: `src/state/session.ts` (`setWindow`, `updateTabSql`)
- Test: `src/state/session.test.ts`

**Interfaces:** сигнатуры не меняются.

- [ ] **Step 1: Красные тесты** — в `src/state/session.test.ts`:

```ts
it('setWindow clears a stale error (recovered window fetch)', () => {
  const s = useSession.getState()
  s.openBlankTab()
  const id = useSession.getState().activeTabId!
  s.setTabError(id, 'boom')
  useSession.getState().setWindow(id, { columns: [], rows: [], numRows: 0 })
  expect(useSession.getState().tabs[0].error).toBeNull()
})

it('updateTabSql invalidates resultProfileError along with the profile', () => {
  const s = useSession.getState()
  s.openBlankTab()
  const id = useSession.getState().activeTabId!
  s.setResultProfileError(id, 'old error')
  useSession.getState().updateTabSql(id, 'SELECT 2')
  expect(useSession.getState().tabs[0].resultProfileError).toBeUndefined()
})
```

Run: `npm test -- session.test` → Expected: FAIL (оба).

- [ ] **Step 2: Реализация** — в `src/state/session.ts`:

`setWindow`: добавить `error: null`:

```ts
  setWindow: (id, window, opts) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? { ...t, window, windowLoading: false, error: null,
              rowCount: opts?.rowCount ?? t.rowCount }
          : t,
      ),
    })),
```

`updateTabSql`: добавить `resultProfileError: undefined`:

```ts
          ? { ...t, sql, resultProfile: undefined, resultRowCount: undefined, resultProfileError: undefined }
```

- [ ] **Step 3: Гейт + коммит**

Run: `npm test` и `npm run build` — зелёные.

```bash
git add src/state/session.ts src/state/session.test.ts
git commit -m "fix(state): setWindow clears stale tab error; updateTabSql invalidates resultProfileError"
```

---

### Задача 8: Reset без утечек каталога (VIEW-витрины + `_qb_result_*`)

**IMPORTANT.** `Shell.handleReset` шлёт `DROP TABLE` всем датасетам: для витрины-VIEW это ошибка (глотается) — VIEW переживает Reset и позже ломает загрузку одноимённого файла. Снапшоты `_qb_result_<tab>` вообще никто не дропает на Reset (утечка памяти WASM). Логика переезжает в тестируемый core-хелпер.

**Files:**
- Create: `src/core/resetPlan.ts`
- Create: `src/core/resetPlan.test.ts`
- Modify: `src/features/Shell.tsx` (`handleReset`)

**Interfaces:**
- Consumes: `buildDropTable`, `rawTableName`, `resultTempName` из `./sql`; `buildDropMart`, `MartKind` из `./mart`.
- Produces: `buildResetStatements(datasets: Array<{ table: string; kind: 'csv' | 'parquet' | 'view' | 'table' }>, tabIds: string[]): string[]` — Shell передаёт `datasets` стора как есть (структурно совместимо).

- [ ] **Step 1: Красный тест** — создать `src/core/resetPlan.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildResetStatements } from './resetPlan'

describe('buildResetStatements', () => {
  it('drops file tables (+raw for csv), marts by their kind, and per-tab result snapshots', () => {
    expect(
      buildResetStatements(
        [
          { table: 'events', kind: 'csv' },
          { table: 'metrics', kind: 'parquet' },
          { table: 'rev', kind: 'view' },
          { table: 'snap', kind: 'table' },
        ],
        ['tab-1', 'tab-2'],
      ),
    ).toEqual([
      'DROP TABLE IF EXISTS "events"',
      'DROP TABLE IF EXISTS "_qb_raw_events"',
      'DROP TABLE IF EXISTS "metrics"',
      'DROP VIEW IF EXISTS "rev"',
      'DROP TABLE IF EXISTS "snap"',
      'DROP TABLE IF EXISTS "_qb_result_tab-1"',
      'DROP TABLE IF EXISTS "_qb_result_tab-2"',
    ])
  })

  it('empty session -> no statements', () => {
    expect(buildResetStatements([], [])).toEqual([])
  })
})
```

Run: `npm test -- resetPlan` → Expected: FAIL (модуля нет).

- [ ] **Step 2: Реализация** — создать `src/core/resetPlan.ts`:

```ts
import { buildDropTable, rawTableName, resultTempName } from './sql'
import { buildDropMart, type MartKind } from './mart'

interface ResetDataset {
  table: string
  kind: 'csv' | 'parquet' | MartKind
}

/**
 * Полная очистка каталога DuckDB на Reset: таблицы файлов (+ immutable raw для
 * csv), витрины — своим DROP (VIEW нельзя дропнуть как TABLE), и материализованные
 * снапшоты результатов всех открытых табов. Каждый statement идемпотентен (IF EXISTS).
 */
export function buildResetStatements(datasets: ResetDataset[], tabIds: string[]): string[] {
  const stmts: string[] = []
  for (const d of datasets) {
    if (d.kind === 'view' || d.kind === 'table') {
      stmts.push(buildDropMart(d.table, d.kind))
    } else {
      stmts.push(buildDropTable(d.table))
      if (d.kind === 'csv') stmts.push(buildDropTable(rawTableName(d.table)))
    }
  }
  for (const id of tabIds) stmts.push(buildDropTable(resultTempName(id)))
  return stmts
}
```

- [ ] **Step 3: Подключить в Shell** — в `src/features/Shell.tsx`:

1. Заменить import `{ buildDropTable, rawTableName } from '../core/sql'` на `{ buildResetStatements } from '../core/resetPlan'`.
2. Заменить `handleReset`:

```ts
  async function handleReset() {
    const st = useSession.getState()
    const stmts = buildResetStatements(st.datasets, st.tabs.map((t) => t.id))
    for (const sql of stmts) {
      try {
        await client.exec(sql)
      } catch {
        // ignore — object may already be gone
      }
    }
    reset()
  }
```

- [ ] **Step 4: Гейт + коммит**

Run: `npm test` и `npm run build` — зелёные.

```bash
git add src/core/resetPlan.ts src/core/resetPlan.test.ts src/features/Shell.tsx
git commit -m "fix(shell): Reset drops VIEW marts by kind and per-tab result snapshots - no more catalog leaks breaking later loads"
```

---

### Задача 9: Освобождать файловый буфер после загрузки (`dropFile`)

**IMPORTANT.** `registerFileBuffer` пинит сырые байты файла в воркере навсегда: CSV живёт в памяти трижды (буфер + `_qb_raw_` + типизированная таблица), Reset буферы не чистит → монотонный рост до OOM. После материализации файл больше не нужен (re-apply схемы идёт из `_qb_raw_`, sniff — в момент загрузки).

**Files:**
- Modify: `src/db/duckdbClient.ts` (интерфейс + реализация `dropFile`)
- Modify: `src/features/loadFiles.ts` (`try/finally` вокруг тела после `registerFile`)
- Create: `src/db/duckdbClient.dropfile.test.ts`

**Interfaces:**
- Produces: метод клиента `dropFile(name: string): Promise<void>`.

- [ ] **Step 1: Красный тест** — создать `src/db/duckdbClient.dropfile.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import { createNodeDuckDB } from './nodeDuckDB'
import { createClient, type DuckDBClient } from './duckdbClient'
import { arrowToRows } from '../core/arrowToRows'

let db: AsyncDuckDB
let client: DuckDBClient

beforeAll(async () => {
  db = await createNodeDuckDB()
  client = createClient(db)
}, 60_000)

afterAll(async () => {
  await db.terminate()
})

describe('dropFile', () => {
  it('frees the registered buffer; tables survive; re-register works (rehydration)', async () => {
    const csv = new TextEncoder().encode('a,b\n1,2\n')
    await client.registerFile('tmp_dropfile.csv', csv)
    await client.loadCsvAllVarchar('tmp_dropfile.csv', 'tmp_dropfile')

    await client.dropFile('tmp_dropfile.csv')

    // таблицы живут:
    expect(arrowToRows(await client.query('SELECT * FROM tmp_dropfile')).numRows).toBe(1)
    // файла больше нет:
    await expect(client.query("SELECT * FROM read_csv_auto('tmp_dropfile.csv')")).rejects.toThrow()
    // повторная регистрация того же имени работает (регидрация после reload):
    await client.registerFile('tmp_dropfile.csv', csv)
    expect(arrowToRows(await client.query("SELECT * FROM read_csv_auto('tmp_dropfile.csv')")).numRows).toBe(1)
  })
})
```

Run: `npm test -- dropfile` → Expected: FAIL — `client.dropFile is not a function`.

- [ ] **Step 2: Реализация клиента** — в `src/db/duckdbClient.ts`:

В интерфейс `DuckDBClient` после `registerFile`:

```ts
  /** Unregister a virtual file, freeing its pinned buffer in the worker. */
  dropFile(name: string): Promise<void>
```

В объект `createClient` после `registerFile`:

```ts
    async dropFile(name) {
      await db.dropFile(name)
    },
```

- [ ] **Step 3: Зелёный**

Run: `npm test -- dropfile` → Expected: PASS.

- [ ] **Step 4: Вызывать из loadOneFile** — в `src/features/loadFiles.ts` обернуть тело после `registerFile` в `try/finally`:

```ts
  const bytes = new Uint8Array(await file.arrayBuffer())
  await client.registerFile(file.name, bytes)
  try {
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
    let suggested: Dataset['suggested']
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
      schemaError: null,
    }
  } finally {
    // Сырые байты запинены в воркере, таблицы уже материализованы (re-apply
    // схемы идёт из _qb_raw_) — буфер освобождаем всегда, даже при ошибке.
    try {
      await client.dropFile(file.name)
    } catch {
      // non-fatal
    }
  }
```

(Это существующее тело функции, целиком обёрнутое в try/finally, — сами ветки не менялись.)

- [ ] **Step 5: Гейт + коммит**

Run: `npm test` и `npm run build` — зелёные (в т.ч. `exampleQueries.integration.test.ts`, который ходит через `loadOneFile`).

```bash
git add src/db/duckdbClient.ts src/db/duckdbClient.dropfile.test.ts src/features/loadFiles.ts
git commit -m "fix(load): drop the registered file buffer after materialization - raw bytes were pinned in WASM for the whole session"
```

---

### Задача 10: Кап строк в виджетах отчёта (live + экспорт)

**IMPORTANT.** Виджет отчёта гоняет полный SQL и конвертирует ВСЕ строки в JS-объекты (`WidgetBlockView.tsx:47-62`); `renderReport` — так же, а к `EXPORT_ROW_CAP` режет уже после материализации. «SELECT * FROM big» на миллионы строк вешает вкладку. Фикс: оборачивать SQL виджета в `LIMIT cap+1` (cap+1 — сигнал усечения).

Зависимость: Задача 2 (`stripTrailingSemicolon`).

**Files:**
- Modify: `src/core/resultQuery.ts` (`WIDGET_ROW_CAP`, `buildWidgetSql`)
- Test: `src/core/resultQuery.test.ts`
- Modify: `src/components/WidgetBlockView.tsx`
- Modify: `src/features/exportReport.ts` (`renderReport`)
- Modify: `src/core/exportHtml.ts` (текст усечения в `renderTable`)
- Modify: `src/index.css` (стиль пометки — презентация, без тестов)

**Interfaces:**
- Produces: `WIDGET_ROW_CAP = 5000` и `buildWidgetSql(sql: string, cap?: number): string` из `src/core/resultQuery.ts`.

- [ ] **Step 1: Красный тест** — в `src/core/resultQuery.test.ts`:

```ts
describe('buildWidgetSql', () => {
  it('wraps the widget sql with a cap+1 LIMIT (cap+1 signals truncation)', () => {
    expect(buildWidgetSql('SELECT * FROM t;', 100)).toBe('SELECT * FROM (\nSELECT * FROM t\n) LIMIT 101')
  })
  it('defaults to WIDGET_ROW_CAP', () => {
    expect(buildWidgetSql('SELECT 1')).toContain(`LIMIT ${WIDGET_ROW_CAP + 1}`)
  })
})
```

Добавить `buildWidgetSql, WIDGET_ROW_CAP` в import. Run → FAIL.

- [ ] **Step 2: Реализация** — в `src/core/resultQuery.ts`:

В import из `'./sql'` добавить `stripTrailingSemicolon`. В конец файла:

```ts
/** Кап строк, который виджет отчёта готов материализовать в JS-объекты. */
export const WIDGET_ROW_CAP = 5000

/** Обернуть сохранённый SQL виджета: не больше cap+1 строк (cap+1 — сигнал усечения). */
export function buildWidgetSql(sql: string, cap = WIDGET_ROW_CAP): string {
  return `SELECT * FROM (\n${stripTrailingSemicolon(sql)}\n) LIMIT ${cap + 1}`
}
```

Run: `npm test -- resultQuery` → PASS.

- [ ] **Step 3: WidgetBlockView** — в `src/components/WidgetBlockView.tsx`:

1. Import: `import { buildWidgetSql, WIDGET_ROW_CAP } from '../core/resultQuery'`.
2. Расширить `WidgetState`:

```ts
type WidgetState =
  | { kind: 'loading' }
  | { kind: 'ok'; result: QueryResult; truncated: boolean }
  | { kind: 'error'; message: string }
```

3. В эффекте заменить `client.query(block.sql)` и обработчик `.then`:

```ts
    client
      .query(buildWidgetSql(block.sql))
      .then((table) => {
        if (cancelled) return
        const full = arrowToRows(table)
        const truncated = full.numRows > WIDGET_ROW_CAP
        const result = truncated
          ? { ...full, rows: full.rows.slice(0, WIDGET_ROW_CAP), numRows: WIDGET_ROW_CAP }
          : full
        setState({ kind: 'ok', result, truncated })
      })
```

4. После блока рендера таблицы/графика (после ветки `vizType === 'chart' && !spec`) добавить пометку:

```tsx
      {state.kind === 'ok' && state.truncated && (
        <p className="widget-truncated">показаны первые {WIDGET_ROW_CAP} строк</p>
      )}
```

5. В `src/index.css` добавить (рядом с другими widget-стилями):

```css
.widget-truncated { color: #999; font-style: italic; font-size: 12px; margin: 6px 0 0; }
```

- [ ] **Step 4: renderReport + текст усечения** —

`src/features/exportReport.ts`: import `{ buildWidgetSql }` из `'../core/resultQuery'` и `EXPORT_ROW_CAP` уже есть в exportHtml — добавить его в существующий import из `'../core/exportHtml'`. Заменить `const result = arrowToRows(await client.query(b.sql))` на:

```ts
      const result = arrowToRows(await client.query(buildWidgetSql(b.sql, EXPORT_ROW_CAP)))
```

`src/core/exportHtml.ts`, `renderTable`: точного «из N строк» больше нет (N — это cap+1 от LIMIT, врать нельзя). Заменить вычисление `cap`:

```ts
  const cap =
    result.rows.length > EXPORT_ROW_CAP
      ? `<p class="qb-cap">таблица усечена: первые ${EXPORT_ROW_CAP} строк</p>`
      : ''
```

Если `exportHtml.test.ts` утверждал старый текст «первые X из Y строк» — обнови ожидание.

- [ ] **Step 5: Гейт + коммит**

Run: `npm test` и `npm run build` — зелёные.

```bash
git add src/core/resultQuery.ts src/core/resultQuery.test.ts src/components/WidgetBlockView.tsx src/features/exportReport.ts src/core/exportHtml.ts src/index.css
git commit -m "fix(report): cap widget result materialization at WIDGET_ROW_CAP - unbounded SELECT froze the tab on pin/rehydration/export"
```

---

### Задача 11: Фильтры — «до»-дата включительно + NULL-бакет в set-фильтре

**IMPORTANT ×2.** (a) `ts <= '2024-01-31'` сравнивает с полуночью — «до» отрезает весь последний день у TIMESTAMP-колонок. (b) Попап фильтра складывает NULL в `''`, а `col::VARCHAR IN ('')` для NULL-строк даёт NULL → отметка «∅» не находит ничего. Попутно: DISTINCT-список без ORDER BY, «применить» активна при нуле галочек.

**Files:**
- Modify: `src/core/resultQuery.ts` (тип `ColumnFilter['set']` + предикаты)
- Test: `src/core/resultQuery.test.ts`
- Modify: `src/components/ColumnFilter.tsx`
- Modify: `src/components/ResultPanel.tsx` (текст чипа set-фильтра — только если чип печатает `f.values`)

**Interfaces:**
- Produces: тип set-фильтра становится `{ col: string; type: 'set'; values: string[]; includeNull?: boolean }`.

- [ ] **Step 1: Красные тесты** — в `src/core/resultQuery.test.ts`:

```ts
it('date max bound includes the whole end day (TIMESTAMP columns)', () => {
  const where = buildWhere(['ts'], {
    ...DEFAULT_VIEW,
    filters: [{ col: 'ts', type: 'date', min: null, max: '2024-01-31' }],
  })
  expect(where).toBe(`WHERE ("ts" < '2024-01-31'::DATE + INTERVAL 1 DAY)`)
})

it('set filter with includeNull matches NULL rows via IS NULL', () => {
  const where = buildWhere(['c'], {
    ...DEFAULT_VIEW,
    filters: [{ col: 'c', type: 'set', values: ['x'], includeNull: true }],
  })
  expect(where).toBe(`WHERE ("c"::VARCHAR IN ('x') OR "c" IS NULL)`)
})

it('set filter with ONLY the null bucket', () => {
  const where = buildWhere(['c'], {
    ...DEFAULT_VIEW,
    filters: [{ col: 'c', type: 'set', values: [], includeNull: true }],
  })
  expect(where).toBe(`WHERE ("c" IS NULL)`)
})

it('empty set and no null bucket -> no predicate', () => {
  expect(
    buildWhere(['c'], { ...DEFAULT_VIEW, filters: [{ col: 'c', type: 'set', values: [] }] }),
  ).toBe('')
})
```

Run → FAIL (тип + предикаты).

- [ ] **Step 2: Реализация core** — в `src/core/resultQuery.ts`:

1. Тип:

```ts
  | { col: string; type: 'set'; values: string[]; includeNull?: boolean }
```

2. В `columnPredicate` заменить ветки `date` и `set`:

```ts
  if (f.type === 'date') {
    const parts: string[] = []
    if (f.min) parts.push(`${col} >= ${quoteLiteral(f.min)}`)
    // «до» включительно: `<= 'YYYY-MM-DD'` сравнивал бы с полуночью и отрезал
    // весь последний день у TIMESTAMP — сравниваем строго со следующим днём.
    if (f.max) parts.push(`${col} < ${quoteLiteral(f.max)}::DATE + INTERVAL 1 DAY`)
    return parts.length ? `(${parts.join(' AND ')})` : null
  }
  // set: NULL не ловится через IN (NULL IN (...) -> NULL) — отдельный IS NULL.
  const inList = f.values.length
    ? `${col}::VARCHAR IN (${f.values.map((v) => quoteLiteral(v)).join(', ')})`
    : null
  const nullPred = f.includeNull ? `${col} IS NULL` : null
  const parts = [inList, nullPred].filter(Boolean)
  return parts.length ? `(${parts.join(' OR ')})` : null
```

Run: `npm test -- resultQuery` → PASS (обнови существующие exact-string тесты set/date, если они утверждали старые предикаты).

- [ ] **Step 3: ColumnFilter UI** — в `src/components/ColumnFilter.tsx`:

1. Состояние: `distinct` хранит `(string | null)[]`, NULL — отдельной галочкой:

```ts
  const [distinct, setDistinct] = useState<(string | null)[] | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [nullChecked, setNullChecked] = useState(false)
```

2. Эффект: не сворачивать NULL в `''`, отсортировать:

```ts
  useEffect(() => {
    const q = `SELECT DISTINCT ${quoteIdent(col)}::VARCHAR AS v FROM ${quoteIdent(resultTempName(tabId))} ORDER BY v LIMIT ${DISTINCT_MAX + 1}`
    void client.query(q).then((t) => {
      const vals = arrowToRows(t).rows.map((r) => (r.v === null ? null : String(r.v)))
      setDistinct(vals.length <= DISTINCT_MAX ? vals : null)
    }).catch(() => setDistinct(null))
  }, [tabId, col, client])
```

3. `applySet`:

```ts
  function applySet() {
    onApply({ col, type: 'set', values: [...checked], ...(nullChecked ? { includeNull: true } : {}) })
  }
```

4. Рендер списка + disabled на «применить»:

```tsx
            <div className="cf-list">
              {distinct.map((v) => (
                <label key={v ?? '∅'}>
                  <input
                    type="checkbox"
                    checked={v === null ? nullChecked : checked.has(v)}
                    onChange={(e) => {
                      if (v === null) { setNullChecked(e.target.checked); return }
                      const n = new Set(checked)
                      if (e.target.checked) n.add(v)
                      else n.delete(v)
                      setChecked(n)
                    }}
                  />
                  {v === null ? '∅ (null)' : v === '' ? '(пусто)' : v}
                </label>
              ))}
            </div>
            <div className="cf-actions">
              <button onClick={applySet} disabled={checked.size === 0 && !nullChecked}>применить</button>
              <button onClick={onClose}>отмена</button>
            </div>
```

- [ ] **Step 4: Чип фильтра** — в `src/components/ResultPanel.tsx` найти место, где чип set-фильтра печатает значения (поиск `values` / `f.values` в JSX). Если печатает — добавить `∅` при `includeNull`, например заменить `f.values.join(', ')` на `[...f.values, ...(f.includeNull ? ['∅'] : [])].join(', ')`. Если чип значений не печатает — шаг пропустить.

- [ ] **Step 5: Гейт + коммит**

Run: `npm test` и `npm run build` — зелёные.

```bash
git add src/core/resultQuery.ts src/core/resultQuery.test.ts src/components/ColumnFilter.tsx src/components/ResultPanel.tsx
git commit -m "fix(filters): inclusive date upper bound and a real NULL bucket in the set filter; ordered distinct list"
```

---

### Задача 12: Профиль — `GROUP BY 1` (колонка `bucket`) + `TIMESTAMP_NS`

**IMPORTANT.** (a) `buildHistogramQuery` группирует `GROUP BY bucket` — реальная колонка `bucket` в таблице (A/B-тесты!) перехватывает алиас → Binder Error, профиль падает целиком. (b) `classifyColumn` не матчит `TIMESTAMP_NS/_MS/_S` (`\b` не срабатывает перед `_`) — parquet с наносекундными таймстампами (pandas default) профилируется как highCardinality вместо range.

**Files:**
- Modify: `src/core/profile.ts` (`buildHistogramQuery`, `classifyColumn`)
- Test: `src/core/profile.test.ts`

**Interfaces:** сигнатуры не меняются; SQL-контракт гистограммы: алиасы `bucket`/`n` остаются (их читает `interpretHistogram`), меняется только `GROUP BY`/`ORDER BY` на позиционные.

- [ ] **Step 1: Красные тесты** — в `src/core/profile.test.ts`:

```ts
it('histogram groups by position so a real column named "bucket" cannot shadow the alias', () => {
  const sql = buildHistogramQuery('t', 'rev', 0, 10, 12)
  expect(sql).toContain('GROUP BY 1 ORDER BY 1')
  expect(sql).not.toContain('GROUP BY bucket')
})

it('classifies TIMESTAMP_NS / TIMESTAMP_MS / TIMESTAMP_S as range', () => {
  expect(classifyColumn('TIMESTAMP_NS', 1000, 50)).toBe('range')
  expect(classifyColumn('TIMESTAMP_MS', 1000, 50)).toBe('range')
  expect(classifyColumn('TIMESTAMP_S', 1000, 50)).toBe('range')
})
```

Run → FAIL (оба).

- [ ] **Step 2: Реализация** — в `src/core/profile.ts`:

1. В `buildHistogramQuery` заменить хвост запроса `GROUP BY bucket ORDER BY bucket` на `GROUP BY 1 ORDER BY 1`:

```ts
  return (
    `SELECT least(${bins} - 1, floor((${c} - ${lo}) / ((${hi} - ${lo}) / ${bins})))::INT AS bucket, ` +
    `count(*) AS n FROM ${quoteIdent(table)} WHERE ${c} IS NOT NULL GROUP BY 1 ORDER BY 1`
  )
```

2. В `classifyColumn` заменить `if (/^(DATE|TIMESTAMP|TIME)\b/.test(t)) return 'range'` на:

```ts
  if (/^(DATE|TIMESTAMP|TIME)/.test(t)) return 'range'
```

Обнови существующие exact-string тесты гистограммы, если они утверждали `GROUP BY bucket`.

- [ ] **Step 3: Гейт + коммит**

Run: `npm test` и `npm run build` — зелёные.

```bash
git add src/core/profile.ts src/core/profile.test.ts
git commit -m "fix(profile): positional GROUP BY (column named bucket broke the whole profile) and TIMESTAMP_NS/_MS/_S classified as range"
```

---

### Задача 13: Тесты на `useSchemaActions` — единственный непокрытый оркестратор

**IMPORTANT (тест-долг).** Apply-оркестрация схемы (M2, `TRY_CAST` — явно названная TDD-территория в CLAUDE.md) не покрыта ни на одном уровне, при том что все её собратья (`useProfileActions`, `useMartActions`, `useResultActions` после Задачи 6) покрыты. Зеркалим паттерн `useProfileActions.test.ts` (стаб-клиент, реальный стор).

**Files:**
- Create: `src/features/useSchemaActions.test.ts`

**Interfaces:** только читает существующие: `useSchemaActions(client).apply/applyInferred`, стор-действия.

- [ ] **Step 1: Написать тесты** — создать `src/features/useSchemaActions.test.ts`:

```ts
import { tableFromJSON } from 'apache-arrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSchemaActions } from './useSchemaActions'
import { useSession, type Dataset } from '../state/session'

// Оркестратор: materialize DDL -> loss query -> describe -> setApplied;
// ошибка -> setSchemaError (не throw). Стаб-клиент, реальный стор — по образцу
// useProfileActions.test.ts.

const ds = (): Dataset => ({
  table: 'events',
  fileName: 'events.csv',
  bytes: 10,
  kind: 'csv',
  columns: [{ name: 'id', type: 'VARCHAR' }],
  rawTable: '_qb_raw_events',
  suggested: [{ name: 'id', type: 'BIGINT' }],
  schemaConfig: [{ origName: 'id', name: 'id', type: 'BIGINT', include: true }],
  schemaError: null,
})

function okClient() {
  return {
    exec: vi.fn(async () => undefined),
    query: vi.fn(async () => tableFromJSON([{ l0: 2n }])), // loss query: 2 значения -> NULL
    describeTable: vi.fn(async () => [{ name: 'id', type: 'BIGINT' }]),
  } as unknown as Parameters<typeof useSchemaActions>[0]
}

beforeEach(() => {
  useSession.getState().reset()
})

describe('useSchemaActions.apply', () => {
  it('re-materializes from the raw table, counts losses, commits via setApplied', async () => {
    useSession.getState().addDataset(ds())
    const client = okClient()
    await useSchemaActions(client).apply('events')

    expect(client.exec).toHaveBeenCalledWith(
      'CREATE OR REPLACE TABLE "events" AS SELECT TRY_CAST("id" AS BIGINT) AS "id" FROM "_qb_raw_events"',
    )
    const d = useSession.getState().datasets[0]
    expect(d.columns).toEqual([{ name: 'id', type: 'BIGINT', nullLoss: 2 }])
    expect(d.schemaError).toBeNull()
    expect(d.profile).toBeUndefined() // setApplied сбрасывает кэш профиля
  })

  it('routes a DuckDB error to setSchemaError instead of throwing', async () => {
    useSession.getState().addDataset(ds())
    const client = okClient()
    ;(client.exec as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Binder Error'))
    await useSchemaActions(client).apply('events')
    expect(useSession.getState().datasets[0].schemaError).toContain('Binder Error')
  })

  it('is a no-op for parquet and unknown datasets', async () => {
    useSession.getState().addDataset({ ...ds(), kind: 'parquet', rawTable: undefined })
    const client = okClient()
    await useSchemaActions(client).apply('events')
    await useSchemaActions(client).apply('nope')
    expect(client.exec).not.toHaveBeenCalled()
  })

  it('applyInferred stages suggested types then applies them', async () => {
    useSession.getState().addDataset({
      ...ds(),
      schemaConfig: [{ origName: 'id', name: 'id', type: 'VARCHAR', include: true }],
    })
    const client = okClient()
    await useSchemaActions(client).applyInferred('events')
    expect(useSession.getState().datasets[0].schemaConfig?.[0].type).toBe('BIGINT')
    expect(client.exec).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Прогнать**

Run: `npm test -- useSchemaActions`
Expected: PASS с первого раза (код уже написан — это пин поведения). Если DDL-строка в первом тесте не совпала — возьми фактическую из вывода `buildMaterializeDDL` и сверь с `castBuilder.test.ts`, прежде чем менять ожидание: тест должен утверждать РЕАЛЬНЫЙ контракт, а не подгонку.

- [ ] **Step 3: Гейт + коммит**

Run: `npm test` и `npm run build` — зелёные.

```bash
git add src/features/useSchemaActions.test.ts
git commit -m "test(schema): pin useSchemaActions orchestration - DDL, loss counting, error routing, applyInferred"
```

---

### Задача 14: Мёртвый код (после M8-переезда на окна)

**MINOR, батч.** Подтверждённый ревью мёртвый код. Правило: перед каждым удалением — поиск по `src/` (включая тесты); если нашёлся продакшн-потребитель — НЕ удалять, записать в отчёт задачи. Зависимость: после Задачи 6 (она сняла последние вызовы `setWindowLoading`).

**Files:**
- Modify: `src/core/sql.ts`, `src/core/sql.test.ts` — `buildSelectAll`, `buildLoadCsv` (используются только своими тестами)
- Modify: `src/state/session.ts`, `src/state/session.test.ts` — `Tab.result` + `setTabResult`, `resetView`, `windowLoading` + `setWindowLoading`
- Modify: `src/components/Icon.tsx` — глиф `'save'` (никто не рендерит)
- Modify: `src/index.css` — блок `.schema-btn.apply` (класс никогда не вешается)

**Interfaces:** ничего не производит; удаления не должны менять поведение.

- [ ] **Step 1: sql.ts** — поиск `buildSelectAll` и `buildLoadCsv` по `src/`: ожидаются только `sql.ts` + `sql.test.ts`. Удалить обе функции и их `describe`-блоки из теста, убрать из import в тесте.

- [ ] **Step 2: session.ts** — поиск по `src/` для каждого:
  - `setTabResult` и `Tab.result` (поле `result: QueryResult | null`): ожидаются только session.ts + session.test.ts. Удалить: поле из `Tab`, строку из интерфейса, реализацию, `result: null` из конструкторов табов в `openOrFocusTab`/`openBlankTab`/`seedTabs`, тест(ы) на `setTabResult` (заголовок теста на строке ~83 переименовать: `'updateTabSql / setTabError mutate the right tab'` и убрать вызов).
  - `resetView`: аналогично (интерфейс + реализация + кусок теста ~538-546; `patchView`-часть теста оставить).
  - `windowLoading` + `setWindowLoading`: поле из `Tab`, интерфейс, реализация; убрать `windowLoading: false` из `setRawResult` и `setWindow`. Компоненты его не читают (проверь поиском `windowLoading` по `src/` — после Задачи 6 не должно остаться ни одного вхождения вне session).

- [ ] **Step 3: Icon + CSS** — в `src/components/Icon.tsx` найти глиф `save`; поиск `"save"`/`'save'` по `src/` — если рендера нет, удалить запись. В `src/index.css` удалить правило `.schema-btn.apply { ... }` (строки ~311-313). Правило `.th-filter.on` НЕ удалять — это недоделанный индикатор активного фильтра, он уходит в бэклог (Задача 15).

- [ ] **Step 4: Гейт + коммит**

Run: `npm test` и `npm run build` — зелёные (build с `noUnusedLocals` поймает хвосты).

```bash
git add -A src/
git commit -m "chore: remove dead code - buildSelectAll/buildLoadCsv, Tab.result/setTabResult, resetView, windowLoading, save glyph, .schema-btn.apply"
```

---

### Задача 15: Бэклог + документация

**Files:**
- Modify: `docs/BACKLOG.md` (новая секция известных-принятых миноров из ревью)
- Modify: `README.md` (путь к скоупу)
- Modify: `CLAUDE.md` (путь к скоупу)
- Modify: `docs/scope-quackbook-v1.md` (аннотация про вырезанный key-хинт)

- [ ] **Step 1: BACKLOG** — в `docs/BACKLOG.md` после секции M7a-миноров вставить:

```markdown
### Известные-принятые (минор, из внешнего ревью 2026-07-02 — не блокеры, фиксируем чтоб не потерять)

- [ ] **`profileResult` профилирует не то, что просят.** Для `paged`-таба переиспользует `_qb_result_<tab>` последнего запуска (аргумент `sql` игнорируется), для raw-таба материализует ТЕКУЩИЙ черновик редактора, который мог не запускаться. Выбрать одну семантику (профиль отображаемого результата) и передавать SQL последнего запуска. Оценка: S.
- [ ] **Explore: двойной fetch окна.** При первом запуске (`view` undefined → DEFAULT_VIEW) и при каждом переключении таба view-эффект перезапрашивает страницу, уже лежащую в сторе. Latest-wins спасает от вреда, но по лишнему запросу на ран/переключение. Guard «view реально поменялся». Оценка: S.
- [ ] **Перерендер на каждый кейстрок.** `updateTabSql` → новый `tabs` → Rail (regex-прогоны pruning), TabStrip, ResultPanel, полный ResultGrid реконсилируются на каждый символ. `React.memo(ResultGrid)` — дешёвый первый шаг. Оценка: XS–S.
- [ ] **Виджет отчёта: мёртвые контролы грида.** `ResultGrid` в отчёте получает no-op `onToggleSort`/`onOpenFilter`, но заголовки кликабельны и ⏷ рисуется. Сделать колбэки опциональными и прятать аффордансы. Оценка: XS.
- [ ] **`Report.tsx` save(): синхронный `revokeObjectURL` после `click()`.** Может оборвать скачивание; `downloadHtml` уже делает отложенный revoke — выровнять. Оценка: XS.
- [ ] **SqlEditor resize: нет `pointercancel`.** После отменённого драга (touch/alt-tab) `pointermove` остаётся на хэндле — ресайз без зажатой кнопки. Добавить `pointercancel` или выход при `ev.buttons === 0`. Оценка: XS.
- [ ] **ProfilePanel: вечное «считаю профиль…» после re-apply.** `setApplied` чистит `ds.profile`, панель показывает спиннер, хотя ничего не считается. Различать «не посчитано» и «считается». Оценка: XS.
- [ ] **Toast: таймер не перезапускается при повторе того же сообщения; нет `role="status"`/`aria-live`.** Оценка: XS.
- [ ] **a11y: dropzone и табы недоступны с клавиатуры.** `CsvDropzone` — кликабельный div без role/tabIndex/key-хендлера; `TabStrip` — div-табы. (+ уже записанный focus-trap `AboutModal`.) Оценка: S.
- [ ] **`exportQuery`: фиксированное имя `qb-export.*` и нет `finally`-очистки.** Двойной экспорт коллидирует; упавший `copyFileToBuffer` течёт виртуальным файлом. Уникальный суффикс + try/finally. Оценка: XS.
- [ ] **TOCTOU-гонки идемпотентности: `loadDemoData` / `Shell.handleFiles`.** Двойной клик/дроп может продублировать датасет (проверка `datasets.some` до async-работы). Module-level in-flight promise / in-flight guard. Оценка: XS.
- [ ] **pruning: `a * b` подсвечивает все колонки; ASCII-only токены.** Арифметическая `*` трактуется как `SELECT *`; кириллические/пробельные имена колонок никогда не подсвечиваются. Оценка: S.
- [ ] **`dedupeColumnNames`: ['id','id','id_1'] → второй `id_1` затирает первый.** Вести seen-set по УЖЕ выданным именам. Оценка: XS.
- [ ] **Нет guard на `_qb_`-префикс имён файлов.** Файл `_qb_raw_events.csv` клоберит внутреннюю raw-таблицу `events` и невидим в рейле. Один `isInternalTable`-чек в `loadOneFile` (переименовать с префиксом `f_`, например). Оценка: XS.
- [ ] **Кириллическое имя файла → `________`.** `tableNameFromFilename('продажи.csv')` даёт подчёркивания; fallback `'table'` не срабатывает. Оценка: XS.
- [ ] **`.th-filter.on` не вешается.** CSS-правило индикатора активного фильтра есть, класс в `ResultGrid` не ставится — колонка с фильтром не помечена. Довести или удалить правило. Оценка: XS.
- [ ] **toggleSort-цикл в `ResultPanel` — логика вне core.** asc→desc→remove + additive multi-sort — тестируемая логика в компоненте (TDD-граница CLAUDE.md). Вынести `cycleSort()` в `core/resultQuery.ts` под тесты. Оценка: S.
- [ ] **Инфра-спринт (отдельным решением):** `noUncheckedIndexedAccess` в tsconfig (шумно, но ловит `rows[0]` на пустых результатах); type-aware ESLint (`recommendedTypeChecked` + `no-floating-promises`); CI-workflow на PR/ветках (сейчас гейт только на push в main). Оценка: M.
- [ ] **`stripTrailingSemicolon` снимает только один `;`.** `SELECT 1;;` или `SELECT 1; -- комм` по-прежнему ломают обёртки. Редко; при желании — срезать хвостовые комментарии/повторные `;`. Оценка: XS.
```

- [ ] **Step 2: пути к скоупу** — в `README.md` (строка ~7) и `CLAUDE.md` заменить упоминание `scope-quackbook-v1.md` на `docs/scope-quackbook-v1.md` (файл лежит в docs/, ссылки битые).

- [ ] **Step 3: аннотация key-хинта** — в `docs/scope-quackbook-v1.md` к пункту про key-хинт (секция «В скоупе v1», строка ~67 «**Key-хинт от Профиля**…») добавить в конец пункта: ` *(вырезан из v1 решением — см. DECISIONS.md, 2026-06-22; остаётся в v1.5)*`.

- [ ] **Step 4: Гейт + коммит**

Run: `npm test` и `npm run build` — зелёные (docs не влияют, но гейт обязателен).

```bash
git add docs/BACKLOG.md README.md CLAUDE.md docs/scope-quackbook-v1.md
git commit -m "docs: backlog entries from 2026-07-02 review; fix scope path references; annotate cut key-hint"
```

---

## Порядок и зависимости

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15.
Жёсткие зависимости: **2 перед 10** (`stripTrailingSemicolon`), **6 перед 14** (`setWindowLoading`). Остальные независимы.

## Финальная приёмка (после всех задач)

- [ ] `npm test` — все зелёные (ожидается ~260+ тестов).
- [ ] `npm run lint` — 0 errors / 0 warnings.
- [ ] `npm run build` — успех.
- [ ] Ручная приёмка в браузере (`npm run dev`): (а) текст-блок с `<img src=x onerror=alert(1)>` рендерится как текст; (б) demo-таб: даты не epoch-millis; (в) параллельный медленный+быстрый запуск в одном табе — остаётся результат последнего; (г) Reset при витрине-VIEW → загрузка файла с тем же именем работает.
