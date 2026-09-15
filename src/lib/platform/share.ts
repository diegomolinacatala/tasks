import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * Exportar en el iPhone: WKWebView ignora los enlaces de descarga, así que el fichero se escribe
 * en la caché y se abre la hoja de compartir ("Guardar en Archivos", AirDrop, Mail…).
 */
export async function shareFile(filename: string, contents: string): Promise<void> {
  const { uri } = await Filesystem.writeFile({
    path: filename,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    data: contents,
  })
  try {
    await Share.share({ title: filename, files: [uri] })
  } catch (error) {
    // Cerrar la hoja sin elegir destino no es un error.
    if (error instanceof Error && /cancel/i.test(error.message)) return
    throw error
  }
}
