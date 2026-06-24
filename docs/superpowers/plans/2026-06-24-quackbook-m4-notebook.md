# M4 Notebook (Отчёт) Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (- [ ]) syntax. Each step is ONE action (2–5 min). For logic (`core/`, store actions) tests come FIRST (red → green); for UI the deliverable is the component compiling + the gate green + a one-line «verify by eye».

**Goal:** Верхний слой — ноутбук. Пользователь закрепляет результат запроса виджет-блоком (`📌` из Исследования), вписывает текстовые комментарии между виджетами и собирает вертикальный нарративный отчёт, который читается сверху вниз как рассуждение. Структура сохраняется в JSON-файл и автосейвится в `localStorage`; данные (таблицы) не персистятся — после reload подгружаются заново, виджеты пересчитываются по таблицам в памяти. **Готово, когда:** закрепляю 2–3 результата, пишу текст между ними, переставляю блоки `↑/↓`, виджеты пересчитываются; сохраняю структуру в JSON, перезагружаю страницу (структура восстановлена из localStorage, виджеты просят источники), открываю JSON → баннер перечисляет недостающие датасеты → подгружаю файлы → виджеты пересчитались.

**Architecture:** Те же 4 зоны, что в M1–M3 (`db/` — единственный, кто говорит с DuckDB; `core/` — чистая логика под TDD; `state/` — Zustand-стор; `features/`+`components/` — React UI). Новой логики в `db/` нет — перезапуск виджета использует существующий `client.query`. **`core/report.ts`** — модель документа (дискриминированный union блоков `TextBlock | WidgetBlock`, `ReportDoc = { version: 1; blocks: Block[] }`) + чистые функции `serializeReport`/`deserializeReport`/`neededDatasets` (сердце TDD). **`state/session.ts`** расширяется срезом `report: ReportDoc` + `activeBlockId` + `toast` и блок-операциями (`pinResult`/`addTextBlock`/`updateTextBlock`/`updateWidgetTitle`/`updateWidgetCaption`/`setWidgetVizType`/`moveBlock`/`removeBlock`/`setActiveBlock`/`loadReport`); id блоков — существующий детерминированный счётчик `seq`, префикс `blk-`. Автосейв структуры — подписка Zustand на ссылку среза `report` пишет `localStorage['quackbook.report']`; гидрация при загрузке модуля; всё под guard `typeof localStorage !== 'undefined'` (vitest гоняет в node без localStorage). UI: `Report.tsx` (вертикальный стек блоков + тулбар `+ текст`/`сохранить`/`открыть`), `TextBlockView` (markdown через `marked` ↔ textarea), `WidgetBlockView` (рерайн SQL в локальном стейте + тогл Таблица/График + сворачиваемый SQL + подпись + `↑↓✕`), `Toast`, `RehydrationBanner`. Презентация (CSS, раскладка) — глазами (честная граница CLAUDE.md).

**Tech Stack:** React 19.2.7 + TS 6.0.3 + Vite 8; Vitest 4 (node env, `include: src/**/*.test.ts` — только `.test.ts`, не `.tsx`); `@duckdb/duckdb-wasm@1.32.0` (движок 1.5.4) + `apache-arrow@17.0.0`; Zustand 5.0.14. **Новая внешняя зависимость — ровно одна: `marked@18.0.5`** (рендер markdown текст-блоков; везёт свои TS-типы, `@types/marked` НЕ нужен). `dnd-kit` НЕ добавляем (решение 1 — кнопки `↑/↓`).

**Источник истины:** `docs/superpowers/specs/2026-06-24-quackbook-m4-notebook-design.md` (+ продукт `docs/scope-quackbook-v1.md`, дорожная карта `docs/superpowers/specs/2026-06-22-quackbook-delivery-design.md`). Правила: `CLAUDE.md`. Ветка: `m4-notebook` (создать перед Task 1; оба среза мержатся одной веткой).

## Global Constraints

- **Determinism:** id блоков — через счётчик `seq` стора, формат `blk-<n>`. НИКОГДА `Math.random()` / `Date.now()` / `new Date()` (они бросают в нашем тулчейне и ломают детерминизм).
- **TDD for logic** (`core/`, store actions): red → green → refactor. UI/презентация проверяется глазами (в репо нет jsdom/RTL). Склейка localStorage — by-eye glue поверх core-протестированных (de)serialize.
- **Gate every task:** `npm test` (vitest), `npm run lint` (0 ошибок; единственный известный/допустимый pre-existing warning — TanStack `useVirtualizer`), и `npm run build` (полный `tsc` — vitest сам по себе НЕ делает полную проверку типов, поэтому build — настоящий type-gate). Задача готова, только когда все три зелёные.
- **Commits:** один на задачу (или на цикл red→green), через bash here-doc (НЕ PowerShell `@'...'@`), тело в настоящем времени, заканчивается трейлером:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Surgical edits:** трогаем только нужное; следуем существующим паттернам файлов; никакого спекулятивного error handling под несуществующие сценарии.
- **No new deps except `marked`.** Явно НЕ добавляем `dnd-kit`. `marked` везёт свои TS-типы (без `@types/marked`).
- **Firewall:** только вертикальный стек (`↑/↓` reorder), одна ширина; персистится только СТРУКТУРА (localStorage + JSON-файл), никогда ДАННЫЕ; виджеты рождаются только через пин (в режиме Отчёт нет блока «+ запрос», только `+ текст`).

## Спека-консистентные решения (зафиксированы здесь, чтобы исполнитель не додумывал)

1. **RTL/jsdom-тесты не пишем** — как в M1–M3. В репо нет jsdom/`@testing-library`, vitest `include` — только `src/**/*.test.ts`. UI/CSS — глазами; вся отделимая логика (модель документа, действия стора) — node-TDD (прямое продолжение прецедента M1–M3 — CLAUDE.md rule 2, простота).
2. **id блоков НЕ генерит `core`** — их генерит стор детерминированным счётчиком `seq` (общий с табами `tab-${seq+1}`), префикс `blk-`. Round-trip сериализации опирается на стабильные id ИЗ документа (`deserializeReport` сохраняет id как есть). Поэтому `core/report.ts` про id не знает.
3. **Результаты виджетов НЕ сериализуются.** Документ несёт только структуру: текст + `{ title, sql, datasetNames, vizType, caption }`. При рендере в Отчёте каждый виджет гоняет свой `sql` через `client.query` в `useEffect` и держит результат в локальном React-стейте (решение 4 спеки).
4. **Reset() возвращает ПУСТОЙ документ, не гидрированный.** Гидрация из localStorage НЕ мутирует `initial.report` (он остаётся `{ version: 1, blocks: [] }` ради семантики reset); живой стор гидрируется отдельно через `useSession.getState().loadReport(hydrated)` ПОСЛЕ `create` — именно `loadReport` (не `setState({ report })`), чтобы вместе с документом продвинуть счётчик `seq` за максимальный `blk-<n>` и не выдать коллизию id после reload. `reset()` дополнительно удаляет ключ localStorage. См. Task 4 — это реальная ловушка.
5. **Автосейв — базовый Zustand v5 `subscribe((s, prev) => …)`**, сравнение ссылки `s.report !== prev.report`. Не нужен `subscribeWithSelector`. Тост (`toast`) меняет другую ветку стейта — подписка на него не реагирует (сравнивается только `report`), localStorage тостом не пишется.
6. **`marked.parse(src)` вызываем синхронно** и кастуем `as string`: при дефолтных опциях (мы не передаём async-расширений) `marked.parse` возвращает `string`. Тип в типах marked — `string | Promise<string>`; синхронный путь верифицируется через `npm run build`. Рендер через `dangerouslySetInnerHTML` БЕЗ санитайзера — контент локальный, один автор, недоверенного ввода нет (CLAUDE.md rule 2 — не обрабатываем несуществующий сценарий; помечаем комментарием).
7. **Пин в `ResultPanel`:** `vizType = view === 'chart' ? 'chart' : 'table'` (profile/table → `'table'`); `datasetNames = detectReferencedTables(sql, datasets.map(d => d.table))`; `title` = заголовок активного таба (читаем из стора `getState().tabs.find(t => t.id === tabId)?.title` в обработчике — без лишней подписки); `caption: ''`. После `pinResult(...)` зовём `setToast('закреплено в отчёт')` и ОСТАЁМСЯ в Исследовании (mode не трогаем).
8. **`setTimeout` допустим в UI** (`Toast` auto-clear), но НЕ в core/store — там его нет. Таймер чистим на unmount/смене значения.
9. **Подсветка рейла по активному блоку (Task 11):** в режиме Отчёт «активный запрос» рейла — это `sql` активного ВИДЖЕТ-блока (не активного таба). Факторизуем выбор «текущий sql + tables», чтобы оба режима кормили один и тот же `detectReferencedTables`/`detectUsedColumns`. В explore-режиме — текущее поведение по активному табу.

---

## File Structure

