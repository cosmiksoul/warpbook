# M10 «Автопрофиль» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Кнопка «в отчёт» на источнике превращает профиль датасета в живой черновик отчёта из исполняемых SQL-ячеек (null-карта, гистограммы числовых, top-K категориальных).

**Architecture:** Чистый генератор `core/autoprofile.ts` строит блоки (text/widget v1 — формат отчёта НЕ меняется) из кэша профиля M3; новый редьюсер `appendBlocks` минтит id и дописывает их в конец отчёта; ячейки M7b исполняются сами при монтировании. Мини-расширение chart-слоя `xNumericStrings` даёт гистограммам бары в порядке бакетов.

**Tech Stack:** React 19 + TS + Zustand 5, DuckDB-WASM, Observable Plot, Vitest (node env, БЕЗ jsdom — компоненты не тестируются юнитами).

## Global Constraints

- Спека: `docs/superpowers/specs/2026-07-06-warpbook-m10-autoprofile-design.md` — источник истины.
- Гейт КАЖДОЙ задачи: `npm test`; затем `npm run build` (полный type-check); затем `npm run lint` — ТРИ отдельные команды, все зелёные, lint 0 errors / 0 warnings.
- 0 новых npm-зависимостей. `package.json` не трогать.
- `src/core/report.ts` НЕ менять (формат отчёта v1 остаётся).
- UI-строки русские, в духе существующих («в отчёт», «null-карта», «распределение», «топ значений»).
- Брендинг «warpbook» в UI; внутренние идентификаторы quackbook (`_qb_`, `quackbook.*`, `blk-`) не переименовывать.
- Коммиты русские, conventional (`feat(autoprofile): …`), каждый с трейлером `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; multi-line месседж — bash here-doc.
- Константы M3 переиспользуются импортом из `src/core/profile.ts`: `THRESHOLD_DISTINCT = 50`, `TOP_K = 7`, `HISTOGRAM_BINS = 12`. Новая константа капа: `PROFILE_CELL_CAP = 8`.

---

### Task 1: chartSpec — числовые строковые лейблы X (`xNumericStrings`)

**Files:**
- Modify: `src/core/chartSpec.ts`
- Modify: `src/components/plotFigure.ts`
- Test: `src/core/chartSpec.test.ts` (существующий — дописать describe)

**Interfaces:**
- Consumes: `ChartSpec`, `buildChartSpec(columns, sample?)` — существующие.
- Produces: `ChartSpec.xNumericStrings?: boolean` — ставится, когда sample-значение X-колонки — непустая строка, парсящаяся в конечное число. `plotFigure` при этом флаге мапит X в `Number` и НЕ ставит `sort: {x:'-y'}` (ординальный домен из чисел Plot сортирует по возрастанию → бары в порядке бакетов).

- [ ] **Step 1: Красный тест**

В `src/core/chartSpec.test.ts` дописать:

```ts
describe('xNumericStrings (M10)', () => {
  const cols = [
    { name: 'от', type: 'Utf8' },
    { name: 'строк', type: 'Int64' },
  ]
  it('числовая строка в X — ставит xNumericStrings', () => {
    const spec = buildChartSpec(cols, { от: '3400.25', строк: 10 })
    expect(spec).toMatchObject({ kind: 'bar', x: 'от', y: 'строк', xNumericStrings: true })
    expect(spec?.xDates).toBeUndefined()
  })
  it('обычная категория — БЕЗ xNumericStrings (value-ranking не задет)', () => {
    const spec = buildChartSpec(cols, { от: 'Adelie', строк: 10 })
    expect(spec?.xNumericStrings).toBeUndefined()
  })
  it('ISO-дата остаётся xDates, не xNumericStrings', () => {
    const spec = buildChartSpec(cols, { от: '2025-04-09', строк: 10 })
    expect(spec?.xDates).toBe(true)
    expect(spec?.xNumericStrings).toBeUndefined()
  })
  it('пустая строка и мусор — не числовые', () => {
    expect(buildChartSpec(cols, { от: '', строк: 1 })?.xNumericStrings).toBeUndefined()
    expect(buildChartSpec(cols, { от: '12abc', строк: 1 })?.xNumericStrings).toBeUndefined()
  })
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npx vitest run src/core/chartSpec.test.ts`
Expected: FAIL — `xNumericStrings` undefined в первом кейсе.

- [ ] **Step 3: Реализация в `chartSpec.ts`**

В интерфейс `ChartSpec` добавить поле (после `xDates?: boolean`):

```ts
  // X-значения — числовые СТРОКИ (напр. `bucket::VARCHAR` автопрофиля): plotFigure
  // мапит их в Number и не сортирует бары по -y — порядок бакетов сохраняется.
  xNumericStrings?: boolean
```

Хелпер рядом с `isIsoDateString`:

```ts
/** Non-empty string that parses to a finite number (histogram bucket labels). */
function isNumericString(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))
}
```

В `buildChartSpec` после вычисления `dateString`:

```ts
  const numericString = !dateString && isNumericString(sample?.[x.name])
