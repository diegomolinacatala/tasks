import { Capacitor } from '@capacitor/core'

/**
 * `true` dentro de la app de iPhone (Capacitor); `false` en la PWA. Decide qué adaptador se usa
 * para avisos, almacenamiento, voz y lugares: la lógica pura de `src/lib` es la misma.
 */
export const isNative = Capacitor.isNativePlatform()

/**
 * La pestaña Lugares y su editor, también en la web: en `npm run dev` para poder probarlos y al
 * hacer las capturas de la App Store (`--mode shots`). Sin el iPhone no hay Apple Maps: sale el plano
 * dibujado. En la PWA publicada, `false`.
 */
export const showsPlaces = isNative || import.meta.env.DEV || import.meta.env.MODE === 'shots'