| Файл | Статус | Ответственность |
|---|---|---|
| `src/core/report.ts` | **новый** | Типы `TextBlock`/`WidgetBlock`/`Block`/`ReportDoc`; `serializeReport`; `deserializeReport` (валидация версии и формы блоков); `neededDatasets`. Чистые функции, без стора/localStorage. |
| `src/core/report.test.ts` | **новый** | TDD: round-trip serialize↔deserialize; reject версии/мусора/битой формы блока; tolerate extra-поля; `neededDatasets` (union/dedupe/sort, пустой/только-текст). |
| `src/state/session.ts` | расширить | State `report`/`activeBlockId`/`toast` (в `initial`); действия `pinResult`/`addTextBlock`/`updateTextBlock`/`updateWidgetTitle`/`updateWidgetCaption`/`setWidgetVizType`/`moveBlock`/`removeBlock`/`setActiveBlock`/`loadReport`/`setToast`; `reset` чистит ключ localStorage; автосейв (subscribe) + гидрация (по eye). |
| `src/state/session.test.ts` | расширить | Новый `describe('session: report (M4)')`: блок-операции, инкремент id, `loadReport` (replace + advance seq), `removeBlock` нуллит active, `reset` чистит. |
| `src/core/report.test.ts` | (см. выше) | — |
| `src/components/TextBlockView.tsx` | **новый** | Рендер markdown (`marked`) ↔ textarea-редактор по клику; blur → `updateTextBlock`. |
| `src/components/WidgetBlockView.tsx` | **новый** | Рерайн `block.sql` (`client.query` → `arrowToRows`) в локальном стейте; шапка (title · пилюли · сворачиваемый SQL); тогл Таблица/График; подпись (editable); `↑↓✕`; error → инлайн + «источник(и): …». |
| `src/components/Toast.tsx` | **новый** | Transient-баннер из `toast`; auto-clear `setTimeout` 2200 мс. |
| `src/components/RehydrationBanner.tsx` | **новый** | `neededDatasets(report)` минус загруженные → баннер «нужны источники: …»; ничего, если всё загружено. |
| `src/features/Report.tsx` | заменить заглушку | Вертикальный стек блоков + тулбар (`+ текст` / `сохранить` / `открыть`) + пустое состояние + клик по блоку → `setActiveBlock`; принимает `client`. |
| `src/features/Shell.tsx` | расширить | Прокинуть `client` в `<Report client={client} />`; рендерить `<Toast />`. |
| `src/features/Rail.tsx` | расширить (slice 2) | В режиме Отчёт «активный запрос» = sql активного виджет-блока; факторизация «sql + tables» под общий highlight. |
| `package.json` / `package-lock.json` | расширить | `+marked@18.0.5` (точный пин). |
| `src/index.css` | расширить (by eye) | Стили блоков отчёта, тоста, баннера, toolbar. |

> `src/core/chartSpec.ts` / `src/components/Chart.tsx` / `src/components/ResultGrid.tsx` — переиспользуем как есть, НЕ трогаем.

---

# SLICE 1 — ноутбук работает в сессии

## Task 0: Ветка (УЖЕ СОЗДАНА — пропустить)

Ветка `m4-notebook` уже создана от `main`; на ней лежат коммиты спеки и этого плана. **Не** создавать заново (`git checkout -b` упадёт `already exists`). Просто убедиться, что находишься на ней, и начинать с Task 1.

- [ ] **Step 1: Подтвердить ветку**

```bash
git -C /c/Users/cosmi/Projects/quackbook rev-parse --abbrev-ref HEAD
```

Expected: `m4-notebook`. Если нет — `git checkout m4-notebook`.

---

## Task 1: `core/report.ts` — типы + serialize/deserialize

**Files:**
- Create: `src/core/report.ts`
- Test: `src/core/report.test.ts`

**Interfaces:**
- Consumes: ничего (чистый модуль).
- Produces:
  - `type TextBlock = { type: 'text'; id: string; markdown: string }`
  - `type WidgetBlock = { type: 'widget'; id: string; title: string; sql: string; datasetNames: string[]; vizType: 'table' | 'chart'; caption: string }`
  - `type Block = TextBlock | WidgetBlock`
  - `type ReportDoc = { version: 1; blocks: Block[] }`
  - `serializeReport(doc: ReportDoc): string`
  - `deserializeReport(json: string): ReportDoc`

- [ ] **Step 1: Write the failing test**

Создать `src/core/report.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  serializeReport,
  deserializeReport,
  type ReportDoc,
} from './report'

const sample: ReportDoc = {
  version: 1,
  blocks: [
    { type: 'text', id: 'blk-1', markdown: '# Заголовок\nтекст' },
    {
      type: 'widget',
      id: 'blk-2',
      title: 'Выручка по странам',
      sql: 'SELECT country, sum(revenue) AS rev FROM events GROUP BY 1',
      datasetNames: ['events'],
      vizType: 'chart',
      caption: 'топ-страны',
    },
  ],
}

describe('serializeReport / deserializeReport', () => {
  it('round-trips a doc with a text + a widget block', () => {
    const json = serializeReport(sample)
    expect(typeof json).toBe('string')
    expect(deserializeReport(json)).toEqual(sample)
  })

  it('rejects an unsupported version', () => {
    expect(() => deserializeReport('{"version":2,"blocks":[]}')).toThrow(
      /version/,
    )
    expect(() => deserializeReport('{"blocks":[]}')).toThrow(/version/)
  })

  it('rejects a non-JSON string', () => {
    // The raw JSON.parse SyntaxError is the intended surface here (this is the
    // one error path that is NOT one of the module's own Error('...') messages).
    expect(() => deserializeReport('not json {')).toThrow(SyntaxError)
  })

  it('rejects a widget block missing sql', () => {
    const bad = JSON.stringify({
      version: 1,
      blocks: [
        {
          type: 'widget',
          id: 'blk-1',
          title: 't',
          datasetNames: [],
          vizType: 'table',
          caption: '',
        },
      ],
    })
    expect(() => deserializeReport(bad)).toThrow(/malformed/)
  })

  it('rejects a block with an unknown type', () => {
    const bad = JSON.stringify({
      version: 1,
      blocks: [{ type: 'chart', id: 'blk-1' }],
    })
    expect(() => deserializeReport(bad)).toThrow(/malformed/)
  })

  it('tolerates an extra unknown field on a valid block and drops it', () => {
    const withExtra = JSON.stringify({
      version: 1,
      blocks: [{ type: 'text', id: 'blk-1', markdown: 'hi', note: 'future' }],
    })
    const doc = deserializeReport(withExtra)
    expect(doc.blocks[0]).toMatchObject({
      type: 'text',
      id: 'blk-1',
      markdown: 'hi',
    })
    // validateBlock rebuilds each block from known fields, so unknown extras are
    // dropped (not merely ignored). Assert it explicitly — toMatchObject is a
    // subset check and would pass even if `note` survived.
    expect(Object.keys(doc.blocks[0])).not.toContain('note')
  })
})
```

- [ ] **Step 2: Run it & see it fail**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm test -- src/core/report.test.ts
```

Expected failure: module not found — `Failed to resolve import "./report"` / `Cannot find module './report'` (the file does not exist yet).

- [ ] **Step 3: Write minimal impl**

Создать `src/core/report.ts`:

```ts
export type TextBlock = { type: 'text'; id: string; markdown: string }

export type WidgetBlock = {
  type: 'widget'
  id: string
  title: string
  sql: string
  datasetNames: string[]
  vizType: 'table' | 'chart'
  caption: string
}

export type Block = TextBlock | WidgetBlock

export type ReportDoc = { version: 1; blocks: Block[] }

/** Stable, pretty JSON of the report STRUCTURE (no widget results). */
export function serializeReport(doc: ReportDoc): string {
  return JSON.stringify(doc, null, 2)
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function validateBlock(b: unknown): Block {
  if (typeof b !== 'object' || b === null) throw new Error('malformed report')
  const r = b as Record<string, unknown>
  if (r.type === 'text') {
    if (!isString(r.id) || !isString(r.markdown)) {
      throw new Error('malformed report')
    }
    return { type: 'text', id: r.id, markdown: r.markdown }
  }
  if (r.type === 'widget') {
    if (
      !isString(r.id) ||
      !isString(r.title) ||
      !isString(r.sql) ||
      !Array.isArray(r.datasetNames) ||
      !r.datasetNames.every(isString) ||
      (r.vizType !== 'table' && r.vizType !== 'chart') ||
      !isString(r.caption)
    ) {
      throw new Error('malformed report')
    }
    return {
      type: 'widget',
      id: r.id,
      title: r.title,
      sql: r.sql,
      datasetNames: r.datasetNames as string[],
      vizType: r.vizType,
      caption: r.caption,
    }
  }
  throw new Error('malformed report')
}

/**
 * Parse + validate a report doc. `version` must be exactly 1, `blocks` an
 * array, each block a known type with its required primitive fields. Unknown
 * EXTRA fields inside a block are tolerated (forward-friendly): we rebuild each
 * block from its known fields and drop extras. Throws on bad JSON / version /
 * shape.
 */
export function deserializeReport(json: string): ReportDoc {
  const parsed: unknown = JSON.parse(json)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('malformed report')
  }
  const obj = parsed as Record<string, unknown>
  if (obj.version !== 1) throw new Error('unsupported report version')
  if (!Array.isArray(obj.blocks)) throw new Error('malformed report')
  return { version: 1, blocks: obj.blocks.map(validateBlock) }
}
```

- [ ] **Step 4: Run it & see it pass**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm test -- src/core/report.test.ts
```

Expected: all 6 tests green.

- [ ] **Step 5: Gate + commit**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm run lint && npm run build && npm test
```

Expected: lint 0 errors (the known `useVirtualizer` warning aside), build OK, all tests green. Then:

```bash
cd /c/Users/cosmi/Projects/quackbook && git add src/core/report.ts src/core/report.test.ts && git commit -F- <<'EOF'
feat(core): report doc model + serialize/deserialize (version + block-shape validation)