```

и после `if (dateString) spec.xDates = true`:

```ts
  if (numericString) spec.xNumericStrings = true
```

- [ ] **Step 4: Зелёный**

Run: `npx vitest run src/core/chartSpec.test.ts`
Expected: PASS (все, включая старые).

- [ ] **Step 5: Ветка в `plotFigure.ts`**

Заменить вычисление `data` и bar-марк (сейчас строки 15-21):

```ts
  const data = spec.xDates
    ? rows.map((r) => ({ ...r, [spec.x]: r[spec.x] == null ? null : new Date(String(r[spec.x])) }))
    : spec.xNumericStrings
      ? rows.map((r) => ({ ...r, [spec.x]: r[spec.x] == null ? null : Number(r[spec.x]) }))
      : rows
  const mark =
    spec.kind === 'bar'
      ? Plot.barY(data, {
          x: spec.x,
          y: spec.y,
          // Гистограммы (числовые лейблы) — в порядке бакетов; категории — value-ranking.
          ...(spec.xNumericStrings ? {} : { sort: { x: '-y' } }),
          fill: seriesColor,
        })
      : Plot.lineY(data, { x: spec.x, y: spec.y, stroke: seriesColor, strokeWidth: 2 })
```

(Имя локальной переменной марка сверить с текущим кодом файла — заменить существующее выражение, не дублировать.)

- [ ] **Step 6: Гейт + коммит**

Run: `npm test` → все зелёные; `npm run build` → ok; `npm run lint` → 0/0.

```bash
git add src/core/chartSpec.ts src/core/chartSpec.test.ts src/components/plotFigure.ts
git commit -m "feat(chart): xNumericStrings — числовые строковые лейблы X держат порядок бакетов

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: autoprofile — SQL-билдеры (TDD)

**Files:**
- Create: `src/core/autoprofile.ts`
- Test: `src/core/autoprofile.test.ts`

**Interfaces:**
- Consumes: `quoteIdent(name): string`, `quoteLiteral(value): string` из `src/core/sql.ts`; `HISTOGRAM_BINS`, `TOP_K` из `src/core/profile.ts`.
- Produces:
  - `PROFILE_CELL_CAP = 8` (export const);
  - `buildNullMapSql(table: string, columns: string[]): string`;
  - `buildHistogramCellSql(table: string, col: string): string`;
  - `buildTopKSql(table: string, col: string): string`.

- [ ] **Step 1: Красный тест**

`src/core/autoprofile.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildHistogramCellSql, buildNullMapSql, buildTopKSql } from './autoprofile'

describe('buildNullMapSql', () => {
  it('long-форма: UNION ALL по колонкам, сортировка по null desc', () => {
    const sql = buildNullMapSql('t', ['a', 'b'])
    expect(sql).toContain(`SELECT 'a' AS "колонка"`)
    expect(sql).toContain('UNION ALL')
    expect(sql).toContain(`count(*) FILTER (WHERE "b" IS NULL)`)
    expect(sql).toContain('greatest(count(*), 1)') // guard деления на 0
    expect(sql.trim().endsWith('ORDER BY "null" DESC, "колонка"')).toBe(true)
  })
  it('кривые имена: идент квотится, литерал эскейпится', () => {
    const sql = buildNullMapSql('t', [`we"ird`, `o'brien`])
    expect(sql).toContain(`"we""ird" IS NULL`)
    expect(sql).toContain(`'o''brien' AS "колонка"`)
  })
})

