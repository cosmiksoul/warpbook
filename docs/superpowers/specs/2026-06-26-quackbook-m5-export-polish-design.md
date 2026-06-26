# quackbook M5 — «Экспорт и полировка» (дизайн)

Дата: 2026-06-26. Источник скоупа: `docs/superpowers/specs/2026-06-22-quackbook-delivery-design.md` (раздел **M5 — Экспорт и полировка**). Вехи M0–M4 отгружены; **линия MVP-демо = конец M4** (полный нарратив работает). M5 — последняя веха v1: доводит продукт до **отчуждаемого** артефакта (отчёт, который можно отдать наружу / напечатать) и закрывает накопленный полиш-бэклог.

## Контекст

Отчёт (ноутбук) сейчас живёт только в браузере: структура автосейвится в localStorage + выгружается JSON-ом, но **результаты виджетов не сериализуются** — они пересчитываются лениво в локальном React-стейте `WidgetBlockView`, а грид **виртуализирован** (в DOM только видимые строки). Чтобы отдать отчёт наружу, нужен self-contained файл с **запечёнными** текущими результатами (таблицы/графики), который открывается офлайн и печатается.

Два важных следствия из виртуализации + не-сериализуемых результатов:
1. Экспорт нельзя строить захватом живого DOM (грид потеряет невидимые строки).
2. PDF нельзя печатать с живого приложения по той же причине (+ тёмная тема нечитаема на бумаге).

## Решения (брейншторм 2026-06-26)

1. **Тема экспорта — светлая (print-friendly).** Белый фон, тёмный текст; одна тема и для HTML-файла, и для PDF. Приложение остаётся тёмным; экспорт — отчуждаемый артефакт, оптимизированный под чернила/печать/шеринг.
2. **Виджет без данных на момент экспорта — «предупредить и экспортнуть».** Non-blocking: экспорт собирается, на месте проблемного виджета — пометка «нет данных: источник X не загружен»; перед выгрузкой — предупреждение «N виджетов без данных». Артефакт честный, частичный отчёт выгрузить можно.
3. **Полиш-скоуп — все три кластера** (UX-апгрейды табов/схемы, a11y+адаптив, чистка dev/build-шума) + дешёвые correctness-фиксы + README. По умолчанию (вне зависимости от выбора) — дешёвые correctness и README.
4. **Архитектура экспорта — вариант A:** централизованный пере-прогон SQL виджетов + **чистый форматтер** `buildReportHtml(doc, rendered) → string`. Детерминизм (не зависит от скролла/виртуализации/что смонтировано), тестируемое ядро (ровно TDD-нота деливери: «doc→self-contained HTML-строка»), переиспользование `arrowToRows`/`buildChartSpec`/Plot.
5. **PDF — печать сгенерированного экспорт-HTML через скрытый iframe** (не живой `window.print()`). Уточнение скоупа M5 относительно деливери-дизайна («print-CSS + window.print») — причина: виртуализация грида + тёмная тема живого DOM. Один рендерер на HTML и PDF.

## Архитектура / модули

### `core/exportHtml.ts` — чистое ядро (TDD)
- Тип результата на виджет:
  ```ts
  type RenderedWidget =
    | { kind: 'table'; result: QueryResult }   // columns + rows (из arrowToRows)
    | { kind: 'chart'; svg: string }           // готовый инлайн-SVG (Plot.outerHTML)
    | { kind: 'empty'; missing: string[] }     // нет данных: имена незагруженных источников
  ```
- `buildReportHtml(doc: ReportDoc, rendered: Record<string, RenderedWidget>): string` — собирает self-contained документ:
  - `<!doctype html>` + `<head>` (charset, `<title>`, инлайн `<style>` — светлая тема, строковая константа в этом модуле) + `<body><article class="qb-report">…</article>`.
  - Блоки — строго в порядке `doc.blocks`.
  - **Текст-блок** → `marked.parse(block.markdown || '')` (синхронно, без DOM → работает в node-тестах).
  - **Виджет** → заголовок (`<h2>`), пилюли источников, SQL в **свёрнутом `<details>`**, тело результата (table / chart / empty), подпись (если есть).
    - `table` → статический `<table>` из `result.columns` + `result.rows` (все строки, без кап-лимита; крупные результаты → крупный файл — приемлемо для v1).
    - `chart` → инлайн-`svg` как есть (наш Plot-вывод; Plot экранирует текст в SVG).
    - `empty` → блок-пометка: при непустом `missing` — «нет данных: <missing.join(', ')> — подгрузи источник(и)»; при пустом — просто «нет данных» (НЕ воспроизводим backlog-баг с пустым списком источников).
  - **Экранирование** всего текстового, что не проходит через marked: title, caption, ячейки таблицы, SQL, имена источников (`<`, `&`, `"`). Хелпер `escapeHtml`.
