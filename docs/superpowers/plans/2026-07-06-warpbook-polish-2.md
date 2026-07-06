# P2 «Полишинг-спринт №2» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть накопленный бэклог (`docs/BACKLOG.md`) одним скоупом + починить мобильную вёрстку (портрет — колоночный режим в потоке страницы; альбом — мини-десктоп через viewport-мету).

**Architecture:** 13 последовательных задач: тики устаревших пунктов → мобилка (CSS + `mobileViewport.ts`) → тематические батчи бэклога (терминал, экспорт, core-мелочи, витрины, ячейки, сортировка, грид, профиль, ресайзы, a11y). Логика — TDD в core/features-тестах (vitest node env, БЕЗ jsdom/RTL — компоненты тестами не покрываем); CSS/раскладка/фокус — глазами.

**Tech Stack:** React 19 + TS + Zustand 5, DuckDB-WASM (движок 1.5.4, npm-пакет `@duckdb/duckdb-wasm@1.32.0` — pinned, НЕ трогать), CodeMirror 6, Observable Plot, Vitest.

**Спека:** `docs/superpowers/specs/2026-07-06-warpbook-polish-2-design.md`.

## Global Constraints

- **0 новых npm-зависимостей.**
- **Гейт каждой задачи:** `npm test` → `npm run build` (полный tsc!) → `npm run lint` — все зелёные, lint **0 errors / 0 warnings**. НЕ маскировать exit-code пайпами (`| tail` глотает падение) — каждую команду отдельным вызовом.
- База на старте: **335 тестов / 36 файлов** — все зелёные; счётчик только растёт.
- **Ветка `polish-2`** от `main`; коммит на каждую задачу; FF-merge в `main` в конце спринта (push делает пользователь, НЕ агент).
- Коммиты: русский, conventional-стиль (`fix(scope): …`), трейлер `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Multi-line — через bash here-doc (`git commit -m "$(cat <<'EOF' … EOF)"`), НЕ PowerShell `@'…'@`.
- Бренд в UI — «warpbook»; внутренние идентификаторы (`_qb_`-префиксы, `quackbook.*`-ключи localStorage, имя пакета) НЕ переименовывать.
- `src/core/report.ts` НЕ трогать.
- Каждая задача **тем же коммитом** тикает свои пункты в `docs/BACKLOG.md`: `- [ ]` → `- [x]`, в конец строки дописать `Закрыто: <суть> (P2, <hash не нужен — достаточно «P2 полишинг»>)`.
- Русские строки UI — в кавычках-«ёлочках», тон терминальный, lowercase там, где уже так.

---

### Task 1: Бухгалтерия бэклога — тики уже закрытых пунктов

**Files:**
- Modify: `docs/BACKLOG.md`

Четыре открытых пункта бэклога уже закрыты прошлыми вехами — проверить и тикнуть, НЕ писать код.

- [ ] **Step 1: Проверить каждый факт по коду** (все четыре обязаны подтвердиться, иначе СТОП и доложить):
  1. `updateWidgetTitle` имеет UI: в `src/components/WidgetBlockView.tsx` есть `editingTitle`/`titleDraft` и `<span className="widget-title" … onClick={…setEditingTitle(true)}>` — click-to-edit реализован (M7b).
  2. `key={block.sql}` на виджете снят: в `src/features/Report.tsx` внешний div ключуется `key={block.id}`, `key={block.sql}` в файле отсутствует (M7b).
  3. `stripTrailingSemicolon` — уже ОДИН экспортируемый хелпер в `src/core/sql.ts:88`; `core/mart.ts` и `db/duckdbClient.ts` его импортируют (копий нет). Остаток пункта (многократные `;` + хвостовые комментарии) уходит в Task 6 — пункт НЕ тикать целиком, а переформулировать (см. Step 2).
  4. Пост-Reset утечка каталога: `src/core/resetPlan.ts` экспортирует `buildDropDatasetStatements` (csv → таблица+`_qb_raw_`, view/table → `buildDropMart`), и `Shell.handleReset` прогоняет его для всех датасетов — VIEW больше не остаётся в каталоге (приёмка M9). Также `loadSample` в `src/features/sampleData.ts` уже имеет module-level `inflight` Set (TOCTOU-половина про демо-данные закрыта).

- [ ] **Step 2: Правки BACKLOG.md**
  - `updateWidgetTitle без UI-вызова` → `[x]` + «Закрыто: click-to-edit заголовка реализован в M7b (WidgetBlockView editingTitle)».
  - `key={block.sql} … инертен` → `[x]` + «Закрыто: key снят в M7b (внешний div ключуется block.id)».
  - `Пост-Reset утечка каталога…` → `[x]` + «Закрыто: buildDropDatasetStatements в приёмке M9 — Reset дропает view/table через buildDropMart».
  - `refreshMart переставляет витрину… + stripTrailingSemicolon в третьей копии` — вычеркнуть ТОЛЬКО пол-пункта про копии: переписать текст, оставив только «refreshMart переставляет витрину в конец списка» (перестановка остаётся принятым минором), с припиской «(копии stripTrailingSemicolon уже консолидированы в core/sql.ts)».
  - `TOCTOU-гонки: loadDemoData / Shell.handleFiles` — переписать: loadDemoData-половина закрыта (M9, inflight Set в sampleData), остаётся Shell.handleFiles (закроет Task 6 этого спринта — пока НЕ тикать).

- [ ] **Step 3: Ветка + гейт + коммит**

```bash
git checkout -b polish-2
npm test
npm run build
npm run lint
git add docs/BACKLOG.md
git commit -m "$(cat <<'EOF'
docs(backlog): тики пунктов, закрытых M7b/M9 по факту

updateWidgetTitle click-to-edit и снятие key={block.sql} — M7b;
пост-Reset чистка каталога (buildDropDatasetStatements) и inflight-guard
loadSample — M9; stripTrailingSemicolon уже один хелпер в core/sql.ts.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Мобилка-портрет — колоночный режим в потоке страницы (CSS)

**Files:**
- Modify: `src/index.css:506-510` (медиа-блок `@media (max-width: 720px)`)

**Диагноз (скриншоты 2026-07-06):** топбар не переносится (min-content ~650px → страница шире вьюпорта → горизонтальный скролл + мёртвое чёрное поле); `.shell { height: 100vh }` с интринсик-высотой рейла в колонке выталкивает контент за шелл (статуслайн повисает посреди контента).

**Presentation-only: тестов нет, проверка глазами (граница CLAUDE.md).**

- [ ] **Step 1: Заменить медиа-блок**

Текущий блок (`src/index.css:506-510`):

```css
@media (max-width: 720px) {
  .body { flex-direction: column; }
  .rail { width: auto; flex: none; border-right: 0; border-bottom: 1px solid var(--border); }
  .rail-resize { display: none; }
}
```

Новый:

```css
@media (max-width: 720px) {
  /* Колоночный режим: страница скроллится ЦЕЛИКОМ (естественный поток),
     а не вложенные скролл-клетки внутри 100vh-шелла. dvh — мобильный URL-бар. */
  .shell { height: auto; min-height: 100dvh; }
  /* Топбар в две строки: лого+режимы / topbar-right (правое выравнивание
     держит его margin-left: auto). Иначе min-content ~650px распирает страницу. */
  .topbar { flex-wrap: wrap; row-gap: 4px; }
  .body { flex: none; flex-direction: column; }
  .rail { width: auto; flex: none; border-right: 0; border-bottom: 1px solid var(--border); overflow: visible; }
  .rail-resize { display: none; }
  .workspace { flex: none; overflow: visible; }
  .explore { flex: none; }
  .report { flex: none; overflow: visible; }
  /* Виртуализатору нужен ограниченный скролл-контейнер: в потоке страницы
     flex-потолок исчезает — даём явный. Отчётные 320px не задеты
     (.report-block .grid-scroll специфичнее). */
  .grid-scroll { max-height: 60vh; }
  /* Hero welcome не схлопывается в полоску при потоке. */
  .welcome-stage { flex: none; min-height: 75vh; }
}
```

- [ ] **Step 2: Приёмка в DevTools-эмуляции** (dev-сервер уже бежит на :5173): портрет 412×915 — welcome, explore с demo-данными (сэмпл «SQL 101», запустить запрос, открыть профиль), отчёт (пример отчёта). Чек-лист: (а) страница НЕ скроллится вбок ни на одном экране; (б) топбар в две ровные строки; (в) статуслайн — в самом конце документа; (г) грид скроллится внутри своих ≤60vh; (д) sticky-тулбар отчёта прилипает к верху вьюпорта при скролле — ок по дизайну. Ширину 720−1100 (узкое десктоп-окно) тоже прогнать — ничего не должно сломаться.

- [ ] **Step 3: Гейт + коммит**

```bash
npm test
npm run build
npm run lint
git add src/index.css
git commit -m "$(cat <<'EOF'
fix(mobile): портрет — колоночный режим в потоке страницы

Топбар переносится (две строки), шелл отпущен из 100vh-клетки в
естественный поток (min-height 100dvh, скроллится страница целиком,
статуслайн в конце), виртуализованный грид получает явный потолок 60vh.
Лечит горизонтальный скролл и статуслайн посреди контента (скриншоты
приёмки 2026-07-06).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Мобилка-альбом — viewport-свитч на мини-десктоп (TDD)

**Files:**
- Create: `src/mobileViewport.ts`
- Create: `src/mobileViewport.test.ts`
- Modify: `src/main.tsx`

**Interfaces:**
- Produces: `viewportContentFor(orientation: 'portrait' | 'landscape', screenWidth: number): string`; `DEFAULT_VIEWPORT: string`; `installMobileViewport(): void` (вызывается из `main.tsx` до рендера).

- [ ] **Step 1: Красный тест** — `src/mobileViewport.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { viewportContentFor, DEFAULT_VIEWPORT } from './mobileViewport'

