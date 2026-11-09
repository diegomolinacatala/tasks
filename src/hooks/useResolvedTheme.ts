import { useEffect, useState } from 'react'
import type { ResolvedTheme } from '../lib/theme'
import { currentTheme } from '../lib/theme'

/** El tema que se ve ahora mismo (también cuando es "Automático"): lo que pone `data-theme` en <html>. */
export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(currentTheme)

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(currentTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return theme
}
