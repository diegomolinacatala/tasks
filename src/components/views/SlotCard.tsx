import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { shortTime } from '../../lib/date'
import { durationLabel, minutesOf } from '../../lib/duration'
import { haptic } from '../../lib/platform/feedback'
import type { SlotOption } from '../../lib/slot'
import { fillUntil, gapAt, slotOptions, timeAt } from '../../lib/slot'
import { busySpans } from '../../lib/tape'
import type { TimelineItem } from '../../lib/timeline'
import { useCopy } from '../../state/LanguageProvider'
import { IconCheck, IconClose } from '../ui/Icons'
import { PickerChip } from '../ui/PickerChip'
import { HourTape } from './HourTape'
import { Clock } from './Timeline'

interface SlotCardProps {
  title: string
  /** La hora propuesta, en minutos desde medianoche. */
  start: number
  /** Lo que tiene hora ese día, sin lo que se está colocando: sombrea la cinta y dice hasta cuándo hay hueco. */
  items: readonly TimelineItem[]
  /** Minutos de ahora si el día es hoy. */
  now: number | null
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
    tape: 'Hora: arrastra la cinta',
    pick: 'Elegir la hora exacta',
    done: 'Listo',
    cancel: 'Dejarla donde estaba',
    lasts: (label: string) => `Dura ${label}`,
  },
  en: {
    label: (title: string) => `Time and duration of “${title}”`,
    tape: 'Time: drag the tape',
    pick: 'Pick the exact time',
    done: 'Done',
    cancel: 'Leave it where it was',
    lasts: (label: string) => `Lasts ${label}`,
  },
} as const

/**
 * La tarjeta que aparece en el hueco del horario al soltar ahí una tarea: la hora a la que empieza,
 * que se elige en la **cinta de horas** (cualquier hora del día a un gesto, con lo ocupado sombreado) o
 * tocando la hora grande, que abre la rueda; y cuánto dura, en píldoras ("Hasta las …" sigue a la hora:
 * siempre es hasta lo siguiente que haya). Ocupa el sitio donde se soltó, con su hora en la columna.
 * Nada se guarda hasta "Listo"; la × la deja donde estaba.
 */
export function SlotCard({ title, start: proposed, items, now, initialDuration = null, fixedDuration, onConfirm, onCancel }: SlotCardProps) {
  const copy = useCopy(COPY)
  const [start, setStart] = useState(proposed)
  const [duration, setDuration] = useState<number | null>(fixedDuration ?? initialDuration)
  // "Hasta las 12:00" sigue a la hora de empezar: si esta cambia, lo que queda hasta las 12 también.
  const [untilNext, setUntilNext] = useState(false)
  const gap = useMemo(() => gapAt(items, start), [items, start])
  const busy = useMemo(() => busySpans(items), [items])
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
    const fill = fillUntil(next, gapAt(items, next))
    setDuration(fill)
    if (fill === null) setUntilNext(false)
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
          <PickerChip type="time" value={time} className="slot__clock" aria-label={copy.pick} onCommit={(value) => moveStart(minutesOf(value))}>
            {shortTime(time)}
          </PickerChip>
          {fixedDuration !== undefined && <span className="slot__fixed">{copy.lasts(durationLabel(fixedDuration))}</span>}
          <button type="button" className="slot__ok" onClick={() => onConfirm(start, duration)}>
            <IconCheck size={14} strokeWidth={2.6} />
            {copy.done}
          </button>
        </div>
        <HourTape start={start} busy={busy} now={now} duration={fixedDuration ?? duration} label={copy.tape} onChange={moveStart} />
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
