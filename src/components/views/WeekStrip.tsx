import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { flushSync } from 'react-dom'
import { MONTH_WEEKS, addDays, addMonths, monthWeeks, sameMonth, startOfMonth, startOfWeek, weekDays } from '../../lib/date'
import { haptic } from '../../lib/platform/feedback'
import { dayLetters, isoWeekday } from '../../lib/routines'
import { useCopy } from '../../state/LanguageProvider'
import type { IsoDate } from '../../types'
import type { DayLoad } from './StripDay'
import { StripDay } from './StripDay'
import './agenda.css'

interface WeekStripProps {
  day: IsoDate
  today: IsoDate
  /** Lo que hay cada día; lo que falta, nada. */
  loads: ReadonlyMap<IsoDate, DayLoad>
  /** Días con algo en el calendario del iPhone: llevan un punto, como en la app Calendario. */
  eventDays?: ReadonlySet<IsoDate>
  /** Desplegada: el mes entero en lugar de la semana. */
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (date: IsoDate) => void
  /** Lo que va debajo de la tira: sube y baja con ella mientras se despliega o se recoge. */
  follower: RefObject<HTMLElement | null>
}

type Layout = 'week' | 'month'
type Mode = 'idle' | 'swipe' | 'pull' | 'ignore'

interface Gesture {
  x: number
  y: number
  t: number
  mode: Mode
  dx: number
  /** Al tirar: de dónde parte (0 recogida, 1 desplegada) y cuántos píxeles hay entre una y otra. */
  base: number
  span: number
  samples: { y: number; t: number }[]
}

const EMPTY: DayLoad = { total: 0, done: 0 }

const COPY = {
  es: { week: 'Semana', month: 'Mes', collapse: 'Recoger el mes', expand: 'Desplegar el mes' },
  en: { week: 'Week', month: 'Month', collapse: 'Collapse the month', expand: 'Expand the month' },
} as const

const LOCK_PX = 8
/** Fracción del ancho o velocidad (px/ms) que bastan para pasar de semana o de mes. */
const PAGE_RATIO = 0.22
const PAGE_SPEED = 0.35
const PAGE_MS = 300
/** Lo que tarda en desplegarse o recogerse; la parte del recorrido y el tirón (px/ms) que bastan para ello. */
const OPEN_MS = 340
const PULL_RATIO = 0.33
const PULL_SPEED = 0.35
const VELOCITY_WINDOW_MS = 90
/** Alto de una semana si aún no se puede medir (`--cal-row` en agenda.css). */
const ROW_PX = 46
/**
 * Los paneles de los lados (la semana o el mes de antes y de después) solo se ven al deslizar: se
 * pintan pasado este rato, cuando ya ha acabado lo que se esté animando, y no en el mismo toque que
 * cambia el día o despliega el mes (un mes son 42 días; con los de los lados, 126).
 */
const SIDES_DELAY_MS = OPEN_MS + 120

/**
 * Los días de la Agenda. Recogida, la semana del día elegido, como la tira de Structured: el número
 * y un anillo que se completa con lo hecho. Desplegada, el mes entero, como el calendario que baja en
 * Google Calendar: se abre tirando de la tira hacia abajo, con el asa o tocando el mes de la
 * cabecera, y elegir un día la recoge en su semana. A los lados se pasa de semana (o de mes). Mientras
 * se arrastra una tarea, cada día es un sitio donde soltarla.
 *
 * Desplegar no anima alturas: el mes ocupa su sitio de golpe y lo que se mueve son un recorte
 * (`clip-path`) y tres `transform` (las semanas, el asa y lo de debajo), que siguen al dedo sin pasar
 * por React.
 */
