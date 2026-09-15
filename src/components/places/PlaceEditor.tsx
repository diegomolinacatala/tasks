import { Suspense, createContext, lazy, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { isNative } from '../../lib/platform'
import type { PlaceRequest } from './PlaceSheet'

const PlaceSheet = lazy(() => import('./PlaceSheet').then((module) => ({ default: module.PlaceSheet })))

type OpenPlace = (request: PlaceRequest) => void

const PlaceEditorContext = createContext<OpenPlace>(() => undefined)

/** Un único editor de lugares para toda la app: se abre desde Ajustes, una tarea o un aviso. */
export function PlaceEditorProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PlaceRequest | null>(null)

  return (
    <PlaceEditorContext.Provider value={setRequest}>
      {children}
      {isNative && (
        <Suspense fallback={null}>
          <PlaceSheet request={request} onClose={() => setRequest(null)} />
        </Suspense>
      )}
    </PlaceEditorContext.Provider>
  )
}

export const usePlaceEditor = (): OpenPlace => useContext(PlaceEditorContext)
