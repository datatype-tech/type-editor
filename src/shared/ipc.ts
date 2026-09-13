import type { Locale } from './locale'

/** Types shared between the main process, the preload bridge and the renderer. */

export interface OpenedFile {
  canceled: boolean
  filePath?: string
  content?: string
}

export interface SavedFile {
  canceled: boolean
  filePath?: string
  fileName?: string
}

export interface SaveRequest {
  text: string
  /** Destination of the active document, or null when it has never been saved. */
  filePath: string | null
  /** Force the destination picker even when the document already has a path. */
  saveAs?: boolean
}

export interface BinarySaveRequest {
  /** Raw bytes of the exported artefact. */
  data: Uint8Array
  defaultName: string
  /** Extension without the dot, used to build the dialog filter. */
  extension: string
  label: string
}

/** What the main process knows about the document the user is looking at. */
export interface DocumentState {
  filePath: string | null
  dirty: boolean
}

/** What the unsaved-changes window needs in order to describe the situation. */
export interface DiscardPrompt {
  name: string
  count: number
  locale: string
  theme: string
}

export interface PickedImage {
  canceled: boolean
  filePath?: string
  fileName?: string
}

export type DiscardChoice = 'save' | 'discard' | 'cancel'
export type UpdateChoice = 'update' | 'later'

export interface UpdateInfo {
  version: string
  name: string
  releaseNotes: string
  releaseUrl: string
  publishedAt: string
  downloadUrl: string | null
  assetName: string | null
  assetSize?: number
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  currentVersion: string
  update?: UpdateInfo
  error?: string
}

export interface UpdateDownloadProgress {
  percent: number
  transferred: number
  total: number
}

/** Commands the application menu sends down to the renderer. */
export type MenuCommand =
  | 'new'
  | 'open'
  | 'save'
  | 'save-as'
  | 'export-png'
  | 'export-docx'
  | 'find'
  | 'toggle-source'
  | 'toggle-autosave'
  | 'settings'
  | 'insert-inline-code'
  | 'insert-code-block'
  | 'home'
  | 'about'
  | 'toggle-outline'
  | 'toggle-focus'
  | 'toggle-typewriter'

export const IPC = {
  openFile: 'file:open',
  openPath: 'file:open-path',
  pickImage: 'file:pick-image',
  saveFile: 'file:save',
  saveBinary: 'file:save-binary',

  /** The unsaved-changes window: opened on request, answered from the dialog. */
  confirmDiscard: 'dialog:confirm-discard',
  discardChoice: 'dialog:discard-choice',
  dialogResize: 'dialog:resize',

  /** The renderer's view of the active document, so main can guard closing. */
  documentState: 'doc:state',
  /** Main asks the renderer to resolve unsaved work before the window closes. */
  closeRequest: 'window:close-request',
  closeResponse: 'window:close-response',
  requestSave: 'doc:request-save',
  saveResult: 'doc:save-result',
  fileSaved: 'file:saved',
  fileOpened: 'file:opened',

  menuCommand: 'menu:command',
  locale: 'app:locale',
  copyText: 'clipboard:write',

  /** Auto updater channels */
  updaterCheck: 'updater:check',
  updaterDownload: 'updater:download',
  updaterInstall: 'updater:install',
  updaterOpenUrl: 'updater:open-url',
  updaterProgress: 'updater:progress',
  confirmUpdate: 'dialog:confirm-update',
  updateChoice: 'dialog:update-choice',

  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowMaximizeChanged: 'window:maximize-changed'
} as const

export type { Locale }