describe('viewportContentFor', () => {
  it('альбом на телефоне → мини-десктоп width=1180', () => {
    expect(viewportContentFor('landscape', 915)).toBe('width=1180')
  })
  it('портрет на телефоне → дефолтная мета', () => {
    expect(viewportContentFor('portrait', 915)).toBe(DEFAULT_VIEWPORT)
  })
  it('широкий экран (планшет) не трогаем в обеих ориентациях', () => {
    expect(viewportContentFor('landscape', 1366)).toBe(DEFAULT_VIEWPORT)
    expect(viewportContentFor('portrait', 1366)).toBe(DEFAULT_VIEWPORT)
  })
})
```

- [ ] **Step 2: Убедиться, что падает** — `npm test -- mobileViewport` → FAIL (модуля нет).

- [ ] **Step 3: Реализация** — `src/mobileViewport.ts`:

```ts
export const DEFAULT_VIEWPORT = 'width=device-width, initial-scale=1.0'
const DESKTOP_LAYOUT_WIDTH = 1180
const WIDE_SCREEN = 1100 // длинная сторона планшета/десктопа — мета не нужна

/**
 * Контент viewport-меты по ориентации. Телефон в альбоме видит цельную
 * десктопную вёрстку в масштабе ~0.78 (layout 1180 ужимается в экран);
 * портрет и широкие экраны — обычный device-width (колоночный режим CSS).
 * screenWidth — ДЛИННАЯ сторона экрана в CSS-px (не зависит от ориентации).
 */
export function viewportContentFor(
  orientation: 'portrait' | 'landscape',
  screenWidth: number,
): string {
  if (orientation === 'landscape' && screenWidth < WIDE_SCREEN) {
    return `width=${DESKTOP_LAYOUT_WIDTH}`
  }
  return DEFAULT_VIEWPORT
}

/**
 * Тонкая обвязка (глазами): только тач-устройства; своп content существующей
 * меты по смене ориентации. screen.width/height в CSS-px устройства НЕ зависят
 * от текущего layout viewport (в отличие от innerWidth, который при width=1180
 * сам стал бы 1180 — петля).
 */
export function installMobileViewport(): void {
  if (!window.matchMedia('(pointer: coarse)').matches) return
  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return
  const mq = window.matchMedia('(orientation: landscape)')
  const apply = () => {
    const longSide = Math.max(window.screen.width, window.screen.height)
    meta.setAttribute(
      'content',
      viewportContentFor(mq.matches ? 'landscape' : 'portrait', longSide),
    )
  }
  apply()
  mq.addEventListener('change', apply)
}
```

- [ ] **Step 4: Зелёный** — `npm test -- mobileViewport` → PASS (3 теста).

- [ ] **Step 5: Подключить в `src/main.tsx`** (до рендера):

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { installMobileViewport } from './mobileViewport'
import './index.css'

installMobileViewport()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 6: Приёмка** — DevTools-эмуляция телефона (сенсорный режим!) 915×412 landscape: мета должна стать `width=1180`, вёрстка — десктопная в уменьшенном масштабе; поворот в портрет возвращает `width=device-width…` и колоночный режим. Поворот туда-обратно ×3 — без поломок. На десктопе (мышь) — мета не трогается вовсе.

- [ ] **Step 7: Гейт + коммит**

```bash
npm test
npm run build
npm run lint
git add src/mobileViewport.ts src/mobileViewport.test.ts src/main.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): альбом на теле — мини-десктоп через viewport-свитч

viewportContentFor (TDD): тач + landscape + экран уже 1100px CSS →
мета width=1180 (вся вёрстка ×~0.78, влезает больше); портрет и широкие
экраны — device-width. Подписка на смену ориентации в installMobileViewport,
вызов до рендера. Десктоп не затронут (мета игнорируется).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Терминал-дискаверабилити — история в UI + дот-команды в «?»

**Files:**
- Modify: `src/components/SqlEditor.tsx` (выделить `stepHistoryCore`, пробросить `historyCtl`/`onHistoryPos`)
- Modify: `src/features/Explore.tsx` (счётчик + кнопки ↑/↓ в panel-head)
- Modify: `src/components/AboutModal.tsx` (секция «Терминал»)
- Modify: `src/index.css` (стили `.hist-ctl`)

**Interfaces:**
- Produces: `export interface SqlEditorHistoryCtl { step: (dir: 1 | -1) => void }`; новые опц. пропсы SqlEditor: `historyCtl?: { current: SqlEditorHistoryCtl | null }`, `onHistoryPos?: (pos: number | null) => void` (pos: `null` = не в истории, `0` = самый свежий).

Логика шага истории уже существует и принята в M9 (клавиатурный путь); здесь — рефактор на core+guards и мышиный путь. Нового тестируемого core нет — приёмка глазами + существующий сюит.

- [ ] **Step 1: SqlEditor — выделить ядро шага и нотификацию.** В `Props` добавить два пропса; `cb`-ref расширить: `const cb = useRef({ onChange, onRun, onHistoryPos })` и `cb.current = { onChange, onRun, onHistoryPos }`. Добавить:

```ts
function notifyPos() {
  cb.current.onHistoryPos?.(histPos.current)
}
```

