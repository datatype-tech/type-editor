import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap
} from '@codemirror/autocomplete'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  insertNewlineKeepIndent
} from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { bracketMatching, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorSelection, EditorState, type Extension } from '@codemirror/state'
import {
  drawSelection,
  dropCursor,
  EditorView,
  keymap,
  placeholder,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'
import { editorContext } from './livePreview'
import { editorTheme, markdownHighlight } from './theme'
import type { EditorContext } from './widgets'

/**
 * Custom auto-pairing for block comments: typing * after / inserts * and closes with *\/
 */
const customSymbolPairing = EditorView.inputHandler.of((view, from, to, text) => {
  if (view.state.readOnly) return false

  if (text === '*') {
    const { doc } = view.state
    if (from > 0 && doc.sliceString(from - 1, from) === '/') {
      view.dispatch({
        changes: { from, to, insert: '*  */' },
        selection: EditorSelection.cursor(from + 2),
        userEvent: 'input'
      })
      return true
    }
  }

  if (text === '/') {
    const { doc } = view.state
    if (from > 1 && doc.sliceString(from - 2, from) === '?*') {
      view.dispatch({
        changes: { from, to, insert: '/  */' },
        selection: EditorSelection.cursor(from + 2),
        userEvent: 'input'
      })
      return true
    }
  }

  return false
})

export const compartments = {
  preview: new Compartment(),
  tabSize: new Compartment(),
  strings: new Compartment(),
  typewriter: new Compartment(),
  closeBrackets: new Compartment()
}

export const typewriterScroll = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate): void {
      if (!update.selectionSet && !update.docChanged) return
      const head = update.state.selection.main.head

      update.view.requestMeasure({
        read: () => null,
        write: () => {
          update.view.dispatch({
            effects: EditorView.scrollIntoView(head, { y: 'center' })
          })
        }
      })
    }
  }
)

const headlessSearch = search({
  top: true,
  createPanel: () => ({ dom: document.createElement('div') })
})

export function tabSizeExtension(size: number): Extension {
  return [EditorState.tabSize.of(size), indentUnit.of(' '.repeat(size))]
}

export function editorStrings(options: { placeholder: string; context: EditorContext }): Extension {
  return [placeholder(options.placeholder), editorContext.of(options.context)]
}

export function autoCloseBracketsExtension(enabled: boolean): Extension {
  if (!enabled) return []
  return [
    closeBrackets(),
    keymap.of(closeBracketsKeymap),
    customSymbolPairing
  ]
}

export interface BaseOptions {
  tabSize: number
  placeholder: string
  context: EditorContext
  preview: Extension
  typewriter: boolean
  autoCloseBrackets: boolean
}

export function createBaseExtensions(options: BaseOptions): Extension[] {
  return [
    history(),
    drawSelection({ cursorBlinkRate: 1060 }),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    bracketMatching(),
    autocompletion(),
    highlightSelectionMatches(),
    headlessSearch,
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(markdownHighlight),
    EditorView.lineWrapping,
    keymap.of([
      { key: 'Enter', run: insertNewlineKeepIndent },
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      indentWithTab
    ]),
    editorTheme,
    compartments.preview.of(options.preview),
    compartments.typewriter.of(options.typewriter ? typewriterScroll : []),
    compartments.tabSize.of(tabSizeExtension(options.tabSize)),
    compartments.closeBrackets.of(autoCloseBracketsExtension(options.autoCloseBrackets)),
    compartments.strings.of(
      editorStrings({ placeholder: options.placeholder, context: options.context })
    )
  ]
}
