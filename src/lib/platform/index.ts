import { Capacitor } from '@capacitor/core'

/**
 * `true` dentro de la app de iPhone (Capacitor); `false` en la PWA. Decide qué adaptador se usa
 * para avisos, almacenamiento, voz y lugares: la lógica pura de `src/lib` es la misma.
 */
export const isNative = Capacitor.isNativePlatform()