Разрезать `stepHistory` на ядро (без клавиатурных guard'ов) и клавиатурную обёртку:

```ts
// Ядро шага — общее для клавиатуры и кнопок ↑/↓ у «запустить».
function stepHistoryCore(v: EditorView, dir: 1 | -1): boolean {
  const list = histRef.current
  if (list.length === 0) return false
  const pos = histPos.current
  if (dir === 1) {
    const next = pos === null ? 0 : pos + 1
    if (next >= list.length) return true // упёрлись в самый старый — съесть нажатие
    if (pos === null) draftStash.current = v.state.doc.toString()
    histPos.current = next
    setDoc(v, list[list.length - 1 - next])
    notifyPos()
    return true
  }
  if (pos === null) return false // не в истории — обычный ArrowDown
  if (pos === 0) {
    histPos.current = null
    setDoc(v, draftStash.current)
    notifyPos()
    return true
  }
  histPos.current = pos - 1
  setDoc(v, list[list.length - 1 - histPos.current])
  notifyPos()
  return true
}

// Клавиатурный путь: guard'ы курсора/автокомплита, потом ядро.
function stepHistory(v: EditorView, dir: 1 | -1): boolean {
  if (completionStatus(v.state) !== null) return false // стрелки — автокомплиту
  const sel = v.state.selection.main
  if (!sel.empty) return false
  const line = v.state.doc.lineAt(sel.head)
  if (dir === 1 && line.number !== 1) return false // старее — только с первой строки
  if (dir === -1 && line.number !== v.state.doc.lines) return false // новее — с последней
  return stepHistoryCore(v, dir)
}
```

- [ ] **Step 2: SqlEditor — сбросы позиции нотифицируют.** В Mod-Enter run: вместо `histPos.current = null` —

```ts
if (histPos.current !== null) { histPos.current = null; notifyPos() }
```

В updateListener вместо `if (u.docChanged && !navigating.current) histPos.current = null` —

```ts
if (u.docChanged && !navigating.current && histPos.current !== null) {
  histPos.current = null
  notifyPos() // ручная правка выводит из истории — гасим счётчик
}
```

- [ ] **Step 3: SqlEditor — ручка для кнопок.** В mount-эффекте (после `view.current = v`):

```ts
if (historyCtl) {
  historyCtl.current = {
    step: (dir) => { if (view.current) stepHistoryCore(view.current, dir) },
  }
}
```

и в cleanup: `if (historyCtl) historyCtl.current = null`. Экспортировать тип:

```ts
export interface SqlEditorHistoryCtl { step: (dir: 1 | -1) => void }
```

- [ ] **Step 4: Explore — счётчик и кнопки.** В `Explore.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { SqlEditor, type SqlEditorHistoryCtl } from '../components/SqlEditor'
// ...
const histCtl = useRef<SqlEditorHistoryCtl | null>(null)
const [histPos, setHistPos] = useState<number | null>(null)
```

В `panel-head` после run-кнопки (рендерить только при `history.length > 0`):

```tsx
{history.length > 0 && (
  <span className="hist-ctl" title="история запросов (или ↑/↓ в редакторе)">
    <button
      className="hist-btn"
      aria-label="раньше в истории"
      disabled={histPos === history.length - 1}
      onClick={() => histCtl.current?.step(1)}
    >↑</button>
    <span className="hist-count">
      {histPos === null ? history.length : `${history.length - histPos}/${history.length}`}
    </span>
    <button
      className="hist-btn"
      aria-label="позже в истории"
      disabled={histPos === null}
      onClick={() => histCtl.current?.step(-1)}
    >↓</button>
  </span>
)}
```

SqlEditor получает пропсы: `historyCtl={histCtl}` и `onHistoryPos={setHistPos}`. Позиция при переключении таба: SqlEditor ключуется `key={tab.id}` → пересоздаётся, histPos внутри сбрасывается, но стейт Explore остаётся — добавить сброс:

```tsx
// Свежий редактор таба стартует вне истории — счётчик тоже.
// eslint-disable-next-line react-hooks/set-state-in-effect
useEffect(() => { setHistPos(null) }, [tab?.id])
```

- [ ] **Step 5: CSS** — в `src/index.css` рядом с `.run-btn`-блоком:

```css
/* История запросов у кнопки запуска: счётчик + мышиный путь к ↑/↓. */
.hist-ctl { display: inline-flex; align-items: center; gap: 4px; }
.hist-btn {
  border: 1px solid var(--border); background: transparent; color: var(--text-dim);
  border-radius: var(--radius-sm); padding: 2px 8px; font-size: 12px; cursor: pointer;
}
.hist-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.hist-btn:disabled { opacity: .35; cursor: default; }
.hist-count { font-family: var(--font-mono); font-size: 11px; color: var(--text-faint); min-width: 34px; text-align: center; }
```

- [ ] **Step 6: AboutModal — секция «Терминал»** (после блока «Как устроено», перед «Ограничения v1»):

```tsx
<h3>Терминал</h3>
<ul>
  <li><code>.tables</code> — список таблиц, <code>.schema имя</code> — колонки, <code>.help</code> — подсказка;</li>
  <li>история запросов — ↑/↓ на первой/последней строке редактора или кнопки у «запустить».</li>
</ul>
```

- [ ] **Step 7: Приёмка глазами.** Запустить 3-4 запроса; счётчик показывает размер истории; ↑ шагает к старым (счётчик `i/N`), ↓ — назад, на свежем крае возвращает черновик и гасит счётчик до `N`; ручная правка текста тоже гасит. Клавиатурный путь (↑ на первой строке) двигает счётчик синхронно. Кнопки задизейблены на краях. «?» показывает секцию «Терминал».

- [ ] **Step 8: Гейт + коммит + тик бэклога** (пункты «Дот-команды не задокументированы в "?"» и «История запросов невидима в UI» → `[x]`).

```bash
npm test
npm run build
npm run lint
git add src/components/SqlEditor.tsx src/features/Explore.tsx src/components/AboutModal.tsx src/index.css docs/BACKLOG.md
git commit -m "$(cat <<'EOF'
feat(terminal): история запросов видима — счётчик и ↑/↓ у «запустить»

stepHistory разрезан на ядро (без клавиатурных guard'ов) и клавиатурную
обёртку; кнопки шагают тем же механизмом через historyCtl-ручку, позиция
синхронна с клавиатурой (onHistoryPos). Дот-команды и история
задокументированы в «?» (AboutModal, секция «Терминал»).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Экспорт-пакет — цвет серий, nochart-паритет, revoke, exportQuery

**Files:**
- Modify: `src/components/plotFigure.ts` (опц. цвет серий)
- Modify: `src/features/exportReport.ts` (LIGHT.series + nochart)
- Modify: `src/core/exportHtml.ts` + Test: `src/core/exportHtml.test.ts` (kind 'nochart')
- Modify: `src/features/Report.tsx` (save: отложенный revoke)
- Modify: `src/db/duckdbClient.ts` + Test: `src/db/duckdbClient.export.test.ts` (уникальное имя + finally)

**Interfaces:**
- Produces: `RenderedWidget` расширяется вариантом `{ kind: 'nochart' }`; `plotFigure(spec, rows, style: { background: string; color: string; series?: string })` (series default `#22d3ee` — живой вид не меняется).

- [ ] **Step 1: Красный тест nochart** — в `src/core/exportHtml.test.ts` добавить (импорты/фикстуры — по образцу соседних тестов файла):

```ts
it('chart-виджет без числовой колонки несёт ту же пометку, что живой', () => {
  const doc: ReportDoc = {
    version: 1,
    blocks: [{ type: 'widget', id: 'w1', title: 'W', sql: 'SELECT 1', datasetNames: [], vizType: 'chart', caption: '' }],
  }
  const html = buildReportHtml(doc, { w1: { kind: 'nochart' } })
  expect(html).toContain('нет числовой колонки для графика')
})
```

Запустить `npm test -- exportHtml` → FAIL (тип 'nochart' не существует).

- [ ] **Step 2: Зелёный** — `src/core/exportHtml.ts`:

```ts
export type RenderedWidget =
  | { kind: 'table'; result: QueryResult }
  | { kind: 'chart'; svg: string }
  | { kind: 'empty'; missing: string[] }
  | { kind: 'nochart' } // сохранённый vizType 'chart', но в пересчёте нет числовой колонки
```

В `renderResult` (перед `return renderTable(...)`):

```ts
if (r.kind === 'nochart') return `<p class="qb-empty">нет числовой колонки для графика</p>`
```

- [ ] **Step 3: exportReport — nochart вместо молчаливой таблицы + тёмный teal.** В `src/features/exportReport.ts`:

```ts
const LIGHT = { background: '#ffffff', color: '#1a1a1a', series: '#0e7490' }
```

и в try-ветке `renderReport`:

```ts
const result = arrowToRows(await client.query(buildWidgetSql(b.sql, EXPORT_ROW_CAP)))
const spec = b.vizType === 'chart' ? buildChartSpec(result.columns, result.rows[0]) : null
if (spec) {
  const fig = plotFigure(spec, result.rows, LIGHT)
  rendered[b.id] = { kind: 'chart', svg: fig.outerHTML }
} else if (b.vizType === 'chart') {
  // Паритет live↔export: живой виджет показывает пометку, не таблицу.
  rendered[b.id] = { kind: 'nochart' }
} else {
  rendered[b.id] = { kind: 'table', result }
}
```

- [ ] **Step 4: plotFigure — опц. цвет серий** (`src/components/plotFigure.ts`):

```ts
export function plotFigure(
  spec: ChartSpec,
  rows: Record<string, unknown>[],
  style: { background: string; color: string; series?: string },
): HTMLElement | SVGSVGElement {
  // Экспорт на белом: cyan #22d3ee даёт контраст ~1.55:1 — серии перекрашиваются
  // в глубокий teal; живое приложение (тёмный фон) остаётся на дефолте.
  const seriesColor = style.series ?? '#22d3ee'
  const data = spec.xDates
    ? rows.map((r) => ({ ...r, [spec.x]: r[spec.x] == null ? null : new Date(String(r[spec.x])) }))
    : rows
  const mark =
    spec.kind === 'bar'
      ? Plot.barY(data, { x: spec.x, y: spec.y, sort: { x: '-y' }, fill: seriesColor })
      : Plot.lineY(data, { x: spec.x, y: spec.y, stroke: seriesColor, strokeWidth: 2 })
  return Plot.plot({
    marks: [mark, Plot.ruleY([0])],
    x: { label: spec.x },
    y: { label: spec.y, grid: true },
    height: 280,
    marginLeft: 56,
    style: { background: style.background, color: style.color },
  })
}
```

- [ ] **Step 5: Report.save() — отложенный revoke** (`src/features/Report.tsx:23-32`, зеркало `downloadHtml`):

```ts
a.click()
setTimeout(() => URL.revokeObjectURL(url), 0)
```

(вместо синхронного `URL.revokeObjectURL(url)`.)

- [ ] **Step 6: Красный тест exportQuery** — в `src/db/duckdbClient.export.test.ts` (harness — по образцу соседних тестов файла; там же живёт создание client через nodeDuckDB):

```ts
it('параллельные экспорты не коллидируют по виртуальному файлу', async () => {
  const [a, b] = await Promise.all([
    client.exportQuery('SELECT 1 AS x', 'csv'),
    client.exportQuery('SELECT 2 AS x', 'csv'),
  ])
  expect(new TextDecoder().decode(a)).toContain('1')
  expect(new TextDecoder().decode(b)).toContain('2')
})
```

Может пройти и на старом коде (гонка недетерминирована) — тогда это регрессионный тест, зафиксировать и идти дальше; главное — код-фикс Step 7.

- [ ] **Step 7: exportQuery — уникальное имя + finally** (`src/db/duckdbClient.ts`). В замыкании `createClient` (рядом с `run`):

```ts
let exportSeq = 0
```

и:

```ts
async exportQuery(sql, format) {
  const ext = format === 'parquet' ? 'parquet' : 'csv'
  // Уникальный суффикс: параллельные экспорты не делят виртуальный файл.
  const fname = `qb-export-${++exportSeq}.${ext}`
  const select = stripTrailingSemicolon(sql)
  const fmt = format === 'parquet' ? 'PARQUET' : 'CSV, HEADER'
  try {
    await run(`COPY (${select}) TO '${fname}' (FORMAT ${fmt})`)
    return await db.copyFileToBuffer(fname)
  } finally {
    // Упавший COPY/copyFileToBuffer не должен течь пином буфера.
    try { await db.dropFile(fname) } catch { /* файла может не быть */ }
  }
},
```

- [ ] **Step 8: Приёмка глазами** — экспорт HTML отчёта с графиком: серии тёмный teal, читаемы на белом; live-график остался cyan. Виджет с vizType chart и нечисловым результатом в экспорте несёт пометку.

- [ ] **Step 9: Гейт + коммит + тики бэклога** («график бледный на белом», «chart-виджет без числовой → таблица», «Report.tsx save(): синхронный revoke», «exportQuery: фикс. имя и нет finally» → `[x]`).

```bash
npm test
npm run build
npm run lint
git add src/components/plotFigure.ts src/features/exportReport.ts src/core/exportHtml.ts src/core/exportHtml.test.ts src/features/Report.tsx src/db/duckdbClient.ts src/db/duckdbClient.export.test.ts docs/BACKLOG.md
git commit -m "$(cat <<'EOF'
fix(export): teal-серии на белом, nochart-паритет, revoke, уникальный экспорт-файл

plotFigure принимает опц. цвет серий — экспорт красит в #0e7490 (живой вид
не тронут); chart-виджет без числовой колонки в экспорте несёт ту же
пометку, что живой (kind nochart, TDD); save() отчёта делает отложенный
revokeObjectURL; exportQuery — уникальный суффикс имени + finally-очистка.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Core-мелочи под TDD — имена файлов, `;`-хвосты, dedupe, in-flight загрузки

**Files:**
- Modify: `src/core/sql.ts` + Test: `src/core/sql.test.ts`
- Modify: `src/core/arrowToRows.ts` + Test: `src/core/arrowToRows.test.ts`
- Modify: `src/features/Shell.tsx`

**Interfaces:**
- Produces: `tableNameFromFilename` — кириллица → `'table'`, `_qb_*` → префикс `f_`; `stripTrailingSemicolon` — многократные `;` и line-комментарий ПОСЛЕ `;`; `dedupeColumnNames` — без затирания.

- [ ] **Step 1: Красные тесты** — в `src/core/sql.test.ts`:

```ts
it('кириллическое имя файла → fallback "table", не подчёркивания', () => {
  expect(tableNameFromFilename('продажи.csv')).toBe('table')
})
it('файл с внутренним префиксом _qb_ получает префикс f_', () => {
  expect(tableNameFromFilename('_qb_raw_events.csv')).toBe('f__qb_raw_events')
})
it('повторные хвостовые ; снимаются все', () => {
  expect(stripTrailingSemicolon('SELECT 1;;')).toBe('SELECT 1')
})
it('хвостовой комментарий после ; снимается вместе с ним', () => {
  expect(stripTrailingSemicolon('SELECT 1; -- прим')).toBe('SELECT 1')
})
it('строковый литерал с -- в конце не трогается', () => {
  expect(stripTrailingSemicolon("SELECT '--'")).toBe("SELECT '--'")
})
```

В `src/core/arrowToRows.test.ts` (describe dedupeColumnNames):

```ts
it('коллизия с уже выданным суффиксом не затирает колонку', () => {
  expect(dedupeColumnNames(['id', 'id', 'id_1'])).toEqual(['id', 'id_1', 'id_1_1'])
})
```

`npm test -- core/sql core/arrowToRows` → новые FAIL (существующие зелёные).

- [ ] **Step 2: Зелёный — `src/core/sql.ts`.** `tableNameFromFilename`:

```ts
export function tableNameFromFilename(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '') // strip last extension
  let ident = base.replace(/[^A-Za-z0-9_]/g, '_') // invalid chars -> _
  // Кириллица/эмодзи целиком → одни подчёркивания: честный fallback.
  if (ident === '' || /^_+$/.test(ident)) return 'table'
  if (/^[0-9]/.test(ident)) ident = `_${ident}` // identifiers cannot start with a digit
  // Файл не может клоберить внутренние _qb_-объекты (и прятаться из рейла).
  if (isInternalTable(ident)) ident = `f_${ident}`
  return ident
}
```

(`isInternalTable` объявлен ниже в том же файле — function declaration хойстится.) `stripTrailingSemicolon`:

```ts
/** Снять хвост запроса: повторные `;` и line-комментарий ПОСЛЕ `;`
 *  (`SELECT 1; -- прим`). Комментарий без `;` не трогаем — резать хвост
 *  внутри строкового литерала ('--') без парсера небезопасно. */
