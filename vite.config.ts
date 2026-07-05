import { defineConfig } from 'vitest/config'
import { createLogger } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages PROJECT page is served under https://<user>.github.io/warpbook/
// so the production base must be '/warpbook/'. The dev server stays at '/'.
// Change REPO if the GitHub repository has a different name.
// (Repo renamed quackbook -> warpbook 2026-07-05; keep in sync with og:* URLs in index.html.)
const REPO = 'warpbook'

const logger = createLogger()
const origWarn = logger.warn.bind(logger)
logger.warn = (msg, opts) => {
  if (typeof msg === 'string' && msg.includes('Sourcemap for') && msg.includes('duckdb')) return
  origWarn(msg, opts)
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${REPO}/` : '/',
  plugins: [react()],
  customLogger: logger,
  // REQUIRED: keep DuckDB out of dep pre-bundling so Vite resolves the raw
  // worker/.wasm files referenced via ?url imports.
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    // M0: every test is pure/node (core/ + db/ integration). No jsdom yet.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Each node DuckDB-WASM suite spins a fresh WASM instance; Vitest runs the
    // files in parallel, so cold init under CPU contention can exceed the
    // default 10s hook / 5s test budget (intermittent timeouts). Generous
    // timeouts keep the full-suite gate deterministic.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // duckdb-node.cjs is CommonJS; inline it so Vitest transforms it
    // consistently instead of externalizing.
    server: { deps: { inline: ['@duckdb/duckdb-wasm'] } },
  },
}))
