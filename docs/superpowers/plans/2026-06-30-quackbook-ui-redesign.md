# quackbook UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repaint the dark app toward the original mockups (depth, layered surfaces, soft shadows, amber glow, self-hosted display+mono fonts, inline-SVG icons, report typography) without changing structure, and close the deferred `updateWidgetTitle` click-to-edit.

**Architecture:** Token-first (variant A). First introduce CSS custom properties in `:root` holding the CURRENT values and rewrite the ~40 hardcoded colors onto them (a pure no-visual-change refactor), then tune those token values toward the mockup. Fonts are self-hosted woff2 (no npm/CDN at runtime). Icons are a tiny own inline-SVG component (no library). Everything else is surface-by-surface CSS plus one small React UI wiring.

**Tech Stack:** React 19.2 + TypeScript 6 + Vite 8, Vitest 4 (node env), plain CSS in `src/index.css`, self-hosted Inter + JetBrains Mono woff2.

## Global Constraints

- **Source of truth:** spec `docs/superpowers/specs/2026-06-30-quackbook-ui-redesign-design.md`; scope `docs/scope-quackbook-v1.md` wins on conflict. Target = mockups `docs/Screenshot 2026-06-22 214921.png` (Explore) + `…214931.png` (Report).
- **Pure visual redesign:** NO structural change — report stays a single-width vertical stack; do NOT add the mockup's status bar, breadcrumb, block-count badge, or saved-query buttons. Name stays `quackbook` (no rebrand).
- **No new npm dependencies.** Icons = own inline SVG. Fonts = self-hosted woff2 assets in `public/fonts/` (assets, not packages); no `@fontsource`, no Google-Fonts/CDN `<link>` at runtime.
- **Do NOT touch** `src/core/exportHtml.ts` — its light `STYLE` is the export theme and is independent of the app CSS. The redesign is the dark app only.
- **Do NOT change** logic / data / SQL / store, except the `updateWidgetTitle` UI wiring (Task 8). No behavior change.
- **Gate every task:** `npm run lint` (0 errors, 0 warnings), `npm run build` (full tsc), `npm test` (**176** green — CSS/font/icon work must not change the count). Done only when all three are green.
- **Verification is by eye** for all presentation (the repo has no jsdom/RTL; Vitest `include` is `src/**/*.test.ts`, node env). Each visual task ends with an `npm run dev` eyeball against the mockup. `updateWidgetTitle`'s store action is already unit-tested; only its UI is added.
- **Determinism:** never `Math.random`/`Date.now`/`new Date`.
- **Commits:** small, frequent; every message ends with the trailer
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  authored via bash here-doc (`git commit -F- <<'EOF' … EOF`), NOT PowerShell `@'…'@`.
- **Branch:** all work on `ui-redesign` (already checked out off `main`).

## File Structure

- `public/fonts/*.woff2` (new) — self-hosted Inter + JetBrains Mono subsets.
- `src/index.css` (modify) — `@font-face`, `:root` tokens, rewrite hardcoded colors onto tokens, tune values, surface polish, active-block glow, report typography.
- `src/components/Icon.tsx` (new) — inline-SVG icon set.
- `src/features/Shell.tsx` (modify) — logo icon + mode-toggle icons.
- `src/features/Explore.tsx` (modify) — `run` button play icon.
- `src/components/ResultPanel.tsx` (modify) — pin button icon.
- `src/features/Report.tsx` (modify) — save/export button icons (optional, in Task 5).
- `src/features/Rail.tsx` (modify) — «типы»/«профиль» icons.
- `src/components/WidgetBlockView.tsx` (modify) — `updateWidgetTitle` click-to-edit.

---

### Task 1: Self-hosted fonts

**Files:**
- Create: `public/fonts/inter-{400,500,600}-{latin,cyrillic}.woff2`, `public/fonts/jetbrains-mono-{400,500}-{latin,cyrillic}.woff2`
- Modify: `src/index.css` (top: `@font-face` block; `body` font-family)

**Interfaces:**
- Produces: font families `Inter` and `JetBrains Mono` available to CSS; `body` uses Inter. (Tokens `--font-ui`/`--font-mono` are added in Task 2.)

By eye + build. Vitest does not load CSS, so tests are unaffected.

- [ ] **Step 1: Download the woff2 subsets into `public/fonts/`**

