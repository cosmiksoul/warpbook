# warpbook Terminal Redesign («Cyan Console») — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести warpbook с неон/варп-эстетики на утверждённый терминальный web-punk («Cyan Console»): IBM Plex Serif+Mono, чёрная плоская TUI-хромировка (radius 0, без теней/градиентов), дизеренный дот-свирл вместо WebGL-шейдера, magenta как функциональный вторичный акцент.

**Architecture:** Value-only миграция CSS-токенов (имена переменных `--accent`, `--surface`… сохраняются — меняются значения), один новый компонент `DitherSwirl` (2D canvas, Bayer 4×4) вместо `WarpShader`, точечные правки 6 существующих компонентов. Источник истины по виду — `docs/superpowers/specs/2026-07-02-warpbook-terminal-redesign-decisions.md` + мокапы `docs/superpowers/specs/mockups/warpbook-terminal/mock.html?v=cyan` и `mock2.html`.

**Tech Stack:** React 19 + TS, Vite 8, Vitest 4 (node), чистый CSS (index.css), 2D canvas. Без новых npm-зависимостей.

## Global Constraints

- **0 новых npm-deps.** Шрифты — статические woff2 в `public/fonts/` (не пакеты); свирл — рукописный 2D canvas.
- **Бренд-раскол:** отображаемое имя — `warpbook` (уже везде); инфраструктура остаётся `quackbook` — НЕ трогать `REPORT_KEY 'quackbook.report'`, префиксы `_qb_`, vite `base '/quackbook/'`, имя пакета.
- **Пины движка:** `@duckdb/duckdb-wasm` 1.32.0 (движок 1.5.4) — не трогать.
- **`src/core/exportHtml.ts` ВНЕ скоупа** — это осознанно отдельная светлая print-тема экспорта; не ретемить (и тесты его не трогать).
- **Мокапы `docs/superpowers/specs/mockups/**` — референс, read-only.**
- **Имена CSS-переменных сохраняются.** Исключения: удалить `--grad-neon` (T2) и `--accent-muted` (T6); добавить `--serif-ink`, `--font-serif`.
- **Точная палитра:** bg `#05070a` · surface `#0a0f14` · surface-2 `#0c141a` · border `#143039` · border-soft `#0e222a` · accent `#22d3ee` · accent-2 `#e849c4` · warn `#e0b64a` · text `#d6ecf1` · dim `#6f97a2` · faint `#3f5b63` · serif-ink `#eaf7fb`.
- **Magenta (`--accent-2`) — только функционально:** hover (nav/источники/строки грида/табы), числа в SQL-подсветке, 2-я серия графика (в v1 дремлет — график односерийный, мульти-серии НЕ строить: firewall). Никаких декоративных заливок magenta.
- **Форма:** radius 0 везде; никаких drop-shadow и градиент-заливок. Glow-тени разрешены только на: primary CTA, hover/focus, `.report-block.active`.
- **Свирл только на boot + welcome.** Никогда за данными (грид/редактор/рейл).
- **Гейт КАЖДОЙ задачи:** `npm test` && `npm run build` && `npm run lint` — всё зелёное/0 warnings. Build обязателен: vitest не гоняет полный type-check.
- **TDD только для логики** (T4 `bootSegments`). CSS/canvas — презентация, проверяется глазами на финальной приёмке (граница из CLAUDE.md).
- **Коммиты:** через Bash-тул с here-doc (Windows; PowerShell `@'...'@` в Bash-туле ломается). Один коммит на задачу, в конце сообщения:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

**Создаются:**
- `scripts/fetch-plex-fonts.mjs` — одноразовый скачиватель woff2 (документирует происхождение бинарей).
- `public/fonts/ibm-plex-mono-{400,500,600}-{latin,cyrillic}.woff2` (6) + `public/fonts/ibm-plex-serif-{500,600}-{latin,cyrillic}.woff2` (4).
- `src/components/DitherSwirl.tsx` — hero-фон (дизеренный дот-свирл).

**Правятся:** `src/index.css` (главное поле боя — T1/T2/T3/T5/T6), `src/core/bootProgress.ts` + `.test.ts` (T4), `src/components/{WelcomeScreen,BootScreen,Icon,SqlEditor,Chart}.tsx`, `src/features/Shell.tsx`, `docs/superpowers/specs/2026-07-02-warpbook-terminal-redesign-decisions.md` (T8, статус).

**Удаляются:** `src/components/WarpShader.tsx`, старые `public/fonts/inter-*.woff2` (6) и `public/fonts/jetbrains-mono-*.woff2` (4).

## Осознанные отклонения от мокапов (утвердить глазами на приёмке)

1. Welcome h1: 46px в моке → **38px** (welcome живёт в workspace рядом с рейлом, не full-bleed).
2. **SEED-счётчик опущен** — в приложении нет сида; честный терминал без фейка.
3. Welcome-«foot» из мока опущен — его роль играет постоянный `.statusline` шелла (T3); версия движка — в топбаре (как в mock2), без дублей.
4. `.tab-close`: круг → квадрат (radius 0 тотально).
5. «Blink-cursor» из terminal-DNA не добавляем (мокапы без него; restraint).

---

### Task 1: Self-host IBM Plex Mono + Serif (замена Inter/JetBrains)

**Files:**
- Create: `scripts/fetch-plex-fonts.mjs`
- Create (скриптом): `public/fonts/ibm-plex-*.woff2` — 10 файлов
- Modify: `src/index.css` (строки 1–31: блок @font-face; строка 34 `:root font-family`; строки 58–59 `--font-ui`/`--font-mono`; строки 61–66 `body`)
- Delete: `public/fonts/inter-*.woff2`, `public/fonts/jetbrains-mono-*.woff2`

**Interfaces:**
- Produces: семейства `'IBM Plex Mono'` (400/500/600) и `'IBM Plex Serif'` (500/600), токен `--font-serif` — их потребляют T2/T3/T5/T6.

- [ ] **Step 1: создать скрипт скачивания**

`scripts/fetch-plex-fonts.mjs` (папки `scripts/` ещё нет — создастся):

