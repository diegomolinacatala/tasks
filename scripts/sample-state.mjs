// Tareas, rutinas y lugares de ejemplo para las capturas de la App Store (y para revisar el diseño
// con datos reales), en español o en inglés. Las fechas son relativas al día en que se ejecuta.

/** Los textos de cada idioma, por id. La cena es con Carlota (la novia del autor): así sale en la tienda. */
const WORDS = {
  es: {
    trabajo: 'Trabajo',
    mercadona: ['Mercadona', 'Calle de Colón, 12'],
    casa: ['Casa', 'Avenida del Puerto, 20'],
    uni: ['Universidad', 'Av. dels Tarongers'],
    creatina: 'Tomar creatina',
    leer: 'Leer 20 minutos',
    estirar: 'Estirar',
    gym: 'Gimnasio',
    luz: 'Pagar la factura de la luz',
    jorge: 'Reunión con Jorge',
    presupuesto: 'Enviar el presupuesto a Javier',
    comida: 'Comida con Ana',
    pan: 'Comprar pan',
    presentacion: 'Preparar la presentación',
    ropa: 'Tender la ropa',
    contrato: 'Revisar el contrato',
    leche: 'Leche y huevos',
    basura: 'Sacar la basura',
    libro: 'Devolver el libro',
    regalo: 'Pensar el regalo de Lucía',
    dni: 'Renovar el DNI',
    dentista: 'Dentista',
    carlota: 'Cena con Carlota',
    itv: 'ITV del coche',
    ingles: 'Clase de inglés',
    padel: 'Partido de pádel',
    mama: 'Llamar a mamá',
    banco: 'Llamar al banco',
    informe: 'Entregar el informe',
    casaOtros: ['el piso', 'casa de mis padres'],
    hecha: 'Hecha',
    pendiente: 'Pendiente',
  },
  en: {
    trabajo: 'Work',
    mercadona: ['Supermarket', '12 Columbus Ave'],
    casa: ['Home', '20 Harbor Street'],
    uni: ['University', 'Campus Drive'],
    creatina: 'Take creatine',
    leer: 'Read 20 minutes',
    estirar: 'Stretch',
    gym: 'Gym',
    luz: 'Pay the electricity bill',
    jorge: 'Meeting with Jordan',
    presupuesto: 'Send the quote to James',
    comida: 'Lunch with Anna',
    pan: 'Buy bread',
    presentacion: 'Prepare the presentation',
    ropa: 'Hang out the laundry',
    contrato: 'Review the contract',
    leche: 'Milk and eggs',
    basura: 'Take out the trash',
    libro: 'Return the book',
    regalo: 'Think of a gift for Lucy',
    dni: 'Renew my passport',
    dentista: 'Dentist',
    carlota: 'Dinner with Carlota',
    itv: 'Car inspection',
    ingles: 'Spanish class',
    padel: 'Tennis match',
    mama: 'Call mom',
    banco: 'Call the bank',
    informe: 'Hand in the report',
    casaOtros: ['my flat', 'my parents’ house'],
    hecha: 'Done',
    pendiente: 'Pending',
  },
}

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
  until: null,
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

function monthFiller(w) {
  const past = PAST_DONE.flatMap((offset, index) =>
    Array.from({ length: 1 + (index % 3) }, (_, n) =>
      task(`hecha${offset}-${n}`, w.hecha, isoFromToday(offset), { done: true, completedAt: Date.now(), order: n }),
    ),
  )
  const ahead = AHEAD.flatMap((offset, index) =>
    Array.from({ length: 1 + (index % 2) }, (_, n) => task(`luego${offset}-${n}`, w.pendiente, isoFromToday(offset), { order: n })),
  )
  return [...past, ...ahead]
}

const place = (w, id, lat, lng, radius, aliases = []) => ({ id, name: w[id][0], aliases, location: { lat, lng, address: w[id][1] }, radius })

