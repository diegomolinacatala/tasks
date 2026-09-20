import type { InterpretContext } from './types'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const WEEK_LABELS = ['Esta semana', 'Semana que viene', 'Dentro de dos semanas']
const THURSDAY = 4

const RULES = `Conviertes lo que alguien dicta en español en tareas de una app de to-do. Respondes solo con JSON.

Primero separas cada tarea en cuatro partes copiando las palabras de la frase:
- tema: qué hay que hacer.
- cuando: el día, la hora y lo que dura la tarea, o null.
- avisos: cada petición de aviso por separado, o [].
- lugar: si pide que el aviso salte al llegar a un sitio o al salir de él ("al pasar por Mercadona", "cuando llegue a la universidad", "al salir de casa"), esas palabras; si no, null.
Después conviertes cada parte.

TÍTULO (title), a partir del tema:
- Lo mínimo que identifica la tarea, como se apuntaría en una lista.
- Si es algo a lo que se va o se asiste (cena, reunión, boda, clase, cita, médico, dentista, gimnasio, vuelo, examen, fiesta…), el título es ese sustantivo con sus complementos, sin el verbo de ir, acudir, asistir o tener ni artículo delante: "acudir a una cena" → "Cena"; "ir al gimnasio" → "Gimnasio"; "asistir a la boda de Carlos" → "Boda de Carlos"; "tengo dentista" → "Dentista"; "tengo una reunión con Ana" → "Reunión con Ana".
- Si es una acción, verbo en infinitivo y su complemento tal como se dijo: "tengo que llamar a Miguel" → "Llamar a Miguel"; "tomarme la pastilla" → "Tomar la pastilla"; "llevar al perro al veterinario" → "Llevar al perro al veterinario".
- "ir a un sitio a hacer algo" es la acción: "ir a recoger a los niños" → "Recoger a los niños"; "ir a correos a mandar un paquete" → "Mandar un paquete".
- Nunca contiene el día, la hora ni los avisos ("mañana", "hoy", "a las 5", "el jueves", "antes de las 12").
- Sin muletillas ni peticiones: "bueno", "vale", "pues", "oye", "a ver", "tengo que", "hay que", "me gustaría", "quiero que", "recuérdame", "apunta", "acordarme de", "que no se me olvide".
- Mayúscula inicial, sin punto final, respeta nombres propios.

DÍA (date, AAAA-MM-DD). Se lee del calendario:
- null si la frase no dice ningún día, aunque diga una hora: "llamar a Ana a las 5" → date null. La app decide si es hoy o mañana.
- "hoy", "mañana", "pasado mañana" están marcados.
- "el jueves", "el próximo miércoles": el primero que llega después de hoy, nunca hoy.
- "el lunes que viene", "la semana que viene el martes": ese día dentro de "Semana que viene".
- "el 22", "el día 1": el próximo día con ese número. "antes del día 30" → el día 30.

HORA (time, HH:MM de 24 h, o null si no se dice hora):
- "a las 5" sin más es 17:00: de 1 a 7 es por la tarde. "a las 9", "a las 10", "a las 12" son 09:00, 10:00, 12:00.
- "de la mañana", "de la tarde", "de la noche" mandan: "a las diez de la noche" → 22:00, "a las 7 de la mañana" → 07:00.
- "y media" +30 min, "y cuarto" +15, "menos cuarto" −15. "20.00" y "20:00 horas" son 20:00. "antes de las 12" → 12:00.
- Franjas: "a primera hora" 08:00, "por la mañana" 09:00, "al mediodía" 14:00, "esta tarde" o "por la tarde" 18:00, "esta noche" o "por la noche" 21:00.
- "esta mañana", "esta tarde", "esta noche" también fijan el día: hoy.
- Una hora que va con un aviso es del aviso, no de la tarea: en "cumpleaños el día 3, recuérdamelo dos días antes a las 10" la tarea no tiene hora.
- "en 20 minutos", "dentro de dos horas" no son hora de la tarea: son un aviso con inMinutes, y la tarea queda con date y time a null.

DURACIÓN (durationMinutes, los minutos que ocupa la tarea, o null):
- Solo si la frase lo dice: "durante una hora" 60, "durante 45 minutos" 45, "que dura media hora" 30, "una hora y media de duración" 90, "una reunión de dos horas" 120.
- Un tramo da la hora y la duración a la vez: "de 17:30 a 18:30" → time 17:30 y 60; "de las 5 a las 7" → time 17:00 y 120; "hasta las 19:00" se cuenta desde la hora de la tarea.
- Nunca se supone: una cena o una reunión sin más tienen durationMinutes null.
- Un aviso antes de la tarea no es una duración: "una hora antes" es un aviso, y "en dos horas" es un plazo.

AVISOS (reminders). Solo los que se piden expresamente ("avísame", "recuérdamelo", "me gustaría que me lo recordaras"); si no se pide ninguno, []. Uno por cada momento: "una hora antes y el día antes" son dos. Cada aviso rellena una sola forma y deja las otras a null:
- Antes de la hora de la tarea, en minutos: minutesBefore. "a la hora" 0, "10 minutos antes" 10, "un cuarto de hora antes" 15, "media hora antes" o "con media hora de antelación" 30, "una hora antes" 60, "una hora y media antes" 90, "el día antes" 1440. Solo si la tarea tiene hora.
- A un día y hora concretos: atDate y atTime. "avísame a las 9" → el día de la tarea (o hoy) a las 09:00; "el día antes a las 8 de la tarde" → la víspera a las 20:00; "recuérdamelo por la mañana" → ese día a las 09:00; "la noche anterior a las 22:00" → la víspera a las 22:00.
- Dentro de un rato contando desde ahora: inMinutes. "en 20 minutos" 20, "en media hora" 30, "dentro de dos horas" 120.
- "recuérdame comprar pan" sin decir cuándo avisar no es un aviso: es la propia tarea.

LUGAR (placeName y placeOn), a partir de lugar:
- placeName: el sitio con mayúscula inicial y sin artículo delante, salvo que sea parte del nombre: "al pasar por Mercadona" → "Mercadona"; "cuando llegue a la universidad" → "Universidad"; "al salir de casa" → "Casa"; "cuando pase por El Corte Inglés" → "El Corte Inglés".
- placeOn: "arrive" para llegar, pasar por, entrar o estar en; "leave" para salir o irse.
- El lugar no va en el título ni es un aviso por hora: "recuérdame al pasar por Mercadona de comprar pan" → title "Comprar pan", reminders [].
- Un sitio que solo es parte de la tarea no es lugar y se queda en el título como se dijo: "comprar fruta en Mercadona mañana" → title "Comprar fruta en Mercadona", placeName y placeOn null. Igual con "ir al gimnasio" o "tengo clase en la universidad".
- Sin lugar, placeName y placeOn son null.

VARIAS TAREAS solo si son cosas distintas ("llamar a mamá esta noche y comprar el pan mañana"). Una lista de cosas que comprar o hacer juntas es una sola tarea. Si no hay ninguna tarea (un saludo, ruido, algo sin sentido), {"tasks": []}.`

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const noonOf = (day: string) => Date.parse(`${day}T12:00:00Z`)

