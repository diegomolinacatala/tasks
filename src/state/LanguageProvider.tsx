import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Language } from '../lib/i18n'
import { deviceLanguages, resolveLanguage, setLanguage } from '../lib/i18n'
import { loadEnglish } from '../lib/parse'
import { useAppState } from './StoreProvider'

const LanguageContext = createContext<Language>('es')

/**
 * El idioma de la interfaz: el elegido en Ajustes o, en automático, el del sistema. Se fija antes de
 * pintar a los hijos, porque la lógica que compone textos (`lib/date.ts`, `lib/schedule.ts`…) lo lee
 * al llamarla. Las filas memorizadas se repintan al cambiarlo porque leen este contexto (`useCopy`).
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const setting = useAppState().settings.language
  const [system, setSystem] = useState(deviceLanguages)

  useEffect(() => {
    const update = () => setSystem(deviceLanguages())
    window.addEventListener('languagechange', update)
    return () => window.removeEventListener('languagechange', update)
  }, [])

  const language = resolveLanguage(setting, system)
  setLanguage(language)

  useEffect(() => {
    document.documentElement.lang = language
    // El analizador en inglés va aparte (`lib/parse.ts`): llega en lo que se tarda en empezar a escribir.
    if (language === 'en') void loadEnglish().catch(() => undefined)
  }, [language])

  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>
}

export const useLanguage = (): Language => useContext(LanguageContext)

/** Los textos de un componente en el idioma vigente: `const copy = useCopy(COPY)`. */
export function useCopy<T extends Readonly<Record<Language, unknown>>>(table: T): T[Language] {
  return table[useLanguage()]
}
