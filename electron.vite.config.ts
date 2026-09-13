import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const PRODUCTION_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  // React sets style attributes, and KaTeX ships its own inline metrics.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: file: https: http:",
  "font-src 'self' data:",
  "connect-src 'self' data:"
].join('; ')

/**
 * The dev server injects an inline React-refresh preamble, so a strict CSP can
 * only be applied to the built app.
 */
function productionCsp(): Plugin {
  return {
    name: 'type-editor:production-csp',
    transformIndexHtml(html, ctx) {
      if (ctx.server) return html
      return html.replace(
        '</head>',
        `    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />\n  </head>`
      )
    }
  }
}

const { version } = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8')
) as { version: string }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    // Loaded over file:// in production, so every asset reference must be relative.
    base: './',
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    plugins: [react(), productionCsp()],
    // The About page states the version, and only the build knows it.
    define: { __APP_VERSION__: JSON.stringify(version) },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          // The unsaved-changes prompt is a window of its own.
          dialog: resolve(__dirname, 'src/renderer/dialog.html')
        }
      }
    }
  }
})
