// Tareas de ejemplo para las capturas de la App Store (y para revisar el diseño con datos reales).
// Las fechas son relativas al día en que se ejecuta.

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

export function sampleState() {
  const today = isoFromToday(0)
  const iso = isoFromToday
  return {
    schemaVersion: 7,
    sections: [{ id: 'trabajo', name: 'Trabajo', order: 0, collapsed: false }],
    places: [
      { id: 'mercadona', name: 'Mercadona', location: { lat: 39.4699, lng: -0.3763, address: 'Valencia' }, radius: 150 },
    ],
    collapsed: { overdue: false, backlog: false },
    settings: { digest: { enabled: true, time: '08:30' } },
    tasks: [
      task('luz', 'Pagar la factura de la luz', iso(-1), { importance: 4 }),
      task('jorge', 'Reunión con Jorge', today, { time: '17:30', duration: 60, reminders: atTime('r1'), order: 0 }),
      task('gym', 'Gimnasio', today, { time: '19:30', duration: 60, reminders: atTime('r2'), order: 1 }),
      task('pan', 'Comprar pan', today, {
        reminders: [{ id: 'r3', kind: 'place', placeId: 'mercadona', on: 'arrive' }],
        order: 2,
      }),
      task('presentacion', 'Preparar la presentación para el cliente', today, { importance: 6, order: 3 }),
      task('ropa', 'Tender la ropa', today, { done: true, completedAt: Date.now(), order: 4 }),
      task('presupuesto', 'Enviar el presupuesto a Javier', today, {
        time: '16:00',
        reminders: [{ id: 'r4', kind: 'before', minutes: 15 }],
        sectionId: 'trabajo',
        order: 0,
      }),
      task('contrato', 'Revisar el contrato', today, { importance: 3, sectionId: 'trabajo', order: 1 }),
      task('regalo', 'Pensar el regalo de Lucía', null, { order: 0 }),
      task('dni', 'Renovar el DNI', null, { order: 1 }),
      task('dentista', 'Dentista', iso(1), { time: '09:30', duration: 45, reminders: [{ id: 'r5', kind: 'before', minutes: 60 }] }),
      task('marta', 'Cena con Marta', iso(2), { time: '21:00', reminders: atTime('r6') }),
      task('itv', 'ITV del coche', iso(3), { time: '10:00', reminders: atTime('r7'), importance: 3 }),
      task('ingles', 'Clase de inglés', iso(4), { time: '18:00', duration: 90, reminders: atTime('r8') }),
      task('padel', 'Partido de pádel', iso(5), { time: '11:00', duration: 90, reminders: atTime('r9') }),
      task('mama', 'Llamar a mamá', iso(6)),
    ],
  }
}

/** Expresión para `Runtime.evaluate`: guarda el estado en la IndexedDB de la página (mismo origen). */
export function writeStateExpression(state) {
  return `new Promise((resolve, reject) => {
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
