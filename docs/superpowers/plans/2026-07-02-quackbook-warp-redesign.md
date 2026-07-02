# Warp Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ребрендинг quackbook→warpbook + сдвиг айдентики в терминал-неон (циан/магента) с warp-drive WebGL-шейдером как hero-моментом на boot и welcome.

**Architecture:** Один самодостаточный компонент `WarpShader` (raw WebGL, GLSL в строках, 0 зависимостей) рисует полноэкранный warp-фон; его переиспользуют `BootScreen` и `WelcomeScreen`. Палитра — токен-управляемая (`index.css` `:root`), поэтому перекрас — в основном правка `:root` + неон-утилиты, применённые к акцентным элементам. Раскладка, структура данных и печатная тема экспорта НЕ меняются.

**Tech Stack:** React 19 + TypeScript + Vite; raw WebGL (WebGL1 / GLSL ES 1.00); CSS custom properties; CodeMirror 6 (SQL highlight); Observable Plot (чарты). Vitest node env.

## Global Constraints

- **0 новых зависимостей.** three.js НЕ тянем; `git diff main -- package.json` должен быть пуст. GLSL пишется в проекте.
- **Гейт каждой задачи перед коммитом:** `npm test` (285+ зелёных) И `npm run build` (полный type-check) И `npm run lint` (0 ошибок/0 варнингов). Все три обязательны.
- **Презентация проверяется глазами** (CSS/GLSL/визуальные компоненты) — граница TDD из CLAUDE.md. Под тест идёт только чистая логика и смена бренд-строки в экспорте (там есть ассерт).
- **Хирургические правки:** трогать только то, что нужно; не переформатировать соседний код.
- **Firewall:** раскладка приложения, стор-логика, SQL-пайплайн, печатная ТЕМА экспорта — НЕ трогаем. `vite base '/quackbook/'`, `REPORT_KEY='quackbook.report'`, префикс `_qb_` — остаются `quackbook` (инфраструктура). Переименовываем только ОТОБРАЖАЕМЫЙ бренд.
- **Палитра (точные значения):** `--bg #07080f`, `--accent #22d3ee` (циан), `--accent-2 #e849c4` (магента), `--danger #ff5c72`, `--warn #e0b64a` (остаётся тёплым семантическим — не бренд).
- Коммиты однострочные `git commit -m "..."`.
- Порядок задач фиксирован: T4 (WarpShader) раньше T5/T6 (потребители). T1 (токены) раньше T2/T7/T8/T9 (используют токены).

---

### Task 1: Палитра — переписать токены `:root` + неон-утилиты + вычистить хардкод-янтарь в index.css

Токены управляют всей палитрой (35 ссылок). Переписываем `:root`, добавляем неон-градиент/glow, правим места хардкод-янтаря (`.run-btn` box-shadow/color, `.boot-bar-fill`, `.pill-local`).

**Files:**
- Modify: `src/index.css` (`:root` блок строки 33–58; `.run-btn` строка 129; `.pill-local` строка 124)

**Interfaces:**
- Produces: CSS-токены `--bg`, `--surface`, `--surface-2`, `--border`, `--border-soft`, `--accent`, `--accent-2`, `--accent-muted`, `--text`, `--text-dim`, `--text-faint`, `--danger`, `--track`, `--warn`, `--warn-bright`, `--glow-cyan`, `--glow-magenta`, `--grad-neon`, `--shadow-card`. Задачи 2/7/8/9 их используют.

- [ ] **Step 1: Переписать `:root`**

В `src/index.css` заменить **строки 37–57** — блок объявлений токенов внутри `:root`, от `--bg:` (строка 37) до `--font-mono:` (строка 57) включительно. Строки 34–35 (`font-family: 'Inter'…` и `color-scheme: dark`), пустую строку 36 и закрывающую `}` (строка 58) НЕ трогать. Заменяемый блок целиком (он воспроизводит и `--radius`/`--radius-sm`/шрифты, чтобы ничего не потерять) на:

