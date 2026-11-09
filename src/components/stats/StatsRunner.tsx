import { useEffect, useRef } from 'react'
import { isNative } from '../../lib/platform'
import { setCollecting } from '../../lib/stats/bus'
import { forgetStats, startCollector, type Collector } from '../../lib/stats/collector'
import { effectiveLevel } from '../../lib/stats/settings'
import { useLanguage } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'

interface StatsRunnerProps {
  apiBase: string
  /** Modo sugerencia: se está señalando algo, no usando la app; los toques no cuentan. */
  paused: boolean
}

/**
 * Enciende, ajusta o apaga el recolector de estadísticas según lo elegido en Ajustes. Apagadas, no queda
 * nada de ellas en el dispositivo (ni lo contado ni la cola). Va en su propio trozo, con el recolector.
 */
export function StatsRunner({ apiBase, paused }: StatsRunnerProps) {
  const { settings } = useAppState()
  const dispatch = useDispatch()
  const lang = useLanguage()
  const level = effectiveLevel(settings.stats)
  const collector = useRef<Collector | null>(null)
  const { cohort } = settings.stats
  const { theme } = settings

  useEffect(() => {
    setCollecting(level !== 'off')
    if (level === 'off') {
      collector.current?.stop()
      collector.current = null
      forgetStats()
      return
    }
    const config = {
      level,
      apiBase,
      version: __APP_VERSION__,
      platform: isNative ? ('ios' as const) : ('web' as const),
      cohort,
      lang,
      theme,
      paused,
      onCohort: (week: string) => dispatch({ type: 'settings/stats', cohort: week }),
    }
    if (collector.current) collector.current.update(config)
    else collector.current = startCollector(config)
  }, [level, apiBase, cohort, lang, theme, paused, dispatch])

  useEffect(
    () => () => {
      collector.current?.stop()
      collector.current = null
    },
    [],
  )

  return null
}
