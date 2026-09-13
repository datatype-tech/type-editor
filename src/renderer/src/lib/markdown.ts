import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import katex from 'katex'
import { sanitizeHtml } from './html'
import MarkdownIt, {
  type MarkdownIt as MarkdownItInstance,
  type StateBlock,
  type StateInline,
  type Token
} from 'markdown-it'

// Only the languages worth bundling; highlight.js ships ~190 by default.
for (const [name, language] of Object.entries({
  bash,
  css,
  go,
  java,
  javascript,
  json,
  markdown,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml
})) {
  hljs.registerLanguage(name, language)
}
hljs.registerAliases(['js', 'jsx', 'mjs', 'cjs'], { languageName: 'javascript' })
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' })
hljs.registerAliases(['html', 'svg'], { languageName: 'xml' })
hljs.registerAliases(['sh', 'shell', 'zsh'], { languageName: 'bash' })
hljs.registerAliases(['yml'], { languageName: 'yaml' })
hljs.registerAliases(['py'], { languageName: 'python' })

/** Minimal structural type for the markdown-it tokens the exporters walk. */
export interface MdToken {
  type: string
  tag: string
  content: string
  info: string
  children: MdToken[] | null
  attrs: [string, string][] | null
  attrGet(name: string): string | number | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function highlightCode(code: string, language: string): string {
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value
    } catch {
      // Fall through to the escaped source below.
    }
  }
  return escapeHtml(code)
}

function renderTex(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { displayMode, throwOnError: false, strict: false })
}

/**
 * Adds `$…$`, `$$…$$`, `\(…\)` and `\[…\]` support on top of markdown-it.
 * `output: 'htmlAndMathml'` (the KaTeX default) also emits MathML, which is what
 * makes the formulas survive the trip into Word.
 */
function mathPlugin(md: MarkdownItInstance): void {
  md.inline.ruler.after('escape', 'math_inline', (state: StateInline, silent: boolean) => {
    const start = state.pos
    const src = state.src
    if (src.charCodeAt(start) !== 0x24) return false
    // `$$` at this position belongs to the block rule.
    if (src.charCodeAt(start + 1) === 0x24) return false

    let end = start + 1
    while (end < state.posMax) {
      const code = src.charCodeAt(end)
      if (code === 0x5c) {
        end += 2
        continue
      }
      if (code === 0x24) break
      if (code === 0x0a) return false
      end += 1
    }
    if (end >= state.posMax) return false

    const content = src.slice(start + 1, end)
    if (!content.trim()) return false

    if (!silent) {
      const token = state.push('math_inline', 'math', 0)
      token.content = content
    }
    state.pos = end + 1
    return true
  })

  md.block.ruler.before(
    'fence',
    'math_block',
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      const start = state.bMarks[startLine] + state.tShift[startLine]
      const max = state.eMarks[startLine]
      const src = state.src

      if (start + 1 >= max) return false
      if (src.charCodeAt(start) !== 0x24 || src.charCodeAt(start + 1) !== 0x24) return false
      if (silent) return true

      const openingLine = src.slice(start + 2, max)
      const closesOnOpeningLine = openingLine.indexOf('$$')
      let content: string
      let lastLine = startLine

      if (closesOnOpeningLine >= 0) {
        content = openingLine.slice(0, closesOnOpeningLine)
      } else {
        content = openingLine
        let closed = false
        while (++lastLine < endLine) {
          const lineStart = state.bMarks[lastLine] + state.tShift[lastLine]
          const line = src.slice(lineStart, state.eMarks[lastLine])
          const index = line.indexOf('$$')
          if (index >= 0) {
            content += `\n${line.slice(0, index)}`
            closed = true
            break
          }
          content += `\n${line}`
        }
        if (!closed) return false
      }

      const token = state.push('math_block', 'math', 0)
      token.block = true
      token.content = content.trim()
      token.map = [startLine, lastLine + 1]
      state.line = lastLine + 1
      return true
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] }
  )

  md.renderer.rules['math_inline'] = (tokens: Token[], index: number): string =>
    renderTex(tokens[index].content, false)

  md.renderer.rules['math_block'] = (tokens: Token[], index: number): string =>
    `<p class="md-math-block">${renderTex(tokens[index].content, true)}</p>\n`
}

/**
 * Raw HTML is allowed, so that a document can carry a table, a `<details>` or a
 * figure that Markdown has no syntax for. Scripts are not part of that deal:
 * everything rendered here goes through `sanitizeHtml` first, which drops
 * script and style elements, every `on*` handler and any `javascript:` URL.
 */