```css
  --bg: #07080f;
  --surface: #0d1018;
  --surface-2: #141926;
  --border: #1e2740;
  --border-soft: #141b2e;
  --accent: #22d3ee;
  --accent-2: #e849c4;
  --glow-cyan: 0 0 0 1px rgba(34,211,238,.45), 0 0 18px rgba(34,211,238,.28);
  --glow-magenta: 0 0 0 1px rgba(232,73,196,.40), 0 0 18px rgba(232,73,196,.24);
  --grad-neon: linear-gradient(135deg, #22d3ee 0%, #e849c4 100%);
  --text: #e8f0f5;
  --text-dim: #8aa0b5;
  --text-faint: #4f6377;
  --danger: #ff5c72;
  --accent-muted: #264a52;
  --track: #14233a;
  --warn: #e0b64a;
  --warn-bright: #f4d98a;
  --radius: 10px;
  --radius-sm: 6px;
  --shadow-card: 0 1px 2px rgba(0,0,0,.45), 0 8px 30px rgba(0,0,0,.35);
  --font-ui: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
```

Примечание: старый токен `--glow-accent` удалён из `:root`, но он используется на **строке 376** (`.report-block { … box-shadow: var(--glow-accent); }`). Там заменить `var(--glow-accent)` → `var(--glow-cyan)`. Прогнать grep `--glow-accent` по `src/index.css` — вхождений остаться не должно.

- [ ] **Step 2: Вычистить хардкод-янтарь**

`.run-btn` (строка ~129) — заменить на:

```css
.run-btn { background: var(--grad-neon); color: #051016; border-color: transparent; font-weight: 600; box-shadow: var(--glow-cyan); }
```

`.pill-local` (строка ~124) — заменить `color: #6fae8e;` на `color: var(--accent);` (оставить остальное правило как есть).

- [ ] **Step 3: Гейт**

Run: `npm test` — 285+ зелёных; `npm run build` — успех; `npm run lint` — 0/0.
(Логика не тронута → тесты зелёные без изменений. Визуал — глазами позже.)

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "style(palette): cyan/magenta terminal-neon tokens; drop amber (warp redesign)"
```

---

### Task 2: Лого — варп-портал (концентрические кольца) в `Icon.tsx` + `.logo` CSS

Заменяем утиный глиф на кольца-портал (эхо шейдера): циан снаружи → магента внутрь.

**Files:**
- Modify: `src/components/Icon.tsx` (ветка `name === 'logo'`, строки 19–30; + стейл-комментарий строки 6)
- Modify: `src/index.css` (`.logo svg` строка 115)

**Interfaces:**
- Consumes: токены `--accent`, `--accent-2`, `--bg` (из Task 1).
- Produces: лого-глиф `Icon name="logo"` рисует кольца-портал.

- [ ] **Step 1: Переписать ветку `logo` в `Icon.tsx`**

Заменить блок `if (name === 'logo') { … }` (строки 19–30) на:

```tsx
  if (name === 'logo') {
    // Warp-portal: концентрические кольца, сгущающиеся к центру (эхо тоннеля
    // шейдера). Внешние — циан (--accent), внутренние — магента (--accent-2),
    // яркая точка-колодец в центре. Двухтональность = намёк на chromatic split.
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: '0 0 auto' }}>
        <circle cx="12" cy="12" r="10.2" stroke="var(--accent)" strokeWidth="1.5" opacity="0.9" />
        <circle cx="12" cy="12" r="7.4" stroke="var(--accent)" strokeWidth="1.5" opacity="0.8" />
        <circle cx="12" cy="12" r="5" stroke="var(--accent-2)" strokeWidth="1.5" opacity="0.85" />
        <circle cx="12" cy="12" r="3" stroke="var(--accent-2)" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="1.1" fill="var(--accent)" />
      </svg>
    )
  }
```

Также обновить стейл-комментарий на **строке 6** `Icon.tsx`: `// logo is rendered separately (filled duck-head mark); these are stroke glyphs.` → `// logo is rendered separately (warp-portal concentric rings); these are stroke glyphs.`

- [ ] **Step 2: Обновить `.logo svg` (убрать янтарный тайл-фон)**