/** `theme`: la apariencia con la que se abre la app (la captura del modo oscuro). `language`: `es` o `en`. */
export function sampleState({ theme = 'light', language = 'es' } = {}) {
  const w = WORDS[language]
  const today = isoFromToday(0)
  const iso = isoFromToday
  return {
    schemaVersion: 15,
    sections: [{ id: 'trabajo', name: w.trabajo, order: 0, collapsed: false }],
    places: [place(w, 'mercadona', 39.4699, -0.3763, 150), place(w, 'casa', 39.4632, -0.3589, 100, w.casaOtros), place(w, 'uni', 39.4808, -0.3443, 300)],
    routines: [
      routine('creatina', w.creatina, '10:00', { emoji: '💊', done: [...history(12, [3]), today], order: 0 }),
      routine('leer', w.leer, '22:30', { emoji: '📖', done: history(9, [1, 5]), order: 1 }),
      routine('estirar', w.estirar, null, { emoji: '🧘', done: history(6, [0, 2]), order: 2 }),
      routine('gym', w.gym, '19:00', { emoji: '🏋️', days: [1, 3, 5], done: history(14, [0, 2, 4, 6, 7, 9, 11, 13]), order: 3 }),
    ],
    collapsed: { overdue: false, backlog: false, routines: false },
    // La bienvenida, dada por vista (de cualquier versión futura): que no tape las capturas.
    // El calendario conectado: en las capturas sale el de muestra (`calendarDemo.ts`) junto a las tareas.
    settings: {
      digest: { enabled: true, time: '08:30' },
      calendar: { enabled: true, hidden: [], export: null },
      dictation: false,
      theme,
      language,
      welcome: 999,
    },
    tasks: [
      task('luz', w.luz, iso(-1), { importance: 4 }),
      task('jorge', w.jorge, today, { time: '09:30', duration: 60, reminders: atTime('r1'), order: 0, done: true, completedAt: Date.now() }),
      task('presupuesto', w.presupuesto, today, {
        time: '12:00',
        duration: 30,
        reminders: [{ id: 'r4', kind: 'before', minutes: 15 }],
        sectionId: 'trabajo',
        order: 0,
      }),
      task('comida', w.comida, today, { time: '14:00', duration: 90, reminders: atTime('r2'), order: 1 }),
      task('pan', w.pan, today, {
        reminders: [{ id: 'r3', kind: 'place', placeId: 'mercadona', on: 'arrive' }],
        order: 2,
      }),
      task('presentacion', w.presentacion, today, { importance: 6, order: 3 }),
      // Plazos: una que viene de hace dos días y vale hasta dentro de cuatro, y otra cuyo último día es hoy.
      task('banco', w.banco, iso(-2), { until: iso(4), order: 0 }),
      task('informe', w.informe, iso(-3), { until: today, order: 1, importance: 3 }),
      task('ropa', w.ropa, today, { done: true, completedAt: Date.now(), order: 4 }),
      task('contrato', w.contrato, today, { importance: 3, sectionId: 'trabajo', order: 1 }),
      task('leche', w.leche, null, { reminders: [{ id: 'r10', kind: 'place', placeId: 'mercadona', on: 'arrive' }], order: 0 }),
      task('basura', w.basura, null, { reminders: [{ id: 'r11', kind: 'place', placeId: 'casa', on: 'leave' }], order: 1 }),
      task('libro', w.libro, null, { reminders: [{ id: 'r12', kind: 'place', placeId: 'uni', on: 'arrive' }], order: 2 }),
      task('regalo', w.regalo, null, { order: 3 }),
      task('dni', w.dni, null, { order: 4 }),
      task('dentista', w.dentista, iso(1), { time: '09:30', duration: 45, reminders: [{ id: 'r5', kind: 'before', minutes: 60 }] }),
      task('carlota', w.carlota, iso(2), { time: '21:00', reminders: atTime('r6') }),
      task('itv', w.itv, iso(3), { time: '10:00', reminders: atTime('r7'), importance: 3 }),
      task('ingles', w.ingles, iso(4), { time: '18:00', duration: 90, reminders: atTime('r8') }),
      task('padel', w.padel, iso(5), { time: '11:00', duration: 90, reminders: atTime('r9') }),
      task('mama', w.mama, iso(6)),
      ...monthFiller(w),
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