ReportDoc = {version:1, blocks:(TextBlock|WidgetBlock)[]}. deserializeReport
rejects bad JSON / unsupported version / malformed block shape, tolerates
unknown extra fields (forward-friendly). Widget RESULTS are never serialized.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: `core/report.ts` — `neededDatasets`

**Files:**
- Modify: `src/core/report.ts`
- Test: `src/core/report.test.ts`

**Interfaces:**
- Consumes: `ReportDoc` (this module).
- Produces: `neededDatasets(doc: ReportDoc): string[]` — union of every WIDGET block's `datasetNames`, deduped, sorted ascending. Text blocks contribute nothing.

- [ ] **Step 1: Write the failing test**

Добавить в `src/core/report.test.ts` (новый import + новый describe):

```ts
import { neededDatasets } from './report'

describe('neededDatasets', () => {
  const widget = (
    id: string,
    datasetNames: string[],
  ): import('./report').WidgetBlock => ({
    type: 'widget',
    id,
    title: id,
    sql: 'SELECT 1',
    datasetNames,
    vizType: 'table',
    caption: '',
  })

  it('empty doc -> []', () => {
    expect(neededDatasets({ version: 1, blocks: [] })).toEqual([])
  })

  it('text-only doc -> []', () => {
    expect(
      neededDatasets({
        version: 1,
        blocks: [{ type: 'text', id: 'blk-1', markdown: 'hi' }],
      }),
    ).toEqual([])
  })

  it('unions overlapping datasetNames, deduped + sorted', () => {
    expect(
      neededDatasets({
        version: 1,
        blocks: [
          widget('blk-1', ['events', 'users']),
          { type: 'text', id: 'blk-2', markdown: 'note' },
          widget('blk-3', ['users', 'orders']),
        ],
      }),
    ).toEqual(['events', 'orders', 'users'])
  })
})
```

- [ ] **Step 2: Run it & see it fail**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm test -- src/core/report.test.ts
```

Expected failure: `neededDatasets is not a function` / `does not provide an export named 'neededDatasets'`.

- [ ] **Step 3: Write minimal impl**

Добавить в конец `src/core/report.ts`:

```ts
/**
 * The set of dataset tables every WIDGET block depends on, deduped + sorted
 * ascending. Text blocks contribute nothing. Drives the rehydration banner
 * (which sources the report needs vs which are loaded).
 */
export function neededDatasets(doc: ReportDoc): string[] {
  const all = new Set<string>()
  for (const b of doc.blocks) {
    if (b.type === 'widget') for (const t of b.datasetNames) all.add(t)
  }
  return [...all].sort()
}
```

- [ ] **Step 4: Run it & see it pass**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm test -- src/core/report.test.ts
```

Expected: all tests (Task 1 + Task 2) green.

- [ ] **Step 5: Gate + commit**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm run lint && npm run build && npm test
```

Expected: all three green. Then:

```bash
cd /c/Users/cosmi/Projects/quackbook && git add src/core/report.ts src/core/report.test.ts && git commit -F- <<'EOF'
feat(core): neededDatasets (union of widget datasetNames, deduped + sorted)

Powers the rehydration banner — which sources a report needs to recompute its
widgets. Text blocks contribute nothing.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: `state/session.ts` — report doc + block operations

**Files:**
- Modify: `src/state/session.ts`
- Test: `src/state/session.test.ts`

**Interfaces:**
- Consumes: `ReportDoc`, `Block`, `WidgetBlock` from `../core/report`; existing `seq` counter; existing `initial` object + `set`.
- Produces (store additions):
  - State: `report: ReportDoc` (initial `{ version: 1, blocks: [] }`), `activeBlockId: string | null` (initial `null`).
  - Actions: `pinResult(fields: Omit<WidgetBlock, 'type' | 'id'>): void`; `addTextBlock(): void`; `updateTextBlock(id: string, markdown: string): void`; `updateWidgetTitle(id: string, title: string): void`; `updateWidgetCaption(id: string, caption: string): void`; `setWidgetVizType(id: string, vizType: 'table' | 'chart'): void`; `moveBlock(id: string, dir: 'up' | 'down'): void`; `removeBlock(id: string): void`; `setActiveBlock(id: string | null): void`; `loadReport(doc: ReportDoc): void`.

- [ ] **Step 1: Write the failing test**

Добавить в конец `src/state/session.test.ts` (после существующих describe). Сначала расширить верхний import:

```ts
import type { ReportDoc, WidgetBlock } from '../core/report'
```

Затем добавить:

```ts
const widgetFields = (
  over: Partial<Omit<WidgetBlock, 'type' | 'id'>> = {},
): Omit<WidgetBlock, 'type' | 'id'> => ({
  title: 'Запрос',
  sql: 'SELECT * FROM events',
  datasetNames: ['events'],
  vizType: 'table',
  caption: '',
  ...over,
})

describe('session: report (M4)', () => {
  it('starts with an empty report and no active block', () => {
    const s = useSession.getState()
    expect(s.report).toEqual({ version: 1, blocks: [] })
    expect(s.activeBlockId).toBeNull()
  })

  it('pinResult appends a widget block with id blk-1 and the given fields', () => {
    useSession.getState().pinResult(widgetFields({ title: 'Выручка' }))
    const b = useSession.getState().report.blocks
    expect(b).toHaveLength(1)
    expect(b[0]).toEqual({
      type: 'widget',
      id: 'blk-1',
      title: 'Выручка',
      sql: 'SELECT * FROM events',
      datasetNames: ['events'],
      vizType: 'table',
      caption: '',
    })
  })

  it('addTextBlock appends an empty text block; ids increment across mixed pin/add', () => {
    const s = useSession.getState()
    s.pinResult(widgetFields())
    s.addTextBlock()
    const b = useSession.getState().report.blocks
    expect(b.map((x) => x.id)).toEqual(['blk-1', 'blk-2'])
    expect(b[1]).toEqual({ type: 'text', id: 'blk-2', markdown: '' })
  })

  it('updateTextBlock / updateWidgetTitle / updateWidgetCaption / setWidgetVizType edit by id', () => {
    const s = useSession.getState()
    s.pinResult(widgetFields()) // blk-1 widget
    s.addTextBlock() // blk-2 text
    s.updateTextBlock('blk-2', '## note')
    s.updateWidgetTitle('blk-1', 'Новый')
    s.updateWidgetCaption('blk-1', 'подпись')
    s.setWidgetVizType('blk-1', 'chart')
    const [w, t] = useSession.getState().report.blocks as [
      WidgetBlock,
      { markdown: string },
    ]
    expect(t.markdown).toBe('## note')
    expect(w.title).toBe('Новый')
    expect(w.caption).toBe('подпись')
    expect(w.vizType).toBe('chart')
  })

  it('moveBlock swaps with the neighbor; no-op at the edges', () => {
    const s = useSession.getState()
    s.addTextBlock() // blk-1
    s.addTextBlock() // blk-2
    s.addTextBlock() // blk-3
    s.moveBlock('blk-2', 'up')
    expect(useSession.getState().report.blocks.map((b) => b.id)).toEqual([
      'blk-2',
      'blk-1',
      'blk-3',
    ])
    s.moveBlock('blk-2', 'up') // already first -> no-op
    expect(useSession.getState().report.blocks.map((b) => b.id)).toEqual([
      'blk-2',
      'blk-1',
      'blk-3',
    ])
    s.moveBlock('blk-3', 'down') // already last -> no-op
    expect(useSession.getState().report.blocks.map((b) => b.id)).toEqual([
      'blk-2',
      'blk-1',
      'blk-3',
    ])
  })

  it('removeBlock drops the block and nulls activeBlockId if it pointed there', () => {
    const s = useSession.getState()
    s.addTextBlock() // blk-1
    s.addTextBlock() // blk-2
    s.setActiveBlock('blk-1')
    s.removeBlock('blk-1')
    const after = useSession.getState()
    expect(after.report.blocks.map((b) => b.id)).toEqual(['blk-2'])
    expect(after.activeBlockId).toBeNull()
  })

  it('setActiveBlock sets and clears', () => {
    const s = useSession.getState()
    s.addTextBlock()
    s.setActiveBlock('blk-1')
    expect(useSession.getState().activeBlockId).toBe('blk-1')
    s.setActiveBlock(null)
    expect(useSession.getState().activeBlockId).toBeNull()
  })

  it('loadReport replaces blocks, nulls active, and advances seq past max blk-<n>', () => {
    const s = useSession.getState()
    s.setActiveBlock('blk-x')
    const doc: ReportDoc = {
      version: 1,
      blocks: [
        { type: 'text', id: 'blk-3', markdown: 'a' },
        { type: 'text', id: 'blk-5', markdown: 'b' },
      ],
    }
    s.loadReport(doc)
    let after = useSession.getState()
    expect(after.report).toEqual(doc)
    expect(after.activeBlockId).toBeNull()
    // next added block must not collide with blk-5
    after.addTextBlock()
    expect(useSession.getState().report.blocks.at(-1)!.id).toBe('blk-6')
  })

  it('reset clears report back to empty and activeBlockId to null', () => {
    const s = useSession.getState()
    s.pinResult(widgetFields())
    s.setActiveBlock('blk-1')
    s.reset()
    const after = useSession.getState()
    expect(after.report).toEqual({ version: 1, blocks: [] })
    expect(after.activeBlockId).toBeNull()
  })
})
```

