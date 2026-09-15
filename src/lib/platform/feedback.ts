import { isNative } from '.'

export type Feedback = 'tap' | 'success' | 'warning' | 'selection'

/** Vibración háptica del iPhone. En la PWA no hace nada: Safari no expone vibración. */
export function haptic(kind: Feedback): void {
  if (!isNative) return
  void import('@capacitor/haptics')
    .then(({ Haptics, ImpactStyle, NotificationType }) => {
      if (kind === 'tap') return Haptics.impact({ style: ImpactStyle.Light })
      if (kind === 'selection') return Haptics.selectionChanged()
      return Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Warning })
    })
    // Sin motor háptico (iPod, ajustes de accesibilidad) no hay nada que hacer.
    .catch(() => undefined)
}
