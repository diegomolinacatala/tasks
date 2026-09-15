import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // Dominio invertido de GitHub Pages: único y a nombre del propietario del repo.
  appId: 'io.github.diegomolinacatala.tasks',
  appName: 'Tasks',
  // `npm run build:native` genera aquí la web sin service worker y con rutas relativas.
  webDir: 'dist-native',
  backgroundColor: '#000000',
  ios: {
    // Las safe areas las resuelve el CSS con env(); el WebView ocupa toda la pantalla.
    contentInset: 'never',
    backgroundColor: '#000000',
    preferredContentMode: 'mobile',
  },
  plugins: {
    SplashScreen: {
      // La app la oculta en cuanto ha cargado el estado: sin pantallazo negro vacío.
      launchAutoHide: false,
      backgroundColor: '#000000',
      showSpinner: false,
    },
    LocalNotifications: {
      presentationOptions: ['banner', 'list', 'sound', 'badge'],
    },
  },
}

export default config