describe('buildHistogramCellSql', () => {
  it('самодостаточный CTE, 12 бакетов, строковый лейбл, числовой ORDER', () => {
    const sql = buildHistogramCellSql('t', 'mass')
    expect(sql).toContain('WITH s AS (SELECT min("mass") AS lo, max("mass") AS hi')
    expect(sql).toContain('nullif(s.hi - s.lo, 0)') // защита lo==hi
    expect(sql).toContain('* 12,') // HISTOGRAM_BINS
    expect(sql).toContain('::VARCHAR AS "от"')
    expect(sql).toContain('ORDER BY min("mass")')
    expect(sql).not.toMatch(/\b\d+\.\d+\b/) // никаких зашитых min/max-констант
  })
})

describe('buildTopKSql', () => {
  it('top-7 с детерминированным tiebreak и без NULL', () => {
    const sql = buildTopKSql('t', 'species')
    expect(sql).toContain(`"species" AS "значение"`)
    expect(sql).toContain('WHERE "species" IS NOT NULL')
    expect(sql).toContain('ORDER BY 2 DESC, 1 LIMIT 7')
  })
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npx vitest run src/core/autoprofile.test.ts`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Реализация `src/core/autoprofile.ts`**

```ts
import { HISTOGRAM_BINS, TOP_K } from './profile'
import { quoteIdent, quoteLiteral } from './sql'

/** Максимум пер-колоночных ячеек в черновике (null-карта не считается). */
export const PROFILE_CELL_CAP = 8

/**
 * Null-карта таблицы long-формой: по строке на колонку (имя, счётчик null, %),
 * сортировка «худшие сверху». greatest(count,1) — guard деления на 0 строк.
 */
export function buildNullMapSql(table: string, columns: string[]): string {
  const t = quoteIdent(table)
  const parts = columns.map(
    (c) =>
      `SELECT ${quoteLiteral(c)} AS "колонка", ` +
      `count(*) FILTER (WHERE ${quoteIdent(c)} IS NULL) AS "null", ` +
      `round(100.0 * count(*) FILTER (WHERE ${quoteIdent(c)} IS NULL) / greatest(count(*), 1), 1) AS "%" ` +
      `FROM ${t}`,
  )
  return `SELECT * FROM (\n  ${parts.join('\n  UNION ALL\n  ')}\n) ORDER BY "null" DESC, "колонка"`
}

/**
 * Гистограмма ячейкой: САМОДОСТАТОЧНЫЙ SQL — min/max берутся CTE, не зашиты
 * константами (ячейка переживает смену данных и редактируется). Лейбл бакета —
 * ::VARCHAR (нижняя граница): buildChartSpec увидит нечисловой X и включит
 * xNumericStrings → бары в порядке бакетов. ORDER BY min(col) — числовой.
 */
export function buildHistogramCellSql(table: string, col: string): string {
  const t = quoteIdent(table)
  const c = quoteIdent(col)
  const n = HISTOGRAM_BINS
  return [
    `WITH s AS (SELECT min(${c}) AS lo, max(${c}) AS hi FROM ${t} WHERE ${c} IS NOT NULL)`,
    `SELECT round(s.lo + floor(least((${c} - s.lo) / nullif(s.hi - s.lo, 0) * ${n}, ${n - 1})) * (s.hi - s.lo) / ${n}, 2)::VARCHAR AS "от",`,
    `       count(*) AS "строк"`,
    `FROM ${t}, s`,
    `WHERE ${c} IS NOT NULL`,
    `GROUP BY 1 ORDER BY min(${c})`,
  ].join('\n')
}

/** Top-K значений категориальной колонки (NULL-бакет исключён, tiebreak по значению). */
export function buildTopKSql(table: string, col: string): string {
  const t = quoteIdent(table)
  const c = quoteIdent(col)
  return `SELECT ${c} AS "значение", count(*) AS "строк"\nFROM ${t}\nWHERE ${c} IS NOT NULL\nGROUP BY 1 ORDER BY 2 DESC, 1 LIMIT ${TOP_K}`
}
```

- [ ] **Step 4: Зелёный**

Run: `npx vitest run src/core/autoprofile.test.ts`
Expected: PASS.

- [ ] **Step 5: Гейт + коммит**

`npm test`; `npm run build`; `npm run lint` — три команды, зелёные.

```bash
git add src/core/autoprofile.ts src/core/autoprofile.test.ts
git commit -m "feat(autoprofile): SQL-билдеры null-карты, гистограммы (CTE) и top-K — TDD

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: autoprofile — генератор черновика `buildProfileDraft` (TDD)

**Files:**
- Modify: `src/core/autoprofile.ts`
- Test: `src/core/autoprofile.test.ts` (дописать)

**Interfaces:**
- Consumes: `ColumnProfile`, `THRESHOLD_DISTINCT` из `src/core/profile.ts`; `TextBlock`, `WidgetBlock` из `src/core/report.ts` (только типы); билдеры Task 2.
- Produces:
  - `type DraftBlock = Omit<TextBlock, 'id'> | Omit<WidgetBlock, 'id'>` (export);
  - `buildProfileDraft(input: { table: string; fileName: string; rowCount: number; columns: ColumnProfile[] }): DraftBlock[]`.

- [ ] **Step 1: Красный тест** (дописать в `autoprofile.test.ts`)

```ts
import { buildProfileDraft, PROFILE_CELL_CAP, type DraftBlock } from './autoprofile'
import type { ColumnProfile } from './profile'

const num = (name: string, min = 0, max = 100): ColumnProfile => ({
  name, type: 'DOUBLE', distinct: 42, nullCount: 0, kind: 'numeric',
  stats: { min, median: (min + max) / 2, max },
})
const cat = (name: string, distinct = 3): ColumnProfile => ({
  name, type: 'VARCHAR', distinct, nullCount: 0, kind: 'categorical',
})
const draft = (columns: ColumnProfile[], rowCount = 344) =>
  buildProfileDraft({ table: 'demo_penguins', fileName: 'penguins.csv', rowCount, columns })
const widgets = (blocks: DraftBlock[]) => blocks.filter((b) => b.type === 'widget')

describe('buildProfileDraft', () => {
  it('состав: заголовок-текст, null-карта table, гистограмма chart, top-K chart', () => {
    const d = draft([num('mass'), cat('species')])
    expect(d[0]).toMatchObject({ type: 'text' })
    expect((d[0] as { markdown: string }).markdown).toContain('## Профиль: penguins.csv')
    expect((d[0] as { markdown: string }).markdown).toContain('344 строк')
    expect(d[1]).toMatchObject({ type: 'widget', title: 'null-карта', vizType: 'table', datasetNames: ['demo_penguins'] })
    expect(d[2]).toMatchObject({ type: 'widget', title: 'mass — распределение', vizType: 'chart' })
    expect(d[3]).toMatchObject({ type: 'widget', title: 'species — топ значений', vizType: 'chart' })
    expect(d).toHaveLength(4) // все вошли — хвоста нет
  })
  it('кап: 9 элигибельных -> 8 ячеек + хвост со списком', () => {
    const cols = Array.from({ length: 9 }, (_, i) => num(`n${i}`))
    const d = draft(cols)
    expect(widgets(d)).toHaveLength(1 + PROFILE_CELL_CAP) // null-карта + 8
    const tail = d[d.length - 1] as { type: string; markdown: string }
    expect(tail.type).toBe('text')
    expect(tail.markdown).toContain('n8')
    expect(tail.markdown).toContain('за капом')
  })
  it('eligibility: all-null numeric, узкий numeric, distinct=1, high-card и range — мимо ячеек, в хвост с причиной', () => {
    const allNull: ColumnProfile = { name: 'empty', type: 'DOUBLE', distinct: 0, nullCount: 344, kind: 'numeric' } // stats нет
    const flat = num('flat', 5, 5) // min==max
    const single = cat('constant', 1)
    const hc: ColumnProfile = { name: 'id', type: 'VARCHAR', distinct: 344, nullCount: 0, kind: 'highCardinality' }
    const dt: ColumnProfile = { name: 'ts', type: 'TIMESTAMP', distinct: 300, nullCount: 0, kind: 'range' }
    const d = draft([allNull, flat, single, hc, dt, num('ok')])
    expect(widgets(d)).toHaveLength(2) // null-карта + ok
    const tail = (d[d.length - 1] as { markdown: string }).markdown
    for (const frag of ['empty', 'flat', 'constant', 'id', 'ts', 'высокая кардинальность', 'дата/время', 'одно значение', 'нет размаха']) {
      expect(tail).toContain(frag)
    }
  })
  it('пустая таблица (0 строк, stats нет): заголовок + null-карта + хвост, ячеек нет', () => {
    const empty: ColumnProfile = { name: 'mass', type: 'DOUBLE', distinct: 0, nullCount: 0, kind: 'numeric' }
    const d = draft([empty], 0)
    expect(widgets(d)).toHaveLength(1) // только null-карта
    expect((d[0] as { markdown: string }).markdown).toContain('0 строк')
    expect((d[d.length - 1] as { markdown: string }).markdown).toContain('mass')
  })
  it('порядок отбора — как в схеме, вперемешку по kind', () => {
    const d = draft([cat('a'), num('b'), cat('c')])
    expect(widgets(d).map((w) => (w as { title: string }).title)).toEqual([
      'null-карта', 'a — топ значений', 'b — распределение', 'c — топ значений',
    ])
  })
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npx vitest run src/core/autoprofile.test.ts`
Expected: FAIL — `buildProfileDraft` не экспортируется.

- [ ] **Step 3: Реализация** (дописать в `src/core/autoprofile.ts`)

```ts
import type { ColumnProfile } from './profile'
import { THRESHOLD_DISTINCT } from './profile'
import type { TextBlock, WidgetBlock } from './report'

/** Блок без id: id минтит стор (appendBlocks) — генератор чистый. */
export type DraftBlock = Omit<TextBlock, 'id'> | Omit<WidgetBlock, 'id'>

function isEligible(c: ColumnProfile): boolean {
  if (c.kind === 'numeric') return c.stats != null && c.stats.min < c.stats.max
  if (c.kind === 'categorical') return c.distinct >= 2 && c.distinct <= THRESHOLD_DISTINCT
  return false // range, highCardinality
}

function skipReason(c: ColumnProfile): string {
  if (c.kind === 'highCardinality') return 'высокая кардинальность'
  if (c.kind === 'range') return 'дата/время'
  if (c.kind === 'numeric') return 'нет размаха значений'
  return 'одно значение'
}

/**
 * Черновик профиля: заголовок -> null-карта (всегда) -> по элигибельным колонкам
 * (порядок схемы, ≤ PROFILE_CELL_CAP) гистограмма или top-K -> хвост «без своей
 * ячейки» с причинами (за капом / причина неэлигибельности).
 */
export function buildProfileDraft(input: {
  table: string
  fileName: string
  rowCount: number
  columns: ColumnProfile[]
}): DraftBlock[] {
  const { table, fileName, rowCount, columns } = input
  const blocks: DraftBlock[] = [
    {
      type: 'text',
      markdown: `## Профиль: ${fileName}\n\n\`${table}\` · ${rowCount} строк · ${columns.length} колонок`,
    },
    {
      type: 'widget',
      title: 'null-карта',
      sql: buildNullMapSql(table, columns.map((c) => c.name)),
      datasetNames: [table],
      vizType: 'table',
      caption: '',
    },
  ]

  const eligible = columns.filter(isEligible)
  const picked = new Set(eligible.slice(0, PROFILE_CELL_CAP))
  for (const c of picked) {
    blocks.push(
      c.kind === 'numeric'
        ? { type: 'widget', title: `${c.name} — распределение`, sql: buildHistogramCellSql(table, c.name), datasetNames: [table], vizType: 'chart', caption: '' }
        : { type: 'widget', title: `${c.name} — топ значений`, sql: buildTopKSql(table, c.name), datasetNames: [table], vizType: 'chart', caption: '' },
    )
  }

  const left = columns.filter((c) => !picked.has(c))
  if (left.length > 0) {
    const items = left.map((c) => `\`${c.name}\` (${eligible.includes(c) ? 'за капом' : skipReason(c)})`)
    blocks.push({ type: 'text', markdown: `Без своей ячейки остались: ${items.join(', ')}.` })
  }
  return blocks
}
```

(Импорты объединить с существующими в файле; порядок `picked` — итерация Set сохраняет порядок вставки = порядок схемы.)

- [ ] **Step 4: Зелёный**

Run: `npx vitest run src/core/autoprofile.test.ts`
Expected: PASS.

- [ ] **Step 5: Гейт + коммит**

`npm test`; `npm run build`; `npm run lint`.

```bash
git add src/core/autoprofile.ts src/core/autoprofile.test.ts
git commit -m "feat(autoprofile): buildProfileDraft — состав, кап 8, eligibility, хвост причин — TDD

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: стор — `appendBlocks` (TDD)

