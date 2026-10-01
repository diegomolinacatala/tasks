import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { addLabel } from '../../lib/compose'
import { relativeLabel } from '../../lib/date'
import type { Details } from '../../lib/details'
import {
  addDetailReminder,
  draftTask,
  removeDetailReminder,
  withDate,
  withDuration,
  withImportance,
  withRepeat,
  withSection,
  withTime,
} from '../../lib/details'
import { createId } from '../../lib/id'
import { haptic } from '../../lib/platform/feedback'
import { routineLabel } from '../../lib/repeat'
import { ALL_DAYS, DAY_LETTERS, WEEKEND, WORKDAYS } from '../../lib/routines'
import type { IsoDate } from '../../types'
import { ImportanceScale } from '../importance/ImportanceScale'
import { DurationPicker } from '../task/DurationPicker'
import { ReminderPicker } from '../task/ReminderPicker'
import { SectionField, TimeField, WhenField } from '../task/fields'
import { IconChevronDown, IconClose, IconPin } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import '../routines/routines.css'
import './compose-sheet.css'

interface ComposeSheetProps {
  open: boolean
  /** Lo escrito en la barra: es el mismo texto, se edite aquí o allí. */
  title: string
  details: Details | null
  today: IsoDate
  onTitle: (title: string) => void
  onChange: (details: Details) => void
  onSubmit: () => void
  /** Plegar: vuelve a la barra con todo lo decidido. */
  onClose: () => void
}

const REPEATS: { label: string; days: readonly number[] }[] = [
  { label: 'Cada día', days: ALL_DAYS },
  { label: 'Entre semana', days: WORKDAYS },
  { label: 'Fines de semana', days: WEEKEND },
]

const sameDays = (a: readonly number[] | null, b: readonly number[]) => a !== null && a.length === b.length && a.every((day, index) => day === b[index])

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * La barra de escribir desplegada, como el reproductor de Spotify cuando se abre su mini reproductor:
 * lo que había en la barra pasa a una ficha a toda altura con todo lo de una tarea (cuándo, hora,
 * duración, avisos, si se repite, sección e importancia) y un botón grande para añadirla. Plegarla (la
 * flecha, el asa o tocar fuera) vuelve a la barra sin perder nada.
 */
