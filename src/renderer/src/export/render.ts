import { toPng } from 'html-to-image'
import katex from 'katex'
import { renderMarkdownToHtml } from '../lib/markdown'
import { resolveSrc } from '../lib/paths'

const OFFSCREEN = 'position:fixed;left:-100000px;top:0;pointer-events:none;'

/** Chromium refuses to paint canvases larger than this on either edge. */
const MAX_CANVAS_EDGE = 30000

export interface RasterImage {
  data: Uint8Array
  width: number
  height: number
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/**
 * Renders the document into an off-screen node styled as a printable page.
 * Both exporters reuse it so the on-screen live preview never has to be
 * screenshotted mid-edit.
 */
export function mountExportDocument(
  markdown: string,
  baseUrl = ''
): {
  host: HTMLElement
  article: HTMLElement
} {
  const host = document.createElement('div')
  host.className = 'export-host'
  host.setAttribute('style', OFFSCREEN)

  const article = document.createElement('article')
  article.className = 'export-doc'
  article.innerHTML = renderMarkdownToHtml(markdown)

  // `![](images/a.png)` means that relative to the document, which is not where
  // this off-screen page lives.
  if (baseUrl) {
    for (const image of article.querySelectorAll('img')) {
      const src = image.getAttribute('src')
      if (src) image.setAttribute('src', resolveSrc(src, baseUrl))
    }
  }

  host.appendChild(article)
  document.body.appendChild(host)
  return { host, article }
}

/** Rasterises the whole document into a single PNG. */
export async function markdownToPng(markdown: string, baseUrl = ''): Promise<Uint8Array> {
  const { host, article } = mountExportDocument(markdown, baseUrl)

  try {
    await document.fonts.ready

    const width = article.offsetWidth
    const height = Math.max(article.scrollHeight, article.offsetHeight)
    if (width < 1 || height < 1) throw new Error('There is nothing to export yet.')

    // A long document at 2x would blow past the canvas limit, so trade
    // resolution for actually producing a file.
    const ratio = Math.min(2, MAX_CANVAS_EDGE / width, MAX_CANVAS_EDGE / height)
    if (ratio < 0.25) {
      throw new Error('This document is too long to export as a single PNG.')
    }

    const dataUrl = await toPng(article, {
      width,
      height,
      pixelRatio: ratio,
      backgroundColor: '#ffffff',
      cacheBust: true
    })
    return dataUrlToBytes(dataUrl)
  } finally {
    host.remove()
  }
}

/** Renders one LaTeX expression to a transparent-friendly PNG for the Word export. */
export async function texToImage(tex: string, block: boolean): Promise<RasterImage> {
  const host = document.createElement('div')
  host.className = 'export-math'
  host.setAttribute('style', `${OFFSCREEN}background:#ffffff;padding:2px;`)

  try {
    katex.render(tex, host, { displayMode: block, throwOnError: false, strict: false })
    document.body.appendChild(host)
    await document.fonts.ready

    const rect = host.getBoundingClientRect()
    const width = Math.max(1, Math.ceil(rect.width))
    const height = Math.max(1, Math.ceil(rect.height))

    const dataUrl = await toPng(host, {
      width,
      height,
      pixelRatio: 3,
      backgroundColor: '#ffffff'
    })
    return { data: dataUrlToBytes(dataUrl), width, height }
  } finally {
    host.remove()
  }
}

/** Measures an image source so it can be placed into a Word document. */
export function measureImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('Image could not be loaded'))
    image.src = src
  })
}
