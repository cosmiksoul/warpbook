# quackbook M3 «Профиль значений» — дизайн

**Дата:** 2026-06-24
**Веха:** M3 (вес M). Источник истины — `docs/scope-quackbook-v1.md` (раздел «M3 — Профиль»), дорожная карта `docs/superpowers/specs/2026-06-22-quackbook-delivery-design.md`.

## Цель

Видеть, что внутри колонок, по клику: сетка карточек — distinct-каунты, топ-значения категориальных (с барами), мини-гистограммы числовых (+ min/median/max), маркеры null. Два таргета: **таблица-источник** (понять сырьё до запроса, вход из рейла) и **результат запроса** (понять, что вернул join/group by на этапе исследования, вход из панели). Без сети, всё в браузерной DuckDB.

**Done when (из скоупа):** жму профиль → карточки с distinct-каунтами, бары топ-значений, гистограммы числовых + min/median/max, маркеры null.

## Принятые решения (развилки брейншторма)

1. **Два таргета профиля** (slice 1 — источник; slice 2 — результат; расширение скоупа по запросу владельца 2026-06-24):
   - **источник** — таблица датасета (`Dataset.table`: CSV типизированная `<t>` / Parquet нативная), вход из рейла «профиль источника»;
   - **результат запроса** — текущий SQL активного таба, вход из таба «профиль» в панели. Делается материализацией результата во внутреннюю таблицу (обычную, **не `TEMP`** — см. ниже) + переиспользованием того же профайлера (см. «Профиль результата (slice 2)»).
2. **Категориальные с высокой кардинальностью — порог по distinct.** `approx_unique ≤ THRESHOLD` (дефолт **50**) → топ-K значений с барами; иначе карточка «≈N distinct, высокая кардинальность» без разбивки (не врём баром на ID/email, экономим точечные запросы).
3. **Histogram — только в карточках профиля.** Основной `Chart`/`chartSpec` не трогаем. Это осознанное прочтение скоупа: строка M3 «Чарт: добавляется histogram» vs done-when (гистограммы только в профиле) — берём done-when (rule 5: трассируемость; YAGNI). Гистограмма в авто-чарте — отложена, не firewall-нарушение, обсуждаемо позже.

**Дефолты:** `THRESHOLD_DISTINCT = 50`, `TOP_K = 7` (показываем + «+N ещё»), `HISTOGRAM_BINS = 12`.

**Слайсы:** **slice 1** — профиль источника (рейл) + весь профайлер-кор (`core/profile.ts`) + UI; **slice 2** — профиль результата (панель), переиспользует кор/UI slice 1 через temp-таблицу. Оба мержатся одной веткой `m3-profile`.

## Проверенные факты DuckDB-WASM 1.32 (спайк, node-движок)

Спайк (создан/прогнан/удалён в сессии 2026-06-24) снял реальное поведение:

- **`SUMMARIZE <table>`** → колонки: `column_name` (Utf8), `column_type` (Utf8), `min` (**Utf8/строка**), `max` (**строка**), `approx_unique` (Int64 → BigInt), `avg`/`std`/`q25`/`q50`/`q75` (**строки**, `null` для нечисловых; **`q50` = медиана**), `count` (Int64), `null_percentage` (Decimal).
  - **min/max/median приходят строками** (гетерогенные колонки) → парсим `Number(...)` для числовых, оставляем строкой для дат/`range`.
  - **`null_percentage` через наш `arrowToRows` декодится криво** (Decimal отдаётся как строка вида `"1667"` вместо `16.67`) → **НЕ используем**. Null-каунты берём отдельным чистым проходом.
- **histogram-функции:** `width_bucket` в сборке **отсутствует**; `histogram(col, N)` нет (есть только `histogram(ANY)→MAP` по каждому distinct и `histogram(ANY, ANY[])` с массивом границ → возвращает кривой MAP с ключом `Infinity`). → **ручной equi-width через `floor`-арифметику** даёт чистые `{bucket:Int32, n:Int64}`, контролируемое число бинов, предсказуемо. Это выбранный путь.
- **top-values** (`GROUP BY col ORDER BY count(*) DESC LIMIT K`) и `approx_count_distinct` — чисто, без сюрпризов.
- **Int64/счётчики** приходят как `BigInt` → оборачиваем `Number(...)`.

## Модель данных профиля (`core/profile.ts`)