export function ComposeSheet({ open, title, details, today, onTitle, onChange, onSubmit, onClose }: ComposeSheetProps) {
  // Al añadir, la barra se vacía mientras la ficha aún baja: hasta que se va, se ve lo que había.
  const [last, setLast] = useState<{ title: string; details: Details } | null>(null)
  if (details && (last?.details !== details || last.title !== title)) setLast({ title, details })
  const shown = details ? { title, details } : last

  // El título ocupa las líneas que tenga. El panel desmonta su contenido al cerrarse, así que se mide
  // también al montarse el campo (ref de función), no solo cuando cambia el texto.
  const titleInput = useRef<HTMLTextAreaElement | null>(null)
  const fit = (input: HTMLTextAreaElement) => {
    input.style.height = 'auto'
    input.style.height = `${input.scrollHeight + input.offsetHeight - input.clientHeight}px`
  }
  const titleRef = useCallback((node: HTMLTextAreaElement | null) => {
    titleInput.current = node
    if (node) fit(node)
  }, [])
  useLayoutEffect(() => {
    if (titleInput.current) fit(titleInput.current)
  }, [shown?.title])

  if (!shown) return null
  const { details: view } = shown
  const routine = view.repeat !== null
  const ready = shown.title.trim().length > 0
  const change = (next: Details) => {
    if (next !== view) onChange(next)
  }
  const where = routine ? routineLabel(view.repeat ?? [], view.time) : view.date ? capitalize(relativeLabel(view.date, today)) : 'Bandeja'

  const toggleDay = (day: number) => {
    const days = view.repeat ?? []
    const has = days.includes(day)
    // Como en el panel de la rutina: siempre toca algún día. Para que no se repita, "No se repite".
    if (has && days.length === 1) return
    haptic('selection')
    change(withRepeat(view, has ? days.filter((item) => item !== day) : [...days, day]))
  }

  const footer = (
    <button type="button" className="sheet__primary" disabled={!ready} onClick={onSubmit}>
      {routine ? 'Crear rutina' : addLabel(view.date, today)}
    </button>
  )

  return (
    <Sheet open={open} onClose={onClose} title={routine ? 'Nueva rutina' : 'Nueva tarea'} footer={footer}>
      <header className="compose-head">
        <button type="button" className="compose-head__fold" aria-label="Plegar" onClick={onClose}>
          <IconChevronDown size={22} />
        </button>
        <div className="compose-head__text">
          <p className="compose-head__kicker">{routine ? 'Nueva rutina' : 'Nueva tarea'}</p>
          <p className="compose-head__where">{where}</p>
        </div>
      </header>

      <textarea
        ref={titleRef}
        className="sheet__input compose-sheet__title"
        rows={1}
        value={shown.title}
        placeholder={routine ? 'Tomar creatina' : 'Qué hay que hacer'}
        aria-label={routine ? 'Nombre de la rutina' : 'Título de la tarea'}
        enterKeyHint="done"
        onChange={(event) => onTitle(event.target.value.replace(/\n/g, ' '))}
        onKeyDown={(event) => {
          // Intro suelta el teclado y deja ver los campos; añadir es el botón de abajo.
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
      />

      {!routine && (
        <>
          <WhenField date={view.date} today={today} onChange={(date) => change(withDate(view, date))} />
          {view.date !== null && <TimeField time={view.time} onChange={(time) => change(withTime(view, time, createId))} />}
          {view.date !== null && view.time !== null && (
            <DurationPicker time={view.time} duration={view.duration} onChange={(duration) => change(withDuration(view, duration))} />
          )}
          <ReminderPicker
            task={draftTask(view, shown.title)}
            onAdd={(reminder) => change(addDetailReminder(view, reminder, createId()))}
            onRemove={(id) => change(removeDetailReminder(view, id))}
            leading={
              view.newPlace && (
                <button
                  type="button"
                  className="chip chip--reminder"
                  aria-label={`Quitar el aviso de ${view.newPlace.name}`}
                  onClick={() => {
                    const { newPlace: _dropped, ...rest } = view
                    change(rest)
                  }}
                >
                  <IconPin size={13} />
                  {view.newPlace.on === 'arrive' ? 'Al llegar a' : 'Al salir de'} {view.newPlace.name}
                  <IconClose size={12} className="chip__remove" />
                </button>
              )
            }
          />
        </>
      )}

      <p className="sheet__title">Repetir</p>
      <div className="sheet__chips">
        <button type="button" className={`chip ${routine ? '' : 'is-active'}`} onClick={() => change(withRepeat(view, null))}>
          No se repite
        </button>
        {REPEATS.map((repeat) => (
          <button
            key={repeat.label}
            type="button"
            className={`chip ${sameDays(view.repeat, repeat.days) ? 'is-active' : ''}`}
            onClick={() => change(withRepeat(view, repeat.days))}
          >
            {repeat.label}
          </button>
        ))}
      </div>
      {routine && (
        <div className="days-picker compose-sheet__days" role="group" aria-label="Días de la semana">
          {DAY_LETTERS.map((letter, index) => {
            const day = index + 1
            const active = view.repeat?.includes(day) ?? false
            return (
              <button
                key={letter}
                type="button"
                className={`days-picker__day ${active ? 'is-active' : ''}`}
                aria-pressed={active}
                onClick={() => toggleDay(day)}
              >
                {letter}
              </button>
            )
          })}
        </div>
      )}

      {routine ? (
        <TimeField time={view.time} title="Aviso" noneLabel="Sin aviso" onChange={(time) => change(withTime(view, time, createId))} />
      ) : (
        <>
          {view.date !== null && <SectionField sectionId={view.sectionId} onChange={(sectionId) => change(withSection(view, sectionId))} />}
          <p className="sheet__title">Importancia</p>
          <ImportanceScale value={view.importance} onChange={(importance) => change(withImportance(view, importance))} />
        </>
      )}
    </Sheet>
  )
}
