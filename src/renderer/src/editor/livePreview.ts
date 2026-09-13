import { syntaxTree } from '@codemirror/language'
import { Facet, type EditorState, type Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import {
  BulletWidget,
  CodeFenceWidget,
  HtmlWidget,
  ImageWidget,
  MathWidget,
  RuleWidget,
  TableWidget,
  TaskWidget,
  type EditorContext
} from './widgets'

/**
 * What the decoration widgets need from outside the document. Supplied as a
 * facet so the live preview never reaches into React state, and so a language
 * or document change only reconfigures the editor rather than rebuilding it.
 */
export const editorContext = Facet.define<EditorContext, EditorContext>({
  combine: (values) =>
    values[0] ??
    { copy: 'Copy', copied: 'Copied', edit: 'Edit', plain: 'Plain text', baseUrl: '', focus: false }
})

/**
 * Typora-style live preview.
 *
 * Every line that does *not* hold the cursor is rendered: Markdown punctuation
 * is hidden and the remaining text is styled, so the buffer reads as a finished
 * document. Moving the caret onto a line reveals its raw source. Because this
 * runs as a view plugin it only ever looks at the visible ranges, which keeps
 * typing cheap regardless of document size.
 */

const HIDDEN_PUNCTUATION = new Set([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'CodeInfo',
  'LinkMark',
  'LinkTitle',
  'QuoteMark'
])

/** Heading nodes, used to tighten the gap when a heading introduces a block. */
const HEADING_NODE = /^(ATXHeading[1-6]|SetextHeading[12])$/

/** A fence line that carries nothing but the backticks and an optional language. */
const FENCE_ONLY = /^(`{3,}|~{3,})\S*$/

/** Nodes that are never scanned for `$…$`, so math inside code stays literal. */
const PROTECTED = new Set([
  'InlineCode',
  'FencedCode',
  'CodeBlock',
  'CodeText',
  'CodeInfo',
  'URL',
  'HTMLBlock',
  'HTMLTag',
  'Comment',
  'LinkTitle'
])

const LINE_CLASS: Record<string, string> = {
  ATXHeading1: 'cm-md-h1',
  ATXHeading2: 'cm-md-h2',
  ATXHeading3: 'cm-md-h3',
  ATXHeading4: 'cm-md-h4',
  ATXHeading5: 'cm-md-h5',
  ATXHeading6: 'cm-md-h6',
  SetextHeading1: 'cm-md-h1',
  SetextHeading2: 'cm-md-h2',
  Blockquote: 'cm-md-quote',
  FencedCode: 'cm-md-codeblock',
  CodeBlock: 'cm-md-codeblock',
  Table: 'cm-md-table',
  TableHeader: 'cm-md-thead'
}

const MARK_CLASS: Record<string, string> = {
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-em',
  Strikethrough: 'cm-md-strike',
  InlineCode: 'cm-md-code'
}

const BULLET_MARK = /^[-*+]$/

const HIDE = Decoration.replace({})

interface MathRange {
  from: number
  to: number
  tex: string
  block: boolean
}

interface PendingReplace {
  from: number
  to: number
  deco: Decoration
}

const MATH_PATTERN = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$(?!\$)([^$\n]+?)\$(?!\$)|\\\(([\s\S]+?)\\\)/g

/**
 * Syntax the Markdown grammar has no node for, so it is scanned out of the text
 * the way math is: highlight, super/subscript and footnote references.
 */
const EXTENDED_PATTERN =
  /==(?=\S)([^=\n]*?\S)==|\^(?=\S)([^\^\n]*?\S)\^|(?<!~)~(?=\S)([^~\n]*?\S)~(?!~)|\[\^([^\]\s]+)\]/g

/** `[^note]: text` — the definition half of a footnote. */
const FOOTNOTE_DEF = /^\[\^[^\]\s]+\]:/

interface ExtendedSpan {
  from: number
  to: number
  /** Characters of marker before the content. */
  pad: number
  /** Characters of marker after it, when the two differ (`[^1]`). */
  endPad?: number
  className: string
}

function collectExtended(
  state: EditorState,
  from: number,
  to: number,
  protectedRanges: readonly { from: number; to: number }[],
  out: ExtendedSpan[]
): void {
  const text = state.doc.sliceString(from, to)
  if (!text.includes('=') && !text.includes('^') && !text.includes('~') && !text.includes('[^')) {
    return
  }
  EXTENDED_PATTERN.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = EXTENDED_PATTERN.exec(text)) !== null) {
    const start = from + match.index
    const end = start + match[0].length
    if (protectedRanges.some((range) => start < range.to && end > range.from)) continue

    if (match[4] !== undefined) {
      // `[^label]` renders as a superscript marker: `[^` opens it and `]` closes
      // it, so the two ends are not the same width.
      out.push({ from: start, to: end, pad: 2, endPad: 1, className: 'cm-md-fnref' })
      continue
    }

    const className = match[1] !== undefined ? 'cm-md-mark' : match[2] !== undefined ? 'cm-md-sup' : 'cm-md-sub'
    const pad = match[1] !== undefined ? 2 : 1
    if (end - start <= pad * 2) continue
    out.push({ from: start, to: end, pad, className })
  }
}

function insideListItem(node: SyntaxNode): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.name === 'ListItem') return true
  }
  return false
}

/** How deeply a list marker is nested, so bullets can change shape per level. */
function listLevel(node: SyntaxNode): number {
  let depth = 0
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.name === 'ListItem') depth += 1
  }
  return Math.max(0, depth - 1)
}

/** Reads `![alt](src "title")` into its parts. */
function parseImage(state: EditorState, node: SyntaxNode): { src: string; alt: string } | null {
  const text = state.doc.sliceString(node.from, node.to)
  const match = /^!\[([^\]]*)\]\(\s*<?([^\s>)]+)>?(?:\s+["'][^"']*["'])?\s*\)$/.exec(text)
  if (!match) return null
  return { alt: match[1], src: match[2] }
}

/** Collects `$…$`, `$$…$$`, `\(…\)` and `\[…\]` that are not inside code. */
function collectMath(
  state: EditorState,
  from: number,
  to: number,
  protectedRanges: readonly { from: number; to: number }[],
  out: MathRange[]
): void {
  const text = state.doc.sliceString(from, to)
  if (!text.includes('$') && !text.includes('\\')) {
    return
  }
  MATH_PATTERN.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = MATH_PATTERN.exec(text)) !== null) {
    const start = from + match.index
    const end = start + match[0].length
    const tex = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? '').trim()
    const block = match[1] !== undefined || match[2] !== undefined
    if (!tex) continue
    if (protectedRanges.some((range) => start < range.to && end > range.from)) continue
    out.push({ from: start, to: end, tex, block })
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view
  const doc = state.doc
  const context = state.facet(editorContext)

  // The line holding the caret shows its Markdown; every other line renders.
  // Clicking a line is therefore how you choose to edit its source.
  const activeLines = new Set<number>()
  for (const range of state.selection.ranges) {
    const first = doc.lineAt(range.from).number
    const last = doc.lineAt(range.to).number
    for (let n = first; n <= last; n++) {
      activeLines.add(n)
    }
  }

  const marks: Range<Decoration>[] = []
  const lines: Range<Decoration>[] = []
  const replaces: PendingReplace[] = []
  const protectedRanges: { from: number; to: number }[] = []
  const seenLineClasses = new Set<string>()

  const addLineClass = (lineNumber: number, className: string): void => {
    const key = `${lineNumber}|${className}`
    if (seenLineClasses.has(key)) return
    seenLineClasses.add(key)
    lines.push(Decoration.line({ class: className }).range(doc.line(lineNumber).from))
  }

  const pushReplace = (from: number, to: number, deco: Decoration): void => {
    if (to <= from) return
    // A replace decoration must never span a line break when a plugin supplies it.
    if (doc.lineAt(from).number !== doc.lineAt(to).number) return
    replaces.push({ from, to, deco })
  }

  const pushMark = (from: number, to: number, className: string): void => {
    if (to <= from) return
    marks.push(Decoration.mark({ class: className }).range(from, to))
  }

  const isActive = (pos: number): boolean => activeLines.has(doc.lineAt(pos).number)

  // The caret's own lines are marked so the swap from rendered text to Markdown
  // can be animated rather than snapping.
  for (const line of activeLines) addLineClass(line, 'cm-md-source')

  // Spacing above a block belongs to the block, the way collapsed margins work
  // in the exported page — and a heading's own block sits closer to it.
  const addBlockGap = (node: SyntaxNode, lineNumber: number): void => {
    const previous = node.prevSibling
    addLineClass(
      lineNumber,
      previous && HEADING_NODE.test(previous.name) ? 'cm-md-after-heading' : 'cm-md-block-start'
    )
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name

        if (PROTECTED.has(name)) {
          protectedRanges.push({ from: node.from, to: node.to })
        }

        const lineClass = LINE_CLASS[name]
        if (lineClass) {
          const first = doc.lineAt(node.from).number
          const last = doc.lineAt(Math.max(node.from, node.to - 1)).number
          for (let n = first; n <= last; n++) addLineClass(n, lineClass)
        }

        // Breathing room above every block, the way a rendered document reads.
        // List items stay tight so a list reads as one unit.
        if (name === 'Paragraph' || name === 'BulletList' || name === 'OrderedList') {
          const start = doc.lineAt(node.from)
          const inList = insideListItem(node.node)
          if (node.from === start.from && !inList) {
            addBlockGap(node.node, start.number)
          }
          // A wrapped line inside a list item hangs under the item's text
          // instead of running back under the bullet.
          if (name === 'Paragraph' && inList) {
            const last = doc.lineAt(Math.max(node.from, node.to - 1)).number
            for (let n = start.number + 1; n <= last; n++) addLineClass(n, 'cm-md-list-cont')
          }
        }

        if (name === 'ListItem') {
          addLineClass(doc.lineAt(node.from).number, 'cm-md-listitem')
        }

        // A fenced block's opening ``` becomes a header bar carrying the
        // language and a copy button; the closing fence collapses out of the
        // flow, leaving the shaded code between them.
        if (name === 'FencedCode') {
          const first = doc.lineAt(node.from).number
          const last = doc.lineAt(Math.max(node.from, node.to - 1)).number
          const opening = doc.line(first)
          const closing = last > first ? doc.line(last) : null

          if (!activeLines.has(first) && FENCE_ONLY.test(opening.text.trim())) {
            const language = opening.text.trim().replace(/^[`~]+/, '').trim()
            const from = opening.to + 1
            const to = closing ? closing.from - 1 : node.to
            pushReplace(
              node.from,
              opening.to,
              Decoration.replace({
                widget: new CodeFenceWidget(
                  language,
                  from <= to ? doc.sliceString(from, to) : '',
                  node.from,
                  context
                )
              })
            )
            addLineClass(first, 'cm-md-codehead')
            addBlockGap(node.node, first)
          }

          if (closing && FENCE_ONLY.test(closing.text.trim()) && !activeLines.has(last)) {
            addLineClass(last, 'cm-md-collapsed')
            // An empty block has no code line to close, so the header closes it.
            addLineClass(last - 1 > first ? last - 1 : first, 'cm-md-codeend')
          }

          // Nothing inside the fence needs decorating: the header replaces the
          // opening line wholesale, and the code is coloured by the highlight
          // style. Descending would also let the fence's own CodeMark
          // replacements collide with the header widget.
          return false
        }

        // A table renders as a real table until the caret enters it, at which
        // point the raw pipe syntax comes back for editing.
        if (name === 'Table') {
          const first = doc.lineAt(node.from).number
          const last = doc.lineAt(Math.max(node.from, node.to - 1)).number

          let onActiveLine = first === last
          for (let n = first; n <= last && !onActiveLine; n++) {
            if (activeLines.has(n)) onActiveLine = true
          }

          if (!onActiveLine) {
            const openingLine = doc.line(first)
            pushReplace(
              node.from,
              openingLine.to,
              Decoration.replace({
                widget: new TableWidget(doc.sliceString(node.from, node.to))
              })
            )
            for (let n = first + 1; n <= last; n++) {
              const line = doc.line(n)
              pushReplace(line.from, line.to, HIDE)
              addLineClass(n, 'cm-md-collapsed')
            }
            addLineClass(first, 'cm-md-table-anchor')
            addBlockGap(node.node, first)
          }
          return false
        }

        if (name === 'Image') {
          if (!isActive(node.from)) {
            const parsed = parseImage(state, node.node)
            if (parsed) {
              pushReplace(
                node.from,
                node.to,
                Decoration.replace({
                  widget: new ImageWidget(parsed.src, parsed.alt, context.baseUrl)
                })
              )
            }
          }
          return false
        }

        // A raw HTML block renders as itself; stepping into it brings the
        // source back, the way every other block in this editor behaves.
        if (name === 'HTMLBlock') {
          if (!isActive(node.from)) {
            const first = doc.lineAt(node.from).number
            const last = doc.lineAt(Math.max(node.from, node.to - 1)).number
            const opening = doc.line(first)
            pushReplace(
              node.from,
              opening.to,
              Decoration.replace({
                widget: new HtmlWidget(doc.sliceString(node.from, node.to), node.from)
              })
            )
            for (let n = first + 1; n <= last; n++) {
              const line = doc.line(n)
              pushReplace(line.from, line.to, HIDE)
              addLineClass(n, 'cm-md-collapsed')
            }
            addLineClass(first, 'cm-md-html-anchor')
            addBlockGap(node.node, first)
          }
          return false
        }

        if (name === 'HorizontalRule') {
          if (!isActive(node.from)) {
            pushReplace(node.from, node.to, Decoration.replace({ widget: new RuleWidget() }))
          }
          return false
        }

        if (name === 'TaskMarker') {
          if (!isActive(node.from)) {
            const checked = doc.sliceString(node.from, node.to).toLowerCase().includes('x')
            pushReplace(
              node.from,
              node.to,
              Decoration.replace({ widget: new TaskWidget(checked, node.from) })
            )

            // The bullet carries no meaning next to a checkbox, so it goes.
            for (let parent = node.node.parent; parent; parent = parent.parent) {
              if (parent.name !== 'ListItem') continue
              for (const mark of parent.getChildren('ListMark')) {
                if (isActive(mark.from)) continue
                let end = mark.to
                while (end < doc.length && doc.sliceString(end, end + 1) === ' ') end += 1
                pushReplace(mark.from, end, HIDE)
              }
              break
            }
          }
          return false
        }

        if (name === 'Link') {
          // Only the label is styled; the destination is hidden punctuation.
          const openParen = node.node
            .getChildren('LinkMark')
            .find((mark) => doc.sliceString(mark.from, mark.to) === '(')
          pushMark(node.from, openParen ? openParen.from : node.to, 'cm-md-link')
          return
        }

        if (name === 'URL') {
          // Bare and autolinked URLs keep their text; only link targets vanish.
          if (node.node.parent?.name === 'Link' && !isActive(node.from)) {
            pushReplace(node.from, node.to, HIDE)
          }
          return
        }

        if (name === 'ListMark') {
          const raw = doc.sliceString(node.from, node.to)
          // A task item's marker belongs to its checkbox, not to a bullet.
          const isTask = /^\s*\[[ xX]\]/.test(doc.sliceString(node.to, Math.min(doc.length, node.to + 6)))
          if (isTask) return false
          if (BULLET_MARK.test(raw.trim()) && !isActive(node.from)) {
            // The dash is replaced by a real bullet, taking its trailing spaces
            // with it so the text keeps its place.
            let end = node.to
            while (end < doc.length && doc.sliceString(end, end + 1) === ' ') end += 1
            pushReplace(
              node.from,
              end,
              Decoration.replace({ widget: new BulletWidget(listLevel(node.node)) })
            )
          } else {
            pushMark(node.from, node.to, 'cm-md-ordinal')
          }
          return false
        }

        const markClass = MARK_CLASS[name]
        if (markClass) pushMark(node.from, node.to, markClass)

        if (HIDDEN_PUNCTUATION.has(name) && !isActive(node.from)) {
          // `#` and `>` are followed by a space that belongs to the marker, not
          // to the text; leaving it behind would indent every rendered heading.
          let end = node.to
          if (name === 'HeaderMark' || name === 'QuoteMark') {
            while (end < doc.length && doc.sliceString(end, end + 1) === ' ') end += 1
          }
          pushReplace(node.from, end, HIDE)
        }
      }
    })
  }

  // Math is scanned from the text rather than the syntax tree, since the
  // Markdown grammar has no notion of LaTeX.
  const mathRanges: MathRange[] = []
  for (const { from, to } of view.visibleRanges) {
    let end = to
    // An odd number of `$$` means a display block runs past the viewport.
    const delimiters = state.doc.sliceString(from, to).match(/\$\$/g)?.length ?? 0
    if (delimiters % 2 === 1) end = doc.length
    collectMath(state, from, end, protectedRanges, mathRanges)
  }

  for (const math of mathRanges) {
    const first = doc.lineAt(math.from).number
    const last = doc.lineAt(Math.max(math.from, math.to - 1)).number

    let onActiveLine = false
    for (let n = first; n <= last; n++) {
      if (activeLines.has(n)) {
        onActiveLine = true
        break
      }
    }
    if (onActiveLine) continue

    if (first === last) {
      pushReplace(
        math.from,
        math.to,
        Decoration.replace({ widget: new MathWidget(math.tex, math.block) })
      )
      continue
    }

    // Multi-line display math: the formula rides on the opening line and the
    // remaining source lines are emptied and collapsed out of the flow.
    const openingLine = doc.line(first)
    pushReplace(
      math.from,
      openingLine.to,
      Decoration.replace({ widget: new MathWidget(math.tex, true) })
    )
    addLineClass(first, 'cm-md-math-anchor')
    for (let n = first + 1; n <= last; n++) {
      const line = doc.line(n)
      pushReplace(line.from, n === last ? math.to : line.to, HIDE)
      addLineClass(n, 'cm-md-collapsed')
    }
  }

  // Extended inline syntax is scanned from the text, like math, because the
  // Markdown grammar has no node for it.
  const extended: ExtendedSpan[] = []
  for (const { from, to } of view.visibleRanges) {
    collectExtended(state, from, to, protectedRanges, extended)
  }

  for (const span of extended) {
    const line = doc.lineAt(span.from)
    if (doc.lineAt(Math.max(span.from, span.to - 1)).number !== line.number) continue
    if (activeLines.has(line.number)) continue
    // The marker on a footnote's own definition line is its label, not a
    // reference to itself.
    if (span.className === 'cm-md-fnref' && FOOTNOTE_DEF.test(line.text)) continue

    const endPad = span.endPad ?? span.pad
    pushReplace(span.from, span.from + span.pad, HIDE)
    pushReplace(span.to - endPad, span.to, HIDE)
    pushMark(span.from + span.pad, span.to - endPad, span.className)
  }

  // Focus mode: the block being edited keeps full ink, everything else recedes.
  if (context.focus) {
    const head = state.selection.main.head
    let block = syntaxTree(state).resolveInner(head, -1)
    while (block.parent && block.parent.name !== 'Document') block = block.parent
    const first = doc.lineAt(block.from).number
    const last = doc.lineAt(Math.max(block.from, block.to - 1)).number

    for (const range of view.visibleRanges) {
      const from = doc.lineAt(range.from).number
      const to = doc.lineAt(Math.min(range.to, doc.length)).number
      for (let n = from; n <= to; n += 1) {
        if (n < first || n > last) addLineClass(n, 'cm-md-dim')
      }
    }
  }

  // Front matter is metadata, not prose: it stays visible but recedes.
  if (doc.line(1).text.trim() === '---') {
    const firstVisible = view.visibleRanges[0] ? doc.lineAt(view.visibleRanges[0].from).number : 1
    if (firstVisible <= 400) {
      let last = 0
      for (let n = 2; n <= Math.min(doc.lines, 400); n += 1) {
        const text = doc.line(n).text.trim()
        if (text === '---' || text === '...') {
          last = n
          break
        }
      }
      if (last > 0) {
        const lastVisible = view.visibleRanges[view.visibleRanges.length - 1]
          ? doc.lineAt(view.visibleRanges[view.visibleRanges.length - 1].to).number
          : doc.lines
        const start = Math.max(1, firstVisible)
        const end = Math.min(last, lastVisible)
        for (let n = start; n <= end; n += 1) addLineClass(n, 'cm-md-frontmatter')
      }
    }
  }

  // A footnote definition reads as a note, not as a paragraph.
  for (const { from, to } of view.visibleRanges) {
    const text = doc.sliceString(from, to)
    if (!text.includes('[^')) continue
    const firstLine = doc.lineAt(from).number
    const lastLine = doc.lineAt(Math.min(to, doc.length)).number
    for (let n = firstLine; n <= lastLine; n += 1) {
      if (FOOTNOTE_DEF.test(doc.line(n).text)) addLineClass(n, 'cm-md-fn-def')
    }
  }

  // Drop any replace that overlaps an earlier one; the CodeMirror range set
  // rejects overlapping replacements outright.
  replaces.sort((a, b) => a.from - b.from || a.to - b.to)
  const accepted: Range<Decoration>[] = []
  let covered = -1
  for (const item of replaces) {
    if (item.from < covered) continue
    covered = item.to
    accepted.push(item.deco.range(item.from, item.to))
  }

  return Decoration.set([...lines, ...marks, ...accepted], true)
}

function getActiveLines(state: EditorState): Set<number> {
  const activeLines = new Set<number>()
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let n = first; n <= last; n++) {
      activeLines.add(n)
    }
  }
  return activeLines
}

function areLineSetsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) {
    if (!b.has(item)) return false
  }
  return true
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    lastActiveLines: Set<number>

    constructor(view: EditorView) {
      this.lastActiveLines = getActiveLines(view.state)
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate): void {
      const activeChanged = update.selectionSet
        ? !areLineSetsEqual(getActiveLines(update.state), this.lastActiveLines)
        : false

      if (
        update.docChanged ||
        update.viewportChanged ||
        activeChanged ||
        update.focusChanged ||
        // The parser finishes after the keystroke that fed it, so a line can
        // briefly be decorated from the tree as it was before the mark was
        // typed. Rebuilding when the tree moves on settles it at once instead.
        syntaxTree(update.state) !== syntaxTree(update.startState) ||
        // A new document directory changes how every image resolves.
        update.startState.facet(editorContext) !== update.state.facet(editorContext)
      ) {
        this.lastActiveLines = getActiveLines(update.state)
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations
  }
)
