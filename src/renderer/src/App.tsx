import { Check, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MenuCommand } from '@shared/ipc'
import EditorPane, { type EditorHandle } from './components/EditorPane'
import OutlinePane from './components/OutlinePane'
import SearchBar from './components/SearchBar'
import SettingsPane from './components/SettingsPane'
import StatusBar from './components/StatusBar'
import TitleBar from './components/TitleBar'
import Toolbar from './components/Toolbar'
import { markdownToDocx } from './export/docx'
import { markdownToPng } from './export/render'
import { I18nProvider, useT } from './lib/i18n-react'
import { documentTitle } from './lib/markdown'
import { documentOutline, type OutlineEntry } from './lib/outline'
import { baseUrlOf, imageReference } from './lib/paths'
import { ABOUT_DOCUMENT } from './lib/about'
import { isWelcomeDocument, WELCOME_DOCUMENT } from './lib/welcome'
import {
  loadRecent,
  loadSession,
  loadSettings,
  rememberFile,
  saveRecent,
  saveSession,
  saveSettings,
  type RecentFile
} from './lib/store'
import {
  applySettings,
  crossFadeTheme,
  DEFAULT_SETTINGS,
  normalizeSettings,
  type Settings
} from './lib/settings'

type Toast = { id: number; message: string; tone: 'ok' | 'error'; leaving?: boolean }
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Counts words without splitting the document into an array of them, which is
 * the difference between instant and sluggish on a file of a few megabytes.
 */
function countWords(text: string): number {
  if (!text.trim()) return 0
  let words = 1
  const gap = /\s+/g
  while (gap.exec(text) !== null) {
    if (gap.lastIndex >= text.length) break
    words += 1
  }
  return words
}