**Files:**
- Modify: `src/state/session.ts`
- Test: `src/state/session.test.ts` (дописать)

**Interfaces:**
- Consumes: `DraftBlock` из `src/core/autoprofile.ts`; существующий паттерн минта id `blk-${seq}` (см. `addQueryBlock`, `pinResult` — сверить, как там инкрементится `seq`, и повторить точно).
- Produces: `appendBlocks: (blocks: DraftBlock[]) => string | null` — минтит id всем блокам, дописывает в конец `report.blocks`, возвращает id ПЕРВОГО добавленного (для скролла); пустой массив — no-op, null.

- [ ] **Step 1: Красный тест** (дописать в `src/state/session.test.ts`, стиль существующих стор-тестов)

```ts
describe('appendBlocks (M10)', () => {
  it('дописывает в конец, минтит уникальные id, возвращает первый', () => {
    const st = useSession.getState()
    st.addTextBlock('существующий')
    const before = useSession.getState().report.blocks.length
    const firstId = useSession.getState().appendBlocks([
      { type: 'text', markdown: '## Профиль' },
      { type: 'widget', title: 'null-карта', sql: 'SELECT 1', datasetNames: ['t'], vizType: 'table', caption: '' },
    ])
    const blocks = useSession.getState().report.blocks
    expect(blocks).toHaveLength(before + 2)
    expect(blocks[before].id).toBe(firstId)
    expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length) // все id уникальны
    expect(blocks[before + 1]).toMatchObject({ type: 'widget', title: 'null-карта' })
  })
  it('пустой массив — no-op и null', () => {
    const before = useSession.getState().report.blocks
    expect(useSession.getState().appendBlocks([])).toBeNull()
    expect(useSession.getState().report.blocks).toBe(before)
  })
})
```

