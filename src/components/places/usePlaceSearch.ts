import { useEffect, useRef, useState } from 'react'
import { distanceMeters } from '../../lib/places'
import type { FoundPlace } from '../../lib/platform/native'

const SEARCH_DEBOUNCE_MS = 350
const MIN_QUERY = 2

export interface SearchResult extends FoundPlace {
  /** Metros desde donde estás, si hay permiso de ubicación. */
  distance: number | null
}

type Point = { lat: number; lng: number }

/** Posición para buscar cerca. La primera búsqueda pide el permiso de ubicación. */
async function nearby(): Promise<Point | null> {
  const { TasksNative } = await import('../../lib/platform/native')
  try {
    const { lat, lng } = await TasksNative.currentPosition()
    return { lat, lng }
  } catch {
    return null
  }
}

/** Busca en Apple Maps mientras se escribe, ordenando por cercanía. */
export function usePlaceSearch(query: string, active: boolean) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  // `undefined` = aún no se ha preguntado; `null` = sin permiso o sin señal.
  const origin = useRef<Point | null | undefined>(undefined)

  useEffect(() => {
    const text = query.trim()
    if (!active || text.length < MIN_QUERY) {
      setResults([])
      setSearching(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      setSearching(true)
      void (async () => {
        try {
          if (origin.current === undefined) origin.current = await nearby()
          const near = origin.current
          const { TasksNative } = await import('../../lib/platform/native')
          const { results: found } = await TasksNative.searchPlaces({ query: text, ...(near ?? {}) })
          if (cancelled) return
          const withDistance = found.map((place) => ({ ...place, distance: near ? distanceMeters(near, place) : null }))
          setResults(near ? withDistance.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)) : withDistance)
          setFailed(false)
        } catch {
          if (!cancelled) setFailed(true)
        } finally {
          if (!cancelled) setSearching(false)
        }
      })()
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, active])

  return { results, searching, failed }
}
