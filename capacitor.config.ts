import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // Dominio invertido de GitHub Pages: único y a nombre del propietario del repo.
  appId: 'io.github.diegomolinacatala.tasks',
  appName: 'Tasks',
  // `npm run build:native` genera aquí la web sin service worker y con rutas relativas.
  webDir: 'dist-native',
  // Papel marfil (`--bg`): el mismo fondo que la pantalla de carga y que la web.
  backgroundColor: '#f4efe6',
  ios: {
    // Las safe areas las resuelve el CSS con env(); el WebView ocupa toda la pantalla.
    contentInset: 'never',
    backgroundColor: '#f4efe6',
    preferredContentMode: 'mobile',
  },
  plugins: {
    SplashScreen: {
      // Muestra LaunchScreen.storyboard hasta que la web pinta su copia exacta (#boot en
      // index.html), que la quita: el relevo no se ve y la web anima la entrada. Sin
      // `backgroundColor`: el plugin lo pondría encima del de la pantalla de carga, que cambia
      // con el modo oscuro (`LaunchBackground` en Assets.xcassets).
      launchAutoHide: false,
      showSpinner: false,
    },
    LocalNotifications: {
      presentationOptions: ['banner', 'list', 'sound', 'badge'],
    },
  },
}

export default config