export const markdownRenderer = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight: highlightCode
})

/**
 * The syntax Markdown forgot. Each of these is a small, self-contained rule so
 * the editor understands the same documents the exporter does:
 *
 *   ==highlight==   ^superscript^   ~subscript~
 *   [^note]         with `[^note]: text` definitions collected at the end
 *   Term / : definition   definition lists
 *   --- front matter ---  YAML at the top of a file
 */

/** Runs `onMatch` for `==text==`, `^text^` and `~text~` style spans. */
function spanRule(
  md: MarkdownItInstance,
  options: { name: string; marker: string; tag: string; className?: string; doubled?: boolean }
): void {
  const { name, marker, tag, className, doubled } = options

  md.inline.ruler.before('emphasis', name, (state: StateInline, silent: boolean) => {
    const start = state.pos
    const code = marker.charCodeAt(0)
    if (state.src.charCodeAt(start) !== code) return false
    if (doubled && state.src.charCodeAt(start + 1) !== code) return false
    // `~~strike~~` and `~sub~` share a character; only one of them may claim it.
    if (!doubled && state.src.charCodeAt(start + 1) === code) return false

    const body = start + (doubled ? 2 : 1)
    const close = state.src.indexOf(doubled ? marker + marker : marker, body)
    if (close < 0 || close === body) return false
    const content = state.src.slice(body, close)
    if (content.includes('\n') || !content.trim()) return false

    if (!silent) {
      const open = state.push(`${name}_open`, tag, 1)
      open.markup = marker
      if (className) open.attrSet('class', className)
      const text = state.push('text', '', 0)
      text.content = content
      state.push(`${name}_close`, tag, -1)
    }
    state.pos = close + (doubled ? 2 : 1)
    return true
  })
}

function footnotePlugin(md: MarkdownItInstance): void {
  md.inline.ruler.before('emphasis', 'footnote_ref', (state: StateInline, silent: boolean) => {
    const start = state.pos
    if (state.src.charCodeAt(start) !== 0x5b /* [ */) return false
    if (state.src.charCodeAt(start + 1) !== 0x5e /* ^ */) return false

    const close = state.src.indexOf(']', start + 2)
    if (close < 0) return false
    const label = state.src.slice(start + 2, close)
    if (!label || /\s/.test(label)) return false

    if (!silent) {
      const token = state.push('footnote_ref', '', 0)
      token.content = label
      token.meta = { label }
    }
    state.pos = close + 1
    return true
  })

  md.block.ruler.before(
    'reference',
    'footnote_def',
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      const start = state.bMarks[startLine] + state.tShift[startLine]
      const max = state.eMarks[startLine]
      const line = state.src.slice(start, max)
      const match = /^\[\^([^\]\s]+)\]:\s*(.*)$/.exec(line)
      if (!match) return false
      if (silent) return true

      const [, label, first] = match
      const body = [first]
      let lastLine = startLine

      // Indented lines continue the note.
      while (lastLine + 1 < endLine) {
        const next = state.bMarks[lastLine + 1] + state.tShift[lastLine + 1]
        const text = state.src.slice(next, state.eMarks[lastLine + 1])
        if (!/^\s{2,}\S/.test(state.src.slice(state.bMarks[lastLine + 1], state.eMarks[lastLine + 1]))) {
          if (!text.trim()) break
        }
        if (!/^\s{2,}/.test(state.src.slice(state.bMarks[lastLine + 1], next))) break
        body.push(text.trim())
        lastLine += 1
      }

      const env = state.env as { footnotes?: { label: string; text: string }[] }
      env.footnotes = env.footnotes ?? []
      env.footnotes.push({ label, text: body.join(' ') })

      state.line = lastLine + 1
      return true
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] }
  )

  md.renderer.rules['footnote_ref'] = (tokens, index): string => {
    const label = tokens[index].meta?.['label'] ?? tokens[index].content
    return `<sup class="footnote-ref"><a href="#fn-${escapeHtml(String(label))}">${escapeHtml(String(label))}</a></sup>`
  }

  // The collected notes belong at the end of the document, not where they were
  // written, so the section is appended once rendering is done.
  md.core.ruler.push('footnote_tail', (state) => {
    const env = state.env as { footnotes?: { label: string; text: string }[] }
    if (!env.footnotes?.length) return
    const items = env.footnotes
      .map(
        (note) =>
          `<li id="fn-${escapeHtml(note.label)}"><span class="footnote-label">${escapeHtml(note.label)}</span> ${escapeHtml(note.text)}</li>`
      )
      .join('')
    state.tokens.push(
      Object.assign(new state.Token('html_block', '', 0), {
        content: `<section class="footnotes"><ol>${items}</ol></section>`,
        block: true
      })
    )
  })
}

