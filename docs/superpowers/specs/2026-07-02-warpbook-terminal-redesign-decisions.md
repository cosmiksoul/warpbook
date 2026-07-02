# warpbook — Terminal Redesign · Design Decisions (in progress)

> **Status:** brainstorming converged, direction **LOCKED** by user. Next = write full spec → plan → SDD.
> **Date:** 2026-07-02 · **Branch:** `warp-redesign` (unmerged) · **Resume from this file.**

## The pivot

The earlier warp-redesign (neon cyan/magenta palette + WebGL "warp tunnel" shader) is **scrapped as a concept** — the user rejected the warp metaphor after seeing it live. New direction: **web-punk / terminal aesthetic in the spirit of Nous Research interfaces.**

- Displayed name stays **warpbook**. Infrastructure identity stays **quackbook** (vite base `/quackbook/`, `REPORT_KEY 'quackbook.report'`, `_qb_` table prefix) — unchanged, as before.
- 0-new-npm-dependencies invariant still holds (fonts are self-hosted assets, swirl is hand-written canvas).

## Locked direction: "Cyan Console" + magenta as functional secondary

Dark terminal. **Cyan is the dominant accent**; **magenta is a restrained, functional secondary** — it earns its place by semantics, not decoration. Validated live on a working-screen mockup (SQL editor + result grid + chart).

**magenta appears ONLY on:**
- chart 2nd+ data series (cyan bars + magenta line read perfectly against each other),
- hover states (nav tab, source row, result row) — cyan = active, magenta = hover,
- SQL syntax: numbers (a tasteful terminal spot accent).

## Design feel — the governing vibe (refinement 2026-07-02)

The single most important directional note; it governs every visual choice below.

**Push MORE toward terminal:** lots of black (flatter, blacker `--bg`, fewer panel shades), simple hard shapes only — rectangles, 1px borders, **radius 0**, **no drop shadows, no gradient fills** (the dithered swirl + focus/hover glow are the only "lit" elements).

**BUT do not slavishly redraw a terminal.** It is **web-punk — the midpoint between Web 1.0 and a terminal.** Take the *feeling*, not a literal xterm costume.

### The two north-star environments (they share one language)

Confirmed 2026-07-02: the aesthetic we imitate (Nous psyche) and the environment the user actually works in (the Claude Code / this-session TUI) are the **same family** — use both as north stars. The four qualities to hit, in the user's words:

- **Crisp lines (линии чёткие):** thin 1px hairline borders and rules, plentiful and structural — like nous-psyche's many boxes and the terminal's divider rules. Sharp, not heavy, not glowing everywhere.
- **Muted-but-readable fades (фейды заглушённые но читаемые):** secondary/dim text is subdued yet clearly legible — like the terminal's gray status line ("Op 4.8 | quackbook…") and "Mulling…". Dim ≠ unreadable; tune `--dim`/`--faint` to stay legible.
- **Bright contrast from the accent (контрасты яркие):** contrast comes from a **muted base vs. a bright, saturated, semantic accent** — exactly the dev terminal's magenta=error / purple=mode / green=ok / yellow=progress. Maps to our cyan(primary) + magenta(secondary) + amber(warn). Accents POP; base stays muted. Accents used sparingly and semantically.
- **Air (отступы с воздухом):** generous, breathing padding in boxes and between sections — like nous-psyche's roomy cards. **This supersedes the earlier "density, not whitespace" note** — we DO want air; the black + crisp lines + air together read as "fast" and "sexy". Not cramped.
- **Fonts:** mono for data/UI + serif for headings (IBM Plex) — as decided.

