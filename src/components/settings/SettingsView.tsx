import { useEffect, useState } from 'react'
import { isNative } from '../../lib/platform'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState } from '../../state/StoreProvider'
import { IconDownload, IconFeather, IconHelp, IconLock, IconSparkle, IconStar } from '../ui/Icons'
import { useAvailableUpdate } from '../update/updateState'
import { AppearanceRow } from './AppearancePicker'
import { CalendarRow } from './CalendarBlock'
import { DataRow } from './DataRow'
import { DictationRow } from './DictationBlock'
import { LanguagePicker } from './LanguagePicker'
import { NotificationsRow } from './NotificationsBlock'
import { SettingsRow } from './SettingsRow'
import './settings.css'

const SITE = 'https://diegomolinacatala.github.io/tasks/'
const APP_STORE = 'https://apps.apple.com/app/id6812776586'

const COPY = {
  es: {
    title: 'Ajustes',
    general: 'General',
    connections: 'Avisos y calendario',
    help: 'Ayuda',
    data: 'Tus datos',
    welcome: 'Ver la bienvenida',
    suggest: 'Sugerir una mejora',
    suggestNote: 'Rodea lo que cambiarías y cuéntalo',
    rate: 'Valorar en la App Store',
    support: 'Soporte',
    privacy: 'Privacidad',
    supportPage: 'soporte.html',
    privacyPage: 'privacidad.html',
    version: (value: string) => `Versión ${value}`,
    build: (day: string) => `Versión web del ${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`,
    update: (value: string) => `Actualizar a la ${value}`,
    updateNote: 'Ya está en la App Store',
  },
  en: {
    title: 'Settings',
    general: 'General',
    connections: 'Notifications & calendar',
    help: 'Help',
    data: 'Your data',
    welcome: 'See the intro',
    suggest: 'Suggest an improvement',
    suggestNote: 'Circle what you’d change and say it',
    rate: 'Rate on the App Store',
    support: 'Support',
    privacy: 'Privacy',
    supportPage: 'support.html',
    privacyPage: 'privacy.html',
    version: (value: string) => `Version ${value}`,
    build: (day: string) => `Web build ${day.slice(5, 7)}/${day.slice(8, 10)}/${day.slice(0, 4)}`,
    update: (value: string) => `Update to ${value}`,
    updateNote: 'Now on the App Store',
  },
} as const

interface SettingsViewProps {
  /** Volver a ver la bienvenida del primer día. */
  onWelcome: () => void
  /** Entrar en el modo sugerencia. Sin servidor (en local) no hay. */
  onSuggest?: () => void
}

/**
 * Ajustes, como los de iOS: una sola lista corta de filas en cuatro grupos, cada una con su sello, su
 * valor de ahora y su panel. Lo que antes eran grupos enteros con notas (avisos, calendario, dictado,
 * datos) vive ahora en su panel, entero: no se pierde nada, solo deja de estar todo a la vez.
 */
export function SettingsView({ onWelcome, onSuggest }: SettingsViewProps) {
  const state = useAppState()
  const copy = useCopy(COPY)
  const [version, setVersion] = useState<string | null>(null)
  const update = useAvailableUpdate()

  useEffect(() => {
    if (!isNative) return
    void import('@capacitor/app')
      .then(({ App }) => App.getInfo())
      .then((info) => setVersion(`${info.version} (${info.build})`))
      .catch(() => undefined)
  }, [])

  return (
    <div className="view settings">
      <header className="view__head">
        <p className="view__kicker">Tasks</p>
        <div className="view__headline">
          <h1 className="view__title">{copy.title}</h1>
        </div>
        <div className="view__progress view__progress--plain" aria-hidden="true" />
      </header>

      {/* Una versión nueva va lo primero: es lo único de aquí que no se ha pedido y conviene ver. */}
      {update && (
        <div className="group__card settings__update">
          <SettingsRow icon={<IconDownload size={17} />} label={copy.update(update.version)} hint={copy.updateNote} href={update.url} />
        </div>
      )}

      <section className="group">
        <h2 className="group__title">{copy.general}</h2>
        <div className="group__card">
          <AppearanceRow value={state.settings.theme} />
          <LanguagePicker value={state.settings.language} />
        </div>
      </section>

      <ConnectionsGroup title={copy.connections} />

      {/* Lo que quieres que tus amigos encuentren va antes que los datos, no al final de la página. */}
      <section className="group">
        <h2 className="group__title">{copy.help}</h2>
        <div className="group__card">
          {onSuggest && <SettingsRow icon={<IconFeather size={17} />} label={copy.suggest} hint={copy.suggestNote} onClick={onSuggest} />}
          <SettingsRow icon={<IconSparkle size={17} />} label={copy.welcome} onClick={onWelcome} />
          <SettingsRow icon={<IconHelp size={17} />} label={copy.support} href={`${SITE}${copy.supportPage}`} />
          {isNative && <SettingsRow icon={<IconStar size={17} />} label={copy.rate} href={`${APP_STORE}?action=write-review`} />}
        </div>
      </section>

      <section className="group">
        <h2 className="group__title">{copy.data}</h2>
        <div className="group__card">
          <DataRow />
          <SettingsRow icon={<IconLock size={17} />} label={copy.privacy} href={`${SITE}${copy.privacyPage}`} />
        </div>
      </section>

      <p className="settings__version">
        {version ? copy.version(version) : copy.build(__BUILD_DATE__)}
      </p>
    </div>
  )
}

/**
 * Avisos, calendario y dictado: cada fila sale solo donde existe (sin servidor no hay avisos ni dictado;
 * sin calendario, la PWA). Si no queda ninguna, el grupo no se pinta.
 */
function ConnectionsGroup({ title }: { title: string }) {
  return (
    <section className="group settings__connections">
      <h2 className="group__title">{title}</h2>
      <div className="group__card">
        <NotificationsRow />
        <CalendarRow />
        <DictationRow />
      </div>
    </section>
  )
}
