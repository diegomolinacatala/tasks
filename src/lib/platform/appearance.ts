import { StatusBar, Style } from '@capacitor/status-bar'
import type { Theme } from '../../types'
import type { ResolvedTheme } from '../theme'
import { TasksNative } from './native'

/**
 * La barra de estado con la tinta que toca (oscura sobre el papel, clara de noche) y la apariencia
 * de la ventana, que decide cómo salen la rueda de la hora, el teclado y los menús del sistema.
 * `auto` deja que iOS siga su ajuste.
 */
export async function syncAppearance(theme: Theme, resolved: ResolvedTheme): Promise<void> {
  await Promise.allSettled([
    StatusBar.setStyle({ style: resolved === 'dark' ? Style.Dark : Style.Light }),
    TasksNative.setAppearance({ style: theme }),
  ])
}