These come from the Fontsource CDN (download-time only; the app never fetches them at runtime). Run from repo root:

```bash
mkdir -p public/fonts
base="https://cdn.jsdelivr.net/fontsource/fonts"
for w in 400 500 600; do
  curl -fsSL "$base/inter@latest/latin-$w-normal.woff2"    -o "public/fonts/inter-$w-latin.woff2"
  curl -fsSL "$base/inter@latest/cyrillic-$w-normal.woff2" -o "public/fonts/inter-$w-cyrillic.woff2"
done
for w in 400 500; do
  curl -fsSL "$base/jetbrains-mono@latest/latin-$w-normal.woff2"    -o "public/fonts/jetbrains-mono-$w-latin.woff2"
  curl -fsSL "$base/jetbrains-mono@latest/cyrillic-$w-normal.woff2" -o "public/fonts/jetbrains-mono-$w-cyrillic.woff2"
done
ls -la public/fonts/
```

Expected: 10 non-empty `.woff2` files. If the network is unavailable in your environment, STOP and report BLOCKED with the list of files needed — the controller will supply them (do NOT add an `@fontsource` npm dependency or a CDN `<link>`; that violates the firewall).

- [ ] **Step 2: Add `@font-face` rules at the very top of `src/index.css`**

```css
/* --- self-hosted fonts (woff2 in public/fonts/) --- */
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 400; font-display: swap;
  src: url('/fonts/inter-400-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215; }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 400; font-display: swap;
  src: url('/fonts/inter-400-cyrillic.woff2') format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 500; font-display: swap;
  src: url('/fonts/inter-500-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215; }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 500; font-display: swap;
  src: url('/fonts/inter-500-cyrillic.woff2') format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 600; font-display: swap;
  src: url('/fonts/inter-600-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215; }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 600; font-display: swap;
  src: url('/fonts/inter-600-cyrillic.woff2') format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 400; font-display: swap;
  src: url('/fonts/jetbrains-mono-400-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215; }
@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 400; font-display: swap;
  src: url('/fonts/jetbrains-mono-400-cyrillic.woff2') format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 500; font-display: swap;
  src: url('/fonts/jetbrains-mono-500-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215; }
@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 500; font-display: swap;
  src: url('/fonts/jetbrains-mono-500-cyrillic.woff2') format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
```

Then set the `body` font (the `:root` token comes in Task 2):

```css
body {
  margin: 0;
  background: #0f1e21;
  color: #e9eeea;
  font-family: 'Inter', system-ui, sans-serif;
}
```

- [ ] **Step 3: Gate + eyeball**

Run: `npm run lint && npm run build && npm test` → all green (176).
`npm run dev` → UI now renders in Inter (check the DevTools Network tab: woff2 served from `/fonts/…`, no external requests).

- [ ] **Step 4: Commit**

