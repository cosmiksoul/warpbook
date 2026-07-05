# M9 «Витрина + REPL» — дизайн

Дата: 2026-07-05. Статус: принят (брейншторм в сессии, решения пользователя зафиксированы ниже). Контекст: первый милстоун пост-v1 очереди `docs/ROADMAP.md`.

## Цель

Порог входа в демку → ноль: визитёр без своего файла делает первый запрос < 30 секунд; SQL-редактор ощущается как shell (история ↑/↓, dot-команды).

## Решения пользователя (2026-07-05)

1. **Сэмплы — все три**: Palmer Penguins (CSV) + NYC Yellow Taxi срез (Parquet) + Titanic (CSV), рядом с существующим cookbook-демо.
2. **Сэмплы не «висят везде»**: карточки на welcome-экране + ОДНА кнопка «сэмплы» у дропзоны рейла → модал. Всё демо (включая cookbook) доступно за этой кнопкой.
3. **История**: psql-стиль (↑/↓ на границах документа), глобальная (не per-tab), кап 200, дедуп подряд, localStorage.
4. **Dot-команды**: только `.tables` / `.schema <t>` / `.help`; вывод псевдо-таблицей в панель результата; исполнение без движка.

## Витрина

### Каталог — `src/core/sampleCatalog.ts` (TDD)

```ts
export interface SampleFile { path: string; name: string } // path под BASE_URL; name задаёт имя таблицы
export interface SampleSeedTab { title: string; sql: string }
export interface Sample {
  id: 'cookbook' | 'penguins' | 'taxi' | 'titanic'
  title: string
  blurb: string        // одна строка на карточке
  sizeLabel: string    // «~350 КБ» — строкой, без рантайм-подсчёта
  files: SampleFile[]
  seedTabs: SampleSeedTab[]
  featured?: boolean   // cookbook: первая, крупнее, с кредитом
  credit?: string      // строка источника/лицензии
}
export const SAMPLES: Sample[]
export function sampleLoaded(s: Sample, loadedTables: string[]): boolean // все таблицы файлов уже в сторе
```

- **cookbook** — существующее демо как запись каталога: files `demo/payments.csv → demo_payments.csv` + `demo/users.parquet → demo_users.parquet`, seedTabs = текущие `EXAMPLE_QUERIES` (2 рецепта), featured, credit «SQL 101: Рецепты продуктового аналитика · MIT».
- **penguins** — `samples/penguins.csv → demo_penguins.csv`; seed «пингвины по видам»: агрегат species → count + avg(body_mass_g).
- **taxi** — `samples/taxi.parquet → demo_taxi.parquet`; seed «поездки по дням»: день ← tpep_pickup_datetime, count(*) + sum(total_amount).
- **titanic** — `samples/titanic.csv → demo_titanic.csv`; seed «выживаемость по классам»: Pclass → count + avg(Survived)·100.

Имена таблиц — с `demo_`-префиксом (консистентно с приёмочным решением M8: демо отличимо от своих файлов). Точные колонки/тексты seed-запросов план фиксирует после подготовки данных; целевой вид — по одному короткому наглядному агрегату на сэмпл, каждый даёт и таблицу, и график.

### Данные

- `public/samples/penguins.csv` (~15 КБ, CC0, palmerpenguins) и `public/samples/titanic.csv` (~60 КБ, классический public-domain train-набор) — коммитятся как есть.
- `public/samples/taxi.parquet` — срез NYC TLC yellow tripdata одного месяца до ~15–20 тыс. строк / ≤1 МБ (колонки типа tpep_pickup_datetime, trip_distance, total_amount, payment_type…). Режется одноразовым скриптом `scripts/prepSamples.mjs` (паттерн `convertUsers.mjs`); скрипт коммитится.
- `DATA-LICENSE` дополняется тремя записями (источник, лицензия). Бюджет новых артефактов ≤ ~1.5 МБ.

### Загрузка — `src/features/sampleData.ts`

Обобщение `loadDemoData`: `loadSample(client, applyInferred, sample)` — fetch `BASE+path` → `File(name)` → `loadOneFile` → `addDataset` → `applyInferred` для csv; идемпотентно по таблицам (skip если таблица есть). `seedSampleTabs(sample)` — добавляет стартовые табы, дубликаты по title скипает (план сверяет с фактической семантикой `seedTabs` и расширяет её при необходимости). `demoData.ts` переезжает на каталог; поведение welcome-кнопки «Открыть пример отчёта» не меняется (cookbook-файлы + sample-report, confirm-guard остаётся).