(Изолировать состояние так же, как соседние тесты этого файла — например `useSession.getState().reset()` в `beforeEach`, сверить с существующим паттерном.)

- [ ] **Step 2: Убедиться, что падает**

Run: `npx vitest run src/state/session.test.ts`
Expected: FAIL — `appendBlocks` не существует.

- [ ] **Step 3: Реализация в `session.ts`**

В интерфейс стора (рядом с `addQueryBlock`):

```ts
  appendBlocks: (blocks: DraftBlock[]) => string | null
```

(импорт: `import type { DraftBlock } from '../core/autoprofile'`).

Реализация (рядом с `addQueryBlock`; минт id и инкремент `seq` — ТОЧНО по образцу `addQueryBlock`, сверить его код):

```ts
  appendBlocks: (blocks) => {
    if (blocks.length === 0) return null
    let firstId: string | null = null
    set((s) => {
      const minted = blocks.map((b, i) => ({ ...b, id: `blk-${s.seq + 1 + i}` }))
      firstId = minted[0].id
      return {
        seq: s.seq + blocks.length,
        report: { version: 1, blocks: [...s.report.blocks, ...minted] },
      }
    })
    return firstId
  },
```

(Сверено с `addQueryBlock` — session.ts:464: счётчик именно `seq`, id-префикс `blk-`, минт `blk-${s.seq + 1}`. `activeBlockId` НЕ трогаем — фокус к черновику даёт скролл, а не подсветка.)

