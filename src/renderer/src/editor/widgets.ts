import { EditorView, WidgetType } from '@codemirror/view'
import katex from 'katex'
import { sanitizeHtml } from '../lib/html'
import { renderMarkdownToHtml } from '../lib/markdown'
import { resolveSrc } from '../lib/paths'

/** What a widget needs from the world outside the document. */
export interface EditorContext {
  copy: string
  copied: string
  edit: string
  plain: string
  /** Directory of the open document, as a URL, for relative image sources. */
  baseUrl: string
  /** Dim every block but the one holding the caret. */
  focus: boolean
}

/**
 * A block of raw HTML, rendered. Clicking it puts the caret back on the source,
 * which is the only way to reach lines that have been replaced by a widget.
 */
export class HtmlWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly pos: number
  ) {
    super()
  }

  eq(other: HtmlWidget): boolean {
    return other.html === this.html && other.pos === this.pos
  }

  toDOM(view: EditorView): HTMLElement {
    const host = document.createElement('div')
    host.className = 'cm-md-html-block'
    host.innerHTML = sanitizeHtml(this.html)
    host.addEventListener('mousedown', (event) => {
      if ((event.target as HTMLElement).closest('a')) return
      event.preventDefault()
      view.dispatch({ selection: { anchor: this.pos }, scrollIntoView: true })
      view.focus()
    })
    return host
  }
}

/**
 * Stands in for the opening ``` line of a fenced block: the language on the
 * left, a copy button on the right. Clicking the label puts the caret back on
 * the fence so the language can be typed, which is the only way to reach a
 * line whose source is hidden.
 */
export class CodeFenceWidget extends WidgetType {
  constructor(
    readonly language: string,
    readonly code: string,
    readonly pos: number,
    readonly labels: EditorContext
  ) {
    super()
  }

  eq(other: CodeFenceWidget): boolean {
    return (
      other.language === this.language &&
      other.code === this.code &&
      other.pos === this.pos &&
      other.labels.copy === this.labels.copy
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const host = document.createElement('span')
    host.className = 'cm-md-fence'

    const name = document.createElement('button')
    name.type = 'button'
    name.className = 'cm-md-fence__name'
    name.textContent = this.language || this.labels.plain
    name.title = this.labels.edit
    name.tabIndex = -1
    name.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      view.dispatch({ selection: { anchor: this.pos }, scrollIntoView: true })
      view.focus()
    })

    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'cm-md-fence__copy'
    copy.textContent = this.labels.copy
    copy.tabIndex = -1

    let reset: number | null = null
    copy.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      window.api.copyText(this.code)
      copy.textContent = this.labels.copied
      if (reset !== null) window.clearTimeout(reset)
      reset = window.setTimeout(() => {
        copy.textContent = this.labels.copy
      }, 1400)
    })

    host.append(name, copy)
    return host
  }
}

/** A list bullet, so `-` reads as a bullet rather than as punctuation. */
export class BulletWidget extends WidgetType {
  constructor(readonly depth: number) {
    super()
  }

  eq(other: BulletWidget): boolean {
    return other.depth === this.depth
  }

  toDOM(): HTMLElement {
    const host = document.createElement('span')
    host.className = `cm-md-bullet cm-md-bullet--${this.depth % 3}`
    host.textContent = this.depth % 3 === 2 ? '▪' : this.depth % 3 === 1 ? '◦' : '•'
    return host
  }
}

/**
 * Renders a LaTeX expression with KaTeX in place of its `$…$` delimiters.
 * `block` switches between inline flow and a centred display formula.
 */
export class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly block: boolean
  ) {
    super()
  }

  eq(other: MathWidget): boolean {
    return other.tex === this.tex && other.block === this.block
  }

  toDOM(): HTMLElement {
    const host = document.createElement('span')
    host.className = this.block ? 'cm-md-math cm-md-math-block' : 'cm-md-math cm-md-math-inline'
    try {
      katex.render(this.tex, host, {
        displayMode: this.block,
        throwOnError: false,
        strict: false,
        trust: false
      })
    } catch {
      host.textContent = this.tex
      host.classList.add('cm-md-math-error')
    }
    return host
  }

  ignoreEvent(): boolean {
    return false
  }
}

/** Draws `![alt](src)` as the image itself once the line loses the cursor. */
export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly baseUrl: string
  ) {
    super()
  }

  eq(other: ImageWidget): boolean {
    return (
      other.src === this.src && other.alt === this.alt && other.baseUrl === this.baseUrl
    )
  }

  toDOM(): HTMLElement {
    const host = document.createElement('span')
    host.className = 'cm-md-image'

    const img = document.createElement('img')
    // A document that refers to `images/a.png` means it relative to itself.
    img.src = resolveSrc(this.src, this.baseUrl)
    img.alt = this.alt
    img.draggable = false

    const caption = document.createElement('span')
    caption.className = 'cm-md-image-alt'
    caption.textContent = this.alt

    host.append(img)
    if (this.alt) host.append(caption)
    return host
  }
}

/**
 * Renders a GFM table as a real table while the caret is elsewhere. A table is
 * the one block that cannot be simulated with hidden punctuation, so it takes
 * the same route as display math: the source collapses and this widget stands
 * in for it.
 */
export class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super()
  }

  eq(other: TableWidget): boolean {
    return other.source === this.source
  }

  toDOM(): HTMLElement {
    const host = document.createElement('div')
    host.className = 'cm-md-table-block'
    host.innerHTML = renderMarkdownToHtml(this.source)
    return host
  }
}

/** Stands in for a `---` thematic break. */
export class RuleWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const host = document.createElement('span')
    host.className = 'cm-md-hr'
    return host
  }
}

/** A clickable GFM task checkbox that rewrites the `[ ]` marker in the source. */
export class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number
  ) {
    super()
  }

  eq(other: TaskWidget): boolean {
    return other.checked === this.checked && other.pos === this.pos
  }

  toDOM(view: EditorView): HTMLElement {
    const host = document.createElement('span')
    host.className = `cm-md-task${this.checked ? ' is-checked' : ''}`
    host.setAttribute('role', 'checkbox')
    host.setAttribute('aria-checked', String(this.checked))
    host.tabIndex = 0

    const toggle = (event: Event): void => {
      event.preventDefault()
      const marker = this.checked ? '[ ]' : '[x]'
      view.dispatch({ changes: { from: this.pos, to: this.pos + 3, insert: marker } })
    }

    host.addEventListener('mousedown', toggle)
    host.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') toggle(event)
    })
    return host
  }
}
