import { isNative } from '.'

export type Feedback = 'tap' | 'success' | 'warning' | 'selection'

/**
 * El generador de los pasos (`selection`): el plugin solo vibra con `selectionChanged` si antes se ha
 * llamado a `selectionStart`, que lo crea. Se crea una vez y se queda.
 */
let selecting: Promise<void> | null = null

/** Vibración háptica del iPhone. En la PWA no hace nada: Safari no expone vibración. */
export function haptic(kind: Feedback): void {
  if (!isNative) return
  void import('@capacitor/haptics')
    .then(({ Haptics, ImpactStyle, NotificationType }) => {
      if (kind === 'tap') return Haptics.impact({ style: ImpactStyle.Light })
      if (kind === 'selection') {
        selecting ??= Haptics.selectionStart()
        return selecting.then(() => Haptics.selectionChanged())
      }
      return Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Warning })
    })
    // Sin motor háptico (iPod, ajustes de accesibilidad) no hay nada que hacer.
    .catch(() => undefined)
}