- [ ] **Step 4: Зелёный**

Run: `npx vitest run src/state/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Гейт + коммит**

`npm test`; `npm run build`; `npm run lint`.

```bash
git add src/state/session.ts src/state/session.test.ts
git commit -m "feat(store): appendBlocks — пакетное дописывание блоков отчёта с минтом id

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: интеграционный смоук — сгенерированный SQL на живом DuckDB

**Files:**
- Create: `src/core/autoprofile.integration.test.ts`

**Interfaces:**
- Consumes: билдеры Task 2; `createNodeDuckDB` из `src/db/nodeDuckDB.ts`, `createClient` из `src/db/duckdbClient.ts`, `arrowToRows` из `src/core/arrowToRows.ts` (паттерн — `src/core/mart.test.ts` / `src/features/mart.integration.test.ts`, сверить импорты там).

- [ ] **Step 1: Написать тест**

```ts
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { arrowToRows } from './arrowToRows'
import { createClient, type DuckDBClient } from '../db/duckdbClient'
import { createNodeDuckDB } from '../db/nodeDuckDB'
import { buildHistogramCellSql, buildNullMapSql, buildTopKSql } from './autoprofile'

let db: AsyncDuckDB
let client: DuckDBClient

beforeAll(async () => {
  db = await createNodeDuckDB()
  client = createClient(db)
  await client.exec(`CREATE TABLE prof AS SELECT * FROM (VALUES
    (1.5, 'a', 10), (2.5, 'a', NULL), (3.5, 'b', 30), (NULL, 'b', 40),
    (5.0, 'b', 50), (6.5, 'c', 60), (8.0, NULL, 70), (9.5, 'a', 80)
  ) v(mass, species, "we""ird")`)
})
afterAll(async () => { await db.terminate() })

describe('autoprofile SQL на живом DuckDB', () => {
  it('null-карта: строка на колонку, null-счётчики честные, худшие сверху', async () => {
    const { rows } = arrowToRows(await client.query(buildNullMapSql('prof', ['mass', 'species', 'we"ird'])))
    expect(rows).toHaveLength(3)
    const byCol = Object.fromEntries(rows.map((r) => [r['колонка'], Number(r['null'])]))
    expect(byCol).toEqual({ mass: 1, species: 1, 'we"ird': 1 })
  })
  it('гистограмма: исполняется, бакеты возрастают, сумма строк = не-null строкам', async () => {
    const { rows } = arrowToRows(await client.query(buildHistogramCellSql('prof', 'mass')))
    expect(rows.length).toBeGreaterThan(1)
    const bounds = rows.map((r) => Number(r['от']))
    expect([...bounds].sort((a, b) => a - b)).toEqual(bounds) // порядок бакетов
    expect(rows.reduce((s, r) => s + Number(r['строк']), 0)).toBe(7) // 8 строк - 1 NULL
  })
  it('top-K: не больше 7, NULL исключён, count по убыванию', async () => {
    const { rows } = arrowToRows(await client.query(buildTopKSql('prof', 'species')))
    expect(rows.map((r) => r['значение'])).toEqual(['a', 'b', 'c']) // 3-3 tiebreak по значению, потом 1
    expect(Number(rows[0]['строк'])).toBeGreaterThanOrEqual(Number(rows[1]['строк']))
  })
  it('гистограмма на константной колонке не падает (nullif-guard)', async () => {
    await client.exec(`CREATE TABLE flat AS SELECT 5 AS x FROM range(3)`)
    const { rows } = arrowToRows(await client.query(buildHistogramCellSql('flat', 'x')))
    expect(rows.length).toBeLessThanOrEqual(1) // один NULL-бакет или пусто — но не throw
  })
})
```

