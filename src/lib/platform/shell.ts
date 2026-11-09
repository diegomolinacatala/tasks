import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { currentTheme } from '../theme'

/**
 * Barra de estado con la tinta del tema. La pantalla de carga ya la quita index.html en cuanto
 * pinta #boot; esto es el respaldo por si aquello fallara (si ya no está, no hace nada).
 */
export async function showApp(): Promise<void> {
  const style = currentTheme() === 'dark' ? Style.Dark : Style.Light
  await Promise.allSettled([StatusBar.setStyle({ style }), SplashScreen.hide({ fadeOutDuration: 120 })])
}