```bash
git add public/fonts src/index.css
git commit -F- <<'EOF'
feat(ui): self-host Inter + JetBrains Mono (woff2), use Inter for the app

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Introduce design tokens (no visual change)

**Files:**
- Modify: `src/index.css` (add `:root` token block; rewrite hardcoded values onto `var(--…)`)

**Interfaces:**
- Produces: CSS variables consumed by every later task: `--bg --surface --surface-2 --border --border-soft --accent --accent-2 --glow-accent --text --text-dim --text-faint --danger --radius --radius-sm --shadow-card --font-ui --font-mono`.

This task is a **pure refactor**: tokens hold the CURRENT values, so the app looks identical. Tuning happens in Task 3.

- [ ] **Step 1: Add the `:root` block (current values) right after the `@font-face` rules**

```css
:root {
  font-family: 'Inter', system-ui, sans-serif;
  color-scheme: dark;

  --bg: #0f1e21;
  --surface: #11262a;
  --surface-2: #1d363b;
  --border: #1d363b;
  --border-soft: #122a2e;
  --accent: #e3a95c;
  --accent-2: #cf933f;
  --glow-accent: 0 0 0 1px rgba(227,169,92,.45), 0 4px 22px rgba(227,169,92,.14);
  --text: #e9eeea;
  --text-dim: #8da6a2;
  --text-faint: #5c7975;
  --danger: #e8826a;
  --radius: 10px;
  --radius-sm: 6px;
  --shadow-card: 0 1px 2px rgba(0,0,0,.30), 0 6px 20px rgba(0,0,0,.22);
  --font-ui: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

- [ ] **Step 2: Rewrite hardcoded values onto tokens by this mapping**

Apply across `src/index.css` (every occurrence), replacing literals with `var(--…)`:

| literal | token |
|---|---|
| `#0f1e21` (incl. `body`, `.report-toolbar` bg) | `var(--bg)` |
| `#0d1c1f`, `#0c1c1f`, `#11221f`, `#10211f` (panel/card/raised dark) | `var(--surface)` (or `--surface-2` where it reads as the raised/active layer — `.grid-head`, `.tab.on`, `.mode-toggle button.on`, `.view-toggle button.on`) |
| `#11262a` | `var(--surface)` |
| `#1d363b` (as a border) | `var(--border)` |
| `#1d363b` (as a raised bg: `.tab.on`, `.mode-toggle .on`, `.view-toggle .on`) | `var(--surface-2)` |
| `#122a2e` (hairline) | `var(--border-soft)` |
| `#34555a` (input/button border) | `var(--border)` |
| `#e3a95c` | `var(--accent)` |
| `#cf933f`, `#9a6f33`, `#efb86c` (amber partners/gradient stops) | `var(--accent-2)` (keep gradient pairs as `var(--accent), var(--accent-2)`) |
| `#e9eeea` | `var(--text)` |
| `#c8d6d2`, `#9fb4af`, `#8da6a2`, `#d7e2de` (dim text) | `var(--text-dim)` |
| `#5c7975` (faint labels) | `var(--text-faint)` |
| `#e8826a`, `#e88` (errors/close-hover) | `var(--danger)` |
| every `ui-monospace, monospace` | `var(--font-mono)` |
| `border-radius: 10px` | `var(--radius)`; `6px`/`7px`/`8px` small radii | `var(--radius-sm)` (leave 4px/5px micro radii as-is) |

Notes: leave the error-surface backgrounds (`#20100e`, `#2a1414`, `#2a2412`) and their borders as literals — they are semantic one-offs, not part of the palette. The `:root font-family` line replaces the old one (don't duplicate).

- [ ] **Step 3: Gate + eyeball (must look IDENTICAL)**

Run: `npm run lint && npm run build && npm test` → green.
`npm run dev` → the app looks the same as before this task (this is a refactor; any visible change means a mismapped token — fix it).

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -F- <<'EOF'
refactor(ui): introduce CSS design tokens, rewrite palette onto them (no visual change)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Tune tokens toward the mockup (the repaint)

**Files:**
- Modify: `src/index.css` (`:root` values only)

**Interfaces:**
- Consumes: tokens from Task 2.

Only token VALUES change here — every rule already references them, so this is the global repaint in one place. By eye against the mockup.

- [ ] **Step 1: Replace the `:root` color/depth values with the tuned set**

```css
  --bg: #0b1418;
  --surface: #11212a;
  --surface-2: #18303a;
  --border: #20393f;
  --border-soft: #16282d;
  --accent: #e3a95c;
  --accent-2: #cf933f;
  --glow-accent: 0 0 0 1px rgba(227,169,92,.45), 0 4px 22px rgba(227,169,92,.14);
  --text: #eaf0ec;
  --text-dim: #9fb4af;
  --text-faint: #607d79;
```

(Keep `--radius`, `--shadow-card`, fonts as in Task 2.) These give the mockup's deeper navy, a distinct raised layer (`--surface-2`), and a slightly warmer text. Fine-tune within these roles while eyeballing.

- [ ] **Step 2: Gate + eyeball against the mockup**

Run: `npm run lint && npm run build && npm test` → green.
`npm run dev` → deeper background; rail/panels read as layers; active tab/toggle clearly raised. Compare with `docs/Screenshot 2026-06-22 214921.png`. Adjust token values (within their roles) until the depth matches.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -F- <<'EOF'
style(ui): tune tokens toward the mockup — deeper navy, layered surfaces

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Icon component + logo & mode-toggle icons

**Files:**
- Create: `src/components/Icon.tsx`
- Modify: `src/features/Shell.tsx` (logo + mode-toggle), `src/index.css` (`.logo` circle, `.mode-toggle button` icon gap)

**Interfaces:**
- Produces: `Icon` component — `<Icon name="logo|explore|report|play|pin|save|types|profile|chevron" size?={number} />` renders an inline `<svg>` with `stroke="currentColor"`, `fill="none"`, inheriting color/size from the parent.

By eye + build.

- [ ] **Step 1: Create `src/components/Icon.tsx`**

```tsx
import type { ReactNode } from 'react'

type IconName =
  | 'logo' | 'explore' | 'report' | 'play' | 'pin' | 'save' | 'types' | 'profile' | 'chevron'

const PATHS: Record<IconName, ReactNode> = {
  // simple, recognizable stroke glyphs (Lucide-ish), 24x24 viewBox
  logo: <path d="M15 6a4 4 0 1 0-4 4h4l4 3v-5a5 5 0 0 0-5-5h-1M7 13c0 3 2 5 5 5h6" />,
  explore: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  report: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  play: <path d="M6 4l14 8-14 8z" />,
  pin: <path d="M12 17v5M9 3h6l-1 7 3 3H7l3-3-1-7z" />,
  save: <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" />,
  types: <path d="M3 21l3-1 11-11-2-2L4 18l-1 3zM14 6l4 4" />,
  profile: <><path d="M3 21h18" /><rect x="5" y="11" width="3" height="7" /><rect x="11" y="7" width="3" height="11" /><rect x="17" y="13" width="3" height="5" /></>,
  chevron: <path d="M9 6l6 6-6 6" />,
}

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: '0 0 auto' }}
    >
      {PATHS[name]}
    </svg>
  )
}
```

- [ ] **Step 2: Use the logo + mode-toggle icons in `src/features/Shell.tsx`**

Add `import { Icon } from '../components/Icon'`. Replace the logo span and put icons in the toggle:

```tsx
<span className="logo"><Icon name="logo" size={18} /> quackbook</span>
```
```tsx
<button className={mode === 'explore' ? 'on' : ''} onClick={() => setMode('explore')}>
  <Icon name="explore" /> исследование
</button>
<button className={mode === 'report' ? 'on' : ''} onClick={() => setMode('report')}>
  <Icon name="report" /> отчёт
</button>
```

- [ ] **Step 3: Style the logo circle + icon alignment in `src/index.css`**

```css
.logo { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: var(--accent); }
.logo svg { background: var(--accent); color: var(--bg); border-radius: 50%; padding: 4px; box-sizing: content-box; }
.mode-toggle button { display: inline-flex; align-items: center; gap: 6px; }
```

- [ ] **Step 4: Gate + eyeball + commit**

Run: `npm run lint && npm run build && npm test` → green.
`npm run dev` → duck/logo glyph in an amber circle; explore/report tabs show icons.

```bash
git add src/components/Icon.tsx src/features/Shell.tsx src/index.css
git commit -F- <<'EOF'
feat(ui): inline-SVG Icon component; logo glyph + mode-toggle icons

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Action-button icons (run / pin / save+export / schema)

**Files:**
- Modify: `src/features/Explore.tsx`, `src/components/ResultPanel.tsx`, `src/features/Report.tsx`, `src/features/Rail.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `Icon` from Task 4.

Replace the existing emoji/text markers (`▶`, `📌`) with `<Icon>` and add icons to save/export and the schema buttons. By eye + build.

- [ ] **Step 1: Run button — `src/features/Explore.tsx`**

Add `import { Icon } from '../components/Icon'`. Replace the run button label:

```tsx
<button className="run-btn" onClick={() => run(tab.sql)}>
  <Icon name="play" /> запустить
</button>
```

- [ ] **Step 2: Pin button — `src/components/ResultPanel.tsx`**

Add `import { Icon } from './Icon'`. Replace the pin button label (keep the onClick handler exactly as-is):

```tsx
<button className="pin-btn" title="закрепить результат в отчёт" onClick={/* unchanged */}>
  <Icon name="pin" /> закрепить
</button>
```

- [ ] **Step 3: Save + export icons — `src/features/Report.tsx`**

Add `import { Icon } from '../components/Icon'`. Prefix the toolbar buttons:

```tsx
<button onClick={save}><Icon name="save" /> сохранить</button>
```
and the export-HTML button: `<button onClick={exportHtml}><Icon name="save" /> экспорт HTML</button>` (leave «+ текст», «открыть», «PDF», «очистить» text-only — or add icons only to save/export to avoid clutter).

- [ ] **Step 4: Schema buttons — `src/features/Rail.tsx`**

Add `import { Icon } from '../components/Icon'`. Put a `types` icon on the «типы» button and a `profile` icon on the «профиль источника» button:

```tsx
<button /* «типы» button, attrs unchanged */><Icon name="types" /> типы</button>
```
```tsx
<button className="profbtn" /* unchanged */><Icon name="profile" /> профиль источника</button>
```

- [ ] **Step 5: Align icons inside buttons — `src/index.css`**

```css
.run-btn, .pin-btn, .report-toolbar button, .schema-btn, .profbtn {
  display: inline-flex; align-items: center; gap: 6px;
}
```
(These rules already exist for some; merge the `display:inline-flex; align-items:center; gap` in rather than duplicating selectors where a rule is already present.)

- [ ] **Step 6: Gate + eyeball + commit**

Run: `npm run lint && npm run build && npm test` → green.
`npm run dev` → run/pin/save/export/types/profile buttons show icons, vertically centered with their text.

```bash
git add src/features/Explore.tsx src/components/ResultPanel.tsx src/features/Report.tsx src/features/Rail.tsx src/index.css
git commit -F- <<'EOF'
feat(ui): action-button icons (run/pin/save/export/types/profile)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Surface depth — Explore (panels as raised cards, grid, rail)

**Files:**
- Modify: `src/index.css`

Lift the query/result panels into cards, give the grid head the raised layer, and make the rail read as a darker column. By eye against `…214921.png`.

- [ ] **Step 1: Panels as cards + rail layering**

```css
.rail { background: var(--surface); }
.query-panel, .result-panel {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: var(--shadow-card); padding: 12px 14px;
}
.query-panel .sql-editor { border-color: var(--border); border-radius: var(--radius-sm); }
.grid-scroll { box-shadow: var(--shadow-card); }
.grid-head { background: var(--surface-2); }
.source-kind {
  background: var(--surface-2); border-radius: 4px; padding: 1px 5px; color: var(--text-faint);
}
.run-btn { box-shadow: 0 2px 10px rgba(227,169,92,.20); }
```

(If `.query-panel`/`.result-panel` had no background before, this is the new card surface; verify the SQL editor and grid still sit correctly inside.)

- [ ] **Step 2: Gate + eyeball + commit**

Run: `npm run lint && npm run build && npm test` → green.
`npm run dev` (Explore) → query and result read as raised cards on the deep bg; rail is a distinct darker column; csv/pq kind badges look like the mockup; run button has a subtle amber lift.

```bash
git add src/index.css
git commit -F- <<'EOF'
style(ui): Explore surfaces — raised query/result cards, layered rail, grid head

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: Report depth — active-block glow + widget cards + typography

**Files:**
- Modify: `src/index.css`

By eye against `…214931.png`.

- [ ] **Step 1: Active block glow, widget cards, narrative typography**

```css
.report-block { border-radius: var(--radius); padding: 12px 14px; transition: box-shadow .15s, border-color .15s; }
.report-block.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  box-shadow: var(--glow-accent);
}
.widget-block { background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: var(--shadow-card); padding: 12px 14px; }
.report-block.active .widget-block { box-shadow: none; } /* avoid double frame */
.ds-pill { font-family: var(--font-mono); }
.widget-sql { background: var(--surface); font-family: var(--font-mono); }
.widget-title { font-size: 16px; }

.text-block { font-size: 15px; line-height: 1.65; color: var(--text-dim); }
.text-block :where(h1,h2,h3) { color: var(--text); line-height: 1.25; margin: .2em 0 .4em; }
.text-block h1 { font-size: 24px; font-weight: 700; }
.text-block h2 { font-size: 19px; font-weight: 600; }
.text-block h3 { font-size: 16px; font-weight: 600; }
```

- [ ] **Step 2: Gate + eyeball + commit**

Run: `npm run lint && npm run build && npm test` → green.
`npm run dev` (Report) → active block has an amber frame + soft glow; widget blocks read as cards; report text reads as a clean narrative with prominent headings (compare the mockup). NOTE: `color-mix` is supported by the Vite-targeted browsers; if you prefer, replace the active bg with a flat `rgba(227,169,92,.06)`.

```bash
git add src/index.css
git commit -F- <<'EOF'
style(ui): Report depth — active-block glow, widget cards, narrative typography

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: `updateWidgetTitle` click-to-edit (close backlog)

**Files:**
- Modify: `src/components/WidgetBlockView.tsx`, `src/index.css`

**Interfaces:**
- Consumes: existing store action `updateWidgetTitle(id, title)` (already unit-tested in `session.test.ts`); `useSession`.

Mirror `TextBlockView`'s click-to-edit. By eye + build (the store action is already covered; this is UI wiring).

- [ ] **Step 1: Add edit state + selector in `WidgetBlockView.tsx`**

Near the other `useSession` selectors add:

```tsx
const updateWidgetTitle = useSession((s) => s.updateWidgetTitle)
```
Add local state (with the other `useState` calls):

```tsx
const [editingTitle, setEditingTitle] = useState(false)
const [titleDraft, setTitleDraft] = useState(block.title)
```
(`useState` is already imported in this file.)

- [ ] **Step 2: Replace the static title span with click-to-edit**

Current:
```tsx
<span className="widget-title">{block.title}</span>
```
New:
```tsx
{editingTitle ? (
  <input
    className="widget-title-edit"
    autoFocus
    value={titleDraft}
    onChange={(e) => setTitleDraft(e.target.value)}
    onClick={(e) => e.stopPropagation()}
    onBlur={() => {
      if (titleDraft.trim() && titleDraft !== block.title) updateWidgetTitle(block.id, titleDraft.trim())
      setEditingTitle(false)
    }}
    onKeyDown={(e) => {
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      else if (e.key === 'Escape') { setTitleDraft(block.title); setEditingTitle(false) }
    }}
  />
) : (
  <span
    className="widget-title"
    title="кликни, чтобы переименовать"
    onClick={(e) => { e.stopPropagation(); setTitleDraft(block.title); setEditingTitle(true) }}
  >
    {block.title}
  </span>
)}
```

- [ ] **Step 3: Style the title input in `src/index.css`**

```css
.widget-title-edit {
  font: 600 16px var(--font-ui); background: var(--surface); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 2px 6px;
}
```

- [ ] **Step 4: Gate + eyeball + commit**

Run: `npm run lint && npm run build && npm test` → green (176; the `updateWidgetTitle` action test still passes).
`npm run dev` → click a widget title → inline input; Enter/blur saves, Esc reverts; clicking the input doesn't toggle block activation.

```bash
git add src/components/WidgetBlockView.tsx src/index.css
git commit -F- <<'EOF'
feat(ui): click-to-edit widget title (closes updateWidgetTitle backlog item)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Self-Review

**Spec coverage:**
- Token-first refactor (vars in `:root`, rewrite onto them) → Tasks 2–3. ✓
- Self-hosted Inter + JetBrains Mono woff2, no npm/CDN → Task 1. ✓
- Inline-SVG Icon set (~9), no library → Task 4; used in 4–5. ✓
- Depth/layers/shadows/glow → Tasks 3, 6, 7. ✓
- Logo glyph + icons in toggle/buttons/types/profile → Tasks 4–5. ✓
- Active-block amber glow → Task 7. ✓
- Report narrative typography → Task 7. ✓
- Mono font for SQL/data/types/pills → Task 2 (`var(--font-mono)` mapping) + Task 7 (pills/sql). ✓
- `updateWidgetTitle` click-to-edit → Task 8. ✓
- Export stays light / no structural change / no rebrand / no new deps → Global Constraints; no task touches `core/exportHtml.ts`, structure, or `package.json`. ✓

**Placeholder scan:** No TBD/TODO. The font download (Task 1 Step 1) has exact URLs + a BLOCKED fallback. Token mapping (Task 2) is an explicit table, not "handle the rest". The `color-mix` note (Task 7) gives a concrete fallback. These are decision points with both branches spelled out, not placeholders.

**Type consistency:** `Icon` prop `{ name: IconName; size?: number }` (Task 4) matches every `<Icon name=… />` call site (Tasks 4–5). `updateWidgetTitle(id, title)` (Task 8) matches the store signature in `session.ts`. Token names defined in Task 2 are exactly those referenced in Tasks 3/6/7. Font families `'Inter'`/`'JetBrains Mono'` (Task 1) match `--font-ui`/`--font-mono` (Task 2).

**Scope:** One milestone, eight tasks, no decomposition needed. Pure visual + one UI wiring; no new product surface, no new deps, firewall respected (no status bar/breadcrumb/badge/saved-queries/rebrand; export untouched).
