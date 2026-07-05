# M7b «Исполняемые ячейки» — план имплементации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Отчёт = живой ноутбук: SQL виджета правится и исполняется на месте (черновик → «▸ выполнить»), «выполнить всё» пересчитывает документ, «+ запрос» рождает ячейку прямо в отчёте.

**Architecture:** Формат отчёта НЕ меняется (version 1; пустой `sql` у widget-блока уже валиден). Черновик и статусы — runtime-only: черновик в локальном стейте `WidgetBlockView`, коммит — store-экшен `updateWidgetSql` (существующий rerun-эффект по `block.sql` пересчитывает ячейку), «выполнить всё» — store-счётчик `runAllSeq` в депсах эффекта каждой ячейки (единственный WASM-worker сериализует исполнение → наблюдаемо сверху вниз). Редактор ячейки — существующий `SqlEditor` с новым `compact`-пропом.

**Tech Stack:** React 19 + TS, zustand 5, CodeMirror 6 (уже в проекте), Vitest (node env).

**Спека:** `docs/superpowers/specs/2026-07-05-warpbook-m7b-executable-cells-design.md`.

## Global Constraints

- **0 новых npm-зависимостей**; `package.json` в диффе не меняется.
- Гейт КАЖДОЙ задачи перед коммитом: `npm test` + `npm run build` + `npm run lint` — 0 ошибок / 0 варнингов.
- Формат отчёта: `core/report.ts` НЕ трогаем (типы/сериализация/валидация без изменений) — это проверяемое требование спеки.
- Исполняется ПОСЛЕ плана M9 (тот добавляет `SqlEditor` проп `history?`; наши правки аддитивны — конфликтов нет; ячейки историю НЕ передают). Если M9 ещё не смержен — СТОП, скажи контроллеру.
- UI-строки русские, в нижнем регистре; цвета — только токены `index.css`; dot-команды в ячейках не работают (фича explore-shell) — это принятое поведение, не баг.
- Firewall: без dashboard-грида, join-builder, per-cell правки данных, OPFS, EXPLAIN; DDL в ячейках не поощряем (движок его исполнит как и раньше — упадёт на `LIMIT`-обёртке `buildWidgetSql`, поведение прежнее).
- Коммиты: `type(scope): описание` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; multi-line — bash here-doc.

---

### Task 1: `core/cellSql.ts` — `extractDatasetNames` (TDD)

**Files:**
- Create: `src/core/cellSql.ts`
- Test: `src/core/cellSql.test.ts`

**Interfaces:**
- Produces: `extractDatasetNames(sql: string, known: string[]): string[]` — отсортированный список известных таблиц, упомянутых в SQL как целые слова. Task 4 вызывает при коммите черновика.

- [ ] **Step 1: Красный тест**

```ts
// src/core/cellSql.test.ts
import { describe, it, expect } from 'vitest'
import { extractDatasetNames } from './cellSql'

describe('extractDatasetNames', () => {
  it('находит известную таблицу', () => {
    expect(extractDatasetNames('SELECT * FROM demo_users', ['demo_users', 'demo_payments'])).toEqual(['demo_users'])
  })
  it('регистронезависимо (как каталог DuckDB)', () => {
    expect(extractDatasetNames('select * from DEMO_USERS', ['demo_users'])).toEqual(['demo_users'])
  })
  it('подстроки НЕ матчатся', () => {
    expect(extractDatasetNames('SELECT * FROM demo_users_2024', ['demo_users'])).toEqual([])
    expect(extractDatasetNames('SELECT users_x FROM t', ['users'])).toEqual([])
  })
  it('несколько таблиц → sorted-дедуп', () => {
    const sql = 'SELECT * FROM demo_users u JOIN demo_payments p ON u.id=p.id JOIN demo_users d ON 1=1'
    expect(extractDatasetNames(sql, ['demo_users', 'demo_payments', 'demo_taxi'])).toEqual(['demo_payments', 'demo_users'])
  })
  it('квотированное имя "demo_users" тоже матчится', () => {
    expect(extractDatasetNames('SELECT * FROM "demo_users"', ['demo_users'])).toEqual(['demo_users'])
  })
  it('пустой SQL / нет известных → []', () => {
    expect(extractDatasetNames('', ['demo_users'])).toEqual([])
    expect(extractDatasetNames('SELECT 1', [])).toEqual([])
  })
})
```

Run: `npx vitest run src/core/cellSql.test.ts` — FAIL.

- [ ] **Step 2: Реализация**

