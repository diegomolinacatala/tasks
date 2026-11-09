import type { CSSProperties } from 'react'
import { dayNumber, monthLong } from '../../lib/date'
import { locale } from '../../lib/i18n'
import type { Recap } from '../../lib/recap'
import { useCopy } from '../../state/LanguageProvider'

const COPY = {
  es: {
    caption: 'Tu cuaderno',
    since: (day: string, month: string, year: string | null) => `desde el ${day} de ${month}${year ? ` de ${year}` : ''}`,
    today: 'de hoy',
    done: (count: number) => (count === 1 ? 'hecha' : 'hechas'),
    streak: 'días seguidos',
    places: (count: number) => (count === 1 ? 'lugar' : 'lugares'),
    routines: (count: number) => (count === 1 ? 'rutina' : 'rutinas'),
    days: (count: number) => (count === 1 ? 'día' : 'días'),
  },
  en: {
    caption: 'Your notebook',
    since: (day: string, month: string, year: string | null) => `since ${month} ${day}${year ? `, ${year}` : ''}`,
    today: 'today',
    done: () => 'done',
    streak: 'days in a row',
    places: (count: number) => (count === 1 ? 'place' : 'places'),
    routines: (count: number) => (count === 1 ? 'routine' : 'routines'),
    days: (count: number) => (count === 1 ? 'day' : 'days'),
  },
} as const

interface Entry {
  key: string
  value: number
  label: string
  emoji?: string | null
}

interface CoverLedgerProps {
  recap: Recap
  today: string
}

/**
 * El cuaderno de quien ya usa la app, en la portada: lo hecho, su racha viva más larga (con el emoji de
 * la rutina) y sus lugares (o sus rutinas, o los días que lleva), como las cuentas de un libro de casa.
 */
export function CoverLedger({ recap, today }: CoverLedgerProps) {
  const copy = useCopy(COPY)
  const third: Entry = recap.places
    ? { key: 'places', value: recap.places, label: copy.places(recap.places) }
    : recap.routines
      ? { key: 'routines', value: recap.routines, label: copy.routines(recap.routines) }
      : { key: 'days', value: recap.days, label: copy.days(recap.days) }
  const entries: Entry[] = [
    ...(recap.done ? [{ key: 'done', value: recap.done, label: copy.done(recap.done) }] : []),
    ...(recap.streak ? [{ key: 'streak', value: recap.streak.days, label: copy.streak, emoji: recap.streak.emoji }] : []),
    third,
  ]
  const year = recap.since.slice(0, 4) === today.slice(0, 4) ? null : recap.since.slice(0, 4)
  const since = recap.days > 1 ? copy.since(dayNumber(recap.since), monthLong(recap.since), year) : copy.today

  return (
    <figure className="welcome__ledger">
      <figcaption className="welcome__ledger-caption">
        {copy.caption} <span>{since}</span>
      </figcaption>
      <dl className="welcome__ledger-list">
        {entries.map((entry, index) => (
          <div key={entry.key} className="welcome__ledger-entry" style={{ '--i': index } as CSSProperties}>
            {/* El rótulo va antes, como manda `dl`; la cifra se pinta encima (column-reverse) */}
            <dt>{entry.label}</dt>
            <dd>
              {entry.value.toLocaleString(locale())}
              {entry.emoji && (
                <span className="welcome__ledger-emoji emoji" aria-hidden="true">
                  {entry.emoji}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  )
}
