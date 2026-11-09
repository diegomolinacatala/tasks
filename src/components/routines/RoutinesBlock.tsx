import { useMemo } from 'react'
import { shortTime } from '../../lib/date'
import { MAX_ROUTINES, byRoutineOrder, isDue, routineProgress } from '../../lib/routines'
import { useCopy, useLanguage } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { IsoDate } from '../../types'
import { BlockHeader } from '../section/BlockHeader'
import { useRowActions } from '../task/rowActions'
import { IconPlus, IconRepeat } from '../ui/Icons'
import { PickerChip } from '../ui/PickerChip'
import { RoutineRow } from './RoutineRow'
import './routines.css'

const COPY = {
  es: {
    title: 'Rutinas',
    add: 'Nueva rutina',
    renew: 'Se renuevan a las',
    change: (time: string) => `Las rutinas se renuevan a las ${time}. Cambiar la hora`,
  },
  en: {
    title: 'Routines',
    add: 'New routine',
    renew: 'They reset at',
    change: (time: string) => `Routines reset at ${time}. Change the time`,
  },
} as const

interface RoutinesBlockProps {
  today: IsoDate
}

/**
 * Rutinas en la Bandeja: primero las que tocan hoy (lo pendiente arriba), después las que hoy no
 * tocan, atenuadas. La cabecera dice cuántas van hechas hoy.
 */
export function RoutinesBlock({ today }: RoutinesBlockProps) {
  const { routines, collapsed, settings } = useAppState()
  const dispatch = useDispatch()
  const actions = useRowActions()
  const copy = useCopy(COPY)
  const language = useLanguage()

  const sorted = useMemo(() => {
    const rank = (due: boolean, done: boolean) => (due ? (done ? 1 : 0) : 2)
    return [...routines].sort(
      (a, b) =>
        rank(isDue(a, today), a.done.includes(today)) - rank(isDue(b, today), b.done.includes(today)) || byRoutineOrder(a, b),
    )
  }, [routines, today])
  const progress = routineProgress(routines, today)
  // Como en un reloj: "00:00" y "04:30" en español (medianoche no es "0:00"); "12:00 AM" en inglés.
  const renewAt = language === 'en' ? shortTime(settings.dayStart) : settings.dayStart

  if (!routines.length) {
    return (
      <section className="block routines">
        <button type="button" className="routines__empty" onClick={() => actions.openRoutine('')}>
          <IconRepeat size={16} />
          <span>
            {copy.title} · {copy.add}
          </span>
        </button>
      </section>
    )
  }

  return (
    <section className="block routines">
      <BlockHeader
        label={copy.title}
        collapsed={collapsed.routines}
        onToggle={() => dispatch({ type: 'block/toggle', block: 'routines' })}
        action={
          <>
            {progress.total > 0 && (
              <span className={`routines__progress ${progress.done === progress.total ? 'is-complete' : ''}`}>
                {progress.done}/{progress.total}
              </span>
            )}
            {/* Al tope (50) no hay dónde añadir: el "+" se va en vez de abrir un panel que no crea nada. */}
            {routines.length < MAX_ROUTINES && (
              <button type="button" className="section__icon section__icon--add" aria-label={copy.add} onClick={() => actions.openRoutine('')}>
                <IconPlus size={17} />
              </button>
            )}
          </>
        }
      />
      {!collapsed.routines && (
        <ul className="column routines__list">
          {sorted.map((routine) => (
            <RoutineRow key={routine.id} routine={routine} today={today} />
          ))}
        </ul>
      )}
      {/* Cuándo amanecen sin tachar: casi nadie lo cambia, así que es una nota y no un ajuste. Tocar la hora la cambia. */}
      {!collapsed.routines && (
        <p className="routines__renew">
          <IconRepeat size={12} />
          <span>{copy.renew}</span>
          <PickerChip
            type="time"
            value={settings.dayStart}
            className="routines__time"
            onCommit={(time) => dispatch({ type: 'settings/dayStart', time })}
          >
            <span aria-label={copy.change(renewAt)}>{renewAt}</span>
          </PickerChip>
        </p>
      )}
    </section>
  )
}