```ts
export type ColumnKind = 'numeric' | 'categorical' | 'range' | 'highCardinality'

export interface TopValue {
  value: string   // строковое представление значения (boolean → 'true'/'false', null-бакет не включаем)
  count: number
  frac: number    // count / max(count) в наборе — ширина бара 0..1
}

export interface HistogramBin {
  lo: number
  hi: number
  count: number
}

export interface ColumnProfile {
  name: string
  type: string          // DuckDB column_type как есть (для бейджа)
  distinct: number      // approx_unique
  nullCount: number
  kind: ColumnKind
  // categorical (вкл. boolean):
  top?: TopValue[]
  moreDistinct?: number // distinct - top.length, для «+N ещё»
  // numeric:
  histogram?: HistogramBin[]
  stats?: { min: number; median: number; max: number }
  // range (date/timestamp):
  range?: { min: string; median: string; max: string }
}
```

### Классификация (`classifyColumn(columnType, approxUnique, threshold)`)

- `BIGINT`/`DOUBLE`/`FLOAT` (и целочисленные/`DECIMAL`, если встретятся) → **`numeric`** (гистограмма + min/median/max).
- `BOOLEAN` → **`categorical`** (топ true/false; всегда низкая кардинальность).
- `VARCHAR` → `approx_unique ≤ threshold` ? **`categorical`** : **`highCardinality`** (только distinct + null, без разбивки).
- `DATE`/`TIMESTAMP`/`TIME` → **`range`** (min/median/max строкой; без гистограммы и топ-значений в v1 — биннинг дат отложен, честно и просто).
- прочее (UUID, BLOB и т.п.) → `highCardinality` (только distinct/null).

## Конвейер вычисления (`features/useProfileActions.ts`, зеркало `useSchemaActions`)

Сайд-эффекты (запросы) — снаружи стора; ошибка DuckDB → в стор, не throw. Ядро — `profileRelation(name)` (работает по имени таблицы; **переиспользуется и источником, и результатом** — для результата `name` = temp-таблица). Шаги:

1. **`SUMMARIZE <table>`** → `parseSummarize` → per-колонка `{ name, type, approxUnique, min, max, median }` (строки, кроме approxUnique).
2. **Null-каунт + total одним проходом** — `buildNullCountQuery(table, colNames)` (паттерн `buildNullLossQuery`): `SELECT count(*) AS total, count(*) FILTER (WHERE "c0" IS NULL) AS n0, … FROM <t>` → `interpretNullCounts` → `{col: nullCount}` + `total`. Чистые Int64.
3. **Классификация** каждой колонки (`classifyColumn`).
4. **На каждую `categorical`:** `buildTopValuesQuery(table, col, TOP_K)` → `interpretTopValues` (нормализация `frac` по максимуму) + `moreDistinct = max(0, distinct - top.length)`.
5. **На каждую `numeric`:** `buildHistogramQuery(table, col, lo, hi, BINS)` (lo/hi = распарсенные min/max). `interpretHistogram` добивает пустые бины нулями и считает границы `lo/hi` каждого бина.
6. Собрать и вернуть `ColumnProfile[]`. Вызывающий кладёт в стор: источник → `setProfile(table, …)`, результат → `setResultProfile(tabId, …)`.

**Кол-во запросов:** `1 (SUMMARIZE) + 1 (null-каунт) + #categorical + #numeric`. Для типичной таблицы ~5–12, локально быстро. Батчинг топ-значений/гистограмм в меньшее число запросов — возможен, но YAGNI; начинаем последовательно-просто. Честно отражаем в подписи (см. ниже).

### Граничные случаи

- **`hi == lo`** (одно distinct-значение / все равны): деление на ноль. Решение — **гистограмму опускаем**: `buildHistogramQuery` возвращает признак вырожденности (`null`/пустой), `interpretHistogram` → `[]`, карточка показывает только `min/median/max` (все равны). Покрыть тестом.
- **Все-null числовая:** min/max null → гистограмму опускаем, `stats` = null-метка.
- **Пустая таблица (0 строк):** топ-значения пусты, гистограммы опускаем; карточки показывают «0 строк». Покрыть.
- **Нетипизированный CSV (всё VARCHAR):** все колонки `categorical`/`highCardinality`; числовые гистограммы появляются только после типизации (M2). Это честно — профиль отражает текущие типы.

## Профиль результата (slice 2)

Профилируем **результат текущего SQL** активного таба, переиспользуя `profileRelation` без изменений:

