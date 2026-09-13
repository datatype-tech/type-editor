/**
 * Test-only entry point. It gives the smoke test a way to call the export
 * pipeline directly, since those functions are bundled into the app and are not
 * reachable from the rendered page. Built by `vite.harness.config.ts` and never
 * shipped — electron-builder only packages `out/**`.
 */
import '../../src/renderer/src/styles/global.css'
import '../../src/renderer/src/styles/editor.css'
import 'katex/dist/katex.min.css'
import { markdownToDocx } from '../../src/renderer/src/export/docx'
import { markdownToPng } from '../../src/renderer/src/export/render'

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

interface HarnessResult {
  base64: string
  length: number
}

declare global {
  interface Window {
    harness: {
      png: (markdown: string) => Promise<HarnessResult>
      docx: (markdown: string, title: string) => Promise<HarnessResult>
      ready: true
    }
  }
}

window.harness = {
  async png(markdown) {
    const bytes = await markdownToPng(markdown)
    return { base64: toBase64(bytes), length: bytes.length }
  },
  async docx(markdown, title) {
    const bytes = await markdownToDocx(markdown, title)
    return { base64: toBase64(bytes), length: bytes.length }
  },
  ready: true
}

document.getElementById('harness-root')!.textContent = 'harness ready'