```ts
// src/core/cellSql.ts

/**
 * Известные таблицы, упомянутые в SQL как целые идентификаторы-слова
 * (регистронезависимо), отсортированные по возрастанию. Строки/комментарии
 * сознательно не вычищаются: имя таблицы в строковом литерале даст ложный
 * плюс — приемлемо, это только хинт рехидрации отчёта (спека M7b).
 */
export function extractDatasetNames(sql: string, known: string[]): string[] {
  const words = new Set(sql.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? [])
  return known.filter((t) => words.has(t.toLowerCase())).sort()
}
```

- [ ] **Step 3: Зелёный + гейт + коммит**

Run: `npx vitest run src/core/cellSql.test.ts` — PASS; затем `npm test`, `npm run build`, `npm run lint`.

```bash
git add src/core/cellSql.ts src/core/cellSql.test.ts
git commit -m "feat(cells): extractDatasetNames — пере-вывод источников ячейки при коммите SQL (TDD)"
```

---

### Task 2: Стор — `updateWidgetSql` / `addQueryBlock` / `runAll` (TDD)

**Files:**
- Modify: `src/state/session.ts`
- Test: `src/state/session.cells.test.ts` (новый)

**Interfaces:**
- Consumes: паттерны существующих редьюсеров отчёта (`pinResult`, `updateWidgetTitle`).
- Produces: `updateWidgetSql(id, sql, datasetNames)`, `addQueryBlock()` (аппенд пустой ячейки + активация), `runAllSeq: number` + `runAll()` — Task 4/5.
- Сериализация: пустой `sql` — валидный `WidgetBlock` уже сейчас (`core/report.ts` не трогаем); тест фиксирует round-trip.

- [ ] **Step 1: Красный тест**

```ts
// src/state/session.cells.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useSession } from './session'
import { serializeReport, deserializeReport } from '../core/report'

beforeEach(() => {
  useSession.setState({
    report: { version: 1, blocks: [] },
    activeBlockId: null,
    runAllSeq: 0,
    seq: 0,
  })
})

describe('addQueryBlock', () => {
  it('аппендит пустую widget-ячейку и делает её активной', () => {
    useSession.getState().addQueryBlock()
    const s = useSession.getState()
    expect(s.report.blocks).toHaveLength(1)
    const b = s.report.blocks[0]
    expect(b).toMatchObject({ type: 'widget', title: 'запрос', sql: '', datasetNames: [], vizType: 'table', caption: '' })
    expect(s.activeBlockId).toBe(b.id)
    expect(s.seq).toBe(1)
  })
  it('пустая ячейка переживает serialize/deserialize без изменений формата', () => {
    useSession.getState().addQueryBlock()
    const doc = useSession.getState().report
    expect(deserializeReport(serializeReport(doc))).toEqual(doc)
  })
})

describe('updateWidgetSql', () => {
  it('пишет sql и datasetNames только widget-блоку', () => {
    useSession.getState().addQueryBlock()
    const id = useSession.getState().report.blocks[0].id
    useSession.getState().updateWidgetSql(id, 'SELECT * FROM demo_users', ['demo_users'])
    const b = useSession.getState().report.blocks[0]
    expect(b.type === 'widget' && b.sql).toBe('SELECT * FROM demo_users')
    expect(b.type === 'widget' && b.datasetNames).toEqual(['demo_users'])
  })
  it('текстовый блок не трогает', () => {
    useSession.getState().addTextBlock('hi')
    const id = useSession.getState().report.blocks[0].id
    useSession.getState().updateWidgetSql(id, 'SELECT 1', [])
    const b = useSession.getState().report.blocks[0]
    expect(b.type === 'text' && b.markdown).toBe('hi')
  })
})

describe('runAll', () => {
  it('инкрементит runAllSeq', () => {
    useSession.getState().runAll()
    useSession.getState().runAll()
    expect(useSession.getState().runAllSeq).toBe(2)
  })
})
```

Run: `npx vitest run src/state/session.cells.test.ts` — FAIL.

- [ ] **Step 2: Реализация в session.ts**

В `SessionState` (рядом с block-экшенами):

```ts
  runAllSeq: number
  addQueryBlock: () => void
  updateWidgetSql: (id: string, sql: string, datasetNames: string[]) => void
  runAll: () => void
```

В `initial`: `runAllSeq: 0,` (runtime-счётчик; сброс при reset безвреден).

Редьюсеры (рядом с `pinResult`/`updateWidgetTitle`, тот же стиль):