function definitionListPlugin(md: MarkdownItInstance): void {
  md.block.ruler.before(
    'paragraph',
    'deflist',
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      if (startLine + 1 >= endLine) return false
      const start = state.bMarks[startLine] + state.tShift[startLine]
      const term = state.src.slice(start, state.eMarks[startLine]).trim()
      if (!term || /^[:#>`-]/.test(term)) return false

      const nextStart = state.bMarks[startLine + 1] + state.tShift[startLine + 1]
      if (!/^:\s+\S/.test(state.src.slice(nextStart, state.eMarks[startLine + 1]))) return false
      if (silent) return true

      const token = state.push('deflist_open', 'dl', 1)
      token.block = true
      let line = startLine
      let open = false

      while (line < endLine) {
        const from = state.bMarks[line] + state.tShift[line]
        const text = state.src.slice(from, state.eMarks[line]).trim()
        if (/^:\s+/.test(text)) {
          if (!open) {
            state.push('deflist_dd_open', 'dd', 1).block = true
            open = true
          } else {
            state.push('deflist_dd_close', 'dd', -1).block = true
            state.push('deflist_dd_open', 'dd', 1).block = true
          }
          const inline = state.push('inline', '', 0)
          inline.content = text.replace(/^:\s+/, '')
          inline.map = [line, line + 1]
          inline.children = []
        } else {
          if (open) {
            state.push('deflist_dd_close', 'dd', -1).block = true
            open = false
          }
          state.push('deflist_dt_open', 'dt', 1).block = true
          const inline = state.push('inline', '', 0)
          inline.content = text
          inline.map = [line, line + 1]
          inline.children = []
          state.push('deflist_dt_close', 'dt', -1).block = true
        }
        line += 1
      }

      if (open) state.push('deflist_dd_close', 'dd', -1).block = true
      state.push('deflist_close', 'dl', -1).block = true
      state.line = line
      return true
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] }
  )
}

function frontMatterPlugin(md: MarkdownItInstance): void {
  md.block.ruler.before(
    'hr',
    'front_matter',
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      if (startLine !== 0) return false
      const first = state.src.slice(state.bMarks[0] + state.tShift[0], state.eMarks[0]).trim()
      if (first !== '---') return false

      let last = 1
      while (last < endLine) {
        const text = state.src.slice(state.bMarks[last] + state.tShift[last], state.eMarks[last]).trim()
        if (text === '---' || text === '...') break
        last += 1
      }
      if (last >= endLine) return false
      if (silent) return true

      const token = state.push('front_matter', 'div', 0)
      token.block = true
      token.content = state.src
        .split('\n')
        .slice(1, last)
        .join('\n')
      token.map = [0, last + 1]
      state.line = last + 1
      return true
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] }
  )

  md.renderer.rules['front_matter'] = (tokens, index): string =>
    `<pre class="front-matter">${escapeHtml(tokens[index].content)}</pre>\n`
}

markdownRenderer.use(mathPlugin)
markdownRenderer.use(footnotePlugin)
markdownRenderer.use(definitionListPlugin)
markdownRenderer.use(frontMatterPlugin)
for (const [name, marker, tag, className, doubled] of [
  ['mark', '=', 'mark', undefined, true],
  ['sup', '^', 'sup', undefined, false],
  ['sub', '~', 'sub', undefined, false]
] as const) {
  spanRule(markdownRenderer, { name, marker, tag, className, doubled })
}

export function renderMarkdownToHtml(markdown: string): string {
  return sanitizeHtml(markdownRenderer.render(markdown))
}

export function parseMarkdown(markdown: string): MdToken[] {
  return markdownRenderer.parse(markdown, {}) as unknown as MdToken[]
}

/** Strips a Markdown file name down to the stem used for export defaults. */
export function documentTitle(filePath: string | null): string {
  if (!filePath) return 'untitled'
  const base = filePath.split(/[\\/]/).pop() ?? 'untitled'
  return base.replace(/\.(md|markdown|mdx|txt)$/i, '') || 'untitled'
}