1. **Материализация результата:** `buildResultTempDDL(tabId, sql)` → `CREATE OR REPLACE TABLE _qb_result_<tabId> AS <sql>` (хвостовой `;`/пробелы — strip). **Обычная (catalog-global) таблица, НЕ `TEMP`** (проверено против движка): `DuckDBClient.run()` открывает свежее соединение на каждый `query`/`exec`, а DuckDB-`TEMP`-таблица локальна для соединения → не дожила бы до профилирующих запросов (`Catalog Error`). Обычная таблица каталог-глобальна (тот же механизм, что `_qb_raw_*`). Запрос исполняется один раз с настоящими выведенными DuckDB типами (числа — числа, даты — даты), поэтому профиль результата осмысленнее, чем у нетипизированного CSV-источника.
2. `profileRelation('_qb_result_<tabId>')` — тот же SUMMARIZE + null-каунт + top-values + гистограммы.
3. Не дропаем явно: следующий `CREATE OR REPLACE` перезатирает таблицу на таб, она живёт сессию (проще, без лишнего DDL) и скрыта из рейла через `isInternalTable`.
4. `setResultProfile(tabId, profiles)`.

Внутреннее имя `_qb_result_*` **скрывается из рейла** (расширить `isInternalTable`, как `_qb_raw_*`).

Оркестратор: `profileResult(tabId, sql)` в `useProfileActions`. Ошибка (невалидный SQL и т.п.) → `setResultProfileError(tabId, msg)` → показ в panel profile-view, не краш.

**Спайк-доверие:** `CREATE OR REPLACE TABLE … AS <select>` + весь конвейер по этой таблице — стандартный DuckDB; спайк уже доказал конвейер на `CREATE TABLE AS`. Confirm обычной (не `TEMP`) таблицы через per-call соединения — первой задачей slice 2 (дёшево).

## Состояние и инвалидация (`state/session.ts`)

**Источник** (slice 1) — кэш на датасете:
- `Dataset`: `profile?: ColumnProfile[]`, `profiling?: boolean`, `profileError?: string | null`.
- Инвалидация: `setApplied` (ре-материализация при apply/«сброс» схемы) **очищает `profile`** датасета. Единственная точка (header-«сброс»/per-column «сбросить» идут через apply→setApplied). Parquet не ре-материализуется → его профиль живёт сессию.

**Результат** (slice 2) — кэш на табе:
- `Tab`: `resultProfile?: ColumnProfile[]`, `resultProfiling?: boolean`, `resultProfileError?: string | null`.
- Инвалидация: `updateTabSql` (правка SQL) **очищает `resultProfile`** таба → следующий показ пересчитает по новому SQL.

**Общее (вид/таргет):**
- Session: `exploreView: 'table' | 'chart' | 'profile'` (**подъём** локального `view` из `ResultPanel` в стор — вид переключают два места: кнопка рейла и таб панели) и `profileTarget: { kind: 'source'; table: string } | { kind: 'result'; tabId: string } | null` (что показывает profile-view при `exploreView==='profile'`).
- Экшены: `setExploreView`, `setProfileTarget`; источник — `setProfile`/`setProfiling`/`setProfileError`; результат — `setResultProfile`/`setResultProfiling`/`setResultProfileError`.

## UI

### Энтрипоинты (мокап `docs/quackpad-app.html`)

- **Рейл (`Rail.tsx`) → профиль ИСТОЧНИКА:** в каждом schema-блоке кнопка «профиль источника» → `setProfileTarget({kind:'source', table})` + `setExploreView('profile')` + `profile(table)` (если не закэширован). Работает **независимо от результата** (сырьё до запроса).
- **Панель (`ResultPanel.tsx`) → профиль РЕЗУЛЬТАТА:** третий вид «профиль» рядом с таблица/график → `setProfileTarget({kind:'result', tabId})` + `setExploreView('profile')` + `profileResult(tabId, sql)`. Доступен при наличии результата (как «график»); без результата кнопка disabled с подсказкой.

Одна profile-view, два возможных таргета; шапка disambiguates (см. ниже). `ResultPanel` читает `exploreView`/`profileTarget` из стора (сейчас держит `view` локально — M3 поднимает его в стор). При показе source-таргета без результата кнопки таблица/график disabled (нечего показывать), активна «профиль».

### Profile-view (`components/ProfilePanel.tsx` + `ProfileCard.tsx`)

- Один компонент `ProfilePanel` для обоих путей — рендерит `ColumnProfile[]` активного таргета (источник: `Dataset.profile`; результат: `Tab.resultProfile`).
- Подпись (psub) по таргету: источник → **«профиль источника · <fileName> · N строк»**; результат → **«профиль результата · <имя таба> · N строк»**. Мокаповское «один проход (SUMMARIZE)» **убираем** (это N запросов; честность для демо).
- Сетка карточек `.pgrid` (auto-fill `minmax(240px,1fr)`) — порт стилей из мокапа.
- Карточка (`ProfileCard`):
  - Шапка: имя, бейдж типа, `N distinct` (или `null · N` коралловым при `nullCount > 0`).
  - `categorical`: строки топ-значений — значение + бар (`frac` ширина) + каунт; «+N ещё» при `moreDistinct > 0`.
  - `numeric`: мини-гистограмма (CSS/SVG `.histo` из мокапа, высоты по `count`) + строка `min / median / max`.
  - `range`: только `min / median / max`.
  - `highCardinality`: «≈N distinct, высокая кардинальность» + null-маркер.
