/**
 * User preferences. Everything the settings pane can change lives here, and
 * `applySettings` is the single place that pushes it into the DOM.
 */

import { LOCALES, type Locale } from '@shared/locale'

export const THEMES = [
  'type',
  'minimal',
  'minimal-light',
  'plain-light',
  'plain-dark',
  'anthropic',
  'anthropic-dark'
] as const
export type ThemeId = (typeof THEMES)[number]

export { LOCALES }
export type { Locale }

export const FONT_GROUPS = ['sans', 'serif', 'mono', 'cjk'] as const
export type FontGroup = (typeof FONT_GROUPS)[number]

export interface FontOption {
  id: string
  /** Proper nouns, so these are intentionally not translated. */
  label: string
  stack: string
  group: FontGroup
}

export const FONTS: FontOption[] = [
  { id: 'system', label: 'System UI', stack: "system-ui, 'Segoe UI', -apple-system, sans-serif", group: 'sans' },
  { id: 'segoe', label: 'Segoe UI', stack: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif", group: 'sans' },
  { id: 'arial', label: 'Arial', stack: "Arial, 'Helvetica Neue', Helvetica, sans-serif", group: 'sans' },
  { id: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif', group: 'sans' },
  { id: 'tahoma', label: 'Tahoma', stack: 'Tahoma, Verdana, sans-serif', group: 'sans' },
  { id: 'georgia', label: 'Georgia', stack: "Georgia, 'Times New Roman', serif", group: 'serif' },
  { id: 'cambria', label: 'Cambria', stack: 'Cambria, Georgia, serif', group: 'serif' },
  { id: 'times', label: 'Times New Roman', stack: "'Times New Roman', Times, serif", group: 'serif' },
  {
    id: 'palatino',
    label: 'Palatino Linotype',
    stack: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
    group: 'serif'
  },
  {
    id: 'yahei',
    label: '微软雅黑 Microsoft YaHei',
    stack: "'Microsoft YaHei UI', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', sans-serif",
    group: 'cjk'
  },
  {
    id: 'songti',
    label: '宋体 SimSun / Songti',
    stack: "'Songti SC', SimSun, 'Noto Serif SC', serif",
    group: 'cjk'
  },
  {
    id: 'jhenghei',
    label: '微軟正黑體 JhengHei',
    stack: "'Microsoft JhengHei UI', 'Microsoft JhengHei', 'PingFang TC', sans-serif",
    group: 'cjk'
  },
  {
    id: 'meiryo',
    label: 'メイリオ Meiryo',
    stack: "Meiryo, 'Yu Gothic UI', 'Hiragino Kaku Gothic ProN', sans-serif",
    group: 'cjk'
  },
  {
    id: 'yumincho',
    label: '游明朝 Yu Mincho',
    stack: "'Yu Mincho', 'Hiragino Mincho ProN', 'Noto Serif JP', serif",
    group: 'cjk'
  },
  { id: 'cascadia', label: 'Cascadia Code', stack: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace", group: 'mono' },
  { id: 'consolas', label: 'Consolas', stack: "Consolas, 'Courier New', monospace", group: 'mono' },
  { id: 'jetbrains', label: 'JetBrains Mono', stack: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace", group: 'mono' }
]

const MONO_STACK = "'Cascadia Code', 'Cascadia Mono', Consolas, ui-monospace, monospace"

export function fontById(id: string): FontOption {
  return FONTS.find((font) => font.id === id) ?? FONTS[0]
}

export interface Settings {
  theme: ThemeId
  locale: Locale
  uiFont: string
  editorFont: string
  /** Editor body size in px. */
  fontSize: number
  /** Multiple of the font size used for leading. */
  lineHeight: number
  /** Width of the text column in px. */
  measure: number
  /** Gap between the window edge and the text column, in px. */
  margin: number
  /** Spaces a tab counts for. */
  tabSize: number
  /** Auto-save cadence in seconds; 0 is off. */
  autoSave: number
  /** Dim everything but the block being edited. */
  focusMode: boolean
  /** Keep the caret line vertically centred while typing. */
  typewriterMode: boolean
  /** Automatically close brackets, quotes and comment symbols. */
  autoCloseBrackets: boolean
}

export const TAB_SIZES = [2, 4, 8] as const

/** Auto-save cadences offered in the title bar menu, in seconds. */
export const AUTOSAVE_STEPS = [0, 30, 60, 300] as const

export const DEFAULT_SETTINGS: Settings = {
  theme: 'type',
  locale: 'en',
  uiFont: 'segoe',
  editorFont: 'segoe',
  fontSize: 16,
  lineHeight: 1.85,
  measure: 768,
  margin: 56,
  tabSize: 4,
  autoSave: 30,
  focusMode: false,
  typewriterMode: false,
  autoCloseBrackets: true
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Folds anything that came out of storage into a usable settings object: a
 * value written by an older or newer build must never break the app.
 */
export function normalizeSettings(input: unknown): Settings {
  const raw = (input ?? {}) as Partial<Settings>
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback

  return {
    theme: pick(raw.theme, THEMES, DEFAULT_SETTINGS.theme),
    locale: pick(raw.locale, LOCALES, DEFAULT_SETTINGS.locale),
    uiFont: FONTS.some((font) => font.id === raw.uiFont) ? raw.uiFont! : DEFAULT_SETTINGS.uiFont,
    editorFont: FONTS.some((font) => font.id === raw.editorFont)
      ? raw.editorFont!
      : DEFAULT_SETTINGS.editorFont,
    fontSize: clamp(Number(raw.fontSize) || DEFAULT_SETTINGS.fontSize, 12, 24),
    lineHeight: clamp(Number(raw.lineHeight) || DEFAULT_SETTINGS.lineHeight, 1.3, 2.6),
    measure: clamp(Number(raw.measure) || DEFAULT_SETTINGS.measure, 420, 1400),
    margin: clamp(Number(raw.margin) || DEFAULT_SETTINGS.margin, 0, 160),
    tabSize: TAB_SIZES.includes(raw.tabSize as 2) ? raw.tabSize! : DEFAULT_SETTINGS.tabSize,
    autoSave: AUTOSAVE_STEPS.includes(raw.autoSave as 0)
      ? raw.autoSave!
      : DEFAULT_SETTINGS.autoSave,
    focusMode: Boolean(raw.focusMode),
    typewriterMode: Boolean(raw.typewriterMode),
    autoCloseBrackets: raw.autoCloseBrackets !== undefined ? Boolean(raw.autoCloseBrackets) : DEFAULT_SETTINGS.autoCloseBrackets
  }
}

export function applySettings(settings: Settings): void {
  const root = document.documentElement
  const editorFont = fontById(settings.editorFont)

  root.dataset.theme = settings.theme
  root.lang = settings.locale
  root.style.setProperty('--font-ui', fontById(settings.uiFont).stack)
  root.style.setProperty('--font-editor', editorFont.stack)
  // A monospaced document font should carry through to code blocks as well.
  root.style.setProperty('--font-mono', editorFont.group === 'mono' ? editorFont.stack : MONO_STACK)
  root.style.setProperty('--editor-size', `${settings.fontSize}px`)
  root.style.setProperty('--editor-line-height', String(settings.lineHeight))
  root.style.setProperty('--measure', `${settings.measure}px`)
  root.style.setProperty('--page-padding', `${settings.margin}px`)
}

/**
 * Runs a colour cross-fade over the whole shell. Transitioning every element
 * permanently would tax scrolling, so the class is only on for the duration of
 * the swap.
 */
export function crossFadeTheme(): void {
  const root = document.documentElement
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  root.classList.add('is-theme-switching')
  window.setTimeout(() => root.classList.remove('is-theme-switching'), 320)
}