```js
// Одноразовый скрипт: скачивает woff2-сабсеты IBM Plex Mono (400/500/600) и
// IBM Plex Serif (500/600), latin + cyrillic, из Google Fonts в public/fonts/.
// Документирует происхождение self-hosted бинарей; в сборку приложения не входит.
// Запуск: node scripts/fetch-plex-fonts.mjs
import { writeFile } from 'node:fs/promises'

const CSS_URL =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Serif:wght@500;600&display=swap'
// Chrome-UA => Google отдаёт woff2 с по-сабсетными unicode-range блоками.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const css = await (await fetch(CSS_URL, { headers: { 'User-Agent': UA } })).text()
// Ответ — повторяющиеся блоки "/* subset */ @font-face { ... }".
const parts = css.split(/\/\*\s*([a-z-]+)\s*\*\//).slice(1)
let saved = 0
for (let i = 0; i < parts.length; i += 2) {
  const subset = parts[i]
  const block = parts[i + 1]
  if (subset !== 'latin' && subset !== 'cyrillic') continue
  const fam = block.includes('IBM Plex Mono') ? 'ibm-plex-mono' : 'ibm-plex-serif'
  const weight = block.match(/font-weight:\s*(\d+)/)?.[1]
  const url = block.match(/src:\s*url\(([^)]+)\)/)?.[1]
  if (!weight || !url) throw new Error(`bad block for ${subset}`)
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  const name = `${fam}-${weight}-${subset}.woff2`
  await writeFile(new URL(`../public/fonts/${name}`, import.meta.url), buf)
  console.log(`${name}  ${(buf.length / 1024).toFixed(1)} KB`)
  saved++
}
if (saved !== 10) throw new Error(`expected 10 files, saved ${saved}`)
console.log('done')
```

- [ ] **Step 2: запустить**

Run: `node scripts/fetch-plex-fonts.mjs`
Expected: 10 строк `ibm-plex-…woff2  NN.N KB` + `done`. Проверить: `ls public/fonts` → 10 новых `ibm-plex-*` файлов, каждый > 5 KB.

- [ ] **Step 3: заменить блок @font-face в `src/index.css`**

Целиком заменить строки 1–31 (от `/* --- self-hosted fonts` до последнего JetBrains-блока включительно) на:

```css
/* --- self-hosted fonts (woff2 in public/fonts/) — IBM Plex, latin+cyrillic --- */
@font-face { font-family: 'IBM Plex Mono'; font-style: normal; font-weight: 400; font-display: swap;
  src: url('/fonts/ibm-plex-mono-400-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215; }
@font-face { font-family: 'IBM Plex Mono'; font-style: normal; font-weight: 400; font-display: swap;
  src: url('/fonts/ibm-plex-mono-400-cyrillic.woff2') format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: 'IBM Plex Mono'; font-style: normal; font-weight: 500; font-display: swap;
  src: url('/fonts/ibm-plex-mono-500-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215; }
@font-face { font-family: 'IBM Plex Mono'; font-style: normal; font-weight: 500; font-display: swap;
  src: url('/fonts/ibm-plex-mono-500-cyrillic.woff2') format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: 'IBM Plex Mono'; font-style: normal; font-weight: 600; font-display: swap;
  src: url('/fonts/ibm-plex-mono-600-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215; }
@font-face { font-family: 'IBM Plex Mono'; font-style: normal; font-weight: 600; font-display: swap;
  src: url('/fonts/ibm-plex-mono-600-cyrillic.woff2') format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: 'IBM Plex Serif'; font-style: normal; font-weight: 500; font-display: swap;
  src: url('/fonts/ibm-plex-serif-500-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215; }
@font-face { font-family: 'IBM Plex Serif'; font-style: normal; font-weight: 500; font-display: swap;
  src: url('/fonts/ibm-plex-serif-500-cyrillic.woff2') format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: 'IBM Plex Serif'; font-style: normal; font-weight: 600; font-display: swap;
  src: url('/fonts/ibm-plex-serif-600-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215; }
@font-face { font-family: 'IBM Plex Serif'; font-style: normal; font-weight: 600; font-display: swap;
  src: url('/fonts/ibm-plex-serif-600-cyrillic.woff2') format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
```

(unicode-range — те же стандартные гугловские сабсеты, что стояли для Inter/JetBrains. Глифы ▸ ● ▮ вне диапазонов и падают в системный шрифт — так было и раньше, ок.)

- [ ] **Step 4: переключить токены и body**

В `:root` заменить строку `font-family: 'Inter', system-ui, sans-serif;` на `font-family: 'IBM Plex Mono', ui-monospace, monospace;`.

Заменить строки токенов:
```css
  --font-ui: 'IBM Plex Mono', ui-monospace, monospace;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
  --font-serif: 'IBM Plex Serif', Georgia, serif;
```
(`--font-ui` намеренно = mono: по решению весь UI/body — mono; токен оставлен, чтобы не трогать его потребителей.)

Заменить блок `body { ... }` на:
```css
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 13.5px;
}
```

- [ ] **Step 5: удалить старые шрифты**

Run (bash): `git rm public/fonts/inter-400-latin.woff2 public/fonts/inter-400-cyrillic.woff2 public/fonts/inter-500-latin.woff2 public/fonts/inter-500-cyrillic.woff2 public/fonts/inter-600-latin.woff2 public/fonts/inter-600-cyrillic.woff2 public/fonts/jetbrains-mono-400-latin.woff2 public/fonts/jetbrains-mono-400-cyrillic.woff2 public/fonts/jetbrains-mono-500-latin.woff2 public/fonts/jetbrains-mono-500-cyrillic.woff2`

- [ ] **Step 6: проверить отсутствие ссылок на старые семейства**

Run: `grep -rn "Inter'\|JetBrains" src/ index.html`
Expected: 0 совпадений.

- [ ] **Step 7: гейт**

Run: `npm test` → все тесты зелёные (сейчас 285), `npm run build` → OK, `npm run lint` → 0 ошибок/0 warnings.

- [ ] **Step 8: commit**

