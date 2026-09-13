/** Interface languages, shared by the renderer's settings and the main process. */
export const LOCALES = ['en', 'zh-CN', 'zh-TW', 'ja'] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}
