import { HighlightStyle } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

/**
 * Sizing lives on line classes in `editor.css` so that live preview can scale a
 * whole heading line. The highlight style only handles colour and weight, which
 * keeps it from fighting those rules.
 *
 * Fenced code is parsed by the language named after the fence, so the code tags
 * below are what actually colour it — no separate tokeniser runs. Every colour
 * is a theme token, which is why the same highlight style serves every preset.
 */
export const markdownHighlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700' },
  { tag: t.heading2, fontWeight: '680' },
  { tag: t.heading3, fontWeight: '660' },
  { tag: t.heading4, fontWeight: '640' },
  { tag: t.heading5, fontWeight: '620' },
  { tag: t.heading6, fontWeight: '620' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.url, color: 'var(--ink-faint)' },
  { tag: t.monospace, color: 'var(--code-ink)' },
  { tag: t.list, color: 'var(--ink-faint)' },
  { tag: t.quote, color: 'var(--ink-soft)' },
  { tag: t.contentSeparator, color: 'var(--ink-faint)' },
  { tag: t.processingInstruction, color: 'var(--ink-faint)' },
  { tag: t.labelName, color: 'var(--ink-soft)' },
  { tag: t.escape, color: 'var(--code-ink)' },
  { tag: t.character, color: 'var(--code-ink)' },
  { tag: t.invalid, color: 'var(--danger)' },

  // --- code syntax --------------------------------------------------------
  {
    tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.moduleKeyword, t.definitionKeyword],
    color: 'var(--code-keyword)'
  },
  { tag: [t.string, t.special(t.string), t.regexp, t.character], color: 'var(--code-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--code-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--code-comment)', fontStyle: 'italic' },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName],
    color: 'var(--code-function)'
  },
  { tag: [t.typeName, t.className, t.namespace, t.tagName, t.standard(t.tagName)], color: 'var(--code-type)' },
  {
    tag: [t.variableName, t.propertyName, t.attributeName, t.definition(t.variableName)],
    color: 'var(--code-variable)'
  },
  { tag: [t.meta, t.annotation, t.self], color: 'var(--code-meta)' },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator, t.derefOperator], color: 'var(--ink-soft)' }
])

export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    position: 'relative',
    backgroundColor: 'transparent',
    color: 'var(--ink)',
    fontSize: 'var(--editor-size)'
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-editor)',
    lineHeight: 'var(--editor-line-height)',
    padding: '26px 0 40vh'
  },
  '.cm-content': {
    maxWidth: 'calc(var(--measure) + 2 * var(--page-padding))',
    margin: '0 auto',
    padding: '0 var(--page-padding)',
    caretColor: 'var(--accent)'
  },
  '.cm-line': {
    padding: '0'
  },
  '&.cm-focused': {
    outline: 'none'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeft: '1.5px solid var(--accent)',
    borderRadius: '1px',
    marginLeft: '-0.5px'
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--selection)'
  },
  // The find and replace UI is drawn by the renderer, so CodeMirror's own panel
  // container only ever needs to exist, never to be seen.
  '.cm-panels': {
    display: 'none'
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--match)',
    borderRadius: '2px'
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--match-active)'
  },
  '.cm-selectionMatch': {
    backgroundColor: 'var(--match)'
  },
  '.cm-tooltip': {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--surface)',
    boxShadow: 'var(--shadow-md)',
    fontFamily: 'var(--font-ui)'
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--accent-ink)'
  }
})