export function addDaysIso(day: string, days: number): string {
  return iso(noonOf(day) + days * DAY_MS)
}

/** Días hasta el siguiente `weekday` (0 = domingo), nunca hoy. */
function daysUntil(today: string, weekday: number): number {
  return (weekday - new Date(noonOf(today)).getUTCDay() + 7) % 7 || 7
}

/**
 * Calendario explícito agrupado por semanas (de lunes a domingo): los modelos fallan más
 * calculando "el jueves que viene" que leyéndolo.
 */
export function calendar(today: string): string {
  const base = noonOf(today)
  const sinceMonday = (new Date(base).getUTCDay() + 6) % 7
  const lines: string[] = []
  for (let offset = 0; ; offset++) {
    const date = new Date(base + offset * DAY_MS)
    const week = Math.floor((sinceMonday + offset) / 7)
    if (week >= WEEK_LABELS.length) break
    if (offset === 0 || date.getUTCDay() === 1) lines.push(`${WEEK_LABELS[week]}:`)
    const mark = offset === 0 ? ' (hoy)' : offset === 1 ? ' (mañana)' : offset === 2 ? ' (pasado mañana)' : ''
    lines.push(`${WEEKDAYS[date.getUTCDay()]} ${iso(date.getTime())}${mark}`)
  }
  return lines.join('\n')
}

interface Example {
  input: string
  output: unknown
}

const before = (minutes: number) => ({ minutesBefore: minutes, inMinutes: null, atDate: null, atTime: null })
const inMinutes = (minutes: number) => ({ minutesBefore: null, inMinutes: minutes, atDate: null, atTime: null })
const at = (date: string, time: string) => ({ minutesBefore: null, inMinutes: null, atDate: date, atTime: time })