- [ ] **Step 2: Run it & see it fail**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm test -- src/state/session.test.ts
```

Expected failure: type/runtime errors — `pinResult is not a function` (and TS errors on `s.report`/`s.pinResult` not existing on `SessionState`).

- [ ] **Step 3: Write minimal impl — types + state**

В `src/state/session.ts` добавить import под существующие type-импорты (после `import { buildSelectStar } from '../core/sql'`):

```ts
import type { ReportDoc, WidgetBlock } from '../core/report'
```

В интерфейс `SessionState` добавить state-поля (рядом с `seq`):

```ts
  report: ReportDoc
  activeBlockId: string | null
```

и действия (в блок `// actions`, рядом с остальными):

```ts
  pinResult: (fields: Omit<WidgetBlock, 'type' | 'id'>) => void
  addTextBlock: () => void
  updateTextBlock: (id: string, markdown: string) => void
  updateWidgetTitle: (id: string, title: string) => void
  updateWidgetCaption: (id: string, caption: string) => void
  setWidgetVizType: (id: string, vizType: 'table' | 'chart') => void
  moveBlock: (id: string, dir: 'up' | 'down') => void
  removeBlock: (id: string) => void
  setActiveBlock: (id: string | null) => void
  loadReport: (doc: ReportDoc) => void
```

В объект `initial` добавить (рядом с `seq: 0`):

```ts
  report: { version: 1, blocks: [] } as ReportDoc,
  activeBlockId: null as string | null,
```

> Both `report` and `activeBlockId` MUST live in the `initial` object (not just the `create` body): `reset()` is `set({ ...initial })` — a shallow merge that only clears keys PRESENT in `initial`. The Step 1 tests «starts with an empty report and no active block» and «reset clears report back to empty» pass at green ONLY because `beforeEach` runs `reset()` and `initial` carries these two keys. If a future edit moves them out of `initial` (keeping them only in the create body), `reset()` stops clearing them and the empty-state guarantee silently breaks across tests. This is the same trap documented for `toast` in Task 8.

- [ ] **Step 4: Write minimal impl — actions**

В `create<SessionState>((set) => ({ ... }))` добавить действия сразу ПОСЛЕ существующего `setProfileTarget: (profileTarget) => set({ profileTarget }),` (session.ts line 274), непосредственно перед закрывающей `}))` (line 275):

```ts
  pinResult: (fields) =>
    set((s) => ({
      report: {
        version: 1,
        blocks: [
          ...s.report.blocks,
          { type: 'widget', id: `blk-${s.seq + 1}`, ...fields },
        ],
      },
      seq: s.seq + 1,
    })),
  addTextBlock: () =>
    set((s) => ({
      report: {
        version: 1,
        blocks: [
          ...s.report.blocks,
          { type: 'text', id: `blk-${s.seq + 1}`, markdown: '' },
        ],
      },
      seq: s.seq + 1,
    })),
  updateTextBlock: (id, markdown) =>
    set((s) => ({
      report: {
        version: 1,
        blocks: s.report.blocks.map((b) =>
          b.id === id && b.type === 'text' ? { ...b, markdown } : b,
        ),
      },
    })),
  updateWidgetTitle: (id, title) =>
    set((s) => ({
      report: {
        version: 1,
        blocks: s.report.blocks.map((b) =>
          b.id === id && b.type === 'widget' ? { ...b, title } : b,
        ),
      },
    })),
  updateWidgetCaption: (id, caption) =>
    set((s) => ({
      report: {
        version: 1,
        blocks: s.report.blocks.map((b) =>
          b.id === id && b.type === 'widget' ? { ...b, caption } : b,
        ),
      },
    })),
  setWidgetVizType: (id, vizType) =>
    set((s) => ({
      report: {
        version: 1,
        blocks: s.report.blocks.map((b) =>
          b.id === id && b.type === 'widget' ? { ...b, vizType } : b,
        ),
      },
    })),
  moveBlock: (id, dir) =>
    set((s) => {
      const blocks = s.report.blocks
      const i = blocks.findIndex((b) => b.id === id)
      if (i === -1) return {}
      const j = dir === 'up' ? i - 1 : i + 1
      if (j < 0 || j >= blocks.length) return {}
      const next = [...blocks]
      ;[next[i], next[j]] = [next[j], next[i]]
      return { report: { version: 1, blocks: next } }
    }),
  removeBlock: (id) =>
    set((s) => ({
      report: {
        version: 1,
        blocks: s.report.blocks.filter((b) => b.id !== id),
      },
      activeBlockId: s.activeBlockId === id ? null : s.activeBlockId,
    })),
  setActiveBlock: (id) => set({ activeBlockId: id }),
  loadReport: (doc) =>
    set((s) => {
      let maxImported = 0
      for (const b of doc.blocks) {
        const m = /^blk-(\d+)$/.exec(b.id)
        if (m) maxImported = Math.max(maxImported, Number(m[1]))
      }
      return {
        report: doc,
        activeBlockId: null,
        seq: Math.max(s.seq, maxImported),
      }
    }),
```

- [ ] **Step 5: Run it & see it pass**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm test -- src/state/session.test.ts
```

Expected: the new `session: report (M4)` describe is green and all pre-existing session tests still pass.

- [ ] **Step 6: Gate + commit**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm run lint && npm run build && npm test
```

Expected: all three green. Then:

```bash
cd /c/Users/cosmi/Projects/quackbook && git add src/state/session.ts src/state/session.test.ts && git commit -F- <<'EOF'
feat(state): report doc + block operations (pin/text/edit/move/remove/load)

report:ReportDoc + activeBlockId in the store. Block ids via the deterministic
seq counter (blk-<n>). loadReport replaces the doc, nulls active, and advances
seq past the max imported blk id to avoid collisions. reset clears report to
the empty doc. updateWidgetTitle is part of the document-model API (spec store-op
contract) and unit-tested, but intentionally has NO UI caller in M4 — the widget
title is set at pin time and re-edited only by re-pinning (spec marks only the
caption editable). Not dead code: it is exercised by the unit test and completes
the block-edit API.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: `state/session.ts` — localStorage autosave + hydration (by eye)

**Files:**
- Modify: `src/state/session.ts`

**Interfaces:**
- Consumes: `serializeReport`, `deserializeReport` from `../core/report`; the live `useSession` store + `initial`.
- Produces: module-load hydration of the LIVE store from `localStorage['quackbook.report']`; autosave subscription on `report` ref change; `reset()` removes the key. No new exported action.

**Why this is by-eye (no new vitest):** the testable core — (de)serialize and the block actions — is already covered in Tasks 1–3. This task is thin glue (subscription + module-load hydration + localStorage guard); the locked decomposition (skeleton Task 4) explicitly scopes it as by-eye glue with no new vitest. The node env has no `localStorage`, so the guard short-circuits before any write — which is exactly why the subscribe/hydration branches are NOT exercised by existing node tests. The autosave subscription's invariants (a report-ref change writes the key; a toast/other-slice change does NOT; `reset()` removes the key) are therefore verified ONLY by eye in Step 5 — Step 5 asserts all three explicitly (a single by-eye test of the subscribe behaviour is not added because the locked plan keeps this glue test-free). **Trap (решение 4):** `reset()` must return the EMPTY doc, not the hydrated one — so `initial.report` stays empty and we hydrate the LIVE store separately (via `loadReport`, Step 3).

- [ ] **Step 1: Add the persistence key + hydration helper**

В `src/state/session.ts` расширить import из `../core/report` (тот, что добавили в Task 3) до:

```ts
import {
  serializeReport,
  deserializeReport,
  type ReportDoc,
  type WidgetBlock,
} from '../core/report'
```

Сразу ПЕРЕД `export const useSession = create<SessionState>(...)` добавить:

```ts
const REPORT_KEY = 'quackbook.report'

/**
 * Load the persisted report STRUCTURE from localStorage (if any). Returns null
 * when there's nothing / it's bad / there's no localStorage (vitest node env).
 * NOTE: we hydrate the LIVE store with this AFTER create — `initial.report`
 * stays the empty doc so reset() clears to empty, not to the persisted doc.
 */
function loadPersistedReport(): ReportDoc | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(REPORT_KEY)
    return raw ? deserializeReport(raw) : null
  } catch {
    return null // bad / incompatible -> ignore, start empty
  }
}
```

- [ ] **Step 2: Extend `reset()` to remove the key**

Заменить существующую строку `reset: () => set({ ...initial }),` на:

```ts
  reset: () => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(REPORT_KEY)
      } catch {
        // ignore — storage may be unavailable
      }
    }
    set({ ...initial })
  },
```

- [ ] **Step 3: Hydrate the live store + subscribe for autosave**

Сразу ПОСЛЕ закрывающей `}))` объекта `create(...)` добавить:

```ts
// Hydrate the live store from localStorage (structure only) via loadReport —
// NOT setState({ report }). loadReport also advances `seq` past the max blk-<n>
// in the persisted doc, so the next addTextBlock/pinResult after a reload mints
// a fresh id instead of colliding with a restored blk-N (and breaking React
// keys / move/remove targeting). It nulls activeBlockId too (fine on fresh
// load). initial.report stays the empty doc so reset() still clears to empty.
// This runs BEFORE subscribe() is attached, so it does not re-trigger autosave.
const persisted = loadPersistedReport()
if (persisted) useSession.getState().loadReport(persisted)

