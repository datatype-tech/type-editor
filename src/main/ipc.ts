import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  IPC,
  type BinarySaveRequest,
  type DiscardChoice,
  type DiscardPrompt,
  type DocumentState,
  type OpenedFile,
  type PickedImage,
  type SaveRequest,
  type SavedFile,
  type UpdateChoice
} from '../shared/ipc'
import { DEFAULT_LOCALE, isLocale, type Locale } from '../shared/locale'
import { mainStrings, type MainKey } from '../shared/strings'
import { updater } from './updater'

type WindowGetter = () => BrowserWindow | null

/** The document state the main process needs in order to save and to guard closing. */
export const docState = {
  filePath: null as string | null,
  dirty: false,
  /** Set once the user has approved a close, so it is not re-prompted. */
  forceClose: false,
  /** True while a close is already being resolved, so prompts cannot stack. */
  closing: false
}

let locale: Locale = DEFAULT_LOCALE

/** The dialog window is painted before the page loads, so main tracks the theme. */
let discardTheme = 'type'
let discardBackground = '#ffffff'

/** Surface colour per theme, used as the dialog window's own frame. */
const THEME_BACKGROUND: Record<string, string> = {
  type: '#ffffff',
  minimal: '#ffffff',
  'minimal-light': '#ffffff',
  'plain-light': '#ffffff',
  'plain-dark': '#1f1f1f',
  anthropic: '#faf9f5',
  'anthropic-dark': '#1f1e1d'
}

export function currentLocale(): Locale {
  return locale
}

function t(key: MainKey, vars?: Record<string, string>): string {
  return mainStrings(locale)(key, vars)
}

const TEXT_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] },
  { name: 'Text', extensions: ['txt'] },
  { name: 'All Files', extensions: ['*'] }
]

function notifySaved(window: BrowserWindow, filePath: string): void {
  window.webContents.send(IPC.fileSaved, { filePath, fileName: basename(filePath) })
}

/**
 * Asks the renderer for the current buffer text. The renderer is the only place
 * that holds the live document, so saving from the menu or during window close
 * has to round-trip through it.
 */
function requestText(getWindow: WindowGetter): Promise<string | null> {
  const window = getWindow()
  if (!window || window.isDestroyed()) return Promise.resolve(null)

  return new Promise((resolve) => {
    const onResult = (_event: Electron.IpcMainEvent, text: string): void => {
      clearTimeout(timer)
      ipcMain.removeListener(IPC.saveResult, onResult)
      resolve(text)
    }
    // Guard against a renderer that never answers so the app can still close.
    const timer = setTimeout(() => {
      ipcMain.removeListener(IPC.saveResult, onResult)
      resolve(null)
    }, 3000)

    ipcMain.on(IPC.saveResult, onResult)
    window.webContents.send(IPC.requestSave)
  })
}

interface WriteOptions {
  filePath: string | null
  saveAs: boolean
  /**
   * Whether to tell the renderer about the write. A save the renderer asked for
   * already learns the result from the call itself; only a save main started on
   * its own — during window close — has to be announced.
   */
  announce?: boolean
}

async function writeDocument(
  getWindow: WindowGetter,
  text: string,
  options: WriteOptions
): Promise<SavedFile> {
  const window = getWindow()
  if (!window) return { canceled: true }

  let target = options.saveAs ? null : options.filePath
  if (!target) {
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      title: options.saveAs ? t('dialog.saveAsTitle') : t('dialog.saveTitle'),
      defaultPath: options.filePath ?? join(app.getPath('documents'), 'untitled.md'),
      filters: TEXT_FILTERS
    })
    if (canceled || !filePath) return { canceled: true }
    target = filePath
  }

  try {
    await writeFile(target, text, 'utf8')
  } catch (error) {
    dialog.showErrorBox(t('dialog.saveError'), `${target}\n\n${(error as Error).message}`)
    return { canceled: true }
  }

  docState.filePath = target
  docState.dirty = false
  if (options.announce) notifySaved(window, target)
  return { canceled: false, filePath: target, fileName: basename(target) }
}