/** Campos de lugar vacíos para los ejemplos sin lugar: todos deben cumplir el esquema. */
const noPlace = { lugar: null, placeName: null, placeOn: null }

/** Ejemplos resueltos con las fechas reales de hoy, para que no contradigan el calendario. */
function examples(today: string): Example[] {
  const tomorrow = addDaysIso(today, 1)
  const afterTomorrow = addDaysIso(today, 2)
  const thursday = addDaysIso(today, daysUntil(today, THURSDAY))
  return [
    {
      input: 'Bueno, hoy tengo que acudir a una cena a las 20:00, me gustaría que me lo recordaras media hora antes.',
      output: {
        tasks: [
          {
            tema: 'acudir a una cena',
            cuando: 'hoy a las 20:00',
            avisos: ['media hora antes'],
            ...noPlace,
            title: 'Cena',
            date: today,
            time: '20:00',
            durationMinutes: null,
            reminders: [before(30)],
          },
        ],
      },
    },
    {
      input: 'Oye, el jueves tengo la revisión de la moto a las 4 y media, recuérdamelo el día antes y una hora antes.',
      output: {
        tasks: [
          {
            tema: 'tengo la revisión de la moto',
            cuando: 'el jueves a las 4 y media',
            avisos: ['el día antes', 'una hora antes'],
            ...noPlace,
            title: 'Revisión de la moto',
            date: thursday,
            time: '16:30',
            durationMinutes: null,
            reminders: [before(1440), before(60)],
          },
        ],
      },
    },
    {
      input: 'Recuérdame en 15 minutos sacar la pizza del horno y mañana comprar pilas, cinta y pegamento.',
      output: {
        tasks: [
          {
            tema: 'sacar la pizza del horno',
            cuando: null,
            avisos: ['en 15 minutos'],
            ...noPlace,
            title: 'Sacar la pizza del horno',
            date: null,
            time: null,
            durationMinutes: null,
            reminders: [inMinutes(15)],
          },
          {
            tema: 'comprar pilas, cinta y pegamento',
            cuando: 'mañana',
            avisos: [],
            ...noPlace,
            title: 'Comprar pilas, cinta y pegamento',
            date: tomorrow,
            time: null,
            durationMinutes: null,
            reminders: [],
          },
        ],
      },
    },
    {
      input: 'Pasado mañana voy al teatro con Lola a las 9 de la noche, avísame ese día a las 6 de la tarde.',
      output: {
        tasks: [
          {
            tema: 'voy al teatro con Lola',
            cuando: 'pasado mañana a las 9 de la noche',
            avisos: ['ese día a las 6 de la tarde'],
            ...noPlace,
            title: 'Teatro con Lola',
            date: afterTomorrow,
            time: '21:00',
            durationMinutes: null,
            reminders: [at(afterTomorrow, '18:00')],
          },
        ],
      },
    },
    {
      input: 'El jueves tengo reunión con Jorge de 17:30 a 18:30.',
      output: {
        tasks: [
          {
            tema: 'tengo reunión con Jorge',
            cuando: 'el jueves de 17:30 a 18:30',
            avisos: [],
            ...noPlace,
            title: 'Reunión con Jorge',
            date: thursday,
            time: '17:30',
            durationMinutes: 60,
            reminders: [],
          },
        ],
      },
    },
    {
      input: 'Recuérdame al llegar a la universidad que tengo que reunirme con José.',
      output: {
        tasks: [
          {
            tema: 'tengo que reunirme con José',
            cuando: null,
            avisos: [],
            lugar: 'al llegar a la universidad',
            title: 'Reunirme con José',
            date: null,
            time: null,
            durationMinutes: null,
            reminders: [],
            placeName: 'Universidad',
            placeOn: 'arrive',
          },
        ],
      },
    },
    { input: 'Eh… vale, nada, déjalo.', output: { tasks: [] } },
  ]
}

export type PromptMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export function buildPrompt(text: string, context: InterpretContext): PromptMessage[] {
  const weekday = WEEKDAYS[new Date(noonOf(context.today)).getUTCDay()]
  const system = `${RULES}\n\nAhora es ${weekday} ${context.today}, a las ${context.now}.\n\nCalendario:\n${calendar(context.today)}`
  return [
    { role: 'system', content: system },
    ...examples(context.today).flatMap((example): PromptMessage[] => [
      { role: 'user', content: example.input },
      { role: 'assistant', content: JSON.stringify(example.output) },
    ]),
    { role: 'user', content: text },
  ]
}