// Autosave: write whenever the report reference changes (block ops produce a
// fresh report object). Zustand v5 basic subscribe gives (state, prevState) —
// no subscribeWithSelector needed. Toast/other slices don't touch report, so
// they won't trigger a write.
useSession.subscribe((s, prev) => {
  if (s.report !== prev.report && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(REPORT_KEY, serializeReport(s.report))
    } catch {
      // ignore — storage may be full / unavailable
    }
  }
})
```

> Why `loadReport`, not `setState({ report: persisted })`: a bare setState would leave `seq` at 0, so after restoring e.g. `blk-5` the next minted id would be `blk-1` — an id collision. `loadReport` (Task 3) advances `seq` past the highest imported `blk-<n>`. The call runs before `subscribe()` is attached, so hydration writes nothing back; even if it did, it would re-serialize the same structure (benign).
> `WidgetBlock` re-imported here is already consumed by Task 3's `pinResult` (`Omit<WidgetBlock, 'type' | 'id'>` signature) and stays as-is. If lint ever reports it unused, that is a real error to fix (remove it) per the 0-errors gate — not something to ignore.

- [ ] **Step 4: Gate**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm run lint && npm run build && npm test
```

Expected: all three green (node env has no localStorage → guards skip; existing + Task 3 tests unaffected).

- [ ] **Step 5: Verify by eye (after Report renders — Task 7; for now confirm gates)**

