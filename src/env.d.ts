interface ImportMetaEnv {
  /** URL del Worker de avisos. Sin ella, la app funciona igual pero sin notificaciones. */
  readonly VITE_PUSH_API?: string
}

/** Día del build (AAAA-MM-DD), puesto por `define` en `vite.config.ts`. */
declare const __BUILD_DATE__: string
