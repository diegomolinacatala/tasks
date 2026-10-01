// Tareas, rutinas y lugares de ejemplo para las capturas de la App Store (y para revisar el diseño
// con datos reales). Las fechas son relativas al día en que se ejecuta.

const pad = (n) => String(n).padStart(2, '0')

export function isoFromToday(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const task = (id, title, date, extra = {}) => ({
  id,
  title,
  done: false,
  date,
  time: null,
  duration: null,
  reminders: [],
  sectionId: null,
  order: 0,
  importance: 1,
  createdAt: Date.now(),
  completedAt: null,
  ...extra,
})

const atTime = (id) => [{ id, kind: 'before', minutes: 0 }]
const DAILY = [1, 2, 3, 4, 5, 6, 7]

/** Los últimos `count` días (sin hoy) menos los que se saltan: una racha con algún fallo. */
const history = (count, skip = []) =>
  Array.from({ length: count }, (_, index) => isoFromToday(-count + index)).filter((_, index) => !skip.includes(index))

const routine = (id, title, time, extra = {}) => ({
  id,
  title,
  emoji: null,
  days: DAILY,
  time,
  done: [],
  order: 0,
  createdAt: Date.now() - 40 * 86_400_000,
  ...extra,
})

/**
 * Para que el mes desplegado salga con sus anillos: días pasados con todo hecho (lo pasado sin hacer
 * iría a Atrasadas) y días sueltos de las próximas semanas con algo pendiente.
 */
const PAST_DONE = [-2, -3, -5, -6, -7, -9, -12, -13, -14, -16, -19, -20, -21, -23, -26, -27]
const AHEAD = [8, 9, 11, 13, 15, 18, 22]

function monthFiller() {
  const past = PAST_DONE.flatMap((offset, index) =>
    Array.from({ length: 1 + (index % 3) }, (_, n) =>
      task(`hecha${offset}-${n}`, 'Hecha', isoFromToday(offset), { done: true, completedAt: Date.now(), order: n }),
    ),
  )
  const ahead = AHEAD.flatMap((offset, index) =>
    Array.from({ length: 1 + (index % 2) }, (_, n) => task(`luego${offset}-${n}`, 'Pendiente', isoFromToday(offset), { order: n })),
  )
  return [...past, ...ahead]
}

/** `theme`: la apariencia con la que se abre la app (la captura del modo oscuro). */
export function sampleState({ theme = 'light' } = {}) {
  const today = isoFromToday(0)
  const iso = isoFromToday
  return {
    schemaVersion: 11,
    sections: [{ id: 'trabajo', name: 'Trabajo', order: 0, collapsed: false }],
    places: [
      { id: 'mercadona', name: 'Mercadona', location: { lat: 39.4699, lng: -0.3763, address: 'Calle de Colón, 12' }, radius: 150 },
      { id: 'casa', name: 'Casa', location: { lat: 39.4632, lng: -0.3589, address: 'Avenida del Puerto, 20' }, radius: 100 },
      { id: 'uni', name: 'Universidad', location: { lat: 39.4808, lng: -0.3443, address: 'Av. dels Tarongers' }, radius: 300 },
    ],
    routines: [
      routine('creatina', 'Tomar creatina', '10:00', { emoji: '💊', done: [...history(12, [3]), today], order: 0 }),
      routine('leer', 'Leer 20 minutos', '22:30', { emoji: '📖', done: history(9, [1, 5]), order: 1 }),
      routine('estirar', 'Estirar', null, { emoji: '🧘', done: history(6, [0, 2]), order: 2 }),
      routine('gym', 'Gimnasio', '19:00', { emoji: '🏋️', days: [1, 3, 5], done: history(14, [0, 2, 4, 6, 7, 9, 11, 13]), order: 3 }),
    ],
    collapsed: { overdue: false, backlog: false, routines: false },
    // La bienvenida, dada por vista (de cualquier versión futura): que no tape las capturas.
    settings: { digest: { enabled: true, time: '08:30' }, dictation: false, theme, welcome: 999 },
    tasks: [
      task('luz', 'Pagar la factura de la luz', iso(-1), { importance: 4 }),
      task('jorge', 'Reunión con Jorge', today, { time: '09:30', duration: 60, reminders: atTime('r1'), order: 0, done: true, completedAt: Date.now() }),
      task('presupuesto', 'Enviar el presupuesto a Javier', today, {
        time: '12:00',
        duration: 30,
        reminders: [{ id: 'r4', kind: 'before', minutes: 15 }],
        sectionId: 'trabajo',
        order: 0,
      }),
      task('comida', 'Comida con Ana', today, { time: '14:00', duration: 90, reminders: atTime('r2'), order: 1 }),
      task('pan', 'Comprar pan', today, {
        reminders: [{ id: 'r3', kind: 'place', placeId: 'mercadona', on: 'arrive' }],
        order: 2,
      }),
      task('presentacion', 'Preparar la presentación', today, { importance: 6, order: 3 }),
      task('ropa', 'Tender la ropa', today, { done: true, completedAt: Date.now(), order: 4 }),
      task('contrato', 'Revisar el contrato', today, { importance: 3, sectionId: 'trabajo', order: 1 }),
      task('leche', 'Leche y huevos', null, { reminders: [{ id: 'r10', kind: 'place', placeId: 'mercadona', on: 'arrive' }], order: 0 }),
      task('basura', 'Sacar la basura', null, { reminders: [{ id: 'r11', kind: 'place', placeId: 'casa', on: 'leave' }], order: 1 }),
      task('libro', 'Devolver el libro', null, { reminders: [{ id: 'r12', kind: 'place', placeId: 'uni', on: 'arrive' }], order: 2 }),
      task('regalo', 'Pensar el regalo de Lucía', null, { order: 3 }),
      task('dni', 'Renovar el DNI', null, { order: 4 }),
      task('dentista', 'Dentista', iso(1), { time: '09:30', duration: 45, reminders: [{ id: 'r5', kind: 'before', minutes: 60 }] }),
      task('marta', 'Cena con Marta', iso(2), { time: '21:00', reminders: atTime('r6') }),
      task('itv', 'ITV del coche', iso(3), { time: '10:00', reminders: atTime('r7'), importance: 3 }),
      task('ingles', 'Clase de inglés', iso(4), { time: '18:00', duration: 90, reminders: atTime('r8') }),
      task('padel', 'Partido de pádel', iso(5), { time: '11:00', duration: 90, reminders: atTime('r9') }),
      task('mama', 'Llamar a mamá', iso(6)),
      ...monthFiller(),
    ],
  }
}

/**
 * Expresión para `Runtime.evaluate`: guarda el estado en la IndexedDB de la página (mismo origen) y
 * la apariencia donde la lee el arranque (`tasks:theme`).
 */
export function writeStateExpression(state) {
  return `new Promise((resolve, reject) => {
  localStorage.setItem('tasks:theme', ${JSON.stringify(state.settings.theme ?? 'light')})
  const request = indexedDB.open('keyval-store')
  request.onupgradeneeded = () => request.result.createObjectStore('keyval')
  request.onerror = () => reject(request.error)
  request.onsuccess = () => {
    const tx = request.result.transaction('keyval', 'readwrite')
    tx.objectStore('keyval').put(${JSON.stringify(state)}, 'tasks:state:v1')
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
  }
})`
}
