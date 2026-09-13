import { idbDelete, idbGet, idbSet } from './idb'
import { normalizeSettings, type Settings } from './settings'

/**
 * Everything the app remembers between runs: the user's settings, the document
 * that was open, and the files they have been working on.
 *
 * Older builds kept the first two in `localStorage`; those values are read once
 * and written into IndexedDB so nobody loses their preferences on upgrade.
 */

const KEY_SETTINGS = 'settings'
const KEY_SESSION = 'session'
const KEY_RECENT = 'recent'

const LEGACY_SETTINGS = 'type-editor.settings.v1'
const LEGACY_SESSION = 'type-editor.document.v1'
const LEGACY_SESSION_TABS = 'type-editor.session.v1'

export interface SessionDocument {
  filePath: string | null
  title: string
  dirty: boolean
  /** Present only when the buffer is not on disk. */
  text?: string
}

export interface RecentFile {
  filePath: string
  name: string
  /** Milliseconds since the epoch, as the file was last touched. */
  at: number
}

/** How many files the recent list keeps. */
const RECENT_LIMIT = 8

/** Buffers larger than this are restored from disk only. */
const MAX_INLINE = 2_000_000

function legacy<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as T
    window.localStorage.removeItem(key)
    return parsed
  } catch {
    return null
  }
}

export async function loadSettings(): Promise<Settings | null> {
  const stored = await idbGet<Partial<Settings>>(KEY_SETTINGS).catch(() => null)
  if (stored) return normalizeSettings(stored)

  const old = legacy<Partial<Settings>>(LEGACY_SETTINGS)
  if (old) {
    const migrated = normalizeSettings(old)
    void saveSettings(migrated)
    return migrated
  }
  return null
}

export function saveSettings(settings: Settings): void {
  void idbSet(KEY_SETTINGS, settings).catch(() => undefined)
}

export async function loadSession(): Promise<SessionDocument | null> {
  const stored = await idbGet<SessionDocument>(KEY_SESSION).catch(() => null)
  if (stored?.filePath !== undefined || stored?.text !== undefined) {
    return {
      filePath: stored.filePath ?? null,
      title: typeof stored.title === 'string' ? stored.title : '',
      dirty: Boolean(stored.dirty),
      text: typeof stored.text === 'string' ? stored.text : undefined
    }
  }

  const old = legacy<SessionDocument>(LEGACY_SESSION)
  if (old?.text !== undefined || old?.filePath) return old

  // A session written by the tabbed build: keep the first document only.
  const tabs = legacy<{ tabs?: SessionDocument[] }>(LEGACY_SESSION_TABS)
  const first = tabs?.tabs?.[0]
  return first ? { ...first, dirty: Boolean(first.dirty) } : null
}

export function saveSession(document: SessionDocument, text: string): void {
  const needsCopy = document.dirty || !document.filePath
  void idbSet(KEY_SESSION, {
    filePath: document.filePath,
    title: document.title,
    dirty: document.dirty,
    text: needsCopy && text.length <= MAX_INLINE ? text : undefined
  } satisfies SessionDocument).catch(() => undefined)
}

export function clearSession(): void {
  void idbDelete(KEY_SESSION).catch(() => undefined)
}

export async function loadRecent(): Promise<RecentFile[]> {
  const stored = await idbGet<RecentFile[]>(KEY_RECENT).catch(() => null)
  if (!Array.isArray(stored)) return []
  return stored.filter((entry) => typeof entry?.filePath === 'string')
}

/**
 * Records a file as recently used. The list is most-recent-first and holds no
 * duplicates, so saving the same document twice does not fill it up.
 */
export function rememberFile(list: readonly RecentFile[], filePath: string, name: string): RecentFile[] {
  const without = list.filter((entry) => entry.filePath !== filePath)
  return [{ filePath, name, at: Date.now() }, ...without].slice(0, RECENT_LIMIT)
}

export function saveRecent(list: readonly RecentFile[]): void {
  void idbSet(KEY_RECENT, list.slice(0, RECENT_LIMIT)).catch(() => undefined)
}