```bash
git add -A && git commit -m "$(cat <<'EOF'
feat(terminal): self-host IBM Plex Mono+Serif, drop Inter/JetBrains

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Терминальные токены + уплощение (radius 0, тени прочь, борд-кнопки)

**Files:**
- Modify: `src/index.css` (блок `:root`; точечные правки по списку ниже)

**Interfaces:**
- Consumes: `--font-serif` из T1.
- Produces: финальные значения токенов (палитра выше) — их потребляют все следующие задачи. Удалён `--grad-neon`. `--accent-muted` пока ЖИВ (его последний потребитель — boot-бар — умирает в T6).

- [ ] **Step 1: заменить блок `:root` целиком**

```css
:root {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  color-scheme: dark;

  --bg: #05070a;
  --surface: #0a0f14;
  --surface-2: #0c141a;
  --border: #143039;
  --border-soft: #0e222a;
  --accent: #22d3ee;
  --accent-2: #e849c4;
  --glow-cyan: 0 0 0 1px rgba(34,211,238,.45), 0 0 18px rgba(34,211,238,.28);
  --glow-magenta: 0 0 0 1px rgba(232,73,196,.40), 0 0 18px rgba(232,73,196,.24);
  --text: #d6ecf1;
  --text-dim: #6f97a2;
  --text-faint: #3f5b63;
  --serif-ink: #eaf7fb;
  --danger: #ff5c72;
  --accent-muted: #164e5a;
  --track: #0e222a;
  --warn: #e0b64a;
  --warn-bright: #f4d98a;
  --radius: 0px;
  --radius-sm: 0px;
  --shadow-card: none;
  --font-ui: 'IBM Plex Mono', ui-monospace, monospace;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
  --font-serif: 'IBM Plex Serif', Georgia, serif;
}
```
(Удалён `--grad-neon`. `--radius`/`--radius-sm` = 0px — все `var()`-потребители квадратятся сами.)

- [ ] **Step 2: де-градиент — primary-кнопки становятся бордерными (glow остаётся)**

`.run-btn` — заменить пару правил (`.reset-btn, .run-btn {...}` и `.run-btn {...}`) на:

```css
.reset-btn, .run-btn {
  border: 1px solid var(--border); background: transparent; color: var(--text-dim);
  padding: 5px 12px; border-radius: var(--radius-sm); cursor: pointer; font-size: 13px;
}
.reset-btn:hover { border-color: var(--accent); color: var(--accent); }
.run-btn {
  border-color: var(--accent); color: var(--accent); font-weight: 500;
  box-shadow: 0 0 15px rgba(34,211,238,.32), inset 0 0 18px rgba(34,211,238,.10);
}
```

`.welcome-cta` — заменить все 5 правил (`.welcome-cta`, `:hover`, `:disabled`, `.ghost`, `.ghost:hover`) на:

```css
.welcome-cta {
  border: 1px solid var(--accent); background: transparent; color: var(--accent);
  padding: 10px 18px; cursor: pointer; font-weight: 500;
  box-shadow: 0 0 15px rgba(34,211,238,.25), inset 0 0 18px rgba(34,211,238,.08);
  transition: box-shadow .15s ease, color .15s ease, border-color .15s ease;
}
.welcome-cta:hover:not(:disabled) { box-shadow: 0 0 22px rgba(34,211,238,.45), inset 0 0 26px rgba(34,211,238,.14); }
.welcome-cta:disabled { opacity: .55; cursor: default; box-shadow: none; }
.welcome-cta.ghost { border-color: var(--border); color: var(--text-dim); box-shadow: none; }
.welcome-cta.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); box-shadow: 0 0 12px rgba(34,211,238,.2); }
```

`.mart-create`: `background: var(--accent); color: #051016; ... font-weight: 600;` → `background: transparent; color: var(--accent); border: 1px solid var(--accent); border-radius: var(--radius-sm); font-weight: 500; padding: 4px 12px; cursor: pointer;`

`.cf-actions button:first-child`: аналогично → `background: transparent; color: var(--accent); border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: 3px 10px; cursor: pointer;`

`.pf`: `background: linear-gradient(90deg, var(--accent), var(--accent-2));` → `background: var(--accent);` и `border-radius: 3px` → `0`.

`.histo .hb`: `background: linear-gradient(180deg, var(--accent), var(--accent-2)); border-radius: 3px 3px 0 0;` → `background: var(--accent); border-radius: 0;` (opacity .9 остаётся).

`.boot-bar-fill`: `background: linear-gradient(90deg, var(--accent-muted), var(--accent));` → `background: var(--accent);` (временная мера — весь boot переписывается в T6).

- [ ] **Step 3: чистка захардкоженных радиусов (точный список)**

| Селектор | было | стало |
|---|---|---|
| `.pt` | `border-radius: 3px` | `border-radius: 0` |
| `.tab` | `border-radius: 10px 10px 0 0` | `border-radius: 0` |
| `.tab-rename` | `border-radius: 4px` | `border-radius: 0` |
| `.tab-close` | `border-radius: 50%` | `border-radius: 0` |
| `.source-kind` | `border-radius: 4px` | `border-radius: 0` |
| `.pc-type` | `border-radius: 4px` | `border-radius: 0` |
| `.chip` | `border-radius: 12px` | `border-radius: 0` |
| `.toast` | `border-radius: 9px` | `border-radius: 0` |
| `.rehydration-banner` | `border-radius: 9px` | `border-radius: 0` |
| `.about-btn` | `border-radius: 50%` | `border-radius: 0` |
| `.mart-kind button` | `border-radius: 4px` | `border-radius: 0` |
| `.view-toggle button` | `border-radius: 5px` | `border-radius: 0` |
| `.ds-pill` | `border-radius: 5px` | `border-radius: 0` |
| `.text-block :not(pre) > code` | `border-radius: 4px` | `border-radius: 0` |

НЕ трогать: `.boot-bar`/`.boot-bar-fill` 999px (блок умирает в T6) и все `var(--radius…)`-ссылки (обнулились токеном).

- [ ] **Step 4: чистка теней и свечений вне политики**

- `.toast`: убрать `box-shadow: 0 6px 20px rgba(0,0,0,.4);`, добавить `border: 1px solid var(--border);`
- `.logo svg { border-radius: var(--radius-sm); filter: drop-shadow(0 0 6px rgba(34,211,238,.5)); }` — удалить правило целиком (никаких blur-свечений на марке).

- [ ] **Step 5: вторичные кнопки — прозрачный фон, hover цианом (уплощение)**

Заменить фоновые/hover-декларации (остальное в правилах не трогать):

```css
.schema-btn { background: transparent; }                /* было var(--surface) */
.schema-btn:hover { background: transparent; border-color: var(--accent); color: var(--accent); }
.report-toolbar button { background: transparent; }
.report-toolbar button:hover { background: transparent; border-color: var(--accent); color: var(--accent); }
.pin-btn { background: transparent; }
.pin-btn:hover { background: transparent; border-color: var(--accent); color: var(--accent); }
.export-btn { background: transparent; }
.export-btn:hover { background: transparent; border-color: var(--accent); color: var(--accent); }
.mart-cancel { background: transparent; }
.profbtn { background: transparent; }
.profbtn:hover { background: transparent; border-color: var(--accent); color: var(--accent); }
.pager-nav button { background: transparent; }
.about-btn { background: transparent; }
.about-btn:hover { background: transparent; border-color: var(--accent); color: var(--accent); }
```