function fileNameOf(filePath: string | null): string | null {
  if (!filePath) return null
  return filePath.split(/[\\/]/).pop() ?? null
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = normalizeSettings({ ...current, ...patch })
      if (patch.theme && patch.theme !== current.theme) crossFadeTheme()
      return next
    })
  }, [])

  // The theme has to reach the DOM before the first paint, which is why this
  // runs during render rather than in an effect.
  useMemo(() => applySettings(settings), [settings])

  // Settings live in IndexedDB, which is asynchronous; the window is already on
  // screen by the time they arrive, so the shell fades in over them.
  useEffect(() => {
    void loadSettings().then((stored) => {
      if (stored) setSettings(stored)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (ready) saveSettings(settings)
  }, [settings, ready])

  useEffect(() => {
    window.api.setLocale(settings.locale)
    document.documentElement.lang = settings.locale
  }, [settings.locale])

  return (
    <I18nProvider locale={settings.locale}>
      <Workspace settings={settings} updateSettings={updateSettings} />
    </I18nProvider>
  )
}

function Workspace({
  settings,
  updateSettings
}: {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
}) {
  const t = useT()

  const [filePath, setFilePath] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [dirty, setDirty] = useState(false)
  const [sourceMode, setSourceMode] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [caret, setCaret] = useState({ line: 1, column: 1 })
  const [counts, setCounts] = useState({ words: 0, characters: 0 })
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [busy, setBusy] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [paneOpen, setPaneOpen] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [outline, setOutline] = useState<OutlineEntry[]>([])
  const [welcome, setWelcome] = useState(false)
  const [recent, setRecent] = useState<RecentFile[]>([])
  const [revision, setRevision] = useState(0)

  const editorRef = useRef<EditorHandle | null>(null)
  const textRef = useRef('')
  const countTimer = useRef<number | null>(null)
  const toastId = useRef(0)
  const dragDepth = useRef(0)

  // Callbacks that outlive a render read the document through these.
  const docRef = useRef({ filePath, title, dirty })
  docRef.current = { filePath, title, dirty }

  // The find bar is the only part of the shell that has to follow the document
  // on every keystroke; everything else waits for a real state change.
  const findOpenRef = useRef(findOpen)
  findOpenRef.current = findOpen

  const displayTitle = title || fileNameOf(filePath) || t('file.untitled')

  // --- feedback ----------------------------------------------------------

  const pushToast = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    toastId.current += 1
    const id = toastId.current
    setToasts((current) => [...current, { id, message, tone }])

    window.setTimeout(() => {
      setToasts((current) =>
        current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast))
      )
      window.setTimeout(
        () => setToasts((current) => current.filter((toast) => toast.id !== id)),
        220
      )
    }, 2600)
  }, [])

  // --- the document -------------------------------------------------------

  /** Puts a document on screen, whether it came from disk or from a session. */
  const showDocument = useCallback(
    (
      nextPath: string | null,
      content: string,
      options: { dirty?: boolean; title?: string; welcome?: boolean } = {}
    ) => {
      editorRef.current?.setDocument(content)
      textRef.current = content
      setFilePath(nextPath)
      setTitle(options.title ?? fileNameOf(nextPath) ?? '')
      setWelcome(Boolean(options.welcome))
      setDirty(Boolean(options.dirty))
      setCounts({ words: countWords(content), characters: content.length })
      setOutline(documentOutline(content))
      setCaret({ line: 1, column: 1 })
      setSaveState('idle')
    },
    []
  )

  /** Notes a file as recently opened, newest first. */
  const remember = useCallback((path: string | null, name: string) => {
    if (!path) return
    setRecent((list) => {
      const next = rememberFile(list, path, name)
      saveRecent(next)
      return next
    })
  }, [])

  const confirmDiscard = useCallback(async (): Promise<boolean> => {
    const doc = docRef.current
    if (!doc.dirty) return true

    const choice = await window.api.confirmDiscard({
      name: doc.title || t('file.untitled'),
      count: 1,
      locale: settings.locale,
      theme: settings.theme
    })
    return choice !== 'cancel'
  }, [settings.locale, settings.theme, t])

  const bootRef = useRef(false)
  useEffect(() => {
    if (bootRef.current) return
    bootRef.current = true

    void (async () => {
      setRecent(await loadRecent())

      // A document that was open when the window last closed comes back, so a
      // reload or a crash never costs unsaved work.
      const session = await loadSession()
      if (session) {
        if (session.text !== undefined) {
          showDocument(session.filePath, session.text, { dirty: session.dirty })
          return
        }
        if (session.filePath) {
          const file = await window.api.openPath(session.filePath)
          if (!file.canceled && file.content !== undefined) {
            showDocument(file.filePath ?? session.filePath, file.content)
            return
          }
        }
      }
      // Nothing to restore: the welcome page, which explains the app and
      // doubles as somewhere harmless to start typing.
      showDocument(null, WELCOME_DOCUMENT, { title: t('home.title'), welcome: true })
    })()
  }, [showDocument, t])

  // The session is written after edits settle. `counts` changes on a debounce
  // after every keystroke, so it doubles as the document tick.
  useEffect(() => {
    const flush = (): void => {
      // An untouched welcome page is not a document the user made; leaving it
      // out of the session means the next launch starts here again.
      if (welcome && !dirty) return
      saveSession(
        { filePath: docRef.current.filePath, title: docRef.current.title, dirty: docRef.current.dirty },
        textRef.current
      )
    }

    const timer = window.setTimeout(flush, 600)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('beforeunload', flush)
    }
  }, [counts, dirty, filePath, title, welcome])

  useEffect(() => {
    window.api.setDocumentState({ filePath, dirty })
    document.title = `${dirty ? '• ' : ''}${displayTitle} — Type Editor`
  }, [filePath, dirty, displayTitle])

  // --- saving -------------------------------------------------------------

  const saveDocument = useCallback(
    async (options: { saveAs?: boolean; silent?: boolean } = {}): Promise<boolean> => {
      setSaveState('saving')
      try {
        const result = await window.api.saveFile({
          text: textRef.current,
          filePath: docRef.current.filePath,
          saveAs: options.saveAs
        })
        if (result.canceled || !result.filePath) {
          setSaveState('idle')
          return false
        }

        setFilePath(result.filePath)
        setTitle(result.fileName ?? fileNameOf(result.filePath) ?? '')
        remember(result.filePath, result.fileName ?? fileNameOf(result.filePath) ?? '')
        setDirty(false)
        setSaveState('saved')
        window.setTimeout(() => setSaveState('idle'), 1600)
        if (!options.silent) pushToast(t('toast.saved', { name: result.fileName ?? '' }))
        return true
      } catch (error) {
        setSaveState('error')
        pushToast((error as Error).message, 'error')
        return false
      }
    },
    [pushToast, remember, t]
  )

  // --- document commands --------------------------------------------------

  const openDocument = useCallback(async () => {
    if (!(await confirmDiscard())) return
    const result = await window.api.openFile()
    if (result.canceled || result.content === undefined) return
    showDocument(result.filePath ?? null, result.content)
    remember(result.filePath ?? null, fileNameOf(result.filePath ?? null) ?? '')
  }, [confirmDiscard, remember, showDocument])

  const openDroppedPath = useCallback(
    async (path: string) => {
      if (!(await confirmDiscard())) return
      const result = await window.api.openPath(path)
      if (result.canceled || result.content === undefined) return
      showDocument(result.filePath ?? null, result.content)
      remember(result.filePath ?? null, fileNameOf(result.filePath ?? null) ?? '')
    },
    [confirmDiscard, remember, showDocument]
  )

  const newDocument = useCallback(async () => {
    if (!(await confirmDiscard())) return
    showDocument(null, '')
  }, [confirmDiscard, showDocument])

  const openAbout = useCallback(async () => {
    if (!(await confirmDiscard())) return
    showDocument(null, ABOUT_DOCUMENT, { title: t('about.title') })
    setPaneOpen(false)
  }, [confirmDiscard, showDocument, t])

  const openHome = useCallback(async () => {
    if (!(await confirmDiscard())) return
    showDocument(null, WELCOME_DOCUMENT, { title: t('home.title'), welcome: true })
    setPaneOpen(false)
  }, [confirmDiscard, showDocument, t])

  const exportAs = useCallback(
    async (kind: 'png' | 'docx') => {
      const markdown = textRef.current
      if (!markdown.trim()) {
        pushToast(t('toast.emptyExport'), 'error')
        return
      }

      const path = docRef.current.filePath
      const name = documentTitle(path)
      const baseUrl = baseUrlOf(path)
      setBusy(kind === 'png' ? t('busy.png') : t('busy.docx'))

      try {
        const data =
          kind === 'png'
            ? await markdownToPng(markdown, baseUrl)
            : await markdownToDocx(markdown, name)

        const result = await window.api.saveBinary({
          data,
          defaultName: `${name}.${kind}`,
          extension: kind,
          label: kind === 'png' ? t('export.png') : t('export.word')
        })
        if (!result.canceled) pushToast(t('toast.exported', { name: result.fileName ?? '' }))
      } catch (error) {
        pushToast((error as Error).message, 'error')
      } finally {
        setBusy(null)
      }
    },
    [pushToast, t]
  )

  // --- editor wiring ------------------------------------------------------

  const handleChange = useCallback((text: string) => {
    textRef.current = text
    setDirty(true)
    // Editing it makes it the user's document, not the page we shipped.
    if (!isWelcomeDocument(text)) setWelcome(false)
    if (findOpenRef.current) setRevision((current) => current + 1)

    if (countTimer.current !== null) window.clearTimeout(countTimer.current)
    countTimer.current = window.setTimeout(() => {
      setCounts({ words: countWords(text), characters: text.length })
      setOutline(documentOutline(text))
    }, 180)
  }, [])

  const handleCaret = useCallback((line: number, column: number) => {
    setCaret({ line, column })
    if (findOpenRef.current) setRevision((current) => current + 1)
  }, [])

  const insertCodeBlock = useCallback((language: string) => {
    setPaneOpen(false)
    editorRef.current?.insertCodeBlock(language)
  }, [])

  const insertInlineCode = useCallback(() => {
    setPaneOpen(false)
    editorRef.current?.insertInlineCode()
  }, [])

  const insertImage = useCallback(async () => {
    const picked = await window.api.pickImage()
    if (picked.canceled || !picked.filePath) return

    // A picture beside the document is written as a path relative to it, so the
    // document stays portable; one from anywhere else has to be absolute.
    const reference = imageReference(picked.filePath, docRef.current.filePath)
    const alt = (picked.fileName ?? '').replace(/\.[^.]+$/, '')
    editorRef.current?.insertSnippet(`![${alt}](${reference})`)
  }, [])

  const openFind = useCallback(() => {
    setPaneOpen(false)
    editorRef.current?.openFind()
  }, [])

  const closeFind = useCallback(() => {
    editorRef.current?.closeFind()
  }, [])

  // --- main-process plumbing ----------------------------------------------

  useEffect(() => {
    const offClose = window.api.onCloseRequest(() => {
      void confirmDiscard().then((allow) => window.api.replyClose(allow))
    })
    // The main process asks for the buffer when it has to save without the
    // renderer's dialog — the native fallback path.
    const offRequestSave = window.api.onRequestSave(() => window.api.replySave(textRef.current))
    const offSaved = window.api.onFileSaved(({ filePath: saved, fileName }) => {
      setFilePath(saved)
      setTitle(fileName)
      setDirty(false)
    })
    const offMaximize = window.api.window.onMaximizeChange(setMaximized)

    return () => {
      offClose()
      offRequestSave()
      offSaved()
      offMaximize()
    }
  }, [confirmDiscard])

  // Auto-save only ever writes to a document that already has a path, so it can
  // never surprise the user with a save dialog.
  useEffect(() => {
    if (settings.autoSave <= 0) return
    const id = window.setInterval(() => {
      if (!docRef.current.dirty || !docRef.current.filePath) return
      void saveDocument({ silent: true })
    }, settings.autoSave * 1000)
    return () => window.clearInterval(id)
  }, [settings.autoSave, saveDocument])

  // --- shortcuts and menu --------------------------------------------------

  const commands = useRef({} as Record<MenuCommand, () => void>)
  commands.current = {
    new: () => void newDocument(),
    open: () => void openDocument(),
    save: () => void saveDocument(),
    'save-as': () => void saveDocument({ saveAs: true }),
    'export-png': () => void exportAs('png'),
    'export-docx': () => void exportAs('docx'),
    find: openFind,
    'toggle-source': () => setSourceMode((current) => !current),
    'toggle-autosave': () =>
      updateSettings({
        autoSave:
          settings.autoSave === 0
            ? 30
            : settings.autoSave === 30
              ? 60
              : settings.autoSave === 60
                ? 300
                : 0
      }),
    settings: () => setPaneOpen((current) => !current),
    'insert-inline-code': insertInlineCode,
    'insert-code-block': () => insertCodeBlock(''),
    'toggle-outline': () => setOutlineOpen((current) => !current),
    'toggle-focus': () => updateSettings({ focusMode: !settings.focusMode }),
    'toggle-typewriter': () => updateSettings({ typewriterMode: !settings.typewriterMode }),
    home: () => void openHome(),
    about: () => void openAbout()
  }

  useEffect(() => {
    return window.api.onMenuCommand((command: MenuCommand) => {
      commands.current[command]?.()
    })
  }, [])

  // A file dropped anywhere else would navigate the window away from the app.
  useEffect(() => {
    const prevent = (event: Event): void => event.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  const editorContext = useMemo(
    () => ({
      copy: t('code.copy'),
      copied: t('code.copied'),
      edit: t('code.edit'),
      plain: t('code.plain'),
      baseUrl: baseUrlOf(filePath),
      focus: settings.focusMode
    }),
    [t, filePath, settings.focusMode]
  )

  const closePane = useCallback(() => setPaneOpen(false), [])
  const togglePane = useCallback(() => setPaneOpen((current) => !current), [])
  const closeOutline = useCallback(() => setOutlineOpen(false), [])
  const toggleOutline = useCallback(() => setOutlineOpen((current) => !current), [])
  const resetSettings = useCallback(() => updateSettings(DEFAULT_SETTINGS), [updateSettings])
  const saveNow = useCallback(() => void saveDocument(), [saveDocument])
  const handleSetAutoSave = useCallback(
    (seconds: number) => updateSettings({ autoSave: seconds }),
    [updateSettings]
  )
  const handleSourceModeChange = useCallback((next: boolean) => setSourceMode(next), [])

  return (
    <div
      className={`app${paneOpen ? ' is-pane-open' : ''}${outlineOpen ? ' is-outline-open' : ''}`}
      data-platform={window.api.platform}
    >
      <TitleBar
        title={displayTitle}
        dirty={dirty}
        maximized={maximized}
        autoSaveSeconds={settings.autoSave}
        saving={saveState === 'saving'}
        onSetAutoSave={handleSetAutoSave}
        onSaveNow={saveNow}
      />

      <Toolbar
        sourceMode={sourceMode}
        busy={busy !== null}
        settingsOpen={paneOpen}
        outlineOpen={outlineOpen}
        onNew={() => void newDocument()}
        recent={recent}
        onOpen={() => void openDocument()}
        onOpenRecent={(path: string) => void openDroppedPath(path)}
        onSave={() => void saveDocument()}
        onSaveAs={() => void saveDocument({ saveAs: true })}
        onExportPng={() => void exportAs('png')}
        onExportDocx={() => void exportAs('docx')}
        onFind={openFind}
        onInsertInlineCode={insertInlineCode}
        onInsertCodeBlock={insertCodeBlock}
        onInsertImage={() => void insertImage()}
        onToggleOutline={toggleOutline}
        onToggleSettings={togglePane}
        onSourceModeChange={handleSourceModeChange}
      />

      <main
        className="workspace"
        onDragEnter={(event) => {
          event.preventDefault()
          dragDepth.current += 1
          setDragActive(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => {
          dragDepth.current -= 1
          if (dragDepth.current <= 0) {
            dragDepth.current = 0
            setDragActive(false)
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          dragDepth.current = 0
          setDragActive(false)
          const file = event.dataTransfer.files[0]
          if (!file) return
          const path = window.api.pathForFile(file)
          if (path) void openDroppedPath(path)
        }}
      >
        <OutlinePane
          open={outlineOpen}
          entries={outline}
          activeLine={caret.line}
          onSelect={(line) => editorRef.current?.scrollToLine(line)}
          onClose={closeOutline}
        />

        <EditorPane
          ref={editorRef}
          sourceMode={sourceMode}
          tabSize={settings.tabSize}
          typewriter={settings.typewriterMode}
          context={editorContext}
          onChange={handleChange}
          onCaret={handleCaret}
          onFindOpenChange={setFindOpen}
        />

        {findOpen && <SearchBar editor={editorRef} revision={revision} onClose={closeFind} />}

        <div className={`dropzone${dragActive ? ' is-visible' : ''}`}>{t('dropzone.hint')}</div>

        {busy && (
          <div className="progressline" role="progressbar" aria-label={busy}>
            <div className="progressline__bar" />
          </div>
        )}
      </main>

      <StatusBar
        words={counts.words}
        characters={counts.characters}
        line={caret.line}
        column={caret.column}
        saveState={saveState}
      />

      <SettingsPane
        open={paneOpen}
        settings={settings}
        onChange={updateSettings}
        onReset={resetSettings}
        onHome={() => void openHome()}
        onAbout={() => void openAbout()}
        onClose={closePane}
      />

      <div className="toast-host">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast${toast.tone === 'error' ? ' toast--error' : ''}${
              toast.leaving ? ' toast--leaving' : ''
            }`}
            role="status"
          >
            {toast.tone === 'ok' ? (
              <Check className="toast__icon--ok" size={15} strokeWidth={2} />
            ) : (
              <TriangleAlert className="toast__icon--error" size={15} strokeWidth={2} />
            )}
            {toast.message}
          </div>
        ))}
      </div>

      {busy && (
        <div className="busy">
          <div className="busy__card" role="status">
            <div className="busy__label">{busy}</div>
            <div className="busy__track">
              <div className="busy__bar" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