- Состояния: `profiling` → «считаю профиль…»; `profileError` → текст ошибки в панели (не краш).
- **`Chart.tsx`/`chartSpec.ts` — без изменений.**

## Архитектура (4 зоны, как M1/M2)

- **`core/profile.ts`** (+ `profile.test.ts`, TDD-ядро): типы; `classifyColumn`; `parseSummarize`; `buildNullCountQuery`/`interpretNullCounts`; `buildTopValuesQuery`/`interpretTopValues`; `buildHistogramQuery`/`interpretHistogram`. Чистые функции, без DuckDB.
- **`core/sql.ts`** (slice 2): `resultTempName(tabId)` → `_qb_result_<tabId>`; `buildResultTempDDL(tabId, sql)` (обычная `CREATE OR REPLACE TABLE … AS <stripped sql>`, **не `TEMP`** — см. «Профиль результата»); расширить `isInternalTable` на `_qb_result_*`. TDD.
- **`db/duckdbClient.ts`**: переиспользуем `query`/`exec`/`describeTable` — новых методов, скорее всего, не нужно (профиль строится из готовых примитивов).
- **`features/useProfileActions.ts`**: `profileRelation(name)` (общее ядро) + `profile(table)` (источник, slice 1) + `profileResult(tabId, sql)` (результат, slice 2).
- **`state/session.ts`**: per-dataset + per-tab поля + `exploreView`/`profileTarget` + экшены + инвалидация (см. выше).
- **`components/ProfilePanel.tsx` + `ProfileCard.tsx`**: рендер (общие для обоих таргетов). Правки `ResultPanel.tsx`, `Rail.tsx`. Стили в `index.css` (порт `.psub/.pgrid/.pcard/.pc-*/.pt/.pf/.histo/.hb/.pstats`).

## Обработка ошибок и загрузки

- Любая ошибка DuckDB при профилировании → в стор (`setProfileError(table, msg)` для источника / `setResultProfileError(tabId, msg)` для результата) → показ в profile-view; стор и приложение не падают (паттерн `setSchemaError`).
- Флаг вычисления (`profiling` / `resultProfiling`) → плейсхолдер «считаю профиль…».

## Тестирование (TDD-граница)

- **Логика (node-TDD red→green):** `classifyColumn`, `parseSummarize`, `buildNullCountQuery`/`interpretNullCounts`, `buildTopValuesQuery`/`interpretTopValues`, `buildHistogramQuery`/`interpretHistogram` (вкл. вырожденный `hi==lo`, пустые бины, нормализацию `frac`); slice 2 — `resultTempName`/`buildResultTempDDL` (strip хвостового `;`) и `isInternalTable('_qb_result_*')`.
- **Интеграционный node-смоук** (зеркало `duckdbClient.dirty.test.ts`): на маленькой таблице прогнать весь конвейер и проверить собранный `ColumnProfile[]` (distinct/null/top/histogram); slice 2 — то же через `CREATE OR REPLACE TABLE _qb_result_* AS <select>` (заодно подтверждает обычную таблицу при per-call соединениях). Уверенность по реальному DuckDB.
- **Карточки/CSS — глазами** (jsdom в репо нет; как в M1/M2).

## Вне скоупа (firewall)

- **Key-хинт** (джойн-подсказка от профиля) — нет (вырезан/v1.5).
- **Histogram в основном чарте** — нет (выбор: только карточки профиля).
- **Биннинг дат / временная гистограмма** — отложено (DATE/TIMESTAMP = `range`).
- **Персист профиля** между сессиями — нет (считается по требованию, кэш в памяти).

## Допущения

- Профиль типизированной таблицы отражает **текущие** типы (нетипизированный CSV → всё строковое — это ожидаемо и честно).
- `THRESHOLD_DISTINCT=50` / `TOP_K=7` / `BINS=12` — стартовые дефолты, можно подправить по виду на реальных данных (в полишинг, не блокер).
- `approx_unique` приблизителен (HLL) — для порога/«≈N distinct» этого достаточно; подпись «≈» честно отражает приблизительность для высокой кардинальности.