И рейл: `.rail { ... background: var(--surface); }` → `background: transparent;` (больше чёрного, меньше панельных оттенков).

- [ ] **Step 6: семантические поверхности под новую палитру (danger/warn примеси)**

- `.result-error`: `background: #20100e; border: 1px solid #4a2018;` → `background: rgba(255,92,114,.06); border: 1px solid rgba(255,92,114,.35);`
- `.schema-error`: `background: #2a1414; border: 1px solid #5a2c2c;` → `background: rgba(255,92,114,.06); border: 1px solid rgba(255,92,114,.35);`
- `.report-toolbar .report-clear`: `border-color: #574a1d;` → `border-color: rgba(224,182,74,.4);`; его `:hover`: `background: #2a2412;` → `background: rgba(224,182,74,.08);`
- `.rehydration-banner`: `background: #2a2412; border: 1px solid #574a1d;` → `background: rgba(224,182,74,.07); border: 1px solid rgba(224,182,74,.35);`

- [ ] **Step 7: фокус — dotted (Web 1.0 DNA) + подчёркнутые ссылки**

Заменить M5-правило фокуса:
```css
:where(button, input, select, textarea, [tabindex], summary):focus-visible {
  outline: 1px dotted var(--accent);
  outline-offset: 2px;
}
```
В neon-блоке внизу файла УДАЛИТЬ правило `:focus-visible { outline: none; box-shadow: var(--glow-cyan); border-radius: var(--radius-sm); }`.

Там же заменить `a { color: var(--accent); }` на:
```css
a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
```
(`a:hover { color: var(--accent-2); }` — уже есть, оставить: hover-magenta по решению.)

Обновить заголовок-комментарий блока `/* --- neon accents + motion (warp redesign) --- */` → `/* --- terminal accents + motion --- */`.

- [ ] **Step 8: гейт + commit**

Run: `npm test` && `npm run build` && `npm run lint` — зелёные.

```bash
git add -A && git commit -m "$(cat <<'EOF'
style(terminal): cyan-console tokens — radius 0, shadows off, bordered CTAs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: TUI-хром — underline-nav, uppercase-лейблы, serif-заголовки, magenta-hover, statusline

**Files:**
- Modify: `src/features/Shell.tsx` (nav без иконок; engine-tag; footer)
- Modify: `src/index.css`

**Interfaces:**
- Consumes: токены T2, `--font-serif` T1.
- Produces: классы `.statusline`, `.sl-ok`, `.sl-right`, `.engine-tag` (используются только здесь).

- [ ] **Step 1: Shell.tsx — текстовая nav, engine-tag, statusline**

В `mode-toggle` убрать иконки (текст остаётся):
```tsx
        <nav className="mode-toggle">
          <button className={mode === 'explore' ? 'on' : ''} onClick={() => setMode('explore')}>
            исследование
          </button>
          <button className={mode === 'report' ? 'on' : ''} onClick={() => setMode('report')}>
            отчёт
          </button>
        </nav>
```
(импорт `Icon` остаётся — он нужен логотипу.)

В `topbar-right` перед `.pill-local` добавить:
```tsx
          <span className="engine-tag">duckdb-wasm 1.5.4</span>
```
(display copy; версия движка запинена в CLAUDE.md.)

После закрывающего `</div>` элемента `.body` (перед `<Toast />`) добавить:
```tsx
      <footer className="statusline">
        <span>engine <b className="sl-ok">ready</b></span>
        <span className="sl-right">MIT · v1</span>
      </footer>
