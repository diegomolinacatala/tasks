import { useMemo } from 'react'
import { byRoutineOrder, isDue, routineProgress } from '../../lib/routines'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { IsoDate } from '../../types'
import { BlockHeader } from '../section/BlockHeader'
import { useRowActions } from '../task/rowActions'
import { IconPlus, IconRepeat } from '../ui/Icons'
import { RoutineRow } from './RoutineRow'
import './routines.css'

const COPY = {
  es: { title: 'Rutinas', add: 'Nueva rutina' },
  en: { title: 'Routines', add: 'New routine' },
} as const

interface RoutinesBlockProps {
  today: IsoDate
}

/**
 * Rutinas en la Bandeja: primero las que tocan hoy (lo pendiente arriba), después las que hoy no
 * tocan, atenuadas. La cabecera dice cuántas van hechas hoy.
 */
export function RoutinesBlock({ today }: RoutinesBlockProps) {
  const { routines, collapsed } = useAppState()
  const dispatch = useDispatch()
  const actions = useRowActions()
  const copy = useCopy(COPY)

  const sorted = useMemo(() => {
    const rank = (due: boolean, done: boolean) => (due ? (done ? 1 : 0) : 2)
    return [...routines].sort(
      (a, b) =>
        rank(isDue(a, today), a.done.includes(today)) - rank(isDue(b, today), b.done.includes(today)) || byRoutineOrder(a, b),
    )
  }, [routines, today])
  const progress = routineProgress(routines, today)

  return (
    <section className="block routines">
      <BlockHeader
        label={copy.title}
        collapsed={routines.length ? collapsed.routines : undefined}
        onToggle={routines.length ? () => dispatch({ type: 'block/toggle', block: 'routines' }) : undefined}
        action={
          <>
            {progress.total > 0 && (
              <span className={`routines__progress ${progress.done === progress.total ? 'is-complete' : ''}`}>
                {progress.done}/{progress.total}
              </span>
            )}
            <button type="button" className="section__icon" aria-label={copy.add} onClick={() => actions.openRoutine('')}>
              <IconPlus size={17} />
            </button>
          </>
        }
      />
      {!routines.length && (
        <button type="button" className="routines__empty" onClick={() => actions.openRoutine('')}>
          <IconRepeat size={16} />
          <span>{copy.add}</span>
        </button>
      )}
      {routines.length > 0 && !collapsed.routines && (
        <ul className="column routines__list">
          {sorted.map((routine) => (
            <RoutineRow key={routine.id} routine={routine} today={today} />
          ))}
        </ul>
      )}
    </section>
  )
}
