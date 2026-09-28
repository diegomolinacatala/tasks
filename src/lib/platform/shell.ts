import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'

/**
 * Barra de estado en tinta sobre el papel. La pantalla de carga ya la quita index.html en cuanto
 * pinta #boot; esto es el respaldo por si aquello fallara (si ya no está, no hace nada).
 */
export async function showApp(): Promise<void> {
  await Promise.allSettled([StatusBar.setStyle({ style: Style.Light }), SplashScreen.hide({ fadeOutDuration: 120 })])
}
