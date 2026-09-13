import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  IPC,
  type BinarySaveRequest,
  type DocumentState,
  type Locale,
  type MenuCommand,
  type DiscardChoice,
  type DiscardPrompt,
  type OpenedFile,
  type PickedImage,
  type SaveRequest,
  type SavedFile
} from '../shared/ipc'

/** Subscribes to a main-process event and returns an unsubscribe function. */
function subscribe<T extends unknown[]>(
  channel: string,
  callback: (...args: T) => void
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
    callback(...(args as T))
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

/**
 * The renderer runs sandboxed with no Node access. Everything it needs from the
 * main process is exposed here as a narrow, explicit surface.
 */
const api = {
  openFile: (): Promise<OpenedFile> => ipcRenderer.invoke(IPC.openFile),
  openPath: (filePath: string): Promise<OpenedFile> => ipcRenderer.invoke(IPC.openPath, filePath),
  saveFile: (payload: SaveRequest): Promise<SavedFile> => ipcRenderer.invoke(IPC.saveFile, payload),
  /** Picks a picture to drop into the document as a Markdown image. */
  pickImage: (): Promise<PickedImage> => ipcRenderer.invoke(IPC.pickImage),
  saveBinary: (payload: BinarySaveRequest): Promise<SavedFile> =>
    ipcRenderer.invoke(IPC.saveBinary, payload),

  /** Opens the unsaved-changes window and resolves with what the user chose. */
  confirmDiscard: (prompt: DiscardPrompt): Promise<DiscardChoice> =>
    ipcRenderer.invoke(IPC.confirmDiscard, prompt),

  /** Answers the unsaved-changes window; only the dialog page calls this. */
  replyDiscard: (choice: DiscardChoice): void => ipcRenderer.send(IPC.discardChoice, choice),
  resizeDialog: (height: number): void => ipcRenderer.send(IPC.dialogResize, height),

  /** Keeps the main process aware of the active document so it can guard closing. */
  setDocumentState: (state: DocumentState): void => ipcRenderer.send(IPC.documentState, state),

  /** The main process asks permission to close; the reply is the renderer's verdict. */
  onCloseRequest: (callback: () => void): (() => void) => subscribe<[]>(IPC.closeRequest, callback),
  replyClose: (allow: boolean): void => ipcRenderer.send(IPC.closeResponse, allow),

  /** The main process asks for the buffer when it has to save during window close. */
  onRequestSave: (callback: () => void): (() => void) => subscribe<[]>(IPC.requestSave, callback),
  replySave: (text: string): void => ipcRenderer.send(IPC.saveResult, text),

  setLocale: (locale: Locale): void => ipcRenderer.send(IPC.locale, locale),
  copyText: (text: string): void => ipcRenderer.send(IPC.copyText, text),

  /** Resolves an OS-dropped File to its absolute path. */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),

  window: {
    minimize: (): void => ipcRenderer.send(IPC.windowMinimize),
    toggleMaximize: (): void => ipcRenderer.send(IPC.windowToggleMaximize),
    close: (): void => ipcRenderer.send(IPC.windowClose),
    onMaximizeChange: (callback: (maximized: boolean) => void): (() => void) =>
      subscribe<[boolean]>(IPC.windowMaximizeChanged, callback)
  },

  onMenuCommand: (callback: (command: MenuCommand) => void): (() => void) =>
    subscribe<[MenuCommand]>(IPC.menuCommand, callback),

  onFileSaved: (callback: (payload: { filePath: string; fileName: string }) => void): (() => void) =>
    subscribe<[{ filePath: string; fileName: string }]>(IPC.fileSaved, callback),

  platform: process.platform
}

export type TypeEditorApi = typeof api

contextBridge.exposeInMainWorld('api', api)
