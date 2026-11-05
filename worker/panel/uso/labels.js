// Nombres para personas de lo que manda la app. Lo que no esté aquí sale tal cual (la clase CSS o el
// tipo de acción), que para quien mantiene la app también dice dónde mirar.

export const SCREENS = {
  agenda: 'Agenda',
  inbox: 'Bandeja',
  places: 'Lugares',
  settings: 'Ajustes',
  composer: 'Escribiendo en la barra',
  compose: 'Ficha del compositor',
  task: 'Panel de una tarea',
  section: 'Panel de una sección',
  routine: 'Panel de una rutina',
  place: 'Panel de un lugar',
  'place-tasks': 'Tareas de un lugar',
  basket: 'La cesta',
  update: 'Versión nueva',
  'dictation-consent': 'Permiso del dictado',
  'stats-consent': 'Permiso de estadísticas',
  appearance: 'Ajustes · Apariencia',
  language: 'Ajustes · Idioma',
  notifications: 'Ajustes · Avisos',
  calendar: 'Ajustes · Calendario',
  'calendar-picker': 'Ajustes · Calendarios',
  'calendar-guide': 'Ajustes · Añadir Google u Outlook',
  'calendar-export': 'Ajustes · Tareas al calendario',
  dictation: 'Ajustes · Dictado',
  data: 'Ajustes · Copias y datos',
  stats: 'Ajustes · Estadísticas',
}

export function screenLabel(screen) {
  if (screen.startsWith('welcome')) return `Bienvenida${screen.includes(':') ? ` · ${screen.split(':')[1]}` : ''}`
  return SCREENS[screen] ?? screen
}

/** Las funciones, por bloques. `[nombre del evento, qué es]`. */
export const FEATURES = [
  {
    group: 'Tareas',
    items: [
      ['task/add', 'Crear una tarea'],
      ['task/toggle', 'Tachar (o destachar)'],
      ['task/remove', 'Borrar'],
      ['task/restore', 'Deshacer un borrado'],
      ['task/rename', 'Cambiar el título'],
      ['task/move', 'Llevar a otro día'],
      ['tasks/reschedule', 'Pasar a hoy'],
      ['task/schedule', 'Soltar en el horario'],
      ['task/setTime', 'Poner o quitar la hora'],
      ['task/setDuration', 'Poner o quitar la duración'],
      ['task/until', 'Poner un plazo'],
      ['task/importance', 'Cambiar la importancia'],
      ['task/snooze', 'Posponer un aviso'],
      ['task/extend', '«Todavía no» al acabar'],
      ['board/commit', 'Reordenar en la Agenda'],
      ['scope/reorder', 'Reordenar en la Bandeja'],
    ],
  },
  {
    group: 'Avisos',
    items: [
      ['reminder/add', 'Añadir un aviso'],
      ['reminder/remove', 'Quitar un aviso'],
      ['reminder/here', 'Fijar «al alejarme»'],
    ],
  },
  {
    group: 'Rutinas',
    items: [
      ['routine/add', 'Crear una rutina'],
      ['routine/toggle', 'Tachar una rutina'],
      ['routine/set', 'Corregir la constancia'],
      ['routine/update', 'Editar una rutina'],
      ['routine/remove', 'Borrar una rutina'],
    ],
  },
  {
    group: 'La cesta',
    items: [
      ['shopping/add', 'Apuntar algo'],
      ['shopping/toggle', 'Comprar (tachar)'],
      ['shopping/remove', 'Quitar algo'],
      ['shopping/clearDone', 'Vaciar la cesta'],
      ['shopping/place', 'Avisar al llegar a una tienda'],
    ],
  },
  {
    group: 'Secciones y lugares',
    items: [
      ['section/add', 'Crear una sección'],
      ['section/toggle', 'Plegar una sección'],
      ['sections/reorder', 'Reordenar secciones'],
      ['place/add', 'Crear un lugar'],
      ['place/update', 'Editar un lugar'],
      ['place/remove', 'Borrar un lugar'],
    ],
  },
  {
    group: 'Calendario y ajustes',
    items: [
      ['event/set', 'Tachar un evento del calendario'],
      ['settings/calendar', 'Ajustar el calendario'],
      ['settings/theme', 'Cambiar el tema'],
      ['settings/language', 'Cambiar el idioma'],
      ['settings/digest', 'Ajustar el resumen diario'],
      ['settings/dayStart', 'Cambiar cuándo se renuevan las rutinas'],
      ['state/import', 'Importar una copia'],
      ['state/clear', 'Borrarlo todo'],
    ],
  },
  {
    group: 'Fuera de la app',
    items: [
      ['inbox/add', 'Apuntar con Siri o Atajos'],
      ['inbox/move', 'Pasar a hoy desde Siri o el widget'],
      ['inbox/ask', 'Responder «¿Has acabado?» en el aviso'],
      ['widget/task', 'Tachar desde el widget'],
      ['widget/routine', 'Tachar una rutina desde el widget'],
    ],
  },
]

