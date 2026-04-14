import { createContext, useContext, useState, type ReactNode } from 'react'
import { translations, type Language, type TranslationKey } from './translations'

interface I18nContextType {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: string, fallback?: string) => string
}

const I18nContext = createContext<I18nContextType | null>(null)

const STORAGE_KEY = 'hermes-hudui-lang'

function getInitialLang(): Language {
  // Check localStorage first
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'zh' || stored === 'en') return stored

  // Fall back to browser language
  const browserLang = navigator.language.toLowerCase()
  if (browserLang.startsWith('zh')) return 'zh'
  return 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(getInitialLang)

  const setLang = (newLang: Language) => {
    setLangState(newLang)
    localStorage.setItem(STORAGE_KEY, newLang)
  }

  const t = (key: TranslationKey | string, fallback?: string): string => {
    return (translations[lang] as Record<string, string>)[key] || translations.en[key as TranslationKey] || fallback || key
  }

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

export function useTranslation() {
  return useI18n()
}

export const LANG_LABELS: Record<Language, string> = { en: 'English', zh: '中文' }
export type Lang = Language
