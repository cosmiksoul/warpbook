import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// GitHub Pages PROJECT page is served under https://<user>.github.io/quackbook/
// so the production base must be '/quackbook/'. The dev server stays at '/'.
// Change REPO if the GitHub repository has a different name.
const REPO = 'quackbook'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${REPO}/` : '/',
  plugins: [react()],
  // REQUIRED: keep DuckDB out of dep pre-bundling so Vite resolves the raw
  // worker/.wasm files referenced via ?url imports.
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
  test: {
    // M0: every test is pure/node (core/ + db/ integration). No jsdom yet.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // duckdb-node.cjs is CommonJS; inline it so Vitest transforms it
    // consistently instead of externalizing.
    server: { deps: { inline: ['@duckdb/duckdb-wasm'] } },
  },
}))