```ts
  addQueryBlock: () =>
    set((s) => {
      const id = `blk-${s.seq + 1}`
      return {
        report: {
          version: 1,
          blocks: [
            ...s.report.blocks,
            { type: 'widget', id, title: 'запрос', sql: '', datasetNames: [], vizType: 'table', caption: '' },
          ],
        },
        activeBlockId: id,
        seq: s.seq + 1,
      }
    }),
  updateWidgetSql: (id, sql, datasetNames) =>
    set((s) => ({
      report: {
        version: 1,
        blocks: s.report.blocks.map((b) =>
          b.id === id && b.type === 'widget' ? { ...b, sql, datasetNames } : b,
        ),
      },
    })),
  runAll: () => set((s) => ({ runAllSeq: s.runAllSeq + 1 })),
```

(автосейв отчёта сработает штатно — оба экшена меняют референс `report`).

- [ ] **Step 3: Зелёный + гейт + коммит**

Run: `npx vitest run src/state/session.cells.test.ts` — PASS; гейт-триада.

```bash
git add src/state/session.ts src/state/session.cells.test.ts
git commit -m "feat(cells): store — addQueryBlock/updateWidgetSql/runAll, формат отчёта не меняется (TDD)"
```

---

### Task 3: `SqlEditor` — проп `compact`

**Files:**
- Modify: `src/components/SqlEditor.tsx`

**Interfaces:**
- Produces: `compact?: boolean` — стартовая высота 120 вместо 168 и БЕЗ drag-ручки. Поведение explore-редактора не меняется (проп не передан). Ячейки НЕ передают `history` → стрелочная навигация M9 в них отключена сама (пустой `histRef` → `stepHistory` возвращает false).

- [ ] **Step 1: Правка**

В `Props` добавить `compact?: boolean`; деструктурировать. Заменить инициализацию высоты и рендер ручки:

```ts
  const [height, setHeight] = useState(compact ? 120 : 168)
```

```tsx
      {!compact && (
        <div
          className="sql-resize"
          onPointerDown={startResize}
          title="потяни, чтобы изменить высоту редактора"
        />
      )}
```

(`startResize`/`setHeight` остаются — используются только в полном режиме; линтер не должен ругаться, т.к. функция по-прежнему referenced в JSX-ветке).

- [ ] **Step 2: Гейт + глазами**

Run: гейт-триада. `npm run dev`: explore-редактор выглядит и ресайзится как раньше (проп не передан) — регрессии нет.

- [ ] **Step 3: Коммит**

```bash
git add src/components/SqlEditor.tsx
git commit -m "feat(cells): compact-режим SqlEditor — 120px без drag-ручки, explore не тронут"
```

---

### Task 4: `WidgetBlockView` — ячейка (черновик, статусы, редактор) + фикс key

**Files:**
- Modify: `src/components/WidgetBlockView.tsx`, `src/features/Report.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `updateWidgetSql`/`runAllSeq` (Task 2), `extractDatasetNames` (Task 1), `SqlEditor compact` (Task 3), `buildSqlSchema` (`../core/sqlSchema`), `isInternalTable` (`../core/sql`).
- КРИТИЧНО: в `Report.tsx` виджет сейчас рендерится `<WidgetBlockView key={block.sql} …/>` — при правке SQL это РАЗМОНТИРУЕТ ячейку (смерть черновика и статуса сразу после коммита). Ключ убрать: внешний `div` уже keyed по `block.id`, rerun обеспечивают депсы эффекта.
- Статусы (спека): `…` (выполняется) / `ошибка` / `правка не выполнена` (draft ≠ block.sql); свежий ок — без чипа. Пустой `sql` → kind `idle`, эффект НЕ дёргает движок, редактор раскрыт сразу.

- [ ] **Step 1: Report.tsx — убрать sql-key**

```tsx
              ) : (
                <WidgetBlockView block={block} client={client} />
              )}
```

(было `key={block.sql}`; больше в этом файле НИЧЕГО не менять — тулбар придёт в Task 5).

- [ ] **Step 2: WidgetBlockView — ячейка**

Импорты добавить/расширить:

```ts
import { useEffect, useMemo, useState } from 'react'
import { buildSqlSchema } from '../core/sqlSchema'
import { extractDatasetNames } from '../core/cellSql'
import { isInternalTable } from '../core/sql'
import { SqlEditor } from './SqlEditor'
```

`WidgetState` расширить:

```ts
type WidgetState =
  | { kind: 'idle' } // пустой sql — ячейка ждёт первый запрос
  | { kind: 'loading' }
  | { kind: 'ok'; result: QueryResult; truncated: boolean }
  | { kind: 'error'; message: string }