```

- [ ] **Step 2: CSS — топбар/nav/statusline**

`.logo` заменить на:
```css
.logo { display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-serif); font-weight: 600; font-size: 16px; color: var(--text); }
```

`.mode-toggle` и его кнопки заменить на:
```css
.mode-toggle { display: flex; gap: 18px; background: transparent; padding: 0; }
.mode-toggle button {
  border: 0; background: transparent; color: var(--text-dim);
  padding: 4px 1px; cursor: pointer; font-size: 12px;
  text-transform: uppercase; letter-spacing: .08em;
  border-bottom: 1px solid transparent; border-radius: 0;
}
.mode-toggle button.on { background: transparent; color: var(--accent); border-bottom-color: var(--accent); }
.mode-toggle button:hover:not(.on) { color: var(--accent-2); border-bottom-color: var(--accent-2); }
```
В terminal-accents-блоке внизу УДАЛИТЬ строку `.mode-toggle button.on { background: var(--surface-2); color: var(--text); box-shadow: inset 0 -2px 0 var(--accent); }`.

`.pill-local` заменить на:
```css
.pill-local { color: var(--accent); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; font-family: var(--font-mono); }
```
Добавить рядом:
```css
.engine-tag { color: var(--text-faint); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
```

Добавить (после `.body`-правила):
```css
.statusline {
  display: flex; gap: 18px; padding: 6px 16px; border-top: 1px solid var(--border);
  color: var(--text-faint); font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
}
.statusline .sl-ok { color: var(--accent); font-weight: 500; }
.statusline .sl-right { margin-left: auto; }
```

- [ ] **Step 3: CSS — serif-заголовки**

```css
.panel-title { font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; color: var(--text-dim); }
```
(заменяет `font-weight: 600; font-size: 14px;`.)

`.widget-title`: `font-weight: 600; color: var(--text); font-size: 16px;` → `font-family: var(--font-serif); font-weight: 500; color: var(--serif-ink); font-size: 17px;`

`.widget-title-edit`: `font: 600 16px var(--font-ui);` → `font: 500 17px var(--font-serif);`

`.text-block :where(h1,h2,h3)`: добавить `font-family: var(--font-serif);` и заменить `color: var(--text)` → `color: var(--serif-ink)`. Веса: `.text-block h1 { font-size: 26px; font-weight: 600; }`, `h2 { font-size: 20px; font-weight: 600; }`, `h3 { font-size: 16px; font-weight: 500; }` (700 не грузим). `.text-block { font-size: 14px; ... }` (было 15px — mono плотнее).

`.modal h2`: добавить `font-family: var(--font-serif);`.

- [ ] **Step 4: CSS — кнопки uppercase-mono**

Рядом с существующим правилом `.run-btn, .pin-btn, .report-toolbar button, .schema-btn { display: inline-flex; ... }` добавить:
```css
.run-btn, .reset-btn, .welcome-cta, .schema-btn, .export-btn, .pin-btn,
.report-toolbar button, .mart-create, .mart-cancel, .profbtn,
.view-toggle button, .mart-kind button {
  font-family: var(--font-mono); text-transform: uppercase; letter-spacing: .05em;
}
```

- [ ] **Step 5: CSS — источники в рейле: бордер-боксы + magenta-hover (mock2)**

`.sources` заменить на:
```css
.sources { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
```
`.source` — заменить декларации границы/фона (размеры/шрифт не трогать):
```css
.source {
  display: flex; align-items: center; gap: 8px; width: 100%;
  border: 1px solid var(--border-soft); background: transparent; color: var(--text-dim); cursor: pointer;
  padding: 7px 9px; border-radius: 0; text-align: left; font-size: 13px;
}
.source:hover { background: rgba(232,73,196,.06); border-color: var(--accent-2); box-shadow: inset 2px 0 0 var(--accent-2); color: var(--text); }
.source.active { background: var(--surface); border-color: var(--accent); box-shadow: inset 2px 0 0 var(--accent); color: var(--text); }
```
УДАЛИТЬ старую объединённую строку `.source.active, .source:hover { background: var(--surface); }` и дубль `.source.active { background: var(--surface-2); box-shadow: inset 2px 0 0 var(--accent); }` в terminal-accents-блоке.

- [ ] **Step 6: CSS — грид: magenta-hover строк + циановые числа (mock2)**

Заменить `.grid-num { text-align: right; color: var(--text-faint); font-variant-numeric: tabular-nums; }` на:
```css
.grid-num { text-align: right; color: var(--accent); font-variant-numeric: tabular-nums; }
.grid-th.grid-num { color: var(--text-faint); }
```
Добавить после `.grid-row`-правила:
```css
.grid-row:hover .grid-cell { background: rgba(232,73,196,.06); }
.grid-row:hover .grid-cell:first-child { box-shadow: inset 2px 0 0 var(--accent-2); }
```

- [ ] **Step 7: CSS — табы: циановая верхняя черта на активном, magenta-hover**

`.tab:hover { color: var(--text); background: var(--surface); }` → `.tab:hover { color: var(--accent-2); background: var(--surface); }`
`.tab.on { background: var(--surface-2); color: var(--text); }` → `.tab.on { background: var(--surface-2); color: var(--text); box-shadow: inset 0 2px 0 var(--accent); }`

- [ ] **Step 8: CSS — метки секций рейла: шире трекинг**

`.rail-section-label`: `letter-spacing: .06em;` → `letter-spacing: .16em;`

- [ ] **Step 9: гейт + commit**

Run: `npm test` && `npm run build` && `npm run lint` — зелёные.

```bash
git add -A && git commit -m "$(cat <<'EOF'
style(terminal): TUI chrome — underline nav, uppercase labels, serif headings, magenta hovers, statusline

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `bootSegments` — маппинг процента в сегменты ▮ (TDD)

**Files:**
- Modify: `src/core/bootProgress.ts`
- Test: `src/core/bootProgress.test.ts`

**Interfaces:**
- Consumes: ничего нового (файл уже экспортирует `bootPercent`, `formatMb`, тип `BootProgress`).
- Produces: `export function bootSegments(pct: number | null, total: number): number | null` — потребляется BootScreen в T6 (null = индетерминация; иначе целое 0..total).

- [ ] **Step 1: красный тест**

В `src/core/bootProgress.test.ts` расширить импорт до `import { bootPercent, bootSegments, formatMb } from './bootProgress'` и добавить в конец файла:

```ts
describe('bootSegments', () => {
  it('null (индетерминация) → null', () => {
    expect(bootSegments(null, 10)).toBeNull()
  })
  it('0% → 0 сегментов', () => {
    expect(bootSegments(0, 10)).toBe(0)
  })
  it('округляет к ближайшему сегменту', () => {
    expect(bootSegments(47, 10)).toBe(5)
    expect(bootSegments(4, 10)).toBe(0)
  })
  it('100% → все сегменты', () => {
    expect(bootSegments(100, 10)).toBe(10)
  })
  it('клампит выход за 100', () => {
    expect(bootSegments(140, 10)).toBe(10)
  })
})
```

- [ ] **Step 2: убедиться, что падает**

Run: `npx vitest run src/core/bootProgress.test.ts`
Expected: FAIL — `bootSegments is not a function` / нет экспорта.

- [ ] **Step 3: минимальная реализация**

В конец `src/core/bootProgress.ts`:

```ts
/**
 * Сколько сегментов ▮ из total подсветить для процента загрузки.
 * null (total неизвестен) → null: сегменты пульсируют индетерминацией.
 */
export function bootSegments(pct: number | null, total: number): number | null {
  if (pct === null) return null
  return Math.max(0, Math.min(total, Math.round((pct / 100) * total)))
}
```

- [ ] **Step 4: зелёный**

Run: `npx vitest run src/core/bootProgress.test.ts`
Expected: PASS — 11 тестов в файле (6 старых + 5 новых).

- [ ] **Step 5: гейт + commit**

Run: `npm test` (итог = было + 5, т.е. 290) && `npm run build` && `npm run lint`.

```bash
git add src/core/bootProgress.ts src/core/bootProgress.test.ts && git commit -m "$(cat <<'EOF'
feat(boot): bootSegments — segmented-bar progress mapping (TDD)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `DitherSwirl` + терминальный Welcome (велью на всю ширину, kicker, steps-box)

**Files:**
- Create: `src/components/DitherSwirl.tsx`
- Modify: `src/components/WelcomeScreen.tsx`
- Modify: `src/index.css` (новый блок swirl/veil; переписать welcome-блок M6)

**Interfaces:**
- Consumes: токены T2.
- Produces: `export function DitherSwirl({ className }: { className?: string })` и CSS-классы `.dither-swirl`, `.stage-veil` — потребляются также BootScreen в T6.

- [ ] **Step 1: компонент**

`src/components/DitherSwirl.tsx` целиком:

```tsx
import { useEffect, useRef } from 'react'

// 4×4 ordered Bayer matrix, нормированная в [0,1) — пороги дизеринга.
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => v / 16))

const DOT = { r: 34, g: 211, b: 238 } // --accent #22d3ee
const CELL = 7

/**
 * Дизеренный дот-свирл (2D canvas, Bayer 4×4) — hero-фон boot/welcome.
 * Заменяет WebGL warp-шейдер: 0 зависимостей, нет жизненного цикла WebGL-
 * контекста (и связанного StrictMode-бага aa0122f); при prefers-reduced-motion
 * рисуется один статичный кадр.
 */