- Светлая тема и `@media print`-твики — внутри этого `<style>` (оттого файл self-contained и одинаков для HTML/PDF).

### `features/exportReport.ts` — оркестратор (тонкий, глазами)
- `async function renderReport(client, report, loadedTables): Promise<{ html: string; missingCount: number }>`:
  - по `report.blocks`: для каждого виджета
    - вычислить `missing = block.datasetNames \ loadedTables`;
    - попытка `client.query(block.sql)`:
      - ok → `arrowToRows`; если `vizType==='chart'` и `buildChartSpec(result.columns)` непустой → `renderChartSvg(spec, rows)`; иначе `{kind:'table'}`;
      - throw → `{kind:'empty', missing}` (рендер пометки — см. выше; пустой `missing` → generic «нет данных»);
  - собрать `rendered`-карту по id, посчитать `missingCount`, вызвать `buildReportHtml`.
- `renderChartSvg(spec, rows): string` — Observable Plot в detached-узел → `figure.outerHTML`. Переиспользует ту же spec-логику, что `Chart.tsx` (вынести общий `plotFigure(spec, rows)`, чтобы не дублировать построение Plot).
- Скачивание HTML и печать PDF — в feature-слое (Blob + `a.click`; iframe + `print`).

### `features/Report.tsx` — кнопки
- В тулбаре (рядом с «сохранить»/«открыть»): **«экспорт HTML»** и **«PDF»**. Видны только при непустом отчёте.
- HTML: `renderReport(...)` → если `missingCount>0` тост-предупреждение → Blob-скачивание `quackbook-report.html`.
- PDF: `renderReport(...)` → записать `html` в **скрытый iframe** → `iframe.contentWindow.print()`.

## Поток экспорта

```
клик «экспорт HTML»/«PDF»
  → оркестратор по report.blocks
      виджет → client.query(sql)
        ok    → arrowToRows → table | (chart && spec) → Plot→SVG
        error → empty + источники
  → missingCount; если >0 → тост «N виджетов без данных»
  → buildReportHtml(doc, rendered) → строка
  → HTML: Blob → download quackbook-report.html
    PDF:  строка → hidden iframe → iframe.contentWindow.print()
```

## Светлая тема (внутри экспорта)