```

Стейт/хуки в компоненте: существующие объявления `const [state, setState] = useState<WidgetState>({ kind: 'loading' })` и `const [sqlOpen, setSqlOpen] = useState(false)` ЗАМЕНИТЬ на блок ниже (draft/runSeq/dirty — новые; title-стейт не трогать):

```ts
  const updateWidgetSql = useSession((s) => s.updateWidgetSql)
  const runAllSeq = useSession((s) => s.runAllSeq)
  const datasets = useSession((s) => s.datasets)
  const schema = useMemo(() => buildSqlSchema(datasets), [datasets])

  const [state, setState] = useState<WidgetState>(
    block.sql.trim() === '' ? { kind: 'idle' } : { kind: 'loading' },
  )
  // Редактор раскрыт сразу у свежей пустой ячейки («+ запрос»).
  const [sqlOpen, setSqlOpen] = useState(block.sql === '')
  // Черновик SQL — runtime-only (спека): живёт, пока блок смонтирован.
  const [draft, setDraft] = useState(block.sql)
  const [runSeq, setRunSeq] = useState(0)
  const dirty = draft !== block.sql
```

Синхронизация черновика при внешней смене sql (наш же коммит — no-op; loadReport с теми же id — следуем):

```ts
  // После commitDraft block.sql === draft (no-op). Внешняя загрузка отчёта с
  // совпадающими id обновляет незакоммиченный черновик — принято (runtime-only).
  useEffect(() => {
    setDraft(block.sql)
  }, [block.sql])
