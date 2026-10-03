import { isNative } from '.'

/**
 * Foto de lo que se ve, para rodear encima lo que se quiere comentar. Solo en el iPhone: una página web
 * no puede fotografiarse a sí misma, así que en la PWA es `null` y se rodea sobre la app en vivo.
 */
export async function captureScreen(): Promise<string | null> {
  if (!isNative) return null
  try {
    const { TasksNative } = await import('./native')
    return (await TasksNative.screenshot()).image
  } catch {
    return null
  }
}