These three subscribe/hydration invariants are verified ONLY here by eye (no node test exercises them — the localStorage guard short-circuits in node). For now the gate passing is the deliverable; once Task 7 (and Task 8's toast) land, run `npm run dev` and confirm ALL of:

1. **Report-ref change writes the key.** Switch to отчёт, add a text block → DevTools → Application → Local Storage shows `quackbook.report` whose JSON, when deserialized, round-trips to the current blocks.
2. **Hydration restores after reload.** Reload the page → the text block is still there (the persisted structure rehydrated). Add another block → its id does NOT collide with the restored one (loadReport advanced `seq`).
3. **Toast does NOT write.** Trigger a toast (📌 закрепить in Исследование, Task 8) and watch `quackbook.report` in DevTools: pinning writes (report changed), but the toast auto-clearing ~2.2 s later must leave the stored value UNCHANGED (toast mutates a different slice, so `s.report !== prev.report` is false → no write). If the timestamp/value of `quackbook.report` changes when only the toast clears, the subscription is wrongly keyed.
4. **Reset removes the key.** Click Reset → report clears AND the `quackbook.report` key is gone from Local Storage.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/cosmi/Projects/quackbook && git add src/state/session.ts && git commit -F- <<'EOF'
feat(state): localStorage autosave + hydration of report STRUCTURE (guarded)

Subscribe writes quackbook.report on report-ref change; module-load hydrates the
LIVE store (initial stays empty so reset clears to empty). reset removes the key.
All localStorage access guarded by typeof check + try/catch (vitest node env has
none). Data is never persisted — only structure.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: `marked` dep + `TextBlockView`

**Files:**
- Modify: `package.json`, `package-lock.json` (add `marked@18.0.5`)
- Create: `src/components/TextBlockView.tsx`
- (CSS in `src/index.css` by eye, later)

**Interfaces:**
- Consumes: `marked` (`marked.parse(src: string): string` at default options); `TextBlock` from `../core/report`; store action `updateTextBlock`.
- Produces: `<TextBlockView block={TextBlock} />`.

- [ ] **Step 1: Install the exact pinned version**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm install marked@18.0.5
```

(`npm view marked version` → `18.0.5`; pin exactly.) This updates `package.json` dependencies + `package-lock.json`. `marked` ships its own types — do NOT install `@types/marked`.

- [ ] **Step 2: Verify the dep resolves + types build**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm run build
```

Expected: build OK (a transient unused-import error is fine until Step 3 adds the component; if build is clean here that's also fine — no source uses `marked` yet).

- [ ] **Step 3: Write the component**

Создать `src/components/TextBlockView.tsx`:

```tsx
import { useState } from 'react'
import { marked } from 'marked'
import type { TextBlock } from '../core/report'
import { useSession } from '../state/session'

const PLACEHOLDER = '_пустой текст — кликни, чтобы редактировать_'

export function TextBlockView({ block }: { block: TextBlock }) {
  const updateTextBlock = useSession((s) => s.updateTextBlock)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(block.markdown)

  if (editing) {
    return (
      <textarea
        className="text-block-edit"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          updateTextBlock(block.id, draft)
          setEditing(false)
        }}
      />
    )
  }

  // local single-user content, no untrusted input -> no sanitizer (CLAUDE.md rule 2)
  const html = marked.parse(block.markdown || PLACEHOLDER) as string
  return (
    <div
      className="text-block"
      onClick={() => {
        setDraft(block.markdown)
        setEditing(true)
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
```

- [ ] **Step 4: Gate**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm run lint && npm run build && npm test
```

Expected: all three green. The `as string` cast confirms the synchronous `marked.parse` path types correctly (решение 6).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/cosmi/Projects/quackbook && git add package.json package-lock.json src/components/TextBlockView.tsx && git commit -F- <<'EOF'
feat(deps,ui): add marked@18.0.5 + TextBlockView (markdown <-> textarea)

Default render is marked.parse(markdown) via dangerouslySetInnerHTML (local
single-user content, no sanitizer — CLAUDE.md rule 2). Click -> textarea seeded
with the source; blur -> updateTextBlock + back to rendered. marked ships its
own TS types (no @types/marked).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

> **Verify by eye:** deferred to `npm run dev` after Task 7 wires Report — empty block shows the placeholder; click → edit; type markdown; blur → renders.

---

## Task 6: `WidgetBlockView`

**Files:**
- Create: `src/components/WidgetBlockView.tsx`

**Interfaces:**
- Consumes: `WidgetBlock` from `../core/report`; `DuckDBClient` from `../db/duckdbClient`; `arrowToRows` + `QueryResult` from `../core/arrowToRows`; `buildChartSpec` from `../core/chartSpec`; `<ResultGrid result={QueryResult} />`; `<Chart spec={ChartSpec} rows={…} />`; store actions `setWidgetVizType`, `updateWidgetCaption`, `moveBlock`, `removeBlock`.
- Produces: `<WidgetBlockView block={WidgetBlock} client={DuckDBClient} />`.

> No vitest (UI by eye). The deliverable is: compiles + lint + build green. Verified by eye after Task 7.

- [ ] **Step 1: Write the component**

Создать `src/components/WidgetBlockView.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { WidgetBlock } from '../core/report'
import type { DuckDBClient } from '../db/duckdbClient'
import { arrowToRows, type QueryResult } from '../core/arrowToRows'
import { buildChartSpec } from '../core/chartSpec'
import { useSession } from '../state/session'
import { ResultGrid } from './ResultGrid'
import { Chart } from './Chart'

interface Props {
  block: WidgetBlock
  client: DuckDBClient
}

export function WidgetBlockView({ block, client }: Props) {
  const setWidgetVizType = useSession((s) => s.setWidgetVizType)
  const updateWidgetCaption = useSession((s) => s.updateWidgetCaption)
  const moveBlock = useSession((s) => s.moveBlock)
  const removeBlock = useSession((s) => s.removeBlock)

  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sqlOpen, setSqlOpen] = useState(false)

  // Lazy rerun: each widget runs its own SQL against the in-memory tables on
  // mount (and when its sql/client change). Result lives in local state — it is
  // NEVER serialized (spec decision 4). Mirrors Explore.run.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    client
      .query(block.sql)
      .then((table) => {
        if (cancelled) return
        setResult(arrowToRows(table))
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(String(e))
        setResult(null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [block.sql, client])

  const spec = result ? buildChartSpec(result.columns) : null
  const showChart = block.vizType === 'chart' && spec && result

  return (
    <div className="widget-block">
      <div className="widget-head">
        <span className="widget-title">{block.title}</span>
        <span className="widget-datasets">
          {block.datasetNames.map((t) => (
            <span className="ds-pill" key={t}>
              {t}
            </span>
          ))}
        </span>
        <button
          className="widget-sql-toggle"
          onClick={() => setSqlOpen((v) => !v)}
          title="показать/скрыть SQL"
        >
          SQL {sqlOpen ? '▾' : '▸'}
        </button>
        <span className="widget-controls">
          <button onClick={() => moveBlock(block.id, 'up')} title="вверх">
            ↑
          </button>
          <button onClick={() => moveBlock(block.id, 'down')} title="вниз">
            ↓
          </button>
          <button onClick={() => removeBlock(block.id)} title="удалить">
            ✕
          </button>
        </span>
      </div>

      {sqlOpen && <pre className="widget-sql">{block.sql}</pre>}

      <div className="view-toggle widget-view-toggle">
        <button
          className={block.vizType === 'table' ? 'on' : ''}
          onClick={() => setWidgetVizType(block.id, 'table')}
        >
          таблица
        </button>
        <button
          className={block.vizType === 'chart' ? 'on' : ''}
          disabled={!spec}
          title={spec ? '' : 'нет числовой колонки для графика'}
          onClick={() => setWidgetVizType(block.id, 'chart')}
        >
          график
        </button>
      </div>

      {error && (
        <div className="widget-error">
          <pre className="result-error">{error}</pre>
          <p className="widget-sources-hint">
            источник(и): {block.datasetNames.join(', ')} — подгрузи, если
            отсутствуют
          </p>
        </div>
      )}
      {!error && loading && <p className="result-empty">пересчитываю…</p>}
      {!error && !loading && showChart && (
        <Chart spec={spec!} rows={result!.rows} />
      )}
      {!error && !loading && result && !showChart && (
        <ResultGrid result={result} />
      )}
      {/*
        Do NOT delete as "dead": this branch fires only for a loaded/rehydrated
        widget whose SAVED vizType is 'chart' but whose recomputed result has no
        numeric column. The chart toggle is disabled={!spec}, so a user can never
        reach vizType==='chart' && !spec by clicking — only a JSON open / reload
        produces it. (Spec line 71: chart toggle disabled when no numeric col.)
      */}
      {!error && !loading && result && block.vizType === 'chart' && !spec && (
        <p className="result-empty">нет числовой колонки для графика</p>
      )}

      <input
        className="widget-caption"
        placeholder="подпись…"
        value={block.caption}
        onChange={(e) => updateWidgetCaption(block.id, e.target.value)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Gate**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm run lint && npm run build && npm test
```

Expected: all three green (component compiles, reuses ResultGrid/Chart/buildChartSpec/arrowToRows; mirrors the Explore.run query pattern).

- [ ] **Step 3: Commit**

```bash
cd /c/Users/cosmi/Projects/quackbook && git add src/components/WidgetBlockView.tsx && git commit -F- <<'EOF'
feat(ui): WidgetBlockView — lazy per-block SQL rerun + table/chart toggle

Runs block.sql via client.query in useEffect (result in local state, never
serialized). Header: title + dataset pills + collapsible SQL. Table reuses
ResultGrid; chart reuses buildChartSpec + Chart (disabled when no numeric col).
SQL error -> inline + "источник(и): ... — подгрузи". Editable caption; up/down/
remove controls.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

> **Verify by eye:** deferred to Task 7.
>
> **Note (autosave eagerness):** the caption `<input>` calls `updateWidgetCaption` on EVERY keystroke (`onChange`), each producing a fresh `report` object → the Task 4 autosave subscription writes the whole serialized structure to localStorage per character. This is acceptable for M4 (single-user, local, structure-only — matches spec «автосейв на каждое изменение»); do NOT debounce (out-of-scope creep). Just expect frequent `quackbook.report` writes during caption typing when doing the Task 4 / Task 8 by-eye checks.

---

## Task 7: real `Report.tsx` + Shell wiring

**Files:**
- Modify: `src/features/Report.tsx` (replace the stub)
- Modify: `src/features/Shell.tsx` (pass `client`)
- (CSS in `src/index.css` by eye)

**Interfaces:**
- Consumes: store `report`, actions `addTextBlock`, `setActiveBlock`, `activeBlockId`; `<TextBlockView block />`; `<WidgetBlockView block client />`; `DuckDBClient`.
- Produces: `<Report client={DuckDBClient} />`; `Shell` passes `client`.

> No vitest (UI by eye).

- [ ] **Step 1: Replace the Report stub**

Полностью заменить содержимое `src/features/Report.tsx`:

```tsx
import type { DuckDBClient } from '../db/duckdbClient'
import { useSession } from '../state/session'
import { TextBlockView } from '../components/TextBlockView'
import { WidgetBlockView } from '../components/WidgetBlockView'

export function Report({ client }: { client: DuckDBClient }) {
  const report = useSession((s) => s.report)
  const activeBlockId = useSession((s) => s.activeBlockId)
  const addTextBlock = useSession((s) => s.addTextBlock)
  const setActiveBlock = useSession((s) => s.setActiveBlock)

  return (
    <div className="report">
      <div className="report-toolbar">
        <button onClick={() => addTextBlock()}>+ текст</button>
      </div>

      {report.blocks.length === 0 ? (
        <div className="report-stub">
          Закрепи результат в Исследовании (📌) или добавь текстовый блок.
        </div>
      ) : (
        <div className="report-stack">
          {report.blocks.map((block) => (
            <div
              key={block.id}
              className={
                block.id === activeBlockId
                  ? 'report-block active'
                  : 'report-block'
              }
              onClick={() => setActiveBlock(block.id)}
            >
              {block.type === 'text' ? (
                <TextBlockView block={block} />
              ) : (
                <WidgetBlockView block={block} client={client} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Pass `client` to Report in Shell**

В `src/features/Shell.tsx` единственное вхождение `<Report />` — на строке 87 (12 пробелов отступа), в ветке `) : (` тернара по `mode` (`mode === 'report'`). Заменить ровно эту строку, сохранив 12-пробельный отступ:

```tsx
            <Report client={client} />
```

- [ ] **Step 3: Gate**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm run lint && npm run build && npm test
```

Expected: all three green.

- [ ] **Step 4: Verify by eye**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm run dev
```

Switch to отчёт: empty state shows. Click `+ текст` → an empty text block appears (placeholder); click it → textarea; type `# Привет`, blur → renders as a heading. Reload — the text block persists (Task 4 autosave). Click Reset — clears. (Widgets verified after Task 8 adds the pin.)

- [ ] **Step 5: Commit**

```bash
cd /c/Users/cosmi/Projects/quackbook && git add src/features/Report.tsx src/features/Shell.tsx && git commit -F- <<'EOF'
feat(ui): real Report — vertical block stack + "+ текст" + active-block click

Replaces the M4 stub. Renders report.blocks top-to-bottom (text -> TextBlockView,
widget -> WidgetBlockView with client). Empty state prompts pin or +text. Clicking
a block sets activeBlockId. Shell now passes client into Report. Single column
(firewall: vertical stack only).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 8: pin button in ResultPanel + toast

**Files:**
- Modify: `src/state/session.ts` (add `toast` + `setToast`)
- Modify: `src/state/session.test.ts` (test `setToast` + `reset` clears toast)
- Create: `src/components/Toast.tsx`
- Modify: `src/components/ResultPanel.tsx` (the `📌 закрепить` button)
- Modify: `src/features/Shell.tsx` (render `<Toast />`)

**Interfaces:**
- Consumes: `detectReferencedTables` from `../core/pruning`; store `datasets`, `pinResult`, `tabs`, `setToast`, `toast`. For vizType mapping the pin handler reuses ResultPanel's EXISTING local `view` (= `store.exploreView`, already at ResultPanel.tsx line 20) — no new `exploreView` selector is added.
- Produces: store `toast: string | null` + `setToast(msg: string | null): void`; `<Toast />`; a pin button in `ResultPanel`.

- [ ] **Step 1: Write the failing store test**

Добавить в `src/state/session.test.ts`, внутри `describe('session: report (M4)')` (или новый describe `session: toast (M4)`):

```ts
describe('session: toast (M4)', () => {
  it('setToast sets and clears; reset clears a non-null toast', () => {
    const s = useSession.getState()
    expect(s.toast).toBeNull()
    s.setToast('закреплено в отчёт')
    expect(useSession.getState().toast).toBe('закреплено в отчёт')
    s.setToast(null)
    expect(useSession.getState().toast).toBeNull()
    // reset-clears: set a NON-null toast first, then reset, then assert null.
    // This is the assertion guarding the Step 3 trap — reset() is set({...initial}),
    // a shallow merge, so it only clears `toast` if `toast` is present in `initial`.
    // Omitting the `initial` entry (but adding the field + create action) would
    // pass setToast set/clear yet leave a stale toast after reset; this line fails
    // in that case.
    s.setToast('again')
    s.reset()
    expect(useSession.getState().toast).toBeNull()
  })
})
```

- [ ] **Step 2: Run it & see it fail**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm test -- src/state/session.test.ts
```

Expected failure: `setToast is not a function` (+ TS error: `toast` not on `SessionState`).

- [ ] **Step 3: Add `toast` to the store**

В `src/state/session.ts`. ALL FOUR edits below are required; the red run only fails on `setToast is not a function`, which would NOT catch a missing `initial` entry — that omission is exactly what the Step 1 «reset clears a non-null toast» assertion guards (without the `initial` entry, `reset()`'s shallow `set({...initial})` leaves a stale toast):

1. В интерфейс `SessionState` добавить поле (рядом с `activeBlockId`):

```ts
  toast: string | null
```

2. В тот же интерфейс — действие (рядом с `setActiveBlock`):

```ts
  setToast: (msg: string | null) => void
```

3. В `initial` добавить (рядом с `activeBlockId: null`) — **это и есть то, что легко забыть; без этой строки reset() не очищает toast**:

```ts
  toast: null as string | null,
```

4. В `create(...)` добавить действие, и убедиться, что `reset` остаётся `set({ ...initial })` (он опирается на шаг 3):

```ts
  setToast: (toast) => set({ toast }),
```

- [ ] **Step 4: Run it & see it pass**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm test -- src/state/session.test.ts
```

Expected: the toast test passes — including «reset clears a non-null toast», which is green only because edit 3 (the `initial` entry) is in place and `reset` is `set({ ...initial })`. All session tests green.

- [ ] **Step 5: Write the Toast component**

Создать `src/components/Toast.tsx`:

```tsx
import { useEffect } from 'react'
import { useSession } from '../state/session'

export function Toast() {
  const toast = useSession((s) => s.toast)
  const setToast = useSession((s) => s.setToast)

  useEffect(() => {
    if (toast === null) return
    // setTimeout is fine in UI (it is NOT in core/store logic).
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast, setToast])

  if (toast === null) return null
  return <div className="toast">{toast}</div>
}
```

- [ ] **Step 6: Render Toast in Shell**

В `src/features/Shell.tsx` добавить import под существующие:

```tsx
import { Toast } from '../components/Toast'
```

и отрендерить `<Toast />` внутри `<div className="shell">`, сразу перед закрывающим `</div>` этого корня (после `<div className="body">…</div>`):

```tsx
      <Toast />
```

- [ ] **Step 7: Add the pin button to ResultPanel**

В `src/components/ResultPanel.tsx`:

Добавить imports под существующие:

```ts
import { detectReferencedTables } from '../core/pruning'
```

В теле компонента (рядом с другими селекторами стора) добавить:

```ts
  const pinResult = useSession((s) => s.pinResult)
  const setToast = useSession((s) => s.setToast)
```

Вставить ровно ПОСЛЕ строки 68 `)}` (закрытие условного блока `view-toggle`) и ПЕРЕД строкой 69 `</header>`, так что `{result && (…)}` становится прямым потомком `<header className="panel-head">` (на одном уровне с `view-toggle`, не внутри него — кнопка активна только при наличии `result`):

```tsx
        {result && (
          <button
            className="pin-btn"
            title="закрепить результат в отчёт"
            onClick={() => {
              const st = useSession.getState()
              const datasetNames = detectReferencedTables(
                sql,
                st.datasets.map((d) => d.table),
              )
              const title =
                st.tabs.find((t) => t.id === tabId)?.title ?? 'Запрос'
              pinResult({
                title,
                sql,
                datasetNames,
                vizType: view === 'chart' ? 'chart' : 'table',
                caption: '',
              })
              setToast('закреплено в отчёт')
            }}
          >
            📌 закрепить
          </button>
        )}
```

> Reads `datasets`/`tabs` via `getState()` inside the handler (no extra subscriptions — решение 7). `vizType` maps `chart → 'chart'`, otherwise `'table'` (profile/table both pin as table). Does NOT switch mode — stays in Explore.

- [ ] **Step 8: Gate**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm run lint && npm run build && npm test
```

Expected: all three green.

- [ ] **Step 9: Verify by eye**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm run dev
```

Drop a CSV, open it, run `SELECT * FROM <t>`. Click `📌 закрепить` → toast «закреплено в отчёт» appears for ~2 s; you stay in Исследование. Switch to отчёт → a widget block is present and the table recomputed. Toggle график if there's a numeric column. Reorder with ↑/↓; ✕ removes.

- [ ] **Step 10: Commit**

```bash
cd /c/Users/cosmi/Projects/quackbook && git add src/state/session.ts src/state/session.test.ts src/components/Toast.tsx src/components/ResultPanel.tsx src/features/Shell.tsx && git commit -F- <<'EOF'
feat(ui,state): pin result to report (📌) + transient toast

ResultPanel pin button (enabled when result exists): datasetNames via
detectReferencedTables(sql, dataset tables), title from the active tab, vizType
from the current view (chart->chart else table), then pinResult + setToast,
staying in Explore. Toast: store slice toast/setToast + auto-clearing banner
(setTimeout in UI only). Toast changes don't touch report -> no localStorage write.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

> **Slice 1 demo checkpoint:** drop CSV → run → 📌 → toast, stay in Explore → switch to отчёт → widget recomputes; add a text block, edit markdown; reorder ↑/↓; reload → structure restored from localStorage (widgets ask for sources until files reloaded). Gate green.

---

# SLICE 2 — отчуждаемость и навигация

## Task 9: Save / Open JSON

**Files:**
- Modify: `src/features/Report.tsx`

**Interfaces:**
- Consumes: `serializeReport`, `deserializeReport` from `../core/report`; store `report`, `loadReport`.
- Produces: `Сохранить` (download `quackbook-report.json`) + `Открыть` (file input → `deserializeReport` → `loadReport`) buttons in the report toolbar.

> No vitest (UI by eye; serialize/deserialize already TDD'd in Tasks 1–2).

- [ ] **Step 1: Add save/open to the toolbar**

В `src/features/Report.tsx`:

Расширить imports (`ChangeEvent` импортируем как named type — в остальном репо нет ни одного использования глобального UMD-неймспейса `React.`, держим единый стиль):

```tsx
import { useRef, type ChangeEvent } from 'react'
import { serializeReport, deserializeReport } from '../core/report'
```

Добавить в теле компонента (рядом с селекторами стора):

```tsx
  const loadReport = useSession((s) => s.loadReport)
  const fileRef = useRef<HTMLInputElement>(null)

  function save() {
    const json = serializeReport(report)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'quackbook-report.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function open(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    try {
      const doc = deserializeReport(await file.text())
      loadReport(doc)
    } catch (err) {
      alert('Не удалось открыть отчёт: ' + String(err))
    }
  }
```

Заменить тулбар на:

```tsx
      <div className="report-toolbar">
        <button onClick={() => addTextBlock()}>+ текст</button>
        <button onClick={save}>сохранить</button>
        <button onClick={() => fileRef.current?.click()}>открыть</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={open}
        />
      </div>
```

- [ ] **Step 2: Gate**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm run lint && npm run build && npm test
```

Expected: all three green.

- [ ] **Step 3: Verify by eye**

`npm run dev`: build a report (pin a widget + a text block). Click `сохранить` → `quackbook-report.json` downloads; open it in an editor — structure only, no widget rows. Click `открыть`, pick a saved JSON → the report is replaced (`loadReport`). Pick a garbage `.json` → `alert` fires, current report untouched.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/cosmi/Projects/quackbook && git add src/features/Report.tsx && git commit -F- <<'EOF'
feat(ui): report save (download JSON) + open (file input -> loadReport)

Сохранить serializes report to a downloaded quackbook-report.json (structure
only). Открыть reads a chosen file, deserializeReport in try/catch -> loadReport
on success, alert on failure; input value reset so the same file re-picks.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 10: `RehydrationBanner`

**Files:**
- Create: `src/components/RehydrationBanner.tsx`
- Modify: `src/features/Report.tsx` (render at top)

**Interfaces:**
- Consumes: `neededDatasets` from `../core/report`; store `report`, `datasets`.
- Produces: `<RehydrationBanner />` — names datasets the report needs but that aren't loaded; renders nothing when none are missing.

> No vitest (UI by eye; `neededDatasets` already TDD'd in Task 2).

- [ ] **Step 1: Write the component**

Создать `src/components/RehydrationBanner.tsx`:

```tsx
import { neededDatasets } from '../core/report'
import { useSession } from '../state/session'

export function RehydrationBanner() {
  const report = useSession((s) => s.report)
  const datasets = useSession((s) => s.datasets)

  const loaded = new Set(datasets.map((d) => d.table))
  const missing = neededDatasets(report).filter((t) => !loaded.has(t))

  if (missing.length === 0) return null
  return (
    <div className="rehydration-banner" role="alert">
      Этому отчёту нужны источники: {missing.join(', ')} — подгрузи их (брось
      файлы выше), чтобы виджеты пересчитались.
    </div>
  )
}
```

- [ ] **Step 2: Render it at the top of Report**

В `src/features/Report.tsx` добавить import:

```tsx
import { RehydrationBanner } from '../components/RehydrationBanner'
```

и отрендерить сразу после открывающего `<div className="report">`, перед `<div className="report-toolbar">`:

```tsx
      <RehydrationBanner />
```

- [ ] **Step 3: Gate**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm run lint && npm run build && npm test
```

Expected: all three green.

- [ ] **Step 4: Verify by eye**

`npm run dev`: with a report referencing `events` but `events` NOT loaded (e.g. reload the page, or open a saved JSON whose datasets aren't loaded) → banner names the missing source(s), and each widget shows its error + «источник(и): …». Drop the matching file → widgets recompute and the banner disappears (`missing` empties).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/cosmi/Projects/quackbook && git add src/components/RehydrationBanner.tsx src/features/Report.tsx && git commit -F- <<'EOF'
feat(ui): RehydrationBanner — names report datasets not yet loaded

neededDatasets(report) minus loaded dataset tables; when non-empty, a banner
tells the user which sources to drop so widgets recompute. Renders nothing when
all needed sources are present.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 11: Rail highlight follows active block

**Files:**
- Modify: `src/features/Rail.tsx`

**Interfaces:**
- Consumes: store `mode`, `report`, `activeBlockId` (in addition to existing `tabs`/`activeTabId`); existing `detectReferencedTables`/`detectUsedColumns`.
- Produces: in report mode with an active WIDGET block, the rail's "current sql" is that block's `sql`; explore mode keeps the active-tab behavior. No signature change to `<Rail client />`.

> No vitest (UI by eye; the SQL-parsing core is already TDD'd in `pruning.test.ts`).

- [ ] **Step 1: Factor the "current sql + dataset table" out of the active tab**

В `src/features/Rail.tsx`:

Добавить селекторы стора (рядом с `activeTabId`):

```tsx
  const mode = useSession((s) => s.mode)
  const report = useSession((s) => s.report)
  const activeBlockId = useSession((s) => s.activeBlockId)
```

Найти существующий блок, вычисляющий `activeTab`, `referenced`, `shownTables` (строки ~31–48). Заменить его на единый источник «текущего sql»: in report mode the active query is the active widget block's sql; in explore mode it's the active tab's sql. Both feed the same `detectReferencedTables`/`detectUsedColumns`.

Заменить:

```tsx
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  // The rail follows the active query: show the schema of every table it
  // references (a JOIN/UNION => several sections). Before a table is named
  // (blank/empty tab) fall back to the tab's own dataset, else the first
  // source, so the rail isn't empty.
  const referenced = activeTab
    ? detectReferencedTables(
        activeTab.sql,
        datasets.map((d) => d.table),
      )
    : []
  const shownTables =
    referenced.length > 0
      ? referenced
      : [activeTab?.datasetTable ?? datasets[0]?.table].filter(
          (t): t is string => t != null,
        )
```

на:

```tsx
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  // The rail follows the ACTIVE QUERY. In report mode that's the active widget
  // block's sql (click a widget -> rail shows its schema/highlights); in explore
  // mode it's the active tab's sql. Both feed the same detect* machinery.
  const activeWidget =
    mode === 'report'
      ? report.blocks.find(
          (b) => b.id === activeBlockId && b.type === 'widget',
        )
      : undefined
  const currentSql =
    activeWidget && activeWidget.type === 'widget'
      ? activeWidget.sql
      : (activeTab?.sql ?? null)
  const fallbackTable = activeTab?.datasetTable ?? datasets[0]?.table

  // Before a table is named (blank/empty tab, or no active widget) fall back to
  // the tab's own dataset, else the first source, so the rail isn't empty.
  const referenced = currentSql
    ? detectReferencedTables(
        currentSql,
        datasets.map((d) => d.table),
      )
    : []
  const shownTables =
    referenced.length > 0
      ? referenced
      : [fallbackTable].filter((t): t is string => t != null)
```

- [ ] **Step 2: Point column highlighting at `currentSql`**

В том же файле найти used-columns highlight внутри `shownDatasets.map(...)`:

```tsx
        const used = new Set(
          activeTab
            ? detectUsedColumns(
                activeTab.sql,
                ds.columns.map((c) => c.name),
              )
            : [],
        )
```

Заменить на:

```tsx
        const used = new Set(
          currentSql
            ? detectUsedColumns(
                currentSql,
                ds.columns.map((c) => c.name),
              )
            : [],
        )
```

> `activeTab` is still used for the explore-mode fallback table; keep its declaration. Only the two `detect*` call sites switch to `currentSql`.

- [ ] **Step 3: Gate**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm run lint && npm run build && npm test
```

Expected: all three green.

- [ ] **Step 4: Verify by eye**

`npm run dev`: in отчёт with its datasets loaded, click a widget block whose SQL touches a table → the rail shows that table's schema section and highlights the columns the query reads (`▸ подсвечены колонки…`). Switch to исследование → the rail follows the active tab again (unchanged behavior).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/cosmi/Projects/quackbook && git add src/features/Rail.tsx && git commit -F- <<'EOF'
feat(ui): rail highlight follows the active widget block in report mode

Factor the rail's "current sql" out of the active tab: in report mode it's the
active widget block's sql, in explore mode the active tab's. Both feed the same
detectReferencedTables / detectUsedColumns, so clicking a widget shows its
schema + used-column highlights.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 12: CSS polish for report blocks (by eye)

**Files:**
- Modify: `src/index.css`

**Interfaces:** styling only — classes introduced by Tasks 5–11 (`.report`, `.report-toolbar`, `.report-stack`, `.report-block`, `.report-block.active`, `.text-block`, `.text-block-edit`, `.widget-block`, `.widget-head`, `.widget-title`, `.widget-datasets`, `.ds-pill`, `.widget-sql-toggle`, `.widget-sql`, `.widget-controls`, `.widget-view-toggle`, `.widget-error`, `.widget-sources-hint`, `.widget-caption`, `.toast`, `.rehydration-banner`, `.pin-btn`). No logic, no tests.

> No vitest. This is the honest CSS boundary (CLAUDE.md): presentation verified by eye against the existing dark palette. Reuse existing tokens (`.panel-head`, `.view-toggle`, `.result-error`, `.result-empty`, `.report-stub`, `.source` colors) so the report layer matches Explore.

- [ ] **Step 1: Add report styles**

Добавить в конец `src/index.css` стили на литеральную тёмную палитру репо (фон `#0e1f22`-семейство, текст `#c8d6d2`/`#e9eeea`, акцент `#1d363b`), переиспользуя существующие токены. Пример (подгонять глазами):

```css
/* --- M4 report (notebook) --- */
.report { display: flex; flex-direction: column; gap: 14px; padding: 16px 18px; overflow: auto; }
.report-toolbar { display: flex; gap: 8px; }
.report-toolbar button { background: #11262a; color: #c8d6d2; border: 1px solid #1d363b; border-radius: 7px; padding: 5px 11px; cursor: pointer; }
.report-toolbar button:hover { background: #1d363b; color: #e9eeea; }

.report-stack { display: flex; flex-direction: column; gap: 14px; max-width: 920px; }
.report-block { border: 1px solid transparent; border-radius: 9px; padding: 10px 12px; cursor: pointer; }
.report-block.active { border-color: #2a4a50; background: #0f2327; }

.text-block { line-height: 1.5; color: #d7e2de; }
.text-block :where(h1,h2,h3) { color: #e9eeea; }
.text-block-edit { width: 100%; min-height: 96px; background: #0c1c1f; color: #e9eeea; border: 1px solid #1d363b; border-radius: 7px; padding: 8px; font: inherit; resize: vertical; }

.widget-block { display: flex; flex-direction: column; gap: 8px; }
.widget-head { display: flex; align-items: center; gap: 10px; }
.widget-title { font-weight: 600; color: #e9eeea; }
.widget-datasets { display: flex; gap: 4px; }
.ds-pill { font-size: 11px; background: #11262a; color: #9fb4af; border-radius: 5px; padding: 1px 7px; }
.widget-sql-toggle, .widget-controls button { background: none; border: none; color: #9fb4af; cursor: pointer; }
.widget-controls { margin-left: auto; display: flex; gap: 6px; }
.widget-controls button:hover { color: #e9eeea; }
.widget-sql { background: #0c1c1f; color: #9fb4af; border-radius: 7px; padding: 8px; overflow: auto; font-size: 12px; }
.widget-view-toggle { align-self: flex-start; }
.widget-error { display: flex; flex-direction: column; gap: 4px; }
.widget-sources-hint { color: #c79a4a; font-size: 12px; }
.widget-caption { background: transparent; border: none; border-bottom: 1px dashed #1d363b; color: #c8d6d2; padding: 4px 2px; font: inherit; }
.widget-caption:focus { outline: none; border-bottom-color: #2a4a50; }

.pin-btn { background: #11262a; color: #c8d6d2; border: 1px solid #1d363b; border-radius: 7px; padding: 3px 9px; cursor: pointer; }
.pin-btn:hover { background: #1d363b; color: #e9eeea; }

.toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); background: #1d363b; color: #e9eeea; border-radius: 9px; padding: 8px 16px; box-shadow: 0 6px 20px rgba(0,0,0,.4); z-index: 50; }
.rehydration-banner { background: #2a2412; color: #e9d39a; border: 1px solid #574a1d; border-radius: 9px; padding: 8px 12px; max-width: 920px; }
```

- [ ] **Step 2: Gate**

```bash
cd /c/Users/cosmi/Projects/quackbook && npm run lint && npm run build && npm test
```

Expected: all three green (CSS-only; no type/test impact).

- [ ] **Step 3: Verify by eye**

`npm run dev`: the report layer reads cleanly against the dark Explore palette — active block highlighted, dataset pills/SQL/caption legible, toast bottom-center, rehydration banner amber.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/cosmi/Projects/quackbook && git add src/index.css && git commit -F- <<'EOF'
style(ui): report block / toast / rehydration-banner / pin styles

Dark-palette styling for the M4 report layer (vertical stack, active block,
widget head/pills/sql/caption, toast, rehydration banner, pin button), reusing
existing tokens to match Explore. Presentation verified by eye.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Final acceptance (end of Slice 2 = M4 done)

`npm run dev`, then run the full демо-нарратив:

1. Drop 1–2 CSVs; run a query per source (and a JOIN/GROUP BY for a chart).
2. `📌 закрепить` 2–3 results → each toasts, you stay in Исследование.
3. Switch to отчёт → widgets recomputed (table/chart toggles work); add `+ текст` between them, write commentary.
4. Reorder blocks with ↑/↓; remove one with ✕.
5. `сохранить` → `quackbook-report.json` downloads (structure only — open it, confirm no widget rows).
6. Reload the page → structure restored from localStorage; widgets show «нужны источники: …» and the rehydration banner lists them; re-drop the files → widgets recompute, banner disappears.
7. Click Reset → report clears, `quackbook.report` key removed.
8. `открыть` a saved JSON without its datasets loaded → report replaced, banner names needed datasets; drop the files → widgets recompute.
9. In отчёт, click a widget → the rail shows its schema + highlights used columns.

All gates green throughout: `npm run lint && npm run build && npm test`.

- [ ] **Finish the branch:** invoke `superpowers:finishing-a-development-branch` to decide merge/PR/cleanup for `m4-notebook` (the user pushes; do not push unprompted — see project memory).
