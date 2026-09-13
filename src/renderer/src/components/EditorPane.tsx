import {
  closeSearchPanel,
  findNext,
  findPrevious,
  openSearchPanel,
  replaceAll,
  replaceNext,
  searchPanelOpen,
  setSearchQuery,
  type SearchQuery
} from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { memo, useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { livePreview } from '../editor/livePreview'
import {
  autoCloseBracketsExtension,
  compartments,
  createBaseExtensions,
  editorStrings,
  tabSizeExtension,
  typewriterScroll
} from '../editor/setup'
import type { EditorContext } from '../editor/widgets'
import { useT } from '../lib/i18n-react'

/** Counting stops here so a common word in a long document stays responsive. */
const MATCH_LIMIT = 2000

export interface EditorHandle {
  /** Replaces the document — used when a file is opened or a session restored. */
  setDocument: (text: string) => void
  focus: () => void
  openFind: () => void
  closeFind: () => void
  getSelection: () => string
  /** Pushes the find bar's query into the editor, which drives the highlights. */
  replaceQuery: (query: SearchQuery) => void
  findNext: () => void
  findPrevious: () => void
  replaceCurrent: () => void
  replaceAllMatches: () => void
  /** Total matches for a query, and which of them the selection sits on. */
  stats: (query: SearchQuery) => { total: number; current: number }
  insertInlineCode: () => void
  insertCodeBlock: (language: string) => void
  /** Drops a snippet in at the caret, on lines of its own. */
  insertSnippet: (text: string) => void
  /** Brings a line into view and puts the caret on it. */
  scrollToLine: (line: number) => void
}

interface EditorPaneProps {
  sourceMode: boolean
  tabSize: number
  typewriter: boolean
  autoCloseBrackets: boolean
  context: EditorContext
  onChange: (text: string) => void
  onCaret: (line: number, column: number) => void
  onFindOpenChange: (open: boolean) => void
  ref?: Ref<EditorHandle>
}

interface InsertHandle {
  line: number
  top: number
  height: number
  left: number
}

function EditorPane({
  sourceMode,
  tabSize,
  typewriter,
  autoCloseBrackets,
  context,
  onChange,
  onCaret,
  onFindOpenChange,
  ref
}: EditorPaneProps) {
  const t = useT()
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  // Loading a document is not an edit, so the change listener has to be able to
  // tell the two apart.
  const loadingRef = useRef(false)
  const [swapping, setSwapping] = useState(false)
  const [handle, setHandle] = useState<InsertHandle | null>(null)
  const handleLineRef = useRef(-1)

  // The view outlives every render, so its listeners read props through refs.
  const refs = useRef({
    onChange,
    onCaret,
    onFindOpenChange,
    context,
    sourceMode,
    tabSize,
    typewriter,
    autoCloseBrackets,
    t
  })
  refs.current = { onChange, onCaret, onFindOpenChange, context, sourceMode, tabSize, typewriter, autoCloseBrackets, t }

  const createState = useCallback((text: string): EditorState => {
    const current = refs.current
    return EditorState.create({
      doc: text,
      extensions: [
        ...createBaseExtensions({
          tabSize: current.tabSize,
          placeholder: current.t('editor.placeholder'),
          context: current.context,
          preview: current.sourceMode ? [] : livePreview,
          typewriter: current.typewriter,
          autoCloseBrackets: current.autoCloseBrackets
        }),
        EditorView.updateListener.of((update) => {
          const live = refs.current
          if (update.docChanged && !loadingRef.current) {
            live.onChange(update.state.doc.toString())
          }

          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head
            const line = update.state.doc.lineAt(head)
            live.onCaret(line.number, head - line.from + 1)
          }

          const wasOpen = searchPanelOpen(update.startState)
          const isOpen = searchPanelOpen(update.state)
          if (wasOpen !== isOpen) live.onFindOpenChange(isOpen)
        })
      ]
    })
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const view = new EditorView({ parent: host, state: createState('') })
    viewRef.current = view
    view.focus()

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [createState])

  // --- the insert handle --------------------------------------------------

  // The handle lives in the margin left of the text column and only wakes up
  // when the pointer is out there, so it never flickers along with the caret or
  // sits on top of the words.
  useEffect(() => {
    const host = hostRef.current
    if (!host || sourceMode) return

    let rafId: number | null = null

    const hide = (): void => {
      if (handleLineRef.current === -1) return
      handleLineRef.current = -1
      setHandle(null)
    }

    const processLocate = (clientX: number, clientY: number): void => {
      const view = viewRef.current
      if (!view) return

      const editorBox = view.dom.getBoundingClientRect()
      const contentBox = view.contentDOM.getBoundingClientRect()
      if (clientX > contentBox.left - 8) return hide()

      const pos = view.posAtCoords({ x: clientX, y: clientY })
      if (pos === null) return hide()

      const line = view.state.doc.lineAt(pos)
      if (line.number === handleLineRef.current) return
      handleLineRef.current = line.number

      const coords = view.coordsAtPos(line.from)
      if (!coords) return hide()

      setHandle({
        line: line.number,
        top: coords.top - editorBox.top,
        height: Math.max(20, coords.bottom - coords.top),
        left: editorBox.right - contentBox.left
      })
    }

    const locate = (event: MouseEvent): void => {
      const { clientX, clientY } = event
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        rafId = null
        processLocate(clientX, clientY)
      })
    }

    const clear = (): void => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      handleLineRef.current = -1
      setHandle(null)
    }

    host.addEventListener('mousemove', locate)
    host.addEventListener('mouseleave', clear)
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
      host.removeEventListener('mousemove', locate)
      host.removeEventListener('mouseleave', clear)
    }
  }, [sourceMode])

  const insertParagraphAbove = (lineNumber: number): void => {
    const view = viewRef.current
    if (!view) return

    const line = view.state.doc.line(lineNumber)
    view.dispatch({
      changes: { from: line.from, insert: '\n' },
      selection: { anchor: line.from },
      scrollIntoView: true,
      userEvent: 'input'
    })
    view.focus()
    handleLineRef.current = -1
    setHandle(null)
  }

  // --- settings ------------------------------------------------------------

  // Every setting that lives inside CodeMirror is re-applied here, so a change
  // in the settings pane never has to rebuild the view.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = refs.current
    view.dispatch({
      effects: [
        compartments.preview.reconfigure(current.sourceMode ? [] : livePreview),
        compartments.tabSize.reconfigure(tabSizeExtension(current.tabSize)),
        compartments.typewriter.reconfigure(current.typewriter ? typewriterScroll : []),
        compartments.closeBrackets.reconfigure(autoCloseBracketsExtension(current.autoCloseBrackets)),
        compartments.strings.reconfigure(
          editorStrings({
            placeholder: current.t('editor.placeholder'),
            context: current.context
          })
        )
      ]
    })
  }, [sourceMode, tabSize, typewriter, autoCloseBrackets, context, t])

  useImperativeHandle(
    ref,
    () => ({
      setDocument(text: string) {
        const view = viewRef.current
        if (!view) return
        if (view.state.doc.toString() === text) {
          view.focus()
          return
        }

        // A new document starts with a clean history and the caret at the top.
        loadingRef.current = true
        view.setState(createState(text))
        loadingRef.current = false
        view.focus()

        // Loading a file rewrites every visible line at once; the fade keeps
        // that from reading as a flash of somebody else's document.
        setSwapping(true)
        window.setTimeout(() => setSwapping(false), 240)
      },

      focus() {
        viewRef.current?.focus()
      },

      openFind() {
        const view = viewRef.current
        if (!view) return
        view.focus()
        openSearchPanel(view)
      },

      closeFind() {
        const view = viewRef.current
        if (view) closeSearchPanel(view)
      },

      getSelection() {
        const view = viewRef.current
        if (!view) return ''
        const { from, to } = view.state.selection.main
        return to > from && to - from < 200 ? view.state.sliceDoc(from, to) : ''
      },

      replaceQuery(query: SearchQuery) {
        viewRef.current?.dispatch({ effects: setSearchQuery.of(query) })
      },

      findNext() {
        const view = viewRef.current
        if (view) findNext(view)
      },

      findPrevious() {
        const view = viewRef.current
        if (view) findPrevious(view)
      },

      replaceCurrent() {
        const view = viewRef.current
        if (view) replaceNext(view)
      },

      replaceAllMatches() {
        const view = viewRef.current
        if (view) replaceAll(view)
      },

      stats(query: SearchQuery) {
        const view = viewRef.current
        if (!view || !query.search || !query.valid) return { total: 0, current: 0 }

        const state = view.state
        const selection = state.selection.main
        let total = 0
        let current = 0
        const cursor = query.getCursor(state)
        let step = cursor.next()
        while (!step.done && total < MATCH_LIMIT) {
          total += 1
          if (step.value.from === selection.from && step.value.to === selection.to) current = total
          step = cursor.next()
        }
        return { total, current }
      },

      scrollToLine(lineNumber: number) {
        const view = viewRef.current
        if (!view) return
        const target = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, lineNumber)))
        view.dispatch({
          selection: { anchor: target.from },
          effects: EditorView.scrollIntoView(target.from, { y: 'start', yMargin: 72 })
        })
        view.focus()
      },

      insertInlineCode() {
        const view = viewRef.current
        if (!view) return
        const { from, to } = view.state.selection.main
        const selected = view.state.sliceDoc(from, to)
        const fence = selected.includes('`') ? '``' : '`'
        view.dispatch({
          changes: { from, to, insert: `${fence}${selected}${fence}` },
          selection: { anchor: from + fence.length, head: from + fence.length + selected.length },
          userEvent: 'input'
        })
        view.focus()
      },

      insertSnippet(text: string) {
        const view = viewRef.current
        if (!view) return
        const { state } = view
        const { from, to } = state.selection.main

        const leading = from > 0 && state.sliceDoc(from - 1, from) !== '\n' ? '\n' : ''
        const trailing = to < state.doc.length && state.sliceDoc(to, to + 1) !== '\n' ? '\n' : ''
        view.dispatch({
          changes: { from, to, insert: `${leading}${text}${trailing}` },
          selection: { anchor: from + leading.length + text.length },
          scrollIntoView: true,
          userEvent: 'input'
        })
        view.focus()
      },

      insertCodeBlock(language: string) {
        const view = viewRef.current
        if (!view) return
        const { state } = view
        const { from, to } = state.selection.main
        const selected = state.sliceDoc(from, to)
        const fence = `\`\`\`${language}`

        // The block has to own its lines, so pad it out where it does not.
        const leading = from > 0 && state.sliceDoc(from - 1, from) !== '\n' ? '\n' : ''
        const trailing = to < state.doc.length && state.sliceDoc(to, to + 1) !== '\n' ? '\n' : ''
        const start = from + leading.length + fence.length + 1

        view.dispatch({
          changes: { from, to, insert: `${leading}${fence}\n${selected}\n\`\`\`${trailing}` },
          selection: { anchor: start, head: start + selected.length },
          scrollIntoView: true,
          userEvent: 'input'
        })
        view.focus()
      }
    }),
    [createState]
  )

  return (
    <div className={`editor-host${swapping ? ' is-swapping' : ''}`} ref={hostRef}>
      {handle && !sourceMode && (
        <button
          type="button"
          className="inserthandle"
          style={{ top: handle.top, height: handle.height, right: handle.left }}
          title={t('editor.insertAbove')}
          aria-label={t('editor.insertAbove')}
          onMouseDown={(event) => {
            event.preventDefault()
            insertParagraphAbove(handle.line)
          }}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M6 1.6v8.8M1.6 6h8.8"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
          <span className="inserthandle__label">{t('editor.insertAbove')}</span>
        </button>
      )}
    </div>
  )
}

export default memo(EditorPane)