export function WeekStrip({ day, today, loads, eventDays, open, onOpenChange, onSelect, follower }: WeekStripProps) {
  const [layout, setLayout] = useState<Layout>(open ? 'month' : 'week')
  const copy = useCopy(COPY)
  const monday = startOfWeek(day)
  const weekIndex = Math.max(0, monthWeeks(day).indexOf(monday))
  const pageKey = layout === 'week' ? monday : day.slice(0, 7)
  const sidesKey = `${layout}:${pageKey}`
  // Para qué semana o mes están pintados los paneles de los lados; `null` al arrancar.
  const [sidesFor, setSidesFor] = useState<string | null>(null)
  const showSides = sidesFor === sidesKey

  const frame = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const rows = useRef<HTMLDivElement>(null)
  const handle = useRef<HTMLButtonElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const paging = useRef(false)
  const settling = useRef(false)
  /** Se ha pedido desplegar desde fuera: al pintarse el mes, se abre animando. */
  const entering = useRef(false)
  /** Cuánto se ve del mes: 0 recogida, 1 desplegada. */
  const progress = useRef(open ? 1 : 0)
  // El `click` que llega detrás de deslizar o tirar no debe elegir el día que había debajo.
  const moved = useRef(false)
  const timers = useRef(new Set<number>())
  // Lo último de cada render, para los temporizadores y los manejadores que no se vuelven a crear.
  const latest = useRef({ open, onOpenChange, onSelect, layout, weekIndex })
  latest.current = { open, onOpenChange, onSelect, layout, weekIndex }

  const later = (run: () => void, ms: number) => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      run()
    }, ms)
    timers.current.add(timer)
  }

  /** Deja todo como lo pinta el CSS: sin recorte ni desplazamientos. */
  const clear = () => {
    for (const node of [frame.current, rows.current, handle.current, follower.current]) {
      node?.style.removeProperty('transition')
      node?.style.removeProperty('transform')
      node?.style.removeProperty('clip-path')
    }
    frame.current?.style.removeProperty('--cal-p')
  }

  /**
   * Pinta el mes abierto en `p` (de 0 a 1) sobre el alto del mes entero: recorta lo que aún no se ve,
   * sube las semanas para que la elegida quede en la ventana y acerca el asa y lo de debajo.
   */
  const paint = (p: number, animate: boolean) => {
    const box = frame.current
    const list = rows.current
    if (!box || !list) return
    const rowHeight = (list.firstElementChild as HTMLElement | null)?.offsetHeight || ROW_PX
    const hidden = (MONTH_WEEKS - 1) * rowHeight * (1 - p)
    const lift = latest.current.weekIndex * rowHeight * (1 - p)
    const timing = `${OPEN_MS}ms var(--ease-sheet)`
    box.style.transition = animate ? `clip-path ${timing}` : 'none'
    box.style.clipPath = `inset(0 0 ${hidden}px 0)`
    box.style.setProperty('--cal-p', String(p))
    const shifts: [HTMLElement | null, number][] = [
      [list, lift],
      [handle.current, hidden],
      [follower.current, hidden],
    ]
    for (const [node, offset] of shifts) {
      if (!node) continue
      node.style.transition = animate ? `transform ${timing}` : 'none'
      node.style.transform = `translate3d(0,${-offset}px,0)`
    }
  }

  /**
   * Lleva la tira a recogida (0) o desplegada (1) desde donde esté; al acabar, cada cosa a su sitio.
   * Si la ha movido el dedo (`byGesture`), se avisa de dónde ha quedado. Si se pidió desde fuera y
   * mientras tanto se ha pedido lo contrario (dos toques seguidos al mes), manda lo último.
   */
  const settle = (target: 0 | 1, byGesture = false) => {
    settling.current = true
    // De "sin recorte" a un recorte no hay transición: primero se pinta el punto de partida.
    paint(progress.current, false)
    void frame.current?.offsetHeight
    paint(target, true)
    progress.current = target
    later(() => {
      settling.current = false
      const { open: wanted, onOpenChange: notify } = latest.current
      const opened = target === 1
      if (wanted !== opened && !byGesture) return settle(wanted ? 1 : 0)
      // Recogida: los estilos se quitan al pintarse la semana (el efecto de `layout`), en el mismo fotograma.
      if (opened) clear()
      else setLayout('week')
      if (wanted !== opened) notify(opened)
    }, OPEN_MS)
  }

  // Al desmontarse (o esconderse la pestaña) a medias, todo vuelve a su sitio.
  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer))
      timers.current.clear()
      paging.current = false
      settling.current = false
      gesture.current = null
      if (track.current) track.current.style.transform = ''
      clear()
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    if (showSides) return
    const timer = window.setTimeout(() => setSidesFor(sidesKey), SIDES_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [showSides, sidesKey])

  // Tras cambiar de semana o de mes la pista vuelve al centro sin animar: lo nuevo ya está ahí.
  useLayoutEffect(() => {
    const node = track.current
    if (!node) return
    node.style.transition = 'none'
    node.style.transform = ''
    paging.current = false
  }, [pageKey])

  useLayoutEffect(() => {
    if (layout === 'week') {
      clear()
      progress.current = 0
      return
    }
    if (!entering.current) return
    entering.current = false
    progress.current = 0
    settle(1)
  }, [layout]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lo pedido desde fuera (el mes de la cabecera, el asa, elegir un día) manda cuando no hay un gesto
  // ni una animación en marcha; si los hay, `settle` lo atiende al terminar.
  useEffect(() => {
    if (settling.current || gesture.current?.mode === 'pull') return
    if (open && layout === 'week') {
      entering.current = true
      setLayout('month')
    } else if (!open && layout === 'month') {
      settle(0)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const move = (dx: number, animate: boolean) => {
    const node = track.current
    if (!node) return
    node.style.transition = animate ? `transform ${PAGE_MS}ms var(--ease-sheet)` : 'none'
    node.style.transform = dx ? `translate3d(${dx}px,0,0)` : ''
  }

  const page = (direction: -1 | 1) => {
    const width = frame.current?.offsetWidth ?? window.innerWidth
    paging.current = true
    move(-direction * width, true)
    haptic('selection')
    // Al pasar de semana se conserva el día de la semana; al pasar de mes, el día del mes.
    later(() => latest.current.onSelect(layout === 'week' ? addDays(day, direction * 7) : addMonths(day, direction)), PAGE_MS)
  }

  /** Elegir un día con el mes desplegado lo recoge en su semana. */
  const pick = useCallback((date: IsoDate) => {
    const current = latest.current
    current.onSelect(date)
    if (current.layout === 'month' && current.open) current.onOpenChange(false)
  }, [])

  const capture = (event: ReactPointerEvent<HTMLDivElement>) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Sin captura el gesto sigue igual mientras el dedo esté encima.
    }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (paging.current || settling.current || (event.pointerType === 'mouse' && event.button !== 0)) return
    gesture.current = { x: event.clientX, y: event.clientY, t: event.timeStamp, mode: 'idle', dx: 0, base: 0, span: 0, samples: [] }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current || current.mode === 'ignore') return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y

    if (current.mode === 'idle') {
      if (Math.abs(dy) > LOCK_PX && Math.abs(dy) > Math.abs(dx)) {
        // Recogida solo se tira hacia abajo; desplegada, hacia arriba. Lo demás no lleva a nada.
        if (layout === 'week' ? dy < 0 : dy > 0) {
          current.mode = 'ignore'
          return
        }
        current.mode = 'pull'
        capture(event)
        if (layout === 'week') {
          // El mes tiene que estar pintado ya para que siga al dedo desde este mismo movimiento.
          flushSync(() => setLayout('month'))
          progress.current = 0
        }
        const rowHeight = (rows.current?.firstElementChild as HTMLElement | null)?.offsetHeight || ROW_PX
        current.span = (MONTH_WEEKS - 1) * rowHeight
        current.base = progress.current
        current.y = event.clientY
      } else if (Math.abs(dx) > LOCK_PX) {
        current.mode = 'swipe'
        capture(event)
        // Si los lados aún no están, ahora sí: el dedo los va a enseñar.
        if (!showSides) flushSync(() => setSidesFor(sidesKey))
      } else {
        return
      }
    }

    if (current.mode === 'pull') {
      const p = Math.min(1, Math.max(0, current.base + (event.clientY - current.y) / current.span))
      progress.current = p
      current.samples.push({ y: event.clientY, t: event.timeStamp })
      if (current.samples.length > 8) current.samples.shift()
      paint(p, false)
      return
    }
    current.dx = dx
    move(dx, false)
  }

  /** Velocidad vertical (px/ms) del final del gesto: hacia abajo, positiva. */
  const pullSpeed = (samples: Gesture['samples']) => {
    const last = samples[samples.length - 1]
    if (!last) return 0
    const first = samples.find((sample) => last.t - sample.t <= VELOCITY_WINDOW_MS) ?? last
    return last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0
  }

  const release = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const current = gesture.current
    gesture.current = null
    if (!current || (current.mode !== 'swipe' && current.mode !== 'pull')) return
    moved.current = true
    later(() => (moved.current = false), 350)

    if (current.mode === 'pull') {
      // Un tirón decide por sí solo; si no, basta un tercio del recorrido para cambiar de estado.
      const speed = cancelled ? 0 : pullSpeed(current.samples)
      const far = Math.abs(progress.current - current.base) > PULL_RATIO
      const target = speed > PULL_SPEED ? 1 : speed < -PULL_SPEED ? 0 : far ? (current.base ? 0 : 1) : current.base ? 1 : 0
      if (target !== current.base) haptic('selection')
      settle(target, true)
      return
    }
    if (cancelled) return move(0, true)
    const width = event.currentTarget.offsetWidth || window.innerWidth
    const speed = current.dx / Math.max(1, event.timeStamp - current.t)
    if (current.dx > width * PAGE_RATIO || speed > PAGE_SPEED) page(-1)
    else if (current.dx < -width * PAGE_RATIO || speed < -PAGE_SPEED) page(1)
    else move(0, true)
  }

  // Recogida, tres semanas (la elegida y las de al lado, que asoman al deslizar); desplegada, tres meses.
  const panels =
    layout === 'week'
      ? [addDays(monday, -7), monday, addDays(monday, 7)].map((start) => ({ key: start, weeks: [start], month: null }))
      : [-1, 0, 1].map((step) => {
          const month = addMonths(startOfMonth(day), step)
          return { key: month.slice(0, 7), weeks: monthWeeks(month), month }
        })

  const selectedColumn = isoWeekday(day) - 1
  const todayColumn = layout === 'week' && startOfWeek(today) === monday ? isoWeekday(today) - 1 : -1

  return (
    <div
      className={`cal ${layout === 'month' ? 'is-month' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => release(event, false)}
      onPointerCancel={(event) => release(event, true)}
      onClickCapture={(event: ReactMouseEvent) => {
        if (!moved.current) return
        moved.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div className="cal__letters" aria-hidden="true">
        {dayLetters().map((letter, index) => (
          <span key={index} className={`cal__letter ${index === selectedColumn ? 'is-selected' : ''} ${index === todayColumn ? 'is-today' : ''}`}>
            {letter}
          </span>
        ))}
      </div>
      <div ref={frame} className="strip" role="group" aria-label={layout === 'week' ? copy.week : copy.month}>
        <div ref={track} className="strip__track">
          {panels.map((panel, index) => {
            const center = index === 1
            return (
              <div key={panel.key} className="strip__panel" aria-hidden={!center}>
                <div ref={center ? rows : undefined} className="strip__rows">
                  {(center || showSides ? panel.weeks : []).map((start) => (
                    <div key={start} className="strip__week">
                      {weekDays(start).map((date) => (
                        <StripDay
                          key={date}
                          date={date}
                          selected={date === day}
                          isToday={date === today}
                          past={date < today}
                          outside={panel.month !== null && !sameMonth(date, panel.month)}
                          load={loads.get(date) ?? EMPTY}
                          events={eventDays?.has(date) ?? false}
                          droppable={center}
                          onSelect={pick}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <button
        ref={handle}
        type="button"
        className="cal__handle"
        aria-expanded={open}
        aria-label={open ? copy.collapse : copy.expand}
        onClick={() => onOpenChange(!open)}
      >
        <span />
      </button>
    </div>
  )
}
