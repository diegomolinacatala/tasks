/** El usuario ha pedido menos movimiento: las láminas enseñan el resultado en vez de animarlo. */
export const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
