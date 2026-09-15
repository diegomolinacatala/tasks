import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'

/**
 * En el iPhone el estado se guarda además en un fichero de Library: entra en las copias de
 * iCloud del dispositivo y iOS no lo borra al liberar espacio, cosa que sí puede hacer con el
 * almacenamiento del WebView.
 */
const FILE = 'tasks-state.json'

export async function readStateFile(): Promise<unknown> {
  try {
    const { data } = await Filesystem.readFile({ path: FILE, directory: Directory.Library, encoding: Encoding.UTF8 })
    return typeof data === 'string' ? JSON.parse(data) : null
  } catch {
    // Primer arranque o fichero ilegible: se sigue con IndexedDB.
    return null
  }
}

export async function writeStateFile(json: string): Promise<void> {
  await Filesystem.writeFile({ path: FILE, directory: Directory.Library, encoding: Encoding.UTF8, data: json })
}
