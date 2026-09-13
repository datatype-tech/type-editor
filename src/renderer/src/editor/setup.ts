import { autocompletion } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { bracketMatching, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
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
 * Everything that stays constant for the life of the editor. Live preview,
 * indentation and interface copy are added through compartments by
 * `EditorPane`, so changing a setting never tears the view down.
 */
export const compartments = {
  preview: new Compartment(),
  tabSize: new Compartment(),
  strings: new Compartment(),
  typewriter: new Compartment()
}

/**
 * Typewriter scrolling: the caret line stays put in the middle of the window, so
 * the text moves under the writer rather than the writer moving down the page.
 */
export const typewriterScroll = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate): void {
      if (!update.selectionSet && !update.docChanged) return
      const head = update.state.selection.main.head

      // Dispatching has to wait for the update to finish, so it is scheduled
      // through a measure cycle.
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

/**
 * Find and replace is drawn by the renderer, so CodeMirror's own panel is
 * replaced by an empty element that only exists to keep the search state — and
 * with it the match highlighting and the search keymap — switched on.
 */
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

export interface BaseOptions {
  tabSize: number
  placeholder: string
  context: EditorContext
  /** What the preview compartment starts out holding. */
  preview: Extension
  /** Whether the caret line is held in the middle of the window. */
  typewriter: boolean
}

export function createBaseExtensions(options: BaseOptions): Extension[] {
  return [
    history(),
    // A slower blink than the default reads as calm rather than as a tic.
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
    keymap.of([...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
    editorTheme,
    compartments.preview.of(options.preview),
    compartments.typewriter.of(options.typewriter ? typewriterScroll : []),
    compartments.tabSize.of(tabSizeExtension(options.tabSize)),
    compartments.strings.of(
      editorStrings({ placeholder: options.placeholder, context: options.context })
    )
  ]
}