export function DitherSwirl({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0
    let H = 0
    let cols = 0
    let rows = 0
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = Math.floor(W * dpr)
      canvas.height = Math.floor(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(W / CELL)
      rows = Math.ceil(H / CELL)
    }

    const start = performance.now()
    const drawFrame = (now: number) => {
      const t = (now - start) / 1000
      ctx.clearRect(0, 0, W, H)
      const R = Math.min(W, H) * 0.62
      const cx = W * 0.5
      const cy = H * 0.5
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const px = gx * CELL + CELL * 0.5
          const py = gy * CELL + CELL * 0.5
          const dx = (px - cx) / R
          const dy = (py - cy) / R
          const r = Math.hypot(dx, dy)
          const ang = Math.atan2(dy, dx)
          // кольца свирла: твист растёт с радиусом, фаза бежит быстро (скорость)
          const rings = 0.5 + 0.5 * Math.sin(r * 11.0 - t * 3.4 + ang * 2.0 + r * 3.0)
          const well = Math.max(0, Math.min(1, (r - 0.06) / 0.34)) // тёмный колодец в центре
          const edge = 1 - Math.max(0, Math.min(1, (r - 0.85) / 0.5)) // затухание к краю
          const inten = rings * rings * well * edge
          if (inten > BAYER[gy & 3][gx & 3]) {
            const a = Math.min(1, 0.16 + inten * 0.72)
            const s = Math.max(1.2, inten > 0.72 ? CELL - 1.5 : inten > 0.45 ? CELL - 3 : CELL - 4.5)
            ctx.fillStyle = `rgba(${DOT.r},${DOT.g},${DOT.b},${a.toFixed(3)})`
            ctx.fillRect(px - s / 2, py - s / 2, s, s)
          }
        }
      }
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const loop = (now: number) => {
      drawFrame(now)
      if (!document.hidden) raf = requestAnimationFrame(loop)
    }

    resize()
    if (reduced) {
      drawFrame(start) // один статичный кадр
    } else {
      raf = requestAnimationFrame(loop)
    }

    const onResize = () => {
      resize()
      if (reduced) drawFrame(performance.now())
    }
    window.addEventListener('resize', onResize)
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else if (!reduced && raf === 0) {
        raf = requestAnimationFrame(loop)
      }
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return <canvas ref={canvasRef} className={'dither-swirl' + (className ? ' ' + className : '')} aria-hidden="true" />
}
```

- [ ] **Step 2: CSS — свирл + велью**

Добавить в `src/index.css` (рядом с будущим местом warp-блока; порядок не критичен):

```css
/* --- dithered dot-swirl hero (boot/welcome) + full-width veil --- */
.dither-swirl { position: absolute; inset: 0; width: 100%; height: 100%; display: block; z-index: 0; }
/* тёмное ядро за текстом + боковое затемнение к краям; свирл «дышит» по краям.
   #05070a = var(--bg) (в градиентах литерал — надёжнее для interpolation к прозрачному). */
.stage-veil { position: absolute; inset: 0; z-index: 1; background:
  radial-gradient(115% 85% at 50% 50%, rgba(0,0,0,.82) 0%, rgba(0,0,0,.6) 42%, rgba(0,0,0,.2) 72%, rgba(0,0,0,0) 100%),
  linear-gradient(90deg, #05070a 0%, rgba(5,7,10,0) 24%, rgba(5,7,10,0) 76%, #05070a 100%); }
```

- [ ] **Step 3: CSS — переписать welcome-блок M6**

Заменить весь блок `/* --- M6 welcome --- */` (правила `.welcome`, `.welcome-title`, `.welcome-lead`, `.welcome-steps`, `.welcome-actions`, `.welcome-stage`, `.welcome-content`, `.welcome-credit`; правила `.welcome-cta*` уже переписаны в T2 — их НЕ трогать) на:

```css
/* --- M6 welcome (terminal) --- */
.welcome-stage { position: relative; flex: 1; min-height: 0; display: flex; overflow: hidden; }
.welcome { max-width: 680px; margin: auto; padding: 32px; display: flex; flex-direction: column; gap: 20px; }
.welcome-content { position: relative; z-index: 2; }
.welcome-kicker { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--accent); display: flex; align-items: center; gap: 10px; }
.welcome-kicker::before { content: ''; width: 26px; height: 1px; background: var(--accent); }
.welcome-title { font-family: var(--font-serif); font-weight: 500; font-size: 38px; line-height: 1.1; letter-spacing: -.01em; color: var(--serif-ink); }
.welcome-lead { color: var(--text-dim); line-height: 1.7; font-size: 14px; }
.welcome-lead b { color: var(--text); font-weight: 500; }
.steps-box { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); display: flex; flex-direction: column; }
.step-row { display: flex; gap: 14px; padding: 11px 16px; border-bottom: 1px solid var(--border-soft); color: var(--text-dim); font-size: 13px; }
.step-row:last-child { border-bottom: 0; }
.step-row b { color: var(--text); font-weight: 500; }
.step-n { color: var(--accent); font-weight: 500; }
.welcome-actions { display: flex; gap: 12px; flex-wrap: wrap; }
.welcome-credit { color: var(--text-faint); font-size: 11.5px; line-height: 1.5; }
.welcome-credit a { color: var(--accent); }
```

- [ ] **Step 4: WelcomeScreen.tsx — JSX**

Заменить импорт `import { WarpShader } from './WarpShader'` на `import { DitherSwirl } from './DitherSwirl'`. Функции `onData`/`onReport` НЕ трогать. Заменить `return (...)` целиком на:

```tsx
  return (
    <div className="welcome-stage">
      <DitherSwirl />
      <div className="stage-veil" aria-hidden="true" />
      <div className="welcome welcome-content">
        <div className="welcome-kicker">Browser analytical terminal</div>
        <h1 className="welcome-title">Аналитический ноутбук в браузере</h1>
        <p className="welcome-lead">
          Брось CSV или Parquet в панель слева — и работай: пиши SQL с JOIN/UNION,
          смотри профиль значений, закрепляй результаты виджетами и собирай
          нарративный отчёт. <b>Всё локально, без бэкенда.</b>
        </p>
        <ol className="steps-box">
          <li className="step-row"><span className="step-n">01</span><span><b>Данные.</b> CSV/Parquet → схема и типы в рейле слева.</span></li>
          <li className="step-row"><span className="step-n">02</span><span><b>Исследование.</b> SQL → таблица, график, профиль значений.</span></li>
          <li className="step-row"><span className="step-n">03</span><span><b>Отчёт.</b> Закрепи виджеты, впиши текст, выгрузи в HTML/PDF.</span></li>
        </ol>
        <div className="welcome-actions">
          <button className="welcome-cta" disabled={busy !== null} onClick={onData}>
            {busy === 'data' ? 'Грузим…' : '▸ Загрузить демо-данные'}
          </button>
          <button className="welcome-cta ghost" disabled={busy !== null} onClick={onReport}>
            {busy === 'report' ? 'Грузим…' : 'Открыть пример отчёта'}
          </button>
        </div>
        <p className="welcome-credit">
          Демо-данные из учебника{' '}
          <a href="https://github.com/cosmiksoul/sql-product-analytics-cookbook" target="_blank" rel="noopener noreferrer">
            «SQL 101: Рецепты продуктового аналитика»
          </a>{' '}
          · MIT. Запросы в книге на BigQuery — примеры в демо адаптированы под DuckDB.
        </p>
      </div>
    </div>
  )