```

Эффект пересчёта — заменить целиком (guard пустого sql + явный `loading` на каждый заход + новые депсы):

```ts
  useEffect(() => {
    if (block.sql.trim() === '') {
      setState({ kind: 'idle' })
      return
    }
    let cancelled = false
    setState({ kind: 'loading' })
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
      .catch((e) => {
        if (cancelled) return
        setState({ kind: 'error', message: String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [block.sql, client, loadedKey, runSeq, runAllSeq])
```

Коммит черновика:

```ts
  function commitDraft() {
    if (draft.trim() === '') return
    if (draft === block.sql) {
      setRunSeq((n) => n + 1) // без правки — просто пересчитать
      return
    }
    const known = datasets.filter((d) => !isInternalTable(d.table)).map((d) => d.table)
    updateWidgetSql(block.id, draft, extractDatasetNames(draft, known))
  }
```

Чипы статуса — в `widget-head`, сразу после title-спана (перед `widget-datasets`):

```tsx
        {loading && <span className="cell-chip">…</span>}
        {error !== null && <span className="cell-chip err">ошибка</span>}
        {dirty && <span className="cell-chip dirty">правка не выполнена</span>}
```

Редактор вместо `<pre>` (заменить строку `{sqlOpen && <pre className="widget-sql">{block.sql}</pre>}`):

```tsx
      {sqlOpen && (
        <div className="cell-editor">
          <SqlEditor
            compact
            value={draft}
            onChange={setDraft}
            onRun={() => commitDraft()}
            schema={schema}
          />
          <div className="cell-actions">
            <button className="cell-run" disabled={draft.trim() === ''} onClick={commitDraft}>
              ▸ выполнить
            </button>
            <button
              className="cell-rerun"
              title="пере-исполнить сохранённый SQL"
              disabled={block.sql.trim() === ''}
              onClick={() => setRunSeq((n) => n + 1)}
            >
              ⟳
            </button>
            {dirty && (
              <button className="cell-cancel" onClick={() => setDraft(block.sql)}>
                отменить
              </button>
            )}
          </div>
        </div>
      )}
```

Явное решение: у `.cell-editor` НЕТ `stopPropagation` — клик в редакторе всплывает до `.report-block` и активирует блок, рейл следует за ячейкой (желаемое поведение, как у остального тела виджета).

Idle-рендер — к веткам вывода добавить:

```tsx
      {state.kind === 'idle' && (
        <p className="result-empty">напиши запрос и нажми ▸ выполнить</p>
      )}
```

(остальные ветки уже защищены `result`/`loading`/`error` — при idle не рендерятся; `loading` переменная остаётся `state.kind === 'loading'`).

- [ ] **Step 3: CSS**

```css
/* Ячейка отчёта (M7b) */
.cell-chip { font-family: var(--font-mono); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint); border: 1px solid var(--border); padding: 1px 6px; border-radius: 3px; white-space: nowrap; }
.cell-chip.dirty { color: var(--accent-2); border-color: var(--accent-2); }
.cell-chip.err { color: var(--warn-bright); border-color: var(--warn-bright); }
.cell-editor { margin: 8px 0; border: 1px dashed var(--border); border-radius: var(--radius-sm); padding: 6px; }
.cell-editor:focus-within { border-color: var(--accent); }
.cell-actions { display: flex; gap: 8px; margin-top: 6px; }
.cell-actions button { border: 1px solid var(--border); background: transparent; color: var(--text-dim); padding: 3px 10px; border-radius: var(--radius-sm); cursor: pointer; font-size: 12px; }
.cell-actions .cell-run:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.cell-actions button:hover:not(:disabled) { border-color: var(--accent-2); color: var(--accent-2); }
.cell-actions button:disabled { opacity: .45; cursor: default; }
```

(`--warn-bright` существует с редизайна; если чип ошибки не совпадёт по тону с `.result-error` — подогнать глазами.)

- [ ] **Step 4: Гейт + глазами**

Run: гейт-триада. `npm run dev`: закрепить виджет из explore → в отчёте «SQL ▸» открывает редактор с подсветкой и автокомплитом; правка → чип «правка не выполнена»; Ctrl+Enter или «▸ выполнить» → пересчёт, чип гаснет; «⟳» пере-исполняет; «отменить» возвращает; кривой SQL → чип «ошибка» + текст ошибки на месте, остальные ячейки живы; правка SQL НЕ сворачивает редактор и НЕ теряет фокус контекста (фикс key).

- [ ] **Step 5: Коммит**

```bash
git add src/components/WidgetBlockView.tsx src/features/Report.tsx src/index.css
git commit -F - <<'EOF'
feat(cells): виджет -> исполняемая ячейка

Inline-редактор (SqlEditor compact, автокомплит по схеме), черновик ->
«выполнить» коммитит через updateWidgetSql (+пере-вывод datasetNames),
«⟳» пере-исполняет, чипы статуса (выполняется/ошибка/правка не
выполнена), idle для пустого sql. Report: убран key={block.sql} —
правка SQL больше не размонтирует ячейку.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Тулбар отчёта — «+ запрос» и «▸ выполнить всё»

**Files:**
- Modify: `src/features/Report.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `addQueryBlock`/`runAll` (Task 2); `runAllSeq` уже в депсах эффекта ячейки (Task 4) — все ячейки пересчитываются, диспатч в порядке документа, worker сериализует.

- [ ] **Step 1: Кнопки**

В `Report.tsx`: селекторы `const addQueryBlock = useSession((s) => s.addQueryBlock)` и `const runAll = useSession((s) => s.runAll)`; `const hasWidgets = report.blocks.some((b) => b.type === 'widget')`.

`toolbar-left`:

```tsx
          <button onClick={() => addTextBlock()}>+ текст</button>
          <button onClick={() => addTextBlock('```sql\n-- код\n```')}>+ код</button>
          <button onClick={addQueryBlock}>+ запрос</button>
```

`toolbar-right` — ПЕРВЫМ элементом (до экспорт-группы):

```tsx
          {hasWidgets && (
            <button className="run-all" onClick={runAll} title="пересчитать все ячейки сверху вниз">
              ▸ выполнить всё
            </button>
          )}
```

- [ ] **Step 2: CSS**

```css
.report-toolbar .run-all { border-color: var(--accent); color: var(--accent); }
.report-toolbar .run-all:hover { border-color: var(--accent-2); color: var(--accent-2); }
```

- [ ] **Step 3: Гейт + глазами (DoD спеки)**

Run: гейт-триада. `npm run dev`:
- «+ запрос» → пустая активная ячейка с раскрытым редактором и хинтом; пишем `SELECT * FROM demo_users` → «▸ выполнить» → таблица; чарт-тоггл работает;
- «выполнить всё» → все ячейки мигают `…` и пересчитываются сверху вниз; ячейка с ошибкой показывает её на месте, остальные завершаются;
- перезагрузка страницы → отчёт с пустой ячейкой открывается (формат не менялся), сохранение/открытие JSON работает;
- смена данных (перезалить файл) по-прежнему авто-пересчитывает (loadedKey).

- [ ] **Step 4: Коммит**

```bash
git add src/features/Report.tsx src/index.css
git commit -m "feat(cells): тулбар отчёта — «+ запрос» и «выполнить всё» (runAllSeq)"
```

---

## Порядок и зависимости

1 (core) и 2 (стор) независимы; 3 (compact) независим; 4 требует 1+2+3; 5 требует 2+4. Всё после мержа M9 (см. Global Constraints).

## Definition of Done (спека)

- Правка SQL в ячейке → «выполнить» → пересчёт на месте; «выполнить всё» проходит документ, ошибки локальны.
- «+ запрос» создаёт ячейку в отчёте; пустой sql не исполняется.
- `core/report.ts` не изменён (git diff пуст по файлу); старый сохранённый JSON открывается.
- Гейт: `npm test` + `npm run build` + `npm run lint` 0/0; `git diff main -- package.json` пуст.
