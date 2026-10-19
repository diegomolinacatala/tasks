import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { shortTime } from '../../lib/date'
import { durationLabel, minutesOf } from '../../lib/duration'
import { haptic } from '../../lib/platform/feedback'
import type { SlotGap, SlotOption } from '../../lib/slot'
import { fillUntil, slotOptions, steppedStart, timeAt } from '../../lib/slot'
import { useCopy } from '../../state/LanguageProvider'
import { IconCheck, IconChevronLeft, IconChevronRight, IconClose } from '../ui/Icons'
import { PickerChip } from '../ui/PickerChip'
import { Clock } from './Timeline'

interface SlotCardProps {
  title: string
  /** La hora propuesta, en minutos desde medianoche. */
  start: number
  gap: SlotGap
  /** Lo que ya duraba la tarea (si tenía hora): se conserva salvo que se elija otra cosa. */
  initialDuration?: number | null
  /** Un evento del calendario: lo que dura ya está decidido; aquí solo se mueve. */
  fixedDuration?: number
  onConfirm: (start: number, duration: number | null) => void
  onCancel: () => void
}

const COPY = {
  es: {
    label: (title: string) => `Hora y duración de «${title}»`,
    earlier: 'Un cuarto de hora antes',
    later: 'Un cuarto de hora después',
    pick: 'Elegir la hora exacta',
    done: 'Listo',
    cancel: 'Dejarla donde estaba',
    lasts: (label: string) => `Dura ${label}`,
  },
  en: {
    label: (title: string) => `Time and duration of “${title}”`,
    earlier: 'A quarter hour earlier',
    later: 'A quarter hour later',
    pick: 'Pick the exact time',
    done: 'Done',
    cancel: 'Leave it where it was',
    lasts: (label: string) => `Lasts ${label}`,
  },
} as const

/**
 * La tarjeta que aparece en el hueco del horario al soltar ahí una tarea: la hora a la que empieza
 * (lo que acaba de proponer el hueco, con un cuarto de hora arriba o abajo o la rueda para afinar) y
 * cuánto dura, en píldoras. Ocupa el sitio que ocupará la tarea, con su hora en la columna: lo que se
 * ve es lo que va a quedar. Nada se guarda hasta "Listo"; la × la deja donde estaba.
 */
export function SlotCard({ title, start: proposed, gap, initialDuration = null, fixedDuration, onConfirm, onCancel }: SlotCardProps) {
  const copy = useCopy(COPY)
  const [start, setStart] = useState(proposed)
  const [duration, setDuration] = useState<number | null>(fixedDuration ?? initialDuration)
  // "Hasta las 12:00" sigue a la hora de empezar: si esta cambia, lo que queda hasta las 12 también.
  const [untilNext, setUntilNext] = useState(false)
  const options = useMemo(() => slotOptions(start, gap, initialDuration), [start, gap, initialDuration])
  const time = timeAt(start)
  const root = useRef<HTMLLIElement>(null)

  // Al soltar, la lista puede moverse (lo cogido vuelve a ocupar su sitio): la tarjeta se queda a la vista.
  useEffect(() => {
    root.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const moveStart = (next: number) => {
    setStart(next)
    if (!untilNext) return
    const fill = fillUntil(next, gap)
    setDuration(fill)
    if (fill === null) setUntilNext(false)
  }

  const step = (steps: number) => {
    haptic('selection')
    moveStart(steppedStart(start, steps))
  }

  const choose = (option: SlotOption) => {
    haptic('selection')
    setDuration(option.minutes)
    setUntilNext(option.until === true)
  }

  return (
    <li ref={root} className="tl tl--card" style={{ '--node': '24px' } as CSSProperties}>
      <span className="tl__time">
        <Clock minutes={start} />
      </span>
      <span className="tl__rail">
        <span className="tl__node tl__node--card" aria-hidden="true" />
      </span>
      <div className="slot" role="dialog" aria-label={copy.label(title)}>
        <div className="slot__head">
          <span className="slot__title">{title}</span>
          <button type="button" className="slot__close" aria-label={copy.cancel} onClick={onCancel}>
            <IconClose size={14} strokeWidth={2.2} />
          </button>
        </div>
        <div className="slot__row">
          <div className="slot__stepper">
            <button type="button" className="slot__step" aria-label={copy.earlier} onClick={() => step(-1)}>
              <IconChevronLeft size={16} strokeWidth={2.2} />
            </button>
            <PickerChip type="time" value={time} className="slot__clock" aria-label={copy.pick} onCommit={(value) => moveStart(minutesOf(value))}>
              {shortTime(time)}
            </PickerChip>
            <button type="button" className="slot__step" aria-label={copy.later} onClick={() => step(1)}>
              <IconChevronRight size={16} strokeWidth={2.2} />
            </button>
          </div>
          {fixedDuration !== undefined && <span className="slot__fixed">{copy.lasts(durationLabel(fixedDuration))}</span>}
          <button type="button" className="slot__ok" onClick={() => onConfirm(start, duration)}>
            <IconCheck size={14} strokeWidth={2.6} />
            {copy.done}
          </button>
        </div>
        {fixedDuration === undefined && (
          <div className="slot__pills" role="radiogroup">
            {options.map((option) => (
              <button
                key={option.minutes ?? 'none'}
                type="button"
                role="radio"
                aria-checked={option.minutes === duration}
                className={`slot__pill ${option.minutes === duration ? 'is-on' : ''}`}
                onClick={() => choose(option)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}
