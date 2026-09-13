import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// El repo se publica en https://<user>.github.io/tasks/ -> base obligatoria.
const BASE = '/tasks/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      // SW propio: además de precachear, recibe los push y abre la tarea al tocar el aviso.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: BASE,
        name: 'Tasks',
        short_name: 'Tasks',
        description: 'Tareas del día. Local, offline, sin cuentas.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/state/**'],
      // Pegamento de navegador/React: se valida en el propio dispositivo, no en Node.
      exclude: [
        'src/state/actions.ts',
        'src/state/StoreProvider.tsx',
        'src/lib/persistence.ts',
        'src/lib/transition.ts',
        'src/lib/push/client.ts',
        'src/lib/push/keystore.ts',
        'src/lib/voice/capture.ts',
        'src/lib/voice/speech.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
})