- [ ] **Step 2: Прогнать**

Run: `npx vitest run src/core/autoprofile.integration.test.ts`
Expected: PASS. Если DuckDB ругается на синтаксис (например `ORDER BY min(...)` при `GROUP BY 1`) — чинить БИЛДЕР (Task 2) и его юнит-тесты, не ослаблять интеграционный тест. `species: ['a','b','c']` — проверить фактический tiebreak ('a' и 'b' по 3, 'c' 1): ожидание `['a','b','c']` или `['b','a','c']` зависит от данных — выставить по реальному распределению в фикстуре и закомментировать почему.

- [ ] **Step 3: Гейт + коммит**

`npm test` (интеграционный войдёт в общий прогон); `npm run build`; `npm run lint`.

```bash
git add src/core/autoprofile.integration.test.ts
git commit -m "test(autoprofile): интеграционный смоук SQL-билдеров на живом node-DuckDB

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: UI — хук `useAutoprofile`, кнопка в рейле, скролл к черновику

**Files:**
- Create: `src/features/useAutoprofile.ts`
- Modify: `src/features/Rail.tsx` (кнопка рядом с «профиль источника», ~строки 310-320)
- Modify: `src/features/Report.tsx` (id на обёртке блока, ~строка 123)
- Modify: `src/index.css` (ряд кнопок профиля)

**Interfaces:**
- Consumes: `buildProfileDraft` (Task 3), `appendBlocks` (Task 4), `useProfileActions.profile(table)` (кэширует в `Dataset.profile`/`rowCount`/`profileError` — см. `src/features/useProfileActions.ts`), `setMode`, `setToast`.
- Produces: `useAutoprofile(client): { profileToReport(table: string): Promise<void> }`.

- [ ] **Step 1: Хук `src/features/useAutoprofile.ts`**

```ts
import { buildProfileDraft } from '../core/autoprofile'
import type { DuckDBClient } from '../db/duckdbClient'
import { useSession } from '../state/session'
import { useProfileActions } from './useProfileActions'

/**
 * «Профиль -> отчёт»: кэш профиля M3 (или посчитать) -> черновик блоков ->
 * append в конец отчёта -> режим «Отчёт» -> скролл к первому добавленному.
 * Ячейки исполняются сами при монтировании (lazy rerun M7b) — runAll не нужен.
 */