export function stripTrailingSemicolon(sql: string): string {
  let s = sql.trim()
  for (;;) {
    const next = s.replace(/;\s*(--[^\n]*)?$/, '').trim()
    if (next === s) return s
    s = next
  }
}
```

- [ ] **Step 3: Зелёный — `src/core/arrowToRows.ts`.** `dedupeColumnNames`:

```ts
/** Disambiguate duplicate column names: ['id','id'] -> ['id','id_1'].
 *  seen — по УЖЕ ВЫДАННЫМ именам: ['id','id','id_1'] не даёт двух id_1. */
export function dedupeColumnNames(names: string[]): string[] {
  const used = new Set<string>()
  return names.map((name) => {
    let candidate = name
    for (let i = 1; used.has(candidate); i++) candidate = `${name}_${i}`
    used.add(candidate)
    return candidate
  })
}
```

`npm test` — ВЕСЬ сюит (старый тест `['id','id','x','id'] → ['id','id_1','x','id_2']` обязан остаться зелёным).

- [ ] **Step 4: Shell.handleFiles — in-flight guard + живой `taken`** (`src/features/Shell.tsx`). `import { useRef, useState } from 'react'`; в компоненте:

```tsx
const inflightFiles = useRef(new Set<string>())

async function handleFiles(files: File[]) {
  for (const file of files) {
    const key = `${file.name}:${file.size}`
    if (inflightFiles.current.has(key)) continue // двойной дроп той же пачки
    inflightFiles.current.add(key)
    try {
      // taken — из ЖИВОГО стора на каждый файл: параллельная пачка не
      // проверяет коллизии против устаревшего списка.
      const taken = useSession.getState().datasets.map((d) => d.table)
      const ds = await loadOneFile(client, file, taken)
      addDataset(ds)
    } catch (e) {
      // Per-file failure: surface, keep loading the rest.
      alert(`Не удалось загрузить ${file.name}: ${String(e)}`)
    } finally {
      inflightFiles.current.delete(key)
    }
  }
}
```

- [ ] **Step 5: Гейт + коммит + тики** («Кириллическое имя файла», «Нет guard на _qb_-префикс», «dedupeColumnNames», «stripTrailingSemicolon снимает только один ;», и дотикать «TOCTOU… Shell.handleFiles» — теперь обе половины закрыты → `[x]`).

```bash
npm test
npm run build
npm run lint
git add src/core/sql.ts src/core/sql.test.ts src/core/arrowToRows.ts src/core/arrowToRows.test.ts src/features/Shell.tsx docs/BACKLOG.md
git commit -m "$(cat <<'EOF'
fix(core): имена файлов (кириллица, _qb_-guard), ;-хвосты, dedupe, in-flight дроп

tableNameFromFilename: сплошные подчёркивания → «table», _qb_* → f_-префикс
(файл не клоберит внутренние таблицы). stripTrailingSemicolon снимает
повторные «;» и комментарий после них (литерал '--' не трогается).
dedupeColumnNames ведёт seen по выданным именам. Shell.handleFiles — 
in-flight guard по имени+размеру и живой taken на каждый файл. Всё TDD.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Витрины — denylist, тост dropMart, in-flight сабмит, эфемерность

**Files:**
- Modify: `src/core/mart.ts` + Test: `src/core/mart.test.ts`
- Modify: `src/features/useMartActions.ts` + Create: `src/features/useMartActions.test.ts`
- Modify: `src/components/ResultPanel.tsx` (martBusy)
- Modify: `src/features/Rail.tsx`, `src/components/AboutModal.tsx`, `src/index.css` (эфемерность)

**Interfaces:**
- Consumes: `useMartActions(client)` — обычная функция без React-хуков, вызывается в тестах напрямую.

- [ ] **Step 1: Красный тест denylist** — `src/core/mart.test.ts`:

```ts
it('reserved-слова SQL отклоняются (цель валидации — не кавычить руками)', () => {
  expect(validateMartName('order', [])).toBe('Это зарезервированное слово SQL')
  expect(validateMartName('SELECT', [])).toBe('Это зарезервированное слово SQL')
  expect(validateMartName('orders', [])).toBeNull()
})
```

- [ ] **Step 2: Зелёный** — `src/core/mart.ts` (после `NAME_RE`):

```ts
// В DDL работают через quoteIdent, но ломают заявленную цель валидации
// («не кавычить в ручном SQL»): SELECT * FROM order — синтакс-ошибка.
const RESERVED = new Set([
  'all', 'and', 'as', 'by', 'case', 'create', 'delete', 'distinct', 'drop',
  'else', 'end', 'false', 'from', 'group', 'having', 'insert', 'join',
  'limit', 'not', 'null', 'offset', 'on', 'or', 'order', 'select', 'table',
  'then', 'true', 'union', 'update', 'using', 'values', 'view', 'when',
  'where', 'with',
])
```

и в `validateMartName` после проверки `NAME_RE`:

```ts
if (RESERVED.has(n.toLowerCase())) return 'Это зарезервированное слово SQL'
```

- [ ] **Step 3: Красный тест тоста dropMart** — Create `src/features/useMartActions.test.ts` (`useMartActions` не содержит React-хуков — зовём как функцию; стор чистим между тестами по образцу `session.test.ts`):

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useMartActions } from './useMartActions'
import { useSession } from '../state/session'
import type { DuckDBClient } from '../db/duckdbClient'

const failing = {
  exec: async () => { throw new Error('boom: dependency') },
} as unknown as DuckDBClient

beforeEach(() => {
  useSession.getState().reset()
})

