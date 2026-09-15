import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'

/** La pantalla de carga se quita cuando ya hay algo que enseñar; la barra de estado, en claro sobre negro. */
export async function showApp(): Promise<void> {
  await Promise.allSettled([StatusBar.setStyle({ style: Style.Dark }), SplashScreen.hide({ fadeOutDuration: 150 })])
}