- **Web 1.0 DNA:** raw structural honesty — underlined links, hard `─` rules / box-drawing dividers, dotted focus outlines, table/directory-listing density, mono labels, UPPERCASE, "SEED / LAST-UPDATED" stamps. Handmade, not corporate-polished.
- **Terminal DNA:** mono everywhere, black + phosphor-cyan, prompt markers `>` / `▸`, blink-cursor accents, status line, segmented `▮▮▮` bars.
- **The synthesis reads as _fast_ and _"sexy"_** (user's words): high-contrast, instant, confident, curated restraint — with the dithered swirl as the single hero flourish.

**Explicitly avoid:** fake CRT curvature, heavy scanlines everywhere, literal xterm cosplay, rounded corners, drop shadows, gradient button fills, skeuomorphism. Sexy ≠ ugly-retro; it's curated and high-contrast.

## Decisions (all confirmed by user — "да, вполне")

1. **Typography:** IBM Plex **Serif** (headings / display) + IBM Plex **Mono** (all UI chrome + body text). Body stays mono (terminal purity; welcome lead is short). Self-hosted woff2 (not npm deps → invariant holds).
2. **Hero graphic:** **dithered dot-matrix swirl** (2D `<canvas>`, ordered 4×4 Bayer dither) **replaces the WebGL warp shader**. Cyan dots on near-black, animated with a real sense of speed (fast phase). 0-dep. Bonus: sidesteps the StrictMode WebGL fallback bug entirely (no WebGL context lifecycle).
3. **Palette:** Cyan Console (exact hex below). Magenta secondary scoped as above. Warm amber `--warn` kept as semantic (not brand).
4. **Chrome:** TUI / terminal — thin borders, boxes, uppercase mono labels (`SEED`, `ENGINE READY`, segmented ▮▮▮ boot bars), mono nav. **Bordered buttons (no fill) + glow** (user preference over solid fills).
5. **Contrast veil:** full-width darkening band with a **dark core behind text** (radial), swirl breathes at the edges — NOT a centered card/плашка.
6. **Swirl scope:** hero / boot / welcome **only**. **NOT** behind live data (grids / editor / rail) — it hurts data-density readability. Working screens stay clean dark terminal (validated in mock2).

## Exact palette (from the approved mockup `mock2.html`)

```
--bg        #05070a   (near-black)
--panel     #0a0f14
--panel-2   #0c141a
--border    #143039
--border-soft #0e222a
--cyan      #22d3ee   (primary accent)
--mag       #e849c4   (secondary — charts / hover / numbers ONLY)
--warm      #e0b64a   (semantic --warn; also SQL strings)
--text      #d6ecf1
--dim       #6f97a2
--faint     #3f5b63
--serif-ink #eaf7fb   (IBM Plex Serif headings)
```

SQL highlight (terminal): keyword `#22d3ee` (cyan, 500) · function `#8ad6ff` · string `#e0b64a` (warm) · **number `#e849c4` (magenta)** · comment `#3f5b63` italic · operator/punct `#6f97a2`.
Chart: series-1 cyan `#22d3ee` (bars) · series-2 magenta `#e849c4` (line/second series).

## Explored variants (for the record)

- **A — Cyan Console** (dark, cyan swirl) — **CHOSEN** + magenta secondary.
- B — Phosphor Green (dark, nous-psyche green) — rejected (taste: cyan wins).
- C — Ink on Paper (cream, ink-blue) — rejected (light theme = full re-theme of a dense dark data app; too big, data reads harder).
- C2 — Ink on Paper × deep-cyan accent — rejected alongside C for the same data-density reason.

## What carries over vs. gets replaced (branch `warp-redesign`)

- **KEEP:** the `warpbook` rebrand strings (was Task 3 of the old plan); overall app structure; the lesson from the WarpShader `loseContext` fix (`aa0122f`) — but the WarpShader component itself is replaced.
- **REPLACE:** `WarpShader` warp GLSL → new `DitherSwirl` canvas component; neon token palette → cyan-console terminal tokens; Inter/JetBrains Mono → IBM Plex Serif+Mono; filled-gradient buttons → bordered; warp-portal ring logo → dithered ring mark (already prototyped in the mockup's `canvas.mark`).
- Prior warp commits (`24b96c6`..`aa0122f`) are largely **superseded** by the new plan — decide at spec time whether to revert-then-rebuild or build forward over them.

## References (user-provided, 2026-07-02)

- **Nous psyche** — dark-green terminal: IBM Plex Serif headings + Mono data, dithered dot-sphere hero, TUI boxes, segmented ▮ progress bars, amber accent on primary CTA, "DISTRIBUTED INTELLIGENCE NETWORK".
- **Nous home** — cyan/ink on cream: IBM Plex, dashed horizontal rules, `OUTPUT 96 / SEED: …` mono labels, duotone images.
- **Nous portal** — electric-blue: serif display "NOUS PORTAL", bordered button, engraved illustration, mono footer.
- **"Swirl"** — cyan dithered dot-swirl (the target look for the hero graphic).
- **IBM Plex** typeface (Serif + Mono).

## Mockups (preserved in-repo)

- `docs/superpowers/specs/mockups/warpbook-terminal/mock.html` — hero/welcome. Palette via query: `?v=cyan` (chosen) `|green|paper|paper-cyan`.
- `docs/superpowers/specs/mockups/warpbook-terminal/mock2.html` — explore working screen (Cyan Console + magenta accent: chart 2nd series, hover, SQL numbers).
- **Serve:** any static server from that dir, e.g. `python -m http.server 8899`, then open `mock.html?v=cyan` and `mock2.html`. (Needs internet for the Google-Fonts IBM Plex link; in-app we self-host.)

## Next steps (resume here)

1. **brainstorming → spec:** formalize the above into `docs/superpowers/specs/2026-07-02-warpbook-terminal-redesign-design.md`; user already approved the direction, so this is documentation + a user review pass.
2. **writing-plans:** implementation plan. Likely tasks: self-host IBM Plex Serif+Mono; terminal token palette (replace neon tokens); `DitherSwirl` canvas component (replaces `WarpShader`); wire swirl into boot + welcome only; TUI chrome (borders/labels/segmented bars); bordered buttons; magenta secondary wiring (chart series-2, hover/active states); SQL highlight retune to terminal palette; dithered ring logo mark; typography pass across app.
3. **SDD execution** (implementer → verifier → fix-loop, final opus review), then user visual acceptance on branch.

**Gate every task:** `npm test` (285+ green) AND `npm run build` (full type-check) AND `npm run lint` (0/0). 0 new npm deps.
