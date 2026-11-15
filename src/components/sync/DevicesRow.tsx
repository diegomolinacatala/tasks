import { lazy, Suspense, useEffect, useState } from 'react'
import { useCopy } from '../../state/LanguageProvider'
import { SettingsRow } from '../settings/SettingsRow'
import { Sheet } from '../ui/Sheet'
import { useSync } from './SyncProvider'
import './sync.css'

const DevicesSheet = lazy(() => import('./DevicesSheet').then((module) => ({ default: module.DevicesSheet })))

const COPY = {
  es: { title: 'Dispositivos', off: 'Sin vincular', online: 'Al día', offline: 'Sin conexión', connecting: 'Conectando…' },
  en: { title: 'Devices', off: 'Not linked', online: 'Up to date', offline: 'Offline', connecting: 'Connecting…' },
} as const

/** Ajustes → Dispositivos: vincular este, ver los tuyos y quitar alguno. Sin servidor no sale. */
export function DevicesRow({ openRequest = 0 }: { openRequest?: number }) {
  const copy = useCopy(COPY)
  const sync = useSync()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (openRequest) setOpen(true)
  }, [openRequest])

  if (!sync.available) return null
  const value = !sync.link ? copy.off : sync.status === 'online' ? copy.online : sync.status === 'connecting' ? copy.connecting : copy.offline

  return (
    <>
      <SettingsRow
        icon={<IconDevices size={17} />}
        label={copy.title}
        value={<span className={`link-status ${sync.status === 'online' ? 'is-online' : ''}`}>{value}</span>}
        onClick={() => setOpen(true)}
      />
      <Sheet screen="devices" open={open} onClose={() => setOpen(false)} title={copy.title}>
        {open && (
          <Suspense fallback={null}>
            <DevicesSheet />
          </Suspense>
        )}
      </Sheet>
    </>
  )
}

/** Un móvil y una pantalla: tus dispositivos. */
function IconDevices({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="4.5" width="14" height="10" rx="1.6" />
      <path d="M6.5 18.5h6M9.5 14.5v4" />
      <rect x="16.5" y="9" width="5" height="10.5" rx="1.3" />
    </svg>
  )
}
