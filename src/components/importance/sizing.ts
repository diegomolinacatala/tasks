import { createContext, useContext } from 'react'

/** Modo "Aa": cada fila cambia el asa de mover por su mando de importancia. */
export const SizingContext = createContext(false)

export const useSizing = (): boolean => useContext(SizingContext)
