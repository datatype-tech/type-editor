import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createTranslator, type Translate } from './i18n'
import type { Locale } from './settings'

const I18nContext = createContext<Translate>(createTranslator('en'))

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const translate = useMemo(() => createTranslator(locale), [locale])
  return <I18nContext.Provider value={translate}>{children}</I18nContext.Provider>
}

/** Translates a message key, interpolating `{name}` placeholders. */
export function useT(): Translate {
  return useContext(I18nContext)
}