### UI

- `src/components/SampleGallery.tsx` — сетка карточек: featured-карточка первая и шире, остальные компактные. Карточка: title, бейджи форматов (CSV/Parquet), sizeLabel, blurb; клик → «грузим…» → «✓ загружено» (по `sampleLoaded`); кредит мелкой строкой на cookbook-карточке. Один компонент для welcome и модала.
- `WelcomeScreen`: кнопка «▸ Загрузить демо-данные» заменяется галереей; «Открыть пример отчёта» остаётся второй CTA; кредит-абзац учебника уезжает в карточку cookbook.
- `Rail`: под дропзоной кнопка-линк «сэмплы» → модал (существующие `.modal`-стили) с той же галереей + строкой-линком «открыть пример отчёта» внизу (тот же confirm-guard).

## История запросов

### `src/core/queryHistory.ts` (TDD)

```ts
export const HISTORY_CAP = 200
export const HISTORY_KEY = 'quackbook.sqlHistory'
export function pushHistory(list: string[], sql: string): string[]
// trim; пустые скипаются; дедуп ТОЛЬКО подряд идущих; кап 200 — старые отваливаются
export function serializeHistory(list: string[]): string
export function deserializeHistory(raw: string | null): string[] // битое/чужое → []
```

- Стор: `history: string[]` в `useSession`; пуш при КАЖДОМ RUN в explore (включая dot-команды и упавшие запросы — как shell); запись в localStorage при пуше, гидратация при инициализации стора (рядом с существующей REPORT_KEY-механикой).
- Только редактор Explore; ячейки M7b истории не имеют.

### Поведение в редакторе (глазами)

- ↑ при курсоре на ПЕРВОЙ строке без выделения → шаг старее; ↓ на ПОСЛЕДНЕЙ строке → шаг новее; ↓ за самым свежим → возврат черновика. В остальных позициях стрелки работают как обычно (fallback на дефолтные биндинги CM6).
- Черновик: при первом входе в историю текущий текст сохраняется (локальный стейт), возвращается при выходе вниз.
- Указатель истории сбрасывается после RUN и при переключении таба.

## Dot-команды

### `src/core/dotCommands.ts` (TDD)

```ts
export type DotCommand =
  | { kind: 'tables' } | { kind: 'schema'; table: string }
  | { kind: 'help' } | { kind: 'unknown'; raw: string }
export function parseDotCommand(input: string): DotCommand | null
// null = не dot-команда (первый непробельный символ не «.» или ввод многострочный)
// регистронезависимо; `.schema` без аргумента → unknown
export function tablesRows(datasets: Dataset[]): PseudoResult // name | kind | columns(count)
export function schemaRows(dataset: Dataset): PseudoResult    // column | type
export function helpRows(): PseudoResult                      // command | description (+строка про ↑/↓)
// PseudoResult — структура, которую принимает существующий raw-путь панели
// результата (setRawResult); точный тип план берёт из него же (QueryResult).
```

- Исполнение в начале run-пайплайна (`useResultActions.runQuery`): распарсилось → строим строки из стора (datasets + витрины; `_qb_*` скрыты существующим `isInternalTable`) → показываем через существующий raw-путь результата (`setRawResult`), движок не трогаем. История пушится.
- `.schema <t>`: таблица не найдена → ошибка в панели «нет таблицы <t> — см. .tables». `unknown` → «неизвестная команда — .help».

## Тестирование и гейт

- TDD: хелперы каталога (`sampleLoaded`), `queryHistory` (пуш/дедуп-подряд/кап/сериализация/битый JSON), `dotCommands` (парсер: три команды, регистр, многострочность, не-точка; три row-билдера; unknown).
- Node-интеграция с движком не нужна (движок не участвует). Галерея, модал, поведение стрелок — глазами (граница CLAUDE.md: презентация тестами не покрывается).
- Гейт: `npm test` + `npm run build` + `npm run lint` 0/0; **0 новых npm-зависимостей**.

## Вне скоупа M9

Remote-источники в витрине (секция появится в M13), EN-строки (M14), пользовательские/кастомные сэмплы, история per-tab и поиск по истории (Ctrl+R), любые другие dot-команды (`.timer`, `.mode`…).
