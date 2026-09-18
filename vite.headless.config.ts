import { defineConfig } from 'vite'

// `headless.js`: la lógica de apuntar tareas para la app de iPhone, que la ejecuta con
// JavaScriptCore cuando Siri o un atajo añaden una tarea sin abrir la app (`src/headless.ts`).
// Se construye con `--mode native` detrás de la web, en la misma carpeta que copia Capacitor.
export default defineConfig({
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: 'dist-native',
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: 'src/headless.ts',
      name: 'TasksHeadless',
      formats: ['iife'],
      fileName: () => 'headless.js',
    },
  },
})