В `src/index.css` `.logo svg` (строка ~115) — портал рисуется как есть, без плашки-тайла. Заменить правило на:

```css
.logo svg { border-radius: var(--radius-sm); filter: drop-shadow(0 0 6px rgba(34,211,238,.5)); }
```

(Убраны `background`/`color`/`padding` — они были для заливного утиного глифа.)

- [ ] **Step 3: Гейт**

Run: `npm test` — 285+ зелёных; `npm run build` — успех; `npm run lint` — 0/0.

- [ ] **Step 4: Commit**

```bash
git add src/components/Icon.tsx src/index.css
git commit -m "style(logo): warp-portal concentric rings replace duck glyph (cyan->magenta)"
```

---

### Task 3: Ребрендинг quackbook→warpbook (только отображаемый бренд) + ассерт экспорта

Переименовываем user-facing бренд; инфраструктуру (`vite base`, `REPORT_KEY`, `_qb_`) не трогаем.

**Files:**
- Modify: `index.html` (`<title>` строка 6)
- Modify: `src/features/Shell.tsx` (топбар-лого «quackbook»)
- Modify: `src/components/BootScreen.tsx` (лого «quackbook» строка 15)
- Modify: `src/components/AboutModal.tsx` («quackbook» строки 12, 14)
- Modify: `src/core/exportHtml.ts` (`<title>quackbook — отчёт</title>` строка 103)
- Modify: `src/core/exportHtml.test.ts` (ассерт на строку title)
- Modify: `src/features/exportResult.ts` (`quackbook-result` строка 20)
- Modify: `src/features/Report.tsx` (имена файлов экспорта строки 26, 49)

**Interfaces:** только строковые правки; сигнатуры не меняются.

- [ ] **Step 1: Обновить ассерт теста (TDD: красный)**

В `src/core/exportHtml.test.ts` найти ассерт, проверяющий title экспорта (grep `quackbook — отчёт` или `<title>` по файлу). Заменить ожидаемую строку `quackbook — отчёт` на `warpbook — отчёт`.

Run: `npm test -- exportHtml.test`
Expected: FAIL — код всё ещё отдаёт `quackbook — отчёт`.

- [ ] **Step 2: Обновить строку экспорта (зелёный)**

В `src/core/exportHtml.ts` строка ~103: `<title>quackbook — отчёт</title>` → `<title>warpbook — отчёт</title>`.

Run: `npm test -- exportHtml.test`
Expected: PASS.

- [ ] **Step 3: Остальные бренд-строки**

- `index.html:6`: `<title>quackbook</title>` → `<title>warpbook</title>`.
- `src/features/Shell.tsx`, строка ~52: в топбар-логотипе `<span className="logo"><Icon name="logo" size={18} /> quackbook</span>` → `warpbook`.
- `src/features/Shell.tsx`, строка ~62 (кнопка About): `title="о quackbook" aria-label="о quackbook"` → оба `"о warpbook"`.
- `src/components/BootScreen.tsx:15`: `<Icon name="logo" size={22} /> quackbook` → `warpbook`.
- `src/components/AboutModal.tsx`: `aria-label="О quackbook"` → `aria-label="О warpbook"` (строка 12); `<h2>quackbook</h2>` → `<h2>warpbook</h2>` (строка 14).
- `src/features/exportResult.ts:20`: `a.download = \`quackbook-result.${format}\`` → `\`warpbook-result.${format}\``.
- `src/features/Report.tsx:26`: `a.download = 'quackbook-report.json'` → `'warpbook-report.json'`.
- `src/features/Report.tsx:49`: `downloadHtml(html, 'quackbook-report.html')` → `'warpbook-report.html'`.