```

(BootScreen пока остаётся на WarpShader — мигрирует в T6; поэтому WarpShader.tsx в этой задаче НЕ удалять.)

- [ ] **Step 5: гейт + commit**

Run: `npm test` && `npm run build` && `npm run lint` — зелёные.

```bash
git add -A && git commit -m "$(cat <<'EOF'
feat(welcome): DitherSwirl hero + terminal welcome — kicker, steps box, full-width veil

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Терминальный BootScreen (TUI-бокс + сегментированный бар) + удаление WarpShader

**Files:**
- Modify: `src/components/BootScreen.tsx` (переписать)
- Modify: `src/index.css` (переписать boot-блок; удалить warp-блок; удалить `--accent-muted`)
- Delete: `src/components/WarpShader.tsx`

**Interfaces:**
- Consumes: `DitherSwirl` + `.stage-veil` (T5), `bootSegments(pct, total): number | null` (T4), `bootPercent`/`formatMb`/`BootProgress` (существующие).

- [ ] **Step 1: BootScreen.tsx целиком**

```tsx
import { Icon } from './Icon'
import { DitherSwirl } from './DitherSwirl'
import { bootPercent, bootSegments, formatMb, type BootProgress } from '../core/bootProgress'

const SEG_COUNT = 10

/**
 * First-run boot screen shown while the DuckDB-WASM engine downloads and
 * instantiates. Терминальный TUI-бокс поверх свирла: сегментированный ▮-бар
 * с реальным процентом, при неизвестном total — индетерминантная пульсация,
 * чтобы медленная первая (некэшированная) загрузка не выглядела зависшей.
 */
export function BootScreen({ progress }: { progress: BootProgress | null }) {
  const pct = bootPercent(progress)
  const lit = bootSegments(pct, SEG_COUNT)
  return (
    <div className="boot-screen">
      <DitherSwirl />
      <div className="stage-veil" aria-hidden="true" />
      <div className="boot-terminal">
        <span className="logo boot-logo"><Icon name="logo" size={22} /> warpbook</span>
        <div className="boot-line">Запуск движка DuckDB-WASM</div>
        <div
          className={'boot-segs' + (lit === null ? ' indeterminate' : '')}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct ?? undefined}
        >
          {Array.from({ length: SEG_COUNT }, (_, i) => (
            <i
              key={i}
              className={lit !== null && i < lit ? 'on' : ''}
              style={lit === null ? { animationDelay: `${i * 0.1}s` } : undefined}
            />
          ))}
        </div>
        <div className="boot-detail">
          {pct === null
            ? progress && progress.loaded > 0
              ? `загружено ${formatMb(progress.loaded)}…`
              : 'подготовка…'
            : `${pct}%${progress ? ` · ${formatMb(progress.loaded)} из ${formatMb(progress.total)}` : ''}`}
        </div>
        <div className="boot-note">
          Первый запуск скачивает движок (~35&nbsp;МБ) — дальше он берётся из кэша браузера.
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: CSS — заменить boot-блок**

Заменить весь блок `/* --- first-run boot screen (WASM engine download) --- */` (правила `.boot-screen`, `.boot-card`, `.boot-logo`, `.boot-title`, `.boot-bar`, `.boot-bar-fill`, `.boot-bar.indeterminate`, `@keyframes boot-slide`, `.boot-detail`, `.boot-note`) на:

```css
/* --- first-run boot screen (terminal TUI box over the swirl) --- */
.boot-screen { position: relative; display: flex; align-items: center; justify-content: center; height: 100vh; padding: 24px; overflow: hidden; }
.boot-terminal {
  position: relative; z-index: 2;
  display: flex; flex-direction: column; gap: 13px; width: min(440px, 100%);
  padding: 24px 26px; border: 1px solid var(--border);
}
.boot-logo { font-size: 18px; }
.boot-line { font-size: 11.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--text-dim); }
.boot-segs { display: flex; gap: 4px; }
.boot-segs i { width: 14px; height: 12px; border: 1px solid var(--border); }
.boot-segs i.on { background: var(--accent); border-color: var(--accent); }
.boot-segs.indeterminate i { animation: seg-pulse 1.2s ease-in-out infinite; }
@keyframes seg-pulse {
  0%, 100% { background: transparent; }
  50% { background: rgba(34,211,238,.45); border-color: var(--accent); }
}
.boot-detail { font-size: 12px; color: var(--text); }
.boot-note { font-size: 11.5px; color: var(--text-faint); line-height: 1.45; }
```

(При `prefers-reduced-motion` глобальное правило M5 `animation: none !important` гасит пульс — индетерминация остаётся видимой текстовой строкой `.boot-detail`. Это ок.)

- [ ] **Step 3: удалить WarpShader и его следы**

- Run: `git rm src/components/WarpShader.tsx`
- В `src/index.css` удалить блок `/* --- warp-drive shader background --- */` (правила `.warp-shader`, `.warp-fallback`, `@media ... .warp-shader`).
- В `:root` удалить строку `--accent-muted: #164e5a;` (последний потребитель умер вместе с `.boot-bar-fill`).
- Run: `grep -rn "WarpShader\|warp-shader\|warp-fallback\|accent-muted" src/` → 0 совпадений.

- [ ] **Step 4: гейт + commit**

Run: `npm test` && `npm run build` && `npm run lint` — зелёные.