describe('dropMart', () => {
  it('реальная ошибка DROP тостится, витрина всё равно уходит из стора', async () => {
    useSession.getState().addDataset({
      table: 'm1', fileName: 'm1', bytes: 0, kind: 'view', columns: [], martSql: 'SELECT 1',
    })
    await useMartActions(failing).dropMart('m1')
    expect(useSession.getState().toast).toContain('boom')
    expect(useSession.getState().datasets).toHaveLength(0)
  })
})
```

`npm test -- useMartActions` → FAIL (тост не ставится).

- [ ] **Step 4: Зелёный** — `src/features/useMartActions.ts`, `dropMart`:

```ts
try {
  await client.exec(buildDropMart(name, ds.kind))
} catch (e) {
  // IF EXISTS гасит только «не существует»; реальную ошибку (зависимость) —
  // тостим, как refreshMart. Запись из стора убираем всё равно: объект эфемерен.
  useSession.getState().setToast('Витрина убрана из списка, но объект в каталоге остался: ' + String(e))
}
useSession.getState().removeDataset(name)
```

- [ ] **Step 5: In-flight guard сабмита** — `src/components/ResultPanel.tsx`: `const [martBusy, setMartBusy] = useState(false)`;

```ts
async function submitMart() {
  if (martBusy) return // key-repeat Enter: гонка двойного сабмита → дубликат в сторе
  setMartBusy(true)
  try {
    const err = await createMart(martName, sql, martKind)
    if (err) {
      setMartErr(err)
      return
    }
    setToast(`витрина «${martName.trim()}» создана`)
    setMartOpen(false)
    setMartName('')
    setMartErr(null)
  } finally {
    setMartBusy(false)
  }
}
```

Кнопке создания: `<button className="mart-create" disabled={martBusy} onClick={() => void submitMart()}>создать</button>`.

- [ ] **Step 6: Эфемерность витрин — сказать юзеру.** `src/features/Rail.tsx`, секция витрин:

```tsx
<div className="rail-section-label">
  Витрины <span className="rail-label-note">· живут до перезагрузки</span>
</div>
```

CSS (`src/index.css`, рядом с `.rail-section-label`):

```css
.rail-label-note { text-transform: lowercase; letter-spacing: .04em; }
```

`src/components/AboutModal.tsx`, в `<ul>` «Ограничения v1» добавить пункт после «перезагрузка страницы очищает данные…»:

```tsx
<li>витрины (VIEW / TABLE) живут до перезагрузки — виджет отчёта на витрине после reload попросит источник;</li>
```

- [ ] **Step 7: Гейт + коммит + тики** («dropMart глотает», «Reserved-word имена», «Гонка двойного сабмита», «Витрина-виджет после перезагрузки — вечная ошибка» → `[x]`; в последнем отметить «закрыт минимумом из бэклога: подпись + About»).

```bash
npm test
npm run build
npm run lint
git add src/core/mart.ts src/core/mart.test.ts src/features/useMartActions.ts src/features/useMartActions.test.ts src/components/ResultPanel.tsx src/features/Rail.tsx src/components/AboutModal.tsx src/index.css docs/BACKLOG.md
git commit -m "$(cat <<'EOF'
fix(marts): denylist reserved-слов, тост при реальной ошибке DROP, in-flight сабмит

validateMartName отклоняет SQL-слова (order/select/…) — цель «не кавычить
руками» держится (TDD); dropMart тостит настоящую ошибку каталога, как
refreshMart (TDD на стабе клиента); двойной Enter больше не плодит дубликат
(martBusy). Эфемерность витрин проговорена: подпись в рейле + строка в About.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Ячейки — extractDatasetNames по FROM/JOIN, onRun-аргумент, поколение материализации

**Files:**
- Modify: `src/core/cellSql.ts` + Test: `src/core/cellSql.test.ts`
- Modify: `src/state/session.ts` + Test: `src/state/session.test.ts` (Dataset.gen)
- Modify: `src/components/WidgetBlockView.tsx`

**Interfaces:**
- Produces: `Dataset.gen?: number` — поколение материализации; `setApplied` инкрементирует. `extractDatasetNames` — та же сигнатура, семантика уже: только идентификаторы после FROM/JOIN (+ перечисление через запятую), строки/комментарии вычищены.

- [ ] **Step 1: Красные тесты extractDatasetNames** — `src/core/cellSql.test.ts` (существующие тесты прочитать; те, что фиксировали СТАРУЮ семантику «любое слово матчится» — переписать под новую с комментарием, позитивные FROM-кейсы должны остаться зелёными):

```ts
it('таблица-тёзка колонки не матчится вне FROM/JOIN', () => {
  expect(extractDatasetNames('SELECT id FROM orders', ['id', 'orders'])).toEqual(['orders'])
})
it('строковый литерал и комментарии не дают ложный источник', () => {
  expect(
    extractDatasetNames("SELECT 'from users' AS s FROM t -- join ghosts", ['users', 'ghosts', 't']),
  ).toEqual(['t'])
})
it('FROM-перечисление, JOIN и кавычки идентификаторов', () => {
  expect(extractDatasetNames('SELECT * FROM "a", b JOIN c ON 1=1', ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
})
it('подзапрос в FROM не ломает разбор', () => {
  expect(extractDatasetNames('SELECT * FROM (SELECT x, y FROM inner_t) q', ['inner_t', 'q', 'x'])).toEqual(['inner_t'])
})
```

- [ ] **Step 2: Зелёный** — `src/core/cellSql.ts` целиком:

```ts
/**
 * Имена известных таблиц, читаемых запросом: идентификаторы сразу после
 * FROM/JOIN (+ перечисление через запятую после FROM), регистронезависимо,
 * по возрастанию. Строковые литералы и комментарии вычищаются: 'from users'
 * в литерале не даёт ложный источник, таблица-тёзка колонки (id) не
 * матчится вне FROM/JOIN. Подзапрос `FROM (…)` идентификатора не даёт.
 */
export function extractDatasetNames(sql: string, known: string[]): string[] {
  const cleaned = sql
    .replace(/'(?:[^']|'')*'/g, "''") // строковые литералы ('' — экранированная кавычка)
    .replace(/--[^\n]*/g, ' ') // line-комментарии
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // блочные комментарии
    .toLowerCase()
  const tokens = cleaned.match(/"[^"]*"|[a-z_][a-z0-9_]*|[(),]/g) ?? []
  const ident = (t: string | undefined): string | null => {
    if (!t) return null
    if (t.startsWith('"')) return t.slice(1, -1)
    return /^[a-z_][a-z0-9_]*$/.test(t) ? t : null
  }
  const found = new Set<string>()
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'from' && tokens[i] !== 'join') continue
    let j = i + 1
    for (;;) {
      const name = ident(tokens[j])
      if (!name) break // подзапрос `(`/конец — перечисление не продолжаем
      found.add(name)
      // FROM a x, b y: пропускаем алиасы до запятой; JOIN дальше словит внешний цикл
      let k = j + 1
      while (ident(tokens[k])) k++
      if (tokens[k] !== ',') break
      j = k + 1
    }
  }
  return known.filter((t) => found.has(t.toLowerCase())).sort()
}
```

`npm test -- cellSql` → PASS. Прогнать ВЕСЬ сюит: `WidgetBlockView`-потребитель сигнатуру не менял.

- [ ] **Step 3: Красный тест Dataset.gen** — `src/state/session.test.ts`:

```ts
it('setApplied инкрементирует поколение материализации (gen)', () => {
  useSession.getState().addDataset({
    table: 't1', fileName: 't1.csv', bytes: 1, kind: 'csv', columns: [{ name: 'a', type: 'VARCHAR' }],
  })
  useSession.getState().setApplied('t1', [{ name: 'a', type: 'BIGINT' }], {})
  expect(useSession.getState().datasets[0].gen).toBe(1)
  useSession.getState().setApplied('t1', [{ name: 'a', type: 'BIGINT' }], {})
  expect(useSession.getState().datasets[0].gen).toBe(2)
})
```

- [ ] **Step 4: Зелёный** — `src/state/session.ts`: в `Dataset` добавить поле (после `martSql`):

```ts
// Поколение материализации: setApplied пересоздаёт таблицу с тем же именем —
// зависимые ячейки отчёта узнают об этом через loadedKey (M7b-минор).
gen?: number
```

В `setApplied` в маппинге датасета добавить `gen: (d.gen ?? 0) + 1`:

```ts
d.table === table
  ? {
      ...d,
      schemaError: null,
      profile: undefined, // re-materialized table -> stale profile
      rowCount: undefined,
      gen: (d.gen ?? 0) + 1,
      columns: columns.map((c) => ({ … })),
    }
  : d,
```

- [ ] **Step 5: loadedKey учитывает gen** — `src/components/WidgetBlockView.tsx:38-44`:

```ts
const loadedKey = useSession((s) =>
  s.datasets
    .filter((d) => block.datasetNames.includes(d.table))
    .map((d) => `${d.table}:${d.gen ?? 0}`) // gen: re-apply схемы перезапускает ячейку
    .sort()
    .join('|'),
)
```

Известный остаток (НЕ чинить, отметить в тике): `refreshMart` пересоздаёт витрину через remove+add — gen обнуляется в undefined, ключ не меняется; ручной ⟳/«выполнить всё» покрывает.

- [ ] **Step 6: onRun пробрасывает sql-аргумент CM** — `WidgetBlockView.tsx`:

```ts
function commitDraft(sqlText = draft) {
  if (sqlText.trim() === '') return
  if (sqlText === block.sql) {
    setRunSeq((n) => n + 1) // без правки — просто пересчитать
    return
  }
  const known = datasets.filter((d) => !isInternalTable(d.table)).map((d) => d.table)
  updateWidgetSql(block.id, sqlText, extractDatasetNames(sqlText, known))
}
```

Вызовы: `<SqlEditor … onRun={(sql) => commitDraft(sql)} />`; кнопка — `onClick={() => commitDraft()}` (НЕ `onClick={commitDraft}`: MouseEvent уехал бы в sqlText).

- [ ] **Step 7: Гейт + коммит + тики** («extractDatasetNames матчит любой идентификатор», «onRun игнорирует sql-аргумент», «PRE-EXISTING: loadedKey не видит ре-материализацию» → `[x]`, последний с оговоркой про refreshMart).

```bash
npm test
npm run build
npm run lint
git add src/core/cellSql.ts src/core/cellSql.test.ts src/state/session.ts src/state/session.test.ts src/components/WidgetBlockView.tsx docs/BACKLOG.md
git commit -m "$(cat <<'EOF'
fix(cells): источники ячейки только из FROM/JOIN, gen материализации, onRun(sql)

extractDatasetNames вычищает строки/комментарии и берёт идентификаторы
после FROM/JOIN с перечислением — таблица-тёзка колонки больше не даёт
ложный pill/перезапуск (TDD). setApplied инкрементирует Dataset.gen,
loadedKey ячейки включает поколение — re-apply схемы перезапускает
зависимые ячейки (TDD). onRun пробрасывает текст из CM в commitDraft.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: cycleSort — логика сортировки в core (TDD)

**Files:**
- Modify: `src/core/resultQuery.ts` + Test: `src/core/resultQuery.test.ts`
- Modify: `src/components/ResultPanel.tsx`

**Interfaces:**
- Produces: `cycleSort(sorts: SortSpec[], col: string, additive: boolean): SortSpec[]`.

- [ ] **Step 1: Красные тесты** — `src/core/resultQuery.test.ts`:

```ts
describe('cycleSort', () => {
  it('цикл одиночной сортировки: asc → desc → снять', () => {
    expect(cycleSort([], 'a', false)).toEqual([{ col: 'a', dir: 'asc' }])
    expect(cycleSort([{ col: 'a', dir: 'asc' }], 'a', false)).toEqual([{ col: 'a', dir: 'desc' }])
    expect(cycleSort([{ col: 'a', dir: 'desc' }], 'a', false)).toEqual([])
  })
  it('без additive другая колонка заменяет сортировку целиком', () => {
    expect(cycleSort([{ col: 'a', dir: 'asc' }], 'b', false)).toEqual([{ col: 'b', dir: 'asc' }])
  })
  it('additive (shift) добавляет и снимает, не трогая остальные', () => {
    const two = cycleSort([{ col: 'a', dir: 'asc' }], 'b', true)
    expect(two).toEqual([{ col: 'a', dir: 'asc' }, { col: 'b', dir: 'asc' }])
    expect(cycleSort([{ col: 'a', dir: 'desc' }, { col: 'b', dir: 'asc' }], 'a', true))
      .toEqual([{ col: 'b', dir: 'asc' }])
  })
})
```

- [ ] **Step 2: Зелёный** — `src/core/resultQuery.ts` (после `buildOrderBy`):

```ts
/** Клик по заголовку: asc → desc → снять; additive (shift) сохраняет остальные. */
export function cycleSort(sorts: SortSpec[], col: string, additive: boolean): SortSpec[] {
  const i = sorts.findIndex((s) => s.col === col)
  if (i < 0) return additive ? [...sorts, { col, dir: 'asc' }] : [{ col, dir: 'asc' }]
  if (sorts[i].dir === 'asc') {
    const next = [...sorts]
    next[i] = { col, dir: 'desc' }
    return additive ? next : [{ col, dir: 'desc' }]
  }
  return additive ? sorts.filter((s) => s.col !== col) : []
}
```

- [ ] **Step 3: ResultPanel использует core** — заменить тело `toggleSort` (`src/components/ResultPanel.tsx:95-103`):

```ts
function toggleSort(col: string, additive: boolean) {
  patchView(tabId, { sorts: cycleSort(resultView.sorts, col, additive), page: 1 })
}
```

(импорт `cycleSort` добавить к существующему импорту из `../core/resultQuery`; локальный алгоритм и, если остался неиспользуемым, импорт типа `SortSpec` — убрать.)

- [ ] **Step 4: Гейт + коммит + тик** («toggleSort-цикл в ResultPanel — логика вне core» → `[x]`).

```bash
npm test
npm run build
npm run lint
git add src/core/resultQuery.ts src/core/resultQuery.test.ts src/components/ResultPanel.tsx docs/BACKLOG.md
git commit -m "$(cat <<'EOF'
refactor(explore): цикл сортировки вынесен в core/resultQuery.cycleSort (TDD)

asc→desc→снять + additive multi-sort — тестируемая логика уехала из
компонента под тесты (TDD-граница CLAUDE.md); ResultPanel делегирует.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Грид — опциональные контролы, индикатор фильтра, memo

**Files:**
- Modify: `src/components/ResultGrid.tsx`
- Modify: `src/components/ResultPanel.tsx`
- Modify: `src/components/WidgetBlockView.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `ResultGrid` пропсы: `onToggleSort?`, `onOpenFilter?` (опциональны — без них заголовки инертны, ⏷ не рисуется), новый `filteredCols?: string[]`; компонент обёрнут в `React.memo`.

Presentation-механика — тестов нет (компоненты вне vitest-скоупа), проверка глазами.

- [ ] **Step 1: ResultGrid** — сигнатура и рендер:

```tsx
import { memo, useRef } from 'react'
// ...
export const ResultGrid = memo(function ResultGrid({
  result,
  sorts,
  rowOffset = 0,
  onToggleSort,
  onOpenFilter,
  filteredCols,
}: {
  result: QueryResult
  sorts: SortSpec[]
  rowOffset?: number
  onToggleSort?: (col: string, additive: boolean) => void
  onOpenFilter?: (col: string, rect: DOMRect) => void
  filteredCols?: string[]
}) {
  // ... (тело как было)
})
```

В хедере колонок: `const filtered = new Set(filteredCols ?? [])` (над return), и:

```tsx
<span
  className={onToggleSort ? 'th-label' : 'th-label static'}
  onClick={onToggleSort ? (e) => onToggleSort(c.name, e.shiftKey) : undefined}
>
  {c.name}
  {dir && <span className="th-sort">{dir === 'asc' ? '▲' : '▼'}{sorts.length > 1 ? si + 1 : ''}</span>}
</span>
{onOpenFilter && (
  <button
    className={filtered.has(c.name) ? 'th-filter on' : 'th-filter'}
    title="фильтр по колонке"
    onClick={(e) => onOpenFilter(c.name, (e.currentTarget as HTMLElement).getBoundingClientRect())}
  >⏷</button>
)}
```

- [ ] **Step 2: CSS** — рядом с `.th-label` (`src/index.css:625`):

```css
/* Виджет отчёта: без колбэков заголовок — не контрол. */
.th-label.static { cursor: default; }
.th-label.static:hover { color: inherit; }
```

- [ ] **Step 3: ResultPanel — стабильные пропсы, чтобы memo работал.** Обернуть колбэки и производные:

```ts
import { useState, useEffect, useMemo, useCallback } from 'react'
// ...
const toggleSort = useCallback(
  (col: string, additive: boolean) => {
    patchView(tabId, { sorts: cycleSort(resultView.sorts, col, additive), page: 1 })
  },
  [patchView, tabId, resultView.sorts],
)
const openFilter = useCallback((col: string, rect: DOMRect) => {
  setFilterCol({ col, rect })
}, [])
const filteredCols = useMemo(() => resultView.filters.map((f) => f.col), [resultView.filters])
```

(function-декларации `toggleSort`/`openFilter` удалить). Грид: `<ResultGrid result={display} sorts={resultView.sorts} rowOffset={…} onToggleSort={toggleSort} onOpenFilter={openFilter} filteredCols={filteredCols} />`.

- [ ] **Step 4: ResultPanel — мемоизация chart-спеков** (закрывает «Chart пересобирает Plot-фигуру на каждый рендер», M-8):

```ts
const spec = useMemo(
  () => (display ? buildChartSpec(display.columns, display.rows[0]) : null),
  [display],
)
// ...
const chartSpec = useMemo(
  () => (chartSrc ? buildChartSpec(chartSrc.columns, chartSrc.rows[0]) : null),
  [chartSrc],
)
```

- [ ] **Step 5: WidgetBlockView — грид отчёта без мёртвых контролов + memo-спек:**

Модульная константа над компонентом: `const NO_SORTS: SortSpec[] = []` (импорт типа из `../core/resultQuery`); в рендере:

```tsx
<ResultGrid result={pageData} rowOffset={(page - 1) * pageSize} sorts={NO_SORTS} />
```

(пропсы `onToggleSort={() => {}}`/`onOpenFilter={() => {}}` удалить). Спек:

```ts
const spec = useMemo(
  () => (pageData ? buildChartSpec(pageData.columns, pageData.rows[0]) : null),
  [pageData],
)
```

(`useMemo` уже импортирован там.)

- [ ] **Step 6: Приёмка глазами.** Explore: сортировка кликом жива, shift-мультисорт жив, у колонки с активным фильтром ⏷ виден постоянно (класс `on`); печать в редакторе при открытом большом гриде заметно плавнее (memo). Отчёт: заголовки грида ячейки инертны (нет pointer/ховера), ⏷ не рисуется.

- [ ] **Step 7: Гейт + коммит + тики** («Виджет отчёта: мёртвые контролы грида», «.th-filter.on не вешается», «Chart пересобирает Plot-фигуру», «Перерендер на каждый кейстрок» — последний тикать как «первый шаг сделан: memo(ResultGrid)+useCallback; полная развязка Rail/TabStrip — вне скоупа» → `[x]`).

```bash
npm test
npm run build
npm run lint
git add src/components/ResultGrid.tsx src/components/ResultPanel.tsx src/components/WidgetBlockView.tsx src/index.css docs/BACKLOG.md
git commit -m "$(cat <<'EOF'
fix(grid): опциональные контролы заголовков, индикатор фильтра, memo

onToggleSort/onOpenFilter опциональны — грид в отчёте без ложных
аффордансов (курсора/⏷); .th-filter.on вешается по filteredCols;
React.memo(ResultGrid) + useCallback/useMemo на пропсах и chart-спеках —
кейстрок в редакторе не перегоняет грид и Plot.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Профиль и окно — семантика profileResult, спиннер, двойной fetch

**Files:**
- Modify: `src/features/useProfileActions.ts` + Test: `src/features/useProfileActions.test.ts`
- Modify: `src/components/ResultPanel.tsx` (вызов без sql)
- Modify: `src/components/ProfilePanel.tsx` (спиннер vs «не посчитан»)
- Modify: `src/features/Explore.tsx` (guard повторного fetch)

**Interfaces:**
- Produces: `profileResult(tabId: string): Promise<void>` — параметр `sql` УДАЛЁН; paged-таб профилирует снапшот `_qb_result_<tab>` (без DDL), raw-таб получает понятную ошибку.

- [ ] **Step 1: Красные тесты** — `src/features/useProfileActions.test.ts` (файл существует; поправить вызовы `profileResult(tabId, sql)` → `profileResult(tabId)` и добавить, следуя локальному harness'у стора/клиента):

```ts
function seedTab(id: string, mode: 'paged' | 'raw') {
  useSession.setState({
    tabs: [{
      id, title: id, datasetTable: null, sql: 'SELECT 1', meta: null, error: null,
      mode, columns: [{ name: 'x', type: 'BIGINT' }],
    }],
  })
}

it('paged-таб профилирует снапшот и НЕ материализует черновик редактора', async () => {
  const calls: string[] = []
  const stub = {
    exec: async (sql: string) => { calls.push(sql) },
    query: async () => { throw new Error('no summarize in stub') },
  } as unknown as DuckDBClient
  seedTab('tab-1', 'paged')
  await useProfileActions(stub).profileResult('tab-1')
  expect(calls.filter((s) => s.startsWith('CREATE'))).toHaveLength(0) // снапшот уже есть
})

it('raw-таб честно говорит, что профилировать нечего', async () => {
  const stub = { exec: async () => {}, query: async () => { throw new Error('unused') } } as unknown as DuckDBClient
  seedTab('tab-2', 'raw')
  await useProfileActions(stub).profileResult('tab-2')
  expect(useSession.getState().tabs.find((t) => t.id === 'tab-2')?.resultProfileError)
    .toContain('SELECT')
})
```

(Импорты/сброс стора между тестами — по образцу существующих тестов файла; на старой сигнатуре paged-тест падает на `sql.trim()` от undefined.)

- [ ] **Step 2: Зелёный** — `src/features/useProfileActions.ts`:

```ts
/**
 * Result-target: профиль ОТОБРАЖАЕМОГО результата. Paged-таб — это снапшот
 * _qb_result_<tab> последнего запуска (run уже материализовал — DDL не нужен
 * и НЕ берётся из черновика редактора, который мог не запускаться).
 * Raw-результат (не-SELECT: PRAGMA/дот-команда) не материализован — честная
 * ошибка вместо профиля черновика.
 */
async function profileResult(tabId: string): Promise<void> {
  const st = useSession.getState()
  const tab = st.tabs.find((t) => t.id === tabId)
  if (!tab || tab.resultProfile) return // cached -> no-op
  if (tab.mode !== 'paged') {
    st.setResultProfileError(tabId, 'профиль доступен для результатов SELECT-запросов')
    return
  }
  st.setResultProfiling(tabId, true)
  try {
    const { profiles, rowCount } = await profileRelation(client, resultTempName(tabId))
    useSession.getState().setResultProfile(tabId, profiles, rowCount)
  } catch (e) {
    useSession.getState().setResultProfileError(tabId, String(e))
  }
}
```

(неиспользуемый импорт `buildResultTempDDL` убрать, `resultTempName` остаётся). Вызов в `ResultPanel.tsx`: `void profileResult(tabId)` (кнопка «профиль» в view-toggle).

- [ ] **Step 3: ProfilePanel — «считается» ≠ «не посчитано»** (`src/components/ProfilePanel.tsx:49-52`):

```tsx
if (error) return <pre className="result-error">{error}</pre>
if (profiling) return <p className="result-empty">считаю профиль…</p>
if (!profiles) {
  // после re-apply схемы кэш сброшен, но никто не считает — не врём спиннером
  return (
    <p className="result-empty">
      {target.kind === 'source'
        ? 'профиль не посчитан — нажми «профиль источника» в рейле'
        : 'профиль не посчитан — нажми «профиль» над результатом'}
    </p>
  )
}
```

- [ ] **Step 4: Explore — guard повторного fetch окна** (`src/features/Explore.tsx:30-35`):

```tsx
// Refetch по смене view; повторный fetch УЖЕ лежащего окна (первый запуск,
// переключение таба) пропускаем — runQuery/прошлый fetch его обслужили.
const view = tab?.view
const lastFetchKey = useRef(new Map<string, string>())
useEffect(() => {
  if (!tab || tab.mode !== 'paged') return
  const key = JSON.stringify([view?.page, view?.pageSize, view?.sorts, view?.search, view?.filters])
  const prev = lastFetchKey.current.get(tab.id)
  if (prev === undefined && tab.window != null) {
    lastFetchKey.current.set(tab.id, key) // окно уже есть — только запомнить вид
    return
  }
  if (prev === key && tab.window != null) return
  lastFetchKey.current.set(tab.id, key)
  void fetchWindow(tab.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tab?.id, view?.page, view?.pageSize, JSON.stringify(view?.sorts), view?.search, JSON.stringify(view?.filters)])
```

Известный компромисс (в коммент-месседж не надо, в тик бэклога — да): после УПАВШЕГО fetch повторное переключение на таб больше не ретраит само — юзер перезапускает запрос.

- [ ] **Step 5: Приёмка глазами** — переключение табов не дёргает лишний запрос (Network/консоль), листание/сортировка работают; профиль paged-результата считается; профиль после «сброс»/«типы» показывает «не посчитан», клик пересчитывает; профиль вывода дот-команды — вежливая ошибка.

- [ ] **Step 6: Гейт + коммит + тики** («profileResult профилирует не то», «Explore: двойной fetch окна», «ProfilePanel: вечное считаю…» → `[x]`).

```bash
npm test
npm run build
npm run lint
git add src/features/useProfileActions.ts src/features/useProfileActions.test.ts src/components/ResultPanel.tsx src/components/ProfilePanel.tsx src/features/Explore.tsx docs/BACKLOG.md
git commit -m "$(cat <<'EOF'
fix(profile): профиль отображаемого результата, честный «не посчитан», без двойного fetch

profileResult потерял sql-параметр: paged — профиль снапшота последнего
запуска (черновик редактора не материализуется), raw — понятная ошибка
(TDD). ProfilePanel различает «считаю» и «не посчитан» (вечный спиннер
после re-apply убит). Explore пропускает refetch окна, уже лежащего в
сторе (первый запуск/переключение таба).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Ресайзы и CSS-чистка — pointercancel, .grid-th

**Files:**
- Modify: `src/components/SqlEditor.tsx` (startResize)
- Modify: `src/features/Rail.tsx` (startResize)
- Modify: `src/index.css` (слить `.grid-th`)

- [ ] **Step 1: SqlEditor.startResize** (`src/components/SqlEditor.tsx:79-93`):

```ts
function startResize(e: ReactPointerEvent<HTMLDivElement>) {
  e.preventDefault()
  const bar = e.currentTarget
  const startY = e.clientY
  const startH = host.current?.offsetHeight ?? height
  bar.setPointerCapture(e.pointerId)
  const onMove = (ev: PointerEvent) => {
    if (ev.buttons === 0) { onUp(); return } // драг оборван без pointerup (alt-tab)
    setHeight(Math.max(84, startH + (ev.clientY - startY)))
  }
  const onUp = () => {
    bar.releasePointerCapture(e.pointerId)
    bar.removeEventListener('pointermove', onMove)
    bar.removeEventListener('pointerup', onUp)
    bar.removeEventListener('pointercancel', onUp)
  }
  bar.addEventListener('pointermove', onMove)
  bar.addEventListener('pointerup', onUp)
  bar.addEventListener('pointercancel', onUp)
}
```

- [ ] **Step 2: Rail.startResize** (`src/features/Rail.tsx:54-69`) — та же схема: `if (ev.buttons === 0) { onUp(); return }` в onMove, `pointercancel` → onUp, снятие в onUp.

- [ ] **Step 3: Слить `.grid-th`.** Убрать сплит: в раннем grid-блоке (`src/index.css:267`) расширить определение и удалить позднее (M8 T4, `src/index.css:624`):

```css
.grid-th {
  color: var(--text-faint); text-transform: uppercase; font-size: 10.5px;
  display: flex; align-items: center; gap: 4px; justify-content: space-between;
}
```

(строку `.grid-th { display: flex; … }` из блока «M8 T4» удалить; `.grid-th.grid-num { … justify-content: flex-end; }` на строке 269 остаётся и продолжает побеждать каскадом.)

- [ ] **Step 4: Приёмка глазами** — грид не изменился визуально; ресайз редактора и рейла: начать драг, alt-tab, вернуться — хэндл не «залипает» за курсором.

- [ ] **Step 5: Гейт + коммит + тики** («SqlEditor resize: нет pointercancel», «Сплит-определение .grid-th» → `[x]`; «DitherSwirl fillStyle» — оставить открытым, он вне скоупа P2 по спеке).

```bash
npm test
npm run build
npm run lint
git add src/components/SqlEditor.tsx src/features/Rail.tsx src/index.css docs/BACKLOG.md
git commit -m "$(cat <<'EOF'
fix(ui): pointercancel на обоих ресайзах, .grid-th в одном определении

Оборванный драг (alt-tab/touch-cancel) больше не оставляет ресайз
редактора/рейла прилипшим к курсору (pointercancel + ev.buttons===0);
сплит-определение .grid-th слито в одно.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: a11y-пакет — focus-trap, ARIA, клавиатура, Toast

**Files:**
- Modify: `src/components/AboutModal.tsx` (focus-trap + restore)
- Modify: `src/features/Shell.tsx` (aria-pressed на mode-toggle)
- Modify: `src/components/ResultPanel.tsx`, `src/components/WidgetBlockView.tsx` (aria-pressed на view-toggle/mart-kind)
- Modify: `src/components/CsvDropzone.tsx`, `src/components/TabStrip.tsx` (клавиатура)
- Modify: `src/features/Report.tsx`, `src/components/TextBlockView.tsx` (фокусируемые поверхности)
- Modify: `src/components/Toast.tsx`, `src/state/session.ts` + Test: `src/state/session.test.ts` (toastSeq)

**Interfaces:**
- Produces: `SessionState.toastSeq: number` — инкремент на КАЖДЫЙ setToast (перезапуск таймера повторного тоста).

- [ ] **Step 1: Красный тест toastSeq** — `src/state/session.test.ts`:

```ts
it('setToast инкрементирует toastSeq и на повторе того же сообщения', () => {
  const before = useSession.getState().toastSeq
  useSession.getState().setToast('готово')
  useSession.getState().setToast('готово')
  expect(useSession.getState().toastSeq).toBe(before + 2)
})
```

- [ ] **Step 2: Зелёный** — `src/state/session.ts`: в интерфейс `SessionState` добавить `toastSeq: number` (рядом с `toast`), в `initial` — `toastSeq: 0`, экшен:

```ts
setToast: (toast) => set((s) => ({ toast, toastSeq: s.toastSeq + 1 })),
```

- [ ] **Step 3: Toast — перезапуск таймера + aria** (`src/components/Toast.tsx`):

```tsx
export function Toast() {
  const toast = useSession((s) => s.toast)
  const toastSeq = useSession((s) => s.toastSeq)
  const setToast = useSession((s) => s.setToast)

  useEffect(() => {
    if (toast === null) return
    // toastSeq в deps: повтор ТОГО ЖЕ сообщения перезапускает таймер.
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast, toastSeq, setToast])

  if (toast === null) return null
  return <div className="toast" role="status" aria-live="polite">{toast}</div>
}
```

Внимание: setToast(null) из таймера тоже инкрементирует seq — эффект перезапустится один раз на null и сразу выйдет (`toast === null`) — петли нет.

- [ ] **Step 4: AboutModal — focus-trap + restore** (`src/components/AboutModal.tsx`):

```tsx
import { useEffect, useRef } from 'react'

export function AboutModal({ onClose }: { onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const box = boxRef.current
    box?.querySelector<HTMLElement>('button, a')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !box) return
      // Трап: Tab с последнего — на первый, Shift+Tab с первого — на последний.
      const items = box.querySelectorAll<HTMLElement>('button, a[href]')
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus() // фокус назад на «?»
    }
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={boxRef} className="modal" role="dialog" aria-modal="true" aria-label="О warpbook" onClick={(e) => e.stopPropagation()}>
        {/* … содержимое без изменений … */}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: aria-pressed на тоггл-группах.**
  - `Shell.tsx` mode-toggle: `<button className={…} aria-pressed={mode === 'explore'} …>` и `aria-pressed={mode === 'report'}`.
  - `ResultPanel.tsx` view-toggle: `aria-pressed={view === 'table'}` / `'chart'` / `'profile'`; mart-kind: `aria-pressed={martKind === 'view'}` / `'table'`.
  - `WidgetBlockView.tsx` widget-view-toggle: `aria-pressed={block.vizType === 'table'}` / `'chart'`.

- [ ] **Step 6: Клавиатура — dropzone и табы.**
  - `CsvDropzone.tsx` корневой div: `role="button" tabIndex={disabled ? -1 : 0} aria-label="загрузить CSV или Parquet"` и

```tsx
onKeyDown={(e) => {
  if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault()
    inputRef.current?.click()
  }
}}
```

  - `TabStrip.tsx` div таба: `role="button" tabIndex={0}` и

```tsx
onKeyDown={(e) => {
  if (e.target !== e.currentTarget) return // не перехватывать input переименования
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTab(t.id) }
}}
```

- [ ] **Step 7: Поверхности отчёта.**
  - `Report.tsx` блок: на div с `onClick={() => setActiveBlock(block.id)}` добавить `tabIndex={0}` и

```tsx
onKeyDown={(e) => {
  if (e.target !== e.currentTarget) return // Enter в редакторе/инпутах — не сюда
  if (e.key === 'Enter') setActiveBlock(block.id)
}}
```

  - `TextBlockView.tsx` `.text-block` div: `role="button" tabIndex={0}` и `onKeyDown` с тем же guard'ом, Enter → `setDraft(block.markdown); setEditing(true)`.
  - `WidgetBlockView.tsx` `.widget-title` span: `role="button" tabIndex={0}` и `onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setTitleDraft(block.title); setEditingTitle(true) } }}`.
  - Глобальный `:focus-visible` (index.css:499) уже покрывает `[tabindex]` — новых CSS-правил не нужно.

- [ ] **Step 8: Приёмка глазами (клавиатурой).** Tab-обход: dropzone → Enter открывает пикер; табы стрипа фокусируются, Enter активирует; «?» → фокус входит в модал, Tab циклится внутри, Esc закрывает и возвращает фокус на «?»; блоки отчёта фокусируются (dotted ring), Enter выбирает/открывает текст-редактор; тост объявляется скринридер-роли (не проверяем вживую — роль стоит), повторный тост держится полные 2.2s.

- [ ] **Step 9: Гейт + коммит + тики** («AboutModal без focus-trap», «Toggle-группы без ARIA», «Report-поверхности mouse-only», «a11y: dropzone и табы», «Toast: таймер + role» → `[x]`).

```bash
npm test
npm run build
npm run lint
git add src/components/AboutModal.tsx src/features/Shell.tsx src/components/ResultPanel.tsx src/components/WidgetBlockView.tsx src/components/CsvDropzone.tsx src/components/TabStrip.tsx src/features/Report.tsx src/components/TextBlockView.tsx src/components/Toast.tsx src/state/session.ts src/state/session.test.ts docs/BACKLOG.md
git commit -m "$(cat <<'EOF'
feat(a11y): focus-trap модалки, aria-pressed, клавиатура для dropzone/табов/отчёта