Проверить, что НЕ тронуты: `vite.config.ts` (`base`), `src/state/session.ts` (`REPORT_KEY`), `src/core/sql.ts` (`_qb_`). Grep `quackbook` по `src/` после правок — ожидаются только инфраструктурные вхождения (REPORT_KEY, код-комментарии в core/*, mart/schemaTypes/sqlSchema comments).

- [ ] **Step 4: Гейт**

Run: `npm test` — 285+ зелёных; `npm run build` — успех; `npm run lint` — 0/0.

- [ ] **Step 5: Commit**

```bash
git add index.html src/features/Shell.tsx src/components/BootScreen.tsx src/components/AboutModal.tsx src/core/exportHtml.ts src/core/exportHtml.test.ts src/features/exportResult.ts src/features/Report.tsx
git commit -m "feat(brand): rename displayed brand quackbook->warpbook (infra identity unchanged)"
```

---

### Task 4: Компонент `WarpShader` — raw WebGL, GLSL, гварды, фоллбэк

Центральный компонент. Полноэкранный fragment-шейдер на quad; палитра циан/магента захардкожена в GLSL как консты (документированы, совпадают с `--accent`/`--accent-2`). Гварды: DPR-кап, пауза на `hidden`/анмаунте, `prefers-reduced-motion` → один статичный кадр, фоллбэк на CSS-градиент без WebGL.

**Files:**
- Create: `src/components/WarpShader.tsx`
- Modify: `src/index.css` (стили `.warp-shader`, `.warp-fallback`)

**Interfaces:**
- Produces: `WarpShader({ intensity?: number; className?: string })` — React-компонент. `intensity` 0..1 множит яркость/скорость (default 1). Задачи 5/6 его импортируют.

- [ ] **Step 1: Создать `src/components/WarpShader.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

// Палитра захардкожена под токены --accent (#22d3ee) / --accent-2 (#e849c4).
const FRAG = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_intensity;
const vec3 CYAN = vec3(0.133, 0.827, 0.933);
const vec3 MAGENTA = vec3(0.910, 0.286, 0.769);
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 center = 0.5 + (u_mouse - 0.5) * 0.06;
  vec2 p = (uv - center) * aspect;
  float r = length(p);
  float a = atan(p.y, p.x);
  float t = u_time * 0.6 * u_intensity;
  float freq = 8.0;
  float off = 0.05 + r * 0.12;
  float ringsC = sin(log(r + 0.06 + off) * freq - t * 3.14159);
  float ringsM = sin(log(r + 0.06 - off) * freq - t * 3.14159);
  float glowC = pow(max(ringsC, 0.0), 6.0);
  float glowM = pow(max(ringsM, 0.0), 6.0);
  float band = 0.7 + 0.3 * (0.5 + 0.5 * sin(a * 3.0 + t * 2.0));
  vec3 col = CYAN * glowC * band + MAGENTA * glowM * band;
  col *= smoothstep(0.0, 0.35, r);          // dark central well
  col *= smoothstep(1.15, 0.2, r);          // vignette
  col *= 1.4 * u_intensity;
  gl_FragColor = vec4(col, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh)
    return null
  }
  return sh
}

export function WarpShader({ intensity = 1, className }: { intensity?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false }) as WebGLRenderingContext | null
    if (!gl) { setFailed(true); return }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()
    if (!vs || !fs || !prog) { setFailed(true); return }
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { setFailed(true); return }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'u_resolution')
    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uMouse = gl.getUniformLocation(prog, 'u_mouse')
    const uInt = gl.getUniformLocation(prog, 'u_intensity')

    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 }
    const onMove = (e: PointerEvent) => {
      mouse.tx = e.clientX / window.innerWidth
      mouse.ty = 1 - e.clientY / window.innerHeight
    }
    window.addEventListener('pointermove', onMove)

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.floor(canvas.clientWidth * dpr)
      const h = Math.floor(canvas.clientHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const start = performance.now()

    function draw(now: number) {
      resize()
      mouse.x += (mouse.tx - mouse.x) * 0.06
      mouse.y += (mouse.ty - mouse.y) * 0.06
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, reduced ? 0 : (now - start) / 1000)
      gl.uniform2f(uMouse, mouse.x, mouse.y)
      gl.uniform1f(uInt, intensity)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      if (!reduced && !document.hidden) raf = requestAnimationFrame(draw)
    }
    draw(start)

    const onVis = () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0 }
      else if (!reduced && raf === 0) raf = requestAnimationFrame(draw)
    }
    document.addEventListener('visibilitychange', onVis)

    const onLost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); setFailed(true) }
    canvas.addEventListener('webglcontextlost', onLost)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', onVis)
      canvas.removeEventListener('webglcontextlost', onLost)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [intensity])

  if (failed) return <div className={'warp-fallback' + (className ? ' ' + className : '')} aria-hidden="true" />
  return <canvas ref={canvasRef} className={'warp-shader' + (className ? ' ' + className : '')} aria-hidden="true" />
}
```

- [ ] **Step 2: Стили canvas/фоллбэка**

В `src/index.css` (в конец файла) добавить:

```css
/* --- warp-drive shader background --- */
.warp-shader, .warp-fallback { position: absolute; inset: 0; width: 100%; height: 100%; display: block; z-index: 0; }
.warp-fallback { background: radial-gradient(circle at 50% 50%, #16324a 0%, #2a0f33 45%, var(--bg) 80%); }
@media (prefers-reduced-motion: reduce) { .warp-shader { /* один статичный кадр рисуется в компоненте */ } }
```

- [ ] **Step 3: Гейт**

Run: `npm test` — 285+ зелёных; `npm run build` — успех (полный type-check компонента); `npm run lint` — 0/0.
(Компонент — презентация, юнит-тестами не покрывается; визуал — на boot/welcome в следующих задачах.)

- [ ] **Step 4: Commit**

```bash
git add src/components/WarpShader.tsx src/index.css
git commit -m "feat(warp): raw WebGL warp-drive shader component (0 deps, DPR cap, reduced-motion + context-loss fallback)"
```

---

### Task 5: Вшить `WarpShader` в `BootScreen` + слои boot

Шейдер фоном за существующей boot-карточкой; прогресс-логика не трогается.

**Files:**
- Modify: `src/components/BootScreen.tsx`
- Modify: `src/index.css` (`.boot-screen`, `.boot-card`)

**Interfaces:**
- Consumes: `WarpShader` (Task 4).

- [ ] **Step 1: Обернуть boot в слой-контейнер**

В `src/components/BootScreen.tsx` добавить импорт `import { WarpShader } from './WarpShader'` и обернуть содержимое: `.boot-screen` получает `<WarpShader intensity={1} />` первым ребёнком, карточка — вторым. Заменить `return ( … )` на:

```tsx
  return (
    <div className="boot-screen">
      <WarpShader intensity={1} />
      <div className="boot-card">
        <span className="logo boot-logo"><Icon name="logo" size={22} /> warpbook</span>
        <div className="boot-title">Запуск движка DuckDB-WASM…</div>
        <div className={'boot-bar' + (pct === null ? ' indeterminate' : '')}>
          <div className="boot-bar-fill" style={pct === null ? undefined : { width: `${pct}%` }} />
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
```

(Примечание: `warpbook` уже проставлен Task 3 — если Task 3 выполнена, строка лого совпадёт; здесь она показана целиком для контекста.)

- [ ] **Step 2: Слои CSS**

В `src/index.css` заменить `.boot-screen` и `.boot-card`:

```css
.boot-screen { position: relative; display: flex; align-items: center; justify-content: center; height: 100vh; padding: 24px; overflow: hidden; }
.boot-card {
  position: relative; z-index: 1;
  display: flex; flex-direction: column; gap: 13px; width: min(420px, 100%);
  padding: 26px 26px 22px; background: rgba(13,16,24,.72); backdrop-filter: blur(8px);
  border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-card);
}
```

- [ ] **Step 3: Гейт**

Run: `npm test` — 285+ зелёных; `npm run build` — успех; `npm run lint` — 0/0.

- [ ] **Step 4: Commit**

```bash
git add src/components/BootScreen.tsx src/index.css
git commit -m "feat(boot): warp-shader background behind the boot card"
```

---

### Task 6: Вшить `WarpShader` в `WelcomeScreen` + слои welcome + неон-CTA

Шейдер-портал за онбордингом; логика загрузки демо/отчёта не трогается.

**Files:**
- Modify: `src/components/WelcomeScreen.tsx`
- Modify: `src/index.css` (`.welcome`, `.welcome-*`, `.welcome-cta`)

**Interfaces:**
- Consumes: `WarpShader` (Task 4).

- [ ] **Step 1: Обернуть welcome в слой-контейнер**

В `src/components/WelcomeScreen.tsx` добавить `import { WarpShader } from './WarpShader'`. Обернуть весь текущий `<div className="welcome">…</div>` во внешний контейнер `.welcome-stage` с шейдером, а контент положить в `.welcome-content`. Заменить `return ( <div className="welcome"> … </div> )` на:

```tsx
  return (
    <div className="welcome-stage">
      <WarpShader intensity={0.85} />
      <div className="welcome welcome-content">
        <h1 className="welcome-title">Аналитический ноутбук в браузере</h1>
        <p className="welcome-lead">
          Брось CSV или Parquet в панель слева — и работай: пиши SQL с JOIN/UNION,
          смотри профиль значений, закрепляй результаты виджетами и собирай
          нарративный отчёт. Всё локально, без бэкенда.
        </p>
        <ol className="welcome-steps">
          <li><b>Данные.</b> CSV/Parquet → схема и типы в рейле слева.</li>
          <li><b>Исследование.</b> SQL → таблица, график, профиль значений.</li>
          <li><b>Отчёт.</b> Закрепи виджеты, впиши текст, выгрузи в HTML/PDF.</li>
        </ol>
        <div className="welcome-actions">
          <button className="welcome-cta" disabled={busy !== null} onClick={onData}>
            {busy === 'data' ? 'Грузим…' : 'Загрузить демо-данные'}
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

- [ ] **Step 2: Слои + неон-CTA CSS**

В `src/index.css` уже есть блок `.welcome`/`.welcome-*` (строки ~434–446), включая `.welcome-cta`/`.welcome-cta.ghost`/`.welcome-cta:disabled`/`.welcome-credit a`. **Заменить существующее правило `.welcome-cta` (и его `:hover`/`.ghost`/`:disabled` варианты) на версию ниже — не добавлять второй дубль** (иначе два конфликтующих `.welcome-cta`). Добавить новые `.welcome-stage` и `.welcome-content`. Остальные `.welcome-*` (title/lead/steps/credit) оставить как есть — они уже на токенах и перекрасятся автоматически.

```css
.welcome-stage { position: relative; flex: 1; min-height: 0; display: flex; overflow: hidden; }
.welcome-content {
  position: relative; z-index: 1; margin: auto; max-width: 620px; padding: 40px 32px;
  background: rgba(7,8,15,.55); backdrop-filter: blur(6px); border-radius: var(--radius);
}
.welcome-cta {
  border: 1px solid transparent; background: var(--grad-neon); color: #051016;
  padding: 10px 18px; border-radius: var(--radius-sm); cursor: pointer; font-weight: 600;
  box-shadow: var(--glow-cyan); transition: box-shadow .14s ease, filter .14s ease;
}
.welcome-cta:hover:not(:disabled) { filter: brightness(1.08); box-shadow: var(--glow-magenta); }
.welcome-cta:disabled { opacity: .6; cursor: default; box-shadow: none; }
.welcome-cta.ghost { background: transparent; color: var(--accent); border-color: var(--border); box-shadow: none; }
.welcome-cta.ghost:hover:not(:disabled) { border-color: var(--accent); box-shadow: var(--glow-cyan); filter: none; }
```

(Если в `index.css` уже есть `.welcome-cta`/`.welcome-title` из прежнего дизайна — заменить `.welcome-cta` на версию выше; остальные `.welcome-*` оставить, они наследуют новые токены.)

- [ ] **Step 3: Гейт**

Run: `npm test` — 285+ зелёных; `npm run build` — успех; `npm run lint` — 0/0.

- [ ] **Step 4: Commit**

```bash
git add src/components/WelcomeScreen.tsx src/index.css
git commit -m "feat(welcome): warp-shader portal behind onboarding + neon CTAs"
```

---

### Task 7: Неон-акценты чрома + движение + reduced-motion (CSS-only)

Фокус/hover/активные состояния получают неон; переходы 120–160ms; «запустить» — короткий pulse; всё гаснет под `prefers-reduced-motion`.

**Files:**
- Modify: `src/index.css` (focus-visible, `.tab.active`, `.mode-toggle button.on`, `.source.active`, ссылки, `.run-btn:active`, reduced-motion блок)

**Interfaces:**
- Consumes: токены `--accent`, `--accent-2`, `--glow-cyan`, `--glow-magenta` (Task 1).

- [ ] **Step 1: Глобальный focus-visible + переходы + акценты**

В `src/index.css` (в конец файла) добавить:

```css
/* --- neon accents + motion (warp redesign) --- */
button, a, .source, .tab { transition: color .14s ease, background-color .14s ease, box-shadow .14s ease, border-color .14s ease; }
:focus-visible { outline: none; box-shadow: var(--glow-cyan); border-radius: var(--radius-sm); }
a { color: var(--accent); }
a:hover { color: var(--accent-2); }
.mode-toggle button.on { background: var(--surface-2); color: var(--text); box-shadow: inset 0 -2px 0 var(--accent); }
.source.active { background: var(--surface-2); box-shadow: inset 2px 0 0 var(--accent); }
.run-btn:active { animation: run-pulse .28s ease-out; }
@keyframes run-pulse {
  0% { box-shadow: 0 0 0 0 rgba(34,211,238,.5); }
  100% { box-shadow: 0 0 0 14px rgba(34,211,238,0); }
}
@media (prefers-reduced-motion: reduce) {
  button, a, .source, .tab { transition: none; }
  .run-btn:active { animation: none; }
}
```

Примечание к активному табу: реальный класс — **`.tab.on`** (не `.active`), и у него уже есть трактовка активности из M8-таб-стрипа (`.tab.on { background: var(--surface-2) }` + `.tab.on .tab-icon { color: var(--accent) }` — иконка уже станет циановой от токена Task 1). Таб-стрип использует систему `::after`-швов — НЕ добавлять сюда inset-box-shadow к `.tab.on` (сломает бесшовность). Достаточно циановой иконки от токена; отдельное правило для таба в этой задаче не пишем. `.source.active` проверить по файлу — если класс иной, применить к реальному.

- [ ] **Step 2: Гейт**

Run: `npm test` — 285+ зелёных; `npm run build` — успех; `npm run lint` — 0/0.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "style(chrome): neon focus/hover/active accents + run-pulse; reduced-motion off-switch"
```

---

### Task 8: SQL-подсветка `SqlEditor` — ретюн под циан/магента

`HighlightStyle` и `caretColor`/selection переезжают с amber-on-teal на неон.

**Files:**
- Modify: `src/components/SqlEditor.tsx` (`qbHighlight` строки 15–26; `qbEditorTheme` selection строка 34)

**Interfaces:** сигнатуры не меняются.

- [ ] **Step 1: Ретюн `qbHighlight`**

В `src/components/SqlEditor.tsx` заменить `const qbHighlight = HighlightStyle.define([ … ])` (строки 15–26) на:

```tsx
// SQL token colors, tuned to the cyan/magenta terminal-neon palette (index.css tokens).
const qbHighlight = HighlightStyle.define([
  { tag: t.keyword, color: '#22d3ee', fontWeight: '600' },
  { tag: [t.typeName, t.typeOperator], color: '#5fe0ea' },
  { tag: [t.string, t.special(t.string)], color: '#e0b64a' },
  { tag: [t.number, t.integer, t.float], color: '#e849c4' },
  { tag: [t.bool, t.null, t.atom], color: '#ff5c72' },
  { tag: t.function(t.variableName), color: '#8ad6ff' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#4f6377', fontStyle: 'italic' },
  { tag: [t.operator, t.compareOperator, t.logicOperator, t.arithmeticOperator], color: '#8aa0b5' },
  { tag: [t.punctuation, t.separator, t.paren, t.bracket], color: '#6b7f9a' },
])
```

- [ ] **Step 2: Ретюн selection в `qbEditorTheme`**

Строка ~34: `'& ::selection': { backgroundColor: 'rgba(227,169,92,.20)' }` → `{ backgroundColor: 'rgba(34,211,238,.22)' }`.
(`caretColor`/`cm-cursor` уже `var(--accent)` → станут циановыми автоматически.)

- [ ] **Step 3: Гейт**

Run: `npm test` — 285+ зелёных; `npm run build` — успех; `npm run lint` — 0/0.

- [ ] **Step 4: Commit**

```bash
git add src/components/SqlEditor.tsx
git commit -m "style(editor): retune SQL syntax highlight to cyan/magenta neon palette"
```

---

### Task 9: Чарты — неон-серии

Серии Observable Plot переводим на неон (циан primary, магента secondary), читаемо на тёмном.

**Files:**
- Modify: `src/components/Chart.tsx` (цвет `color` строка 15)
- Modify: `src/components/plotFigure.ts` (цвет марки)

**Interfaces:** сигнатуры не меняются.

- [ ] **Step 1: Задать неон-цвет марки в `plotFigure`**

В `src/components/plotFigure.ts` в `mark` (barY/lineY) добавить `fill`/`stroke` циан. Заменить блок построения `mark` на:

```ts
  const mark =
    spec.kind === 'bar'
      ? Plot.barY(data, { x: spec.x, y: spec.y, sort: { x: '-y' }, fill: '#22d3ee' })
      : Plot.lineY(data, { x: spec.x, y: spec.y, stroke: '#22d3ee', strokeWidth: 2 })
```

(`data`/`spec.xDates` — как в текущем коде после chart-fix; не менять.)

- [ ] **Step 2: Цвет живого чарта в `Chart.tsx`**

В `src/components/Chart.tsx` строка ~15 `plotFigure(spec, rows, { background: 'transparent', color: '#c8d6d2' })` — `color` управляет осями/подписями; заменить на `color: '#8aa0b5'` (нейтральный `--text-dim` для читаемости осей на тёмном; марка уже циановая из Step 1).

- [ ] **Step 3: Гейт**

Run: `npm test` — 285+ зелёных; `npm run build` — успех; `npm run lint` — 0/0.
(Экспорт-чарт `exportReport`/`plotFigure` использует ту же марку — в светлой печатной теме циан на белом читается; если приёмка покажет плохой контраст в экспорте — отдельный минор в бэклог, тему экспорта не трогаем в этой вехе.)

- [ ] **Step 4: Commit**

```bash
git add src/components/Chart.tsx src/components/plotFigure.ts
git commit -m "style(chart): neon cyan series for bar/line marks"
```

---

## Порядок и зависимости

T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9.
Жёсткие: **T1 раньше T2/T7/T8/T9** (токены); **T4 раньше T5/T6** (WarpShader). T3 независима (можно раньше/позже, порядок сохранён для стабильности гейта).

## Финальная приёмка (после всех задач)

- [ ] `npm test` — 285+ зелёных; `npm run lint` — 0/0; `npm run build` — успех.
- [ ] `git diff main -- package.json` — пусто (0 новых зависимостей); `git diff main -- vite.config.ts` не меняет `base`.
- [ ] Grep `quackbook` по `src/` — только инфраструктура (`REPORT_KEY`, `_qb_`, код-комментарии); UI/экспорт-бренд = `warpbook`.
- [ ] Визуальная приёмка (`npm run dev`, пользователь): (а) boot — warp-портал за карточкой, бренд «warpbook», % читаем; (б) welcome — портал за онбордингом, текст читаем, CTA неонит; (в) внутри тула — циан/магента акценты, focus/hover, «запустить» pulse, гриды/таблицы читаемы; (г) `prefers-reduced-motion` — шейдер застыл, анимаций нет; (д) лого = кольца-портал; чарты циановые; SQL-подсветка читаема; (е) экспорт HTML — `<title>warpbook — отчёт</title>`, файл результата `warpbook-result.*`.