```bash
git add -A && git commit -m "$(cat <<'EOF'
feat(boot): terminal boot — TUI box + segmented bar over DitherSwirl; drop WarpShader

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Кокпит-детали — SQL-подсветка, дизеренный ring-логотип, ось графика

**Files:**
- Modify: `src/components/SqlEditor.tsx` (только `qbHighlight` + комментарий)
- Modify: `src/components/Icon.tsx` (только ветка `logo`)
- Modify: `src/components/Chart.tsx` (один литерал цвета)

**Interfaces:**
- Consumes: палитру T2 (литералы обязаны совпадать с токенами).
- Produces: ничего нового (сигнатуры `Icon`/`Chart`/`SqlEditor` не меняются).

- [ ] **Step 1: SqlEditor — ретюн `qbHighlight`**

Заменить комментарий и блок:

```ts
// SQL token colors, tuned to the cyan-console terminal palette (index.css tokens).
const qbHighlight = HighlightStyle.define([
  { tag: t.keyword, color: '#22d3ee', fontWeight: '500' },
  { tag: [t.typeName, t.typeOperator], color: '#5fe0ea' },
  { tag: [t.string, t.special(t.string)], color: '#e0b64a' },
  { tag: [t.number, t.integer, t.float], color: '#e849c4' },
  { tag: [t.bool, t.null, t.atom], color: '#ff5c72' },
  { tag: t.function(t.variableName), color: '#8ad6ff' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#3f5b63', fontStyle: 'italic' },
  { tag: [t.operator, t.compareOperator, t.logicOperator, t.arithmeticOperator], color: '#6f97a2' },
  { tag: [t.punctuation, t.separator, t.paren, t.bracket], color: '#6f97a2' },
])
```

(Изменения против текущего: keyword weight 600→500; comment `#4f6377`→`#3f5b63`; operator `#8aa0b5`→`#6f97a2`; punctuation `#6b7f9a`→`#6f97a2`. Числа уже magenta ✓, строки уже warm ✓. `qbEditorTheme` не трогать — он на var()-токенах.)

- [ ] **Step 2: Icon — logo → дизеренное кольцо (порт `canvas.mark` из мокапа)**

В `src/components/Icon.tsx` заменить ветку `if (name === 'logo') {...}` (вместе с комментарием про warp-portal) на:

```tsx
  if (name === 'logo') {
    // Дизеренное кольцо (порт canvas.mark из терминального мокапа):
    // детерминированная решётка 3px-ячеек 40×40, интенсивность кольца → альфа точки.
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" style={{ flex: '0 0 auto' }}>
        {MARK_DOTS.map((d, i) => (
          <rect key={i} x={d.x} y={d.y} width="2" height="2" fill="var(--accent)" opacity={d.o} />
        ))}
      </svg>
    )
  }
```

И над компонентом (после `PATHS`) добавить:

```tsx
// Точки логотипа считаются один раз на модуль: дизеренное кольцо на решётке 3px.
const MARK_DOTS: { x: number; y: number; o: number }[] = (() => {
  const dots: { x: number; y: number; o: number }[] = []
  for (let y = 0; y < 40; y += 3) {
    for (let x = 0; x < 40; x += 3) {
      const dx = (x - 20) / 18
      const dy = (y - 20) / 18
      const r = Math.hypot(dx, dy)
      const ring = 0.5 + 0.5 * Math.sin(r * 10 - 1.2)
      const mask = Math.max(0, Math.min(1, (r - 0.1) / 0.25)) * (1 - Math.max(0, Math.min(1, (r - 0.85) / 0.3)))
      const inten = ring * ring * mask
      if (inten > 0.35) dots.push({ x, y, o: 0.4 + inten * 0.6 })
    }
  }
  return dots
})()
```

- [ ] **Step 3: Chart — ось/подписи в `--dim`**

В `src/components/Chart.tsx`: `color: '#8aa0b5'` → `color: '#6f97a2'`. (Заливка серий в `plotFigure.ts` уже cyan `#22d3ee` — не трогать; magenta 2-й серии дремлет до мульти-серий, которые вне v1.)

- [ ] **Step 4: гейт + commit**

Run: `npm test` && `npm run build` && `npm run lint` — зелёные.

```bash
git add -A && git commit -m "$(cat <<'EOF'
style(terminal): SQL palette retune, dithered ring logo, chart axis dim

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Финальная зачистка + статус в decisions-доке

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-warpbook-terminal-redesign-decisions.md` (только статус-строки сверху)

**Interfaces:** — (проверочная задача).

- [ ] **Step 1: грепы на остатки (все → 0 совпадений)**

```bash
grep -rn "Inter'\|JetBrains" src/ index.html
grep -rn "grad-neon\|accent-muted" src/
grep -rn "WarpShader\|warp-shader\|warp-fallback\|warp-drive" src/
```

- [ ] **Step 2: радиусы — только var()/0**

Run: `grep -n "border-radius" src/index.css`
Expected: каждая строка — либо `var(--radius`/`var(--radius-sm)`, либо значение `0`. Захардкоженных px/%-радиусов нет.

- [ ] **Step 3: шрифты на диске**

Run: `ls public/fonts`
Expected: ровно 10 файлов, все `ibm-plex-*`.

- [ ] **Step 4: статус в decisions-доке**

В шапке `docs/superpowers/specs/2026-07-02-warpbook-terminal-redesign-decisions.md` заменить строку
`> **Status:** brainstorming converged, direction **LOCKED** by user. Next = write full spec → plan → SDD.`
на
`> **Status:** IMPLEMENTED on \`warp-redesign\` per plan \`docs/superpowers/plans/2026-07-05-warpbook-terminal-redesign.md\` (2026-07-05). Awaiting user visual acceptance.`

- [ ] **Step 5: полный гейт + commit**

Run: `npm test` (290) && `npm run build` && `npm run lint`.

```bash
git add -A && git commit -m "$(cat <<'EOF'
docs(redesign): mark terminal redesign implemented; leftover sweep green

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Что план осознанно НЕ делает (firewall / follow-ups)

- **Мульти-серии графиков** (magenta 2-я серия дремлет) — вне v1.
- **Экспортная print-тема** остаётся светлой — осознанное решение M4.
- **Сегментирование профильных баров** (`.pt`/`.pf`) — форма не менялась, только цвет; возможный follow-up.
- **App-wide blink-cursor** и прочий терминальный декор вне мокапов — restraint.
- Мокапы и `scripts/fetch-plex-fonts.mjs` в прод-бандл не попадают (docs/ и scripts/ вне Vite-графа).

## Приёмка

После T8 — визуальная приёмка пользователем на `npm run dev`: boot (свирл + сегменты; проверить и cold-load с DevTools-throttling), welcome (kicker/steps/CTA над свирлом), explore (nav-underline, источники-боксы, magenta-hover, циановые числа грида, SQL-палитра), report (serif-заголовки, виджеты), модалка, statusline. Пуш в origin — делает пользователь.
