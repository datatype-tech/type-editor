import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/** Builds the export harness used by `scripts/smoke.cjs`. Test-only. */
export default defineConfig({
  root: resolve(__dirname, 'scripts/harness'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'tmp/harness'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'scripts/harness/index.html') }
  }
})