/** Where the compiled dialog page lives, next to the main bundle. */
function dialogPage(): string {
  return join(__dirname, '../renderer/dialog.html')
}

/**
 * Shows the Save / Don't Save / Cancel prompt in a window of its own.
 *
 * It is a real window rather than a message box inside the editor so that it can
 * sit over a window full of tabs without touching the page underneath, and it is
 * drawn by the app rather than by the OS so it can carry the current theme and
 * language.
 */
export function promptDiscard(
  getWindow: WindowGetter,
  prompt: Omit<DiscardPrompt, 'locale' | 'theme'> & Partial<DiscardPrompt> = { name: '', count: 1 }
): Promise<DiscardChoice> {
  const parent = getWindow()
  if (!parent || parent.isDestroyed()) return Promise.resolve('discard')

  return new Promise((resolve) => {
    let settled = false
    const query = new URLSearchParams({
      locale,
      theme: discardTheme,
      name: prompt.name ?? '',
      count: String(prompt.count ?? 1)
    }).toString()

    const window = new BrowserWindow({
      parent,
      modal: true,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      show: false,
      width: 460,
      height: 200,
      backgroundColor: discardBackground,
      // The dialog page is part of the renderer bundle and talks back over the
      // same bridge; without its preload it has no API and paints nothing.
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    const finish = (choice: DiscardChoice): void => {
      if (settled) return
      settled = true
      ipcMain.removeListener(IPC.discardChoice, onChoice)
      ipcMain.removeListener(IPC.dialogResize, onResize)
      if (!window.isDestroyed()) window.destroy()
      resolve(choice)
    }

    const onChoice = (event: Electron.IpcMainEvent, choice: DiscardChoice): void => {
      if (event.sender === window.webContents) finish(choice)
    }
    const onResize = (event: Electron.IpcMainEvent, height: number): void => {
      if (event.sender !== window.webContents || window.isDestroyed()) return
      const clamped = Math.max(150, Math.min(420, Math.round(height)))
      const [width] = window.getContentSize()
      window.setContentSize(width, clamped)
    }

    ipcMain.on(IPC.discardChoice, onChoice)
    ipcMain.on(IPC.dialogResize, onResize)

    window.once('ready-to-show', () => window.show())
    // Closing the window any other way — Alt+F4, say — means "don't save".
    window.on('closed', () => finish('cancel'))

    void window.loadFile(dialogPage(), { search: query })
  })
}

/**
 * Shows the update prompt in a modal dialog before closing.
 */
export function promptUpdateOnClose(
  getWindow: WindowGetter,
  version: string
): Promise<UpdateChoice> {
  const parent = getWindow()
  if (!parent || parent.isDestroyed()) return Promise.resolve('later')

  return new Promise((resolve) => {
    let settled = false
    const query = new URLSearchParams({
      type: 'update',
      locale,
      theme: discardTheme,
      version
    }).toString()

    const window = new BrowserWindow({
      parent,
      modal: true,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      show: false,
      width: 460,
      height: 200,
      backgroundColor: discardBackground,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    const finish = (choice: UpdateChoice): void => {
      if (settled) return
      settled = true
      ipcMain.removeListener(IPC.updateChoice, onChoice)
      ipcMain.removeListener(IPC.dialogResize, onResize)
      if (!window.isDestroyed()) window.destroy()
      resolve(choice)
    }

    const onChoice = (event: Electron.IpcMainEvent, choice: UpdateChoice): void => {
      if (event.sender === window.webContents) finish(choice)
    }
    const onResize = (event: Electron.IpcMainEvent, height: number): void => {
      if (event.sender !== window.webContents || window.isDestroyed()) return
      const clamped = Math.max(150, Math.min(420, Math.round(height)))
      const [width] = window.getContentSize()
      window.setContentSize(width, clamped)
    }

    ipcMain.on(IPC.updateChoice, onChoice)
    ipcMain.on(IPC.dialogResize, onResize)

    window.once('ready-to-show', () => window.show())
    window.on('closed', () => finish('later'))

    void window.loadFile(dialogPage(), { search: query })
  })
}

/** Last-resort resolution of a dirty buffer, used when the renderer is silent. */
async function resolveDirty(getWindow: WindowGetter): Promise<boolean> {
  if (!docState.dirty) return true

  const choice = await promptDiscard(getWindow, {
    name: docState.filePath ? basename(docState.filePath) : t('dialog.untitled'),
    count: 1
  })
  if (choice === 'cancel') return false
  if (choice === 'discard') return true

  const text = await requestText(getWindow)
  if (text === null) return false
  const result = await writeDocument(getWindow, text, {
    filePath: docState.filePath,
    saveAs: false,
    announce: true
  })
  return !result.canceled
}

/**
 * Hands the unsaved-changes decision to the renderer, which owns the document
 * and draws the app's own dialog. If it does not answer — a hung or crashed
 * renderer — the native prompt takes over so the window can always be closed.
 */
function requestCloseApproval(getWindow: WindowGetter): Promise<boolean> {
  const window = getWindow()
  if (!window || window.isDestroyed()) return Promise.resolve(true)

  return new Promise((resolve) => {
    const onReply = (_event: Electron.IpcMainEvent, allow: boolean): void => {
      cleanup()
      resolve(Boolean(allow))
    }
    const cleanup = (): void => {
      clearTimeout(timer)
      ipcMain.removeListener(IPC.closeResponse, onReply)
    }
    const timer = setTimeout(() => {
      cleanup()
      void resolveDirty(getWindow).then(resolve)
    }, 3000)

    ipcMain.on(IPC.closeResponse, onReply)
    window.webContents.send(IPC.closeRequest)
  })
}

export function registerIpc(getWindow: WindowGetter, onLocaleChange: () => void): void {
  ipcMain.handle(IPC.openFile, async (): Promise<OpenedFile> => {
    const window = getWindow()
    if (!window) return { canceled: true }

    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      title: t('dialog.openTitle'),
      properties: ['openFile'],
      filters: TEXT_FILTERS
    })
    if (canceled || filePaths.length === 0) return { canceled: true }

    return readDocument(filePaths[0])
  })

  ipcMain.handle(IPC.pickImage, async (): Promise<PickedImage> => {
    const window = getWindow()
    if (!window) return { canceled: true }

    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      title: t('dialog.imageTitle'),
      properties: ['openFile'],
      filters: [
        {
          name: t('dialog.imageFilter'),
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']
        },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (canceled || filePaths.length === 0) return { canceled: true }

    const filePath = filePaths[0]
    return { canceled: false, filePath, fileName: basename(filePath) }
  })

  ipcMain.handle(IPC.openPath, async (_event, filePath: string): Promise<OpenedFile> => {
    if (!filePath) return { canceled: true }
    return readDocument(filePath)
  })

  ipcMain.handle(IPC.saveFile, (_event, payload: SaveRequest): Promise<SavedFile> => {
    return writeDocument(getWindow, payload.text, {
      filePath: payload.filePath ?? null,
      saveAs: Boolean(payload.saveAs)
    })
  })

  ipcMain.handle(IPC.saveBinary, async (_event, payload: BinarySaveRequest): Promise<SavedFile> => {
    const window = getWindow()
    if (!window) return { canceled: true }

    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      title: t('dialog.exportTitle', { label: payload.label }),
      defaultPath: join(app.getPath('documents'), payload.defaultName),
      filters: [{ name: payload.label, extensions: [payload.extension] }]
    })
    if (canceled || !filePath) return { canceled: true }

    try {
      await writeFile(filePath, Buffer.from(payload.data))
    } catch (error) {
      dialog.showErrorBox(t('dialog.exportError'), `${filePath}\n\n${(error as Error).message}`)
      return { canceled: true }
    }
    return { canceled: false, filePath, fileName: basename(filePath) }
  })

  ipcMain.on(IPC.documentState, (_event, state: DocumentState) => {
    docState.filePath = state?.filePath ?? null
    docState.dirty = Boolean(state?.dirty)
  })

  ipcMain.handle(IPC.confirmDiscard, (_event, prompt: DiscardPrompt) => {
    discardTheme = prompt?.theme ?? discardTheme
    discardBackground = THEME_BACKGROUND[discardTheme] ?? '#ffffff'
    if (isLocale(prompt?.locale)) locale = prompt.locale
    return promptDiscard(getWindow, { name: prompt?.name ?? '', count: prompt?.count ?? 1 })
  })

  ipcMain.on(IPC.locale, (_event, next: Locale) => {
    if (!isLocale(next) || next === locale) return
    locale = next
    onLocaleChange()
  })

  ipcMain.on(IPC.copyText, (_event, text: string) => {
    if (typeof text === 'string' && text) clipboard.writeText(text)
  })

  ipcMain.on(IPC.windowMinimize, () => getWindow()?.minimize())
  ipcMain.on(IPC.windowToggleMaximize, () => {
    const window = getWindow()
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  ipcMain.on(IPC.windowClose, () => getWindow()?.close())

  // Updater handlers
  ipcMain.handle(IPC.updaterCheck, async () => {
    return updater.checkForUpdates(false)
  })

  ipcMain.handle(IPC.updaterDownload, async (event) => {
    return updater.downloadUpdate((progress) => {
      event.sender.send(IPC.updaterProgress, progress)
    })
  })

  ipcMain.handle(IPC.updaterInstall, async () => {
    updater.installAndQuit()
  })

  ipcMain.handle(IPC.updaterOpenUrl, async (_event, url: string) => {
    if (typeof url === 'string' && url.startsWith('https://')) {
      await shell.openExternal(url)
    }
  })
}

async function readDocument(filePath: string): Promise<OpenedFile> {
  try {
    const content = await readFile(filePath, 'utf8')
    return { canceled: false, filePath, content }
  } catch (error) {
    dialog.showErrorBox(t('dialog.openError'), `${filePath}\n\n${(error as Error).message}`)
    return { canceled: true }
  }
}

/**
 * Wires the window's close button into the unsaved-changes and auto-update flow.
 */
export function attachCloseGuard(getWindow: WindowGetter): void {
  const window = getWindow()
  if (!window) return

  window.on('close', (event) => {
    if (docState.forceClose) return
    if (docState.closing) {
      event.preventDefault()
      return
    }

    const cached = updater.getCachedUpdate()
    const hasUpdate = cached !== null && !updater.userDeclinedOnClose

    if (!docState.dirty && !hasUpdate) return

    event.preventDefault()
    docState.closing = true

    void (async () => {
      try {
        if (docState.dirty) {
          const allow = await requestCloseApproval(getWindow)
          if (!allow) return
        }

        if (hasUpdate && cached) {
          const choice = await promptUpdateOnClose(getWindow, cached.version)
          if (choice === 'update') {
            updater.userDeclinedOnClose = false
            const downloaded = updater.getDownloadedPath()
            if (downloaded) {
              updater.installAndQuit(downloaded)
              return
            } else {
              const res = await updater.downloadUpdate()
              if (res.success && res.localPath) {
                updater.installAndQuit(res.localPath)
                return
              }
            }
          } else {
            updater.userDeclinedOnClose = true
          }
        }

        docState.forceClose = true
        getWindow()?.close()
      } finally {
        docState.closing = false
      }
    })()
  })
}