export function useAutoprofile(client: DuckDBClient) {
  const { profile } = useProfileActions(client)

  async function profileToReport(table: string): Promise<void> {
    if (!useSession.getState().datasets.find((d) => d.table === table)?.profile) {
      await profile(table) // считает и кэширует; ошибка ляжет в profileError
    }
    const st = useSession.getState()
    const ds = st.datasets.find((d) => d.table === table)
    if (!ds) return
    if (!ds.profile) {
      st.setToast(`профиль не посчитался: ${ds.profileError ?? 'ошибка'}`)
      return
    }
    const draft = buildProfileDraft({
      table,
      fileName: ds.fileName,
      rowCount: ds.rowCount ?? 0,
      columns: ds.profile,
    })
    const firstId = st.appendBlocks(draft)
    st.setMode('report')
    st.setToast(`профиль ${ds.fileName} добавлен: ${draft.filter((b) => b.type === 'widget').length} ячеек`)
    if (firstId) {
      // Report ещё монтируется — скроллим после коммита рендера.
      setTimeout(() => document.getElementById(firstId)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60)
    }
  }

  return { profileToReport }
}
```

- [ ] **Step 2: Кнопка в Rail.tsx**

Рядом с существующей кнопкой `.profbtn` «профиль источника» (внутри секции выбранного датасета) — обернуть обе в ряд и добавить вторую:

```tsx
<div className="profbtn-row">
  <button
    className="profbtn"
    onClick={() => {
      setProfileTarget({ kind: 'source', table: ds.table })
      setExploreView('profile')
      void profile(ds.table)
    }}
    title="посмотреть распределения колонок источника"
  >
    <Icon name="profile" /> профиль источника
  </button>
  <button
    className="profbtn"
    disabled={!!ds.profiling}
    onClick={() => void profileToReport(ds.table)}
    title="черновик отчёта из профиля: null-карта, распределения, топ значений"
  >
    <Icon name="pin" /> в отчёт
  </button>
</div>
```

Хук подключить в компоненте Rail: `const { profileToReport } = useAutoprofile(client)` (импорт из `./useAutoprofile`). Имя глифа `pin` сверить с `src/components/Icon.tsx` — взять существующий (pin/report), НЕ рисовать новый.

- [ ] **Step 3: id блока в Report.tsx**

На обёртке блока (элемент с `key={block.id}` и `onClick={() => setActiveBlock(block.id)}`, ~строка 123) добавить атрибут:

```tsx
id={block.id}
```

- [ ] **Step 4: CSS**

В `src/index.css` рядом со стилями `.profbtn`:

```css
.profbtn-row { display: flex; gap: 6px; }
.profbtn-row .profbtn { flex: 1; min-width: 0; }
```

(Сверить текущие стили `.profbtn` — если он был block/width:100%, ряд сохраняет прежнюю ширину пары. Юниформность пары проверить глазами.)

- [ ] **Step 5: Гейт + приёмка глазами**

`npm test`; `npm run build`; `npm run lint` — зелёные.

Глазами (`npm run dev`): загрузить сэмпл «пингвины Палмера» → в рейле у источника «в отчёт» → переключило на «Отчёт», проскроллило к «## Профиль: …», тост «профиль … добавлен: N ячеек»; null-карта таблицей (species/sex сверху); гистограммы с барами в порядке бакетов (НЕ по убыванию высоты); top-K species — три бара; ячейки редактируются, «выполнить всё» пересчитывает; повторный клик — второй черновик ниже; экспорт HTML содержит черновик.

- [ ] **Step 6: Коммит**

```bash
git add src/features/useAutoprofile.ts src/features/Rail.tsx src/features/Report.tsx src/index.css
git commit -m "feat(autoprofile): кнопка «в отчёт» в рейле — профиль датасета живым черновиком отчёта

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Финал спринта

- [ ] Полный гейт на голове ветки: `npm test`; `npm run build`; `npm run lint` — три команды, зелёные, 0/0.
- [ ] Сквозная приёмка (глазами, dev): пингвины → «в отчёт» → черновик за секунды; такси (широкая таблица) → кап 8 + хвост «без своей ячейки»; титаник → смешанные типы; ячейка гистограммы правится руками (например bins 12→6) и пере-исполняется; DoD спеки закрыт.
- [ ] `docs/BACKLOG.md` — ревизия: закрытое тикнуть, новые миноры записать.
- [ ] FF-merge в `main`, гейт на main, пуш — юзер.