AboutModal запирает Tab внутри и возвращает фокус на «?»; тогглы несут
aria-pressed; dropzone, табы, блоки отчёта, текст-блок и заголовок виджета
доступны с клавиатуры (Enter). Toast: role=status + toastSeq в сторе (TDD) —
повтор того же сообщения перезапускает таймер.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Финал спринта

- [ ] **Полный гейт на `polish-2`:** `npm test` (ожидаемо ~350+ тестов), `npm run build`, `npm run lint` — 0/0.
- [ ] **Сквозная приёмка глазами** (desktop + DevTools-мобилка): welcome → сэмпл → запрос → профиль → витрина → отчёт (ячейка, график) → экспорт HTML/PDF → Reset.
- [ ] **BACKLOG.md ревизия:** все пункты спринта `[x]`; открытыми остаются только: инфра-спринт, DitherSwirl, integration-паритет seedTabs, таб-стрип 2 ряда, pruning `a*b`, refreshMart-перестановка, топбар-пункт M-5 тикнуть (закрыт Task 2), «Welcome клипается» уже `[x]`.
- [ ] **FF-merge:** `git checkout main && git merge --ff-only polish-2`, гейт на main повторить. Пуш — пользователь.
- [ ] Реальный телефон: приёмка мобилки юзером после деплоя (портрет/альбом).