/** Cómo nacen las tareas: una parte de un todo. */
export const SOURCES = [
  ['add/typed', 'Escritas'],
  ['add/voice', 'Dictadas'],
  ['add/sheet', 'Con la ficha'],
  ['inbox/add', 'Siri o Atajos'],
]

/** Qué llevan las tareas nuevas. */
export const TRAITS = [
  ['task/add+date', 'Con día'],
  ['task/add+time', 'Con hora'],
  ['task/add+duration', 'Con duración'],
  ['task/add+until', 'Con plazo'],
  ['task/add+before', 'Con aviso antes'],
  ['task/add+at', 'Con aviso a una hora'],
  ['task/add+place', 'Con aviso por lugar'],
  ['task/add+here', 'Con «al alejarme»'],
  ['task/add+section', 'En una sección'],
  ['task/add+importance', 'Con importancia'],
]

/** El embudo de la barra y del dictado. */
export const FLOWS = [
  ['ui/pill', 'La barra entiende lo escrito'],
  ['ui/pill-undo', 'Se deja tal cual (tocar la píldora)'],
  ['ui/details', 'Abrir la ficha del compositor'],
  ['ui/voice-start', 'Empezar a dictar'],
  ['ui/voice-ok', 'Dictado que se apunta'],
  ['ui/voice-fail', 'Dictado que falla'],
  ['ui/welcome-done', 'Acabar la bienvenida'],
  ['ui/welcome-skip', 'Saltar la bienvenida'],
  ['ui/feedback', 'Empezar una sugerencia'],
]

const TARGETS = {
  tabs__tab: 'Pestaña de abajo',
  composer: 'Barra de escribir',
  composer__input: 'Barra · el campo',
  composer__send: 'Barra · enviar',
  composer__more: 'Barra · Detalles',
  composer__mic: 'Barra · micrófono',
  composer__handle: 'Barra · el asa',
  composer__target: 'Barra · un destino',
  composer__pill: 'Barra · lo entendido',
  app__basket: 'El icono de la cesta',
  app__veil: 'El velo (suelta el teclado)',
  sheet__scrim: 'Fuera del panel (lo cierra)',
  sheet__handle: 'El asa del panel',
  row__check: 'El círculo de tachar',
  row__title: 'El título de una tarea',
  tl__body: 'Una fila del horario',
  strip__day: 'Un día de la tira',
  'settings-row': 'Una fila de Ajustes',
  'place-card': 'Una tarjeta de lugar',
  routine__main: 'Una rutina',
  chip: 'Una píldora',
  welcome__next: 'Bienvenida · Continuar',
  welcome__skip: 'Bienvenida · Saltar',
}

export const targetLabel = (target) => TARGETS[target] ?? target

/** Errores: «TypeError@index-3f2a.js:1:2345» → «TypeError en index-3f2a.js». */
export function errorLabel(signature) {
  const [name, where = ''] = signature.split('@')
  return where ? `${name} en ${where.split(':')[0]}` : name
}

export const PLATFORMS = { ios: 'iPhone', web: 'Web' }
export const LANGS = { es: 'Español', en: 'English' }
export const THEMES = { light: 'Claro', dark: 'Oscuro', auto: 'Automático' }
export const SIZES = { s: 'Pequeña (menos de 700 px)', m: 'Mediana', l: 'Grande (más de 860 px)' }