Инлайн `<style>`: белый фон, тёмный текст (~#1a1a1a), системный шрифт; таблицы — светлые рамки + подложка шапки, моноширинный шрифт ячеек; SVG графика — адаптивная ширина (`max-width:100%`); подписи — приглушённый курсив; заголовки виджетов/секций. `@media print { @page { margin: …; } .qb-widget { break-inside: avoid; } }`. Проверяется глазами.

## Полиш-скоуп (слайс 2)

**Дешёвые correctness (всегда):**
- `TextBlockView`: писать только при `draft !== block.markdown` (backlog: blur-пишет-всегда).
- Ошибка виджета с пустым `datasetNames` → показывать только текст ошибки, без «источник(и): » (backlog).
- Рейл в Отчёте без активного виджета → гасить (backlog: рейл-на-текст-блоке; решено — гасить).
- `WidgetBlockView`: сброс в `loading` при смене `sql`/`loadedKey` через ключ/деривацию, **не** синхронный `setState` (backlog; станет актуально, если виджет получит editable-SQL — но реализуем безопасно сейчас).
- Удалить мёртвое поле `Dataset.dirty` + его записи (`stageColumn`/`setColumnConfig`/`setApplied`), поправить тесты (backlog).
- **Фикстуры:** закоммитить `fixtures/acceptance.sql` + `fixtures/events.csv` в `fixtures/` (консистентно с уже закоммиченным `dirty.csv`).
- **README** «Старт» + команды `dev`/`test`/`build`/`deploy` (заполняет TBD из CLAUDE.md).

**UX-апгрейды:**
- Переименование табов: double-click по заголовку → inline-инпут; стор `renameTab(id, title)`; Enter/blur сохраняет, Esc отменяет (backlog).
- Sublime-стиль таб-стрипа: перерисовать `.tab-strip`/`.tab`/`.tab-close`/`.tab-add` (CSS) (backlog).
- Ярлык **STRING** вместо VARCHAR — только на UI-границе (`SchemaColumnEditor` option-label, `col-type` в `Rail`); внутренний `ColType`/SQL не трогать (backlog).
- Click-to-edit заголовка виджета — зеркало подписи/`TextBlockView`; задействует существующий `updateWidgetTitle` (закрывает backlog «updateWidgetTitle API-only»).
- Релейбл «применить к колонке» → «применить» (backlog).

**A11y + адаптив:**
- Фокус-стили / клавиатурная навигация по интерактиву; `prefers-reduced-motion` гасит переходы; адаптивная раскладка (рейл сворачивается на узком вьюпорте). Пасс, глазами.

**dev/build-чистка:**
- `customLogger` в `vite.config.ts` глушит ровно sourcemap-warning воркеров DuckDB-WASM (backlog).
- Точечный `eslint-disable` с обоснованием для `useVirtualizer` в `ResultGrid.tsx` (lint станет 0 warnings) (backlog).
- Поднять `build.chunkSizeWarningLimit` (убрать chunk-size advisory из лога сборки) (backlog).

## Тестирование

**TDD (node, vitest):**
- `core/exportHtml.test.ts` — `buildReportHtml`: экранирование (`<`/`&`/`"` в title/caption/ячейке/sql), текст-блок через `marked`, рендер таблицы (columns+rows→`<table>`), пометка «нет данных», SQL в `<details>`, порядок блоков сохранён, пустой `doc`.
- стор `renameTab` (red→green).
- Правка `Dataset.dirty`: обновить затронутые стор-тесты.

**Глазами:** SVG-фиделити графика в экспорте, светлая тема, PDF через iframe, весь полиш (табы, STRING-ярлык, a11y/фокус, reduced-motion, адаптив, dev/build-шум).

Граница TDD честная: чистый форматтер и стор-логика — тестами; презентация (тема, SVG, печать, CSS-полиш) — глазами (как в M1–M4).

## Слайсы и исполнение

- **Слайс 1 — Экспорт:** форматтер `core/exportHtml` (TDD) → оркестратор `features/exportReport` → `renderChartSvg`/`plotFigure` → кнопки в `Report.tsx` → PDF через iframe → светлая тема.
- **Слайс 2 — Полиш:** дешёвые correctness → UX-апгрейды → a11y/адаптив → dev/build-чистка → README.

Исполнение — subagent-driven-development через фоновые Workflow (на задачу: имплементер → независимый верификатор, гоняет полный гейт → fix-loop), затем финальный whole-branch review (3 opus-линзы), как в M2–M4. Гейт каждой задачи: `npm run lint` (0 errors), `npm run build`, `npm test`.

## Firewall / вне скоупа (не строить без явного запроса)

- **Не** интерактивный/«живой» экспорт-дашборд, **не** серверный рендер, **не** шеринг с правами, **не** OPFS-персист данных, **не** remote-данные.
- PDF — **через браузерную печать** (iframe + `window.print()`), **не** своя PDF-генерация: никаких тяжёлых либ (jsPDF/pdfmake) — firewall на вес бандла.
- Запекание результатов в файл — разовый снэпшот в **экспорт**, это НЕ персист данных в приложении (данные по-прежнему только в памяти сессии).
- Полиш строго по бэклогу/полиш-листу деливери — без нового продуктового скоупа.

## Готово, когда

- Экспортирую отчёт в standalone-HTML → открывается офлайн (двойной клик по файлу, без сети) и выглядит верно: текст, таблицы (все строки), графики (инлайн-SVG), подписи, светлая тема.
- Виджет без загруженного источника → в файле аккуратная пометка «нет данных», перед выгрузкой было предупреждение «N виджетов без данных».
- «PDF» открывает системный диалог печати с тем же светлым отчётом (полные таблицы, не обрезанные виртуализацией); печать/сохранение в PDF выглядит верно.
- Полиш-кластеры закрыты и проверены глазами; `lint` 0 warnings, лог сборки/`npm run dev`-консоль чистые; README заполнен; гейт зелёный.

## Trace-ability

Каждый пункт ← раздел **M5** деливери-дизайна (экспорт HTML/PDF, полиш-лист, README) либо конкретный пункт `docs/BACKLOG.md`. Единственное сознательное уточнение скоупа — **PDF через печать экспорт-HTML в iframe** вместо живого `window.print()` (причина: виртуализация грида + тёмная тема живого DOM сделали бы PDF неполным/нечитаемым).
