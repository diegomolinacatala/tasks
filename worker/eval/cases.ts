/**
 * Frases dictadas reales (tal como las escribe Whisper) y lo que la app debería crear.
 * Contexto por defecto: lunes 14 de septiembre de 2026 a las 10:00.
 *
 * `reminders` son los instantes finales en hora local (`AAAA-MM-DD HH:MM`), ya con el aviso
 * automático "a la hora" que añade el móvil cuando hay hora y no se piden avisos.
 * `title` y `time` admiten alternativas cuando varias respuestas son igual de buenas.
 */
export interface ExpectedTask {
  title: string | string[]
  date: string | null
  time: string | null | (string | null)[]
  reminders: string[]
  /** Aviso al llegar o salir de un sitio. Sin él, la tarea no debe tener lugar. */
  place?: { name: string | string[]; on: 'arrive' | 'leave' }
}

export interface EvalCase {
  id: string
  text: string
  now?: string
  expected: ExpectedTask[]
  /** Otras respuestas válidas cuando la frase es ambigua de verdad. */
  alternatives?: ExpectedTask[][]
}

export const TODAY = '2026-09-14'
export const NOW = '10:00'

export const CASES: EvalCase[] = [
  {
    id: 'cena',
    text: 'Bueno, hoy tengo que acudir a una cena a las 20:00, me gustaría que me lo recordaras media hora antes.',
    expected: [{ title: 'Cena', date: '2026-09-14', time: '20:00', reminders: ['2026-09-14 19:30'] }],
  },
  {
    id: 'cena-sin-puntuacion',
    text: 'bueno hoy tengo que acudir a una cena a las 20:00 me gustaría que me lo recordaras media hora antes',
    expected: [{ title: 'Cena', date: '2026-09-14', time: '20:00', reminders: ['2026-09-14 19:30'] }],
  },
  {
    id: 'reunion-dos-avisos',
    text: 'Tengo una reunión mañana a las 17:00, quiero que me lo recuerdes una hora antes y media hora antes.',
    expected: [{ title: 'Reunión', date: '2026-09-15', time: '17:00', reminders: ['2026-09-15 16:00', '2026-09-15 16:30'] }],
  },
  {
    id: 'jueves',
    text: 'Llamar a Miguel el jueves.',
    expected: [{ title: 'Llamar a Miguel', date: '2026-09-17', time: null, reminders: [] }],
  },
  {
    id: 'leche',
    text: 'Oye, recuérdame comprar leche.',
    expected: [{ title: 'Comprar leche', date: null, time: null, reminders: [] }],
  },
  {
    id: 'dentista',
    text: 'El viernes a las 9 y media tengo dentista, avísame el día antes.',
    expected: [{ title: ['Dentista', 'Cita con el dentista'], date: '2026-09-18', time: '09:30', reminders: ['2026-09-17 09:30'] }],
  },
  {
    id: 'gimnasio',
    text: 'Mañana por la tarde tengo que ir al gimnasio.',
    expected: [{ title: 'Gimnasio', date: '2026-09-15', time: '18:00', reminders: ['2026-09-15 18:00'] }],
  },
  {
    id: 'lavadora',
    text: 'Sacar la ropa de la lavadora en 20 minutos.',
    expected: [
      { title: 'Sacar la ropa de la lavadora', date: '2026-09-14', time: [null, '10:20'], reminders: ['2026-09-14 10:20'] },
    ],
  },
  {
    id: 'informe',
    text: 'A ver, el lunes que viene tengo que entregar el informe de ventas, avísame a las 9 de la mañana.',
    expected: [{ title: 'Entregar el informe de ventas', date: '2026-09-21', time: null, reminders: ['2026-09-21 09:00'] }],
  },
  {
    id: 'luz',
    text: 'Pagar la luz antes del día 30.',
    expected: [{ title: 'Pagar la luz', date: '2026-09-30', time: null, reminders: [] }],
  },
  {
    id: 'dos-tareas',
    text: 'Tengo que llamar a mamá esta noche y comprar el pan mañana por la mañana.',
    expected: [
      { title: 'Llamar a mamá', date: '2026-09-14', time: '21:00', reminders: ['2026-09-14 21:00'] },
      { title: ['Comprar el pan', 'Comprar pan'], date: '2026-09-15', time: '09:00', reminders: ['2026-09-15 09:00'] },
    ],
  },
  {
    id: 'cumple-laura',
    text: 'Cumpleaños de Laura el 3 de octubre, recuérdamelo dos días antes a las 10.',
    expected: [{ title: 'Cumpleaños de Laura', date: '2026-10-03', time: null, reminders: ['2026-10-01 10:00'] }],
  },
  {
    id: 'basura',
    text: 'Me gustaría que me recordaras sacar la basura a las 10 de la noche.',
    expected: [{ title: 'Sacar la basura', date: '2026-09-14', time: ['22:00', null], reminders: ['2026-09-14 22:00'] }],
  },
  {
    id: 'medico',
    text: 'Cita con el médico el 22 a las 11:15.',
    expected: [{ title: ['Cita con el médico', 'Médico'], date: '2026-09-22', time: '11:15', reminders: ['2026-09-22 11:15'] }],
  },
  {
    id: 'dni',
    text: 'Vale, pues apunta que tengo que renovar el DNI.',
    expected: [{ title: 'Renovar el DNI', date: null, time: null, reminders: [] }],
  },
  {
    id: 'ingles',
    text: 'Clase de inglés el miércoles a las siete de la tarde, avísame un cuarto de hora antes.',
    expected: [{ title: 'Clase de inglés', date: '2026-09-16', time: '19:00', reminders: ['2026-09-16 18:45'] }],
  },
  {
    id: 'pastilla',
    text: 'Dentro de dos horas tengo que tomarme la pastilla.',
    expected: [
      { title: ['Tomar la pastilla', 'Tomarme la pastilla'], date: '2026-09-14', time: [null, '12:00'], reminders: ['2026-09-14 12:00'] },
    ],
  },
  {
    id: 'taller',
    text: 'Mañana a las 8:00 tengo que llevar el coche al taller, avísame a las 7:30 y otra vez a las 7:50.',
    expected: [
      { title: 'Llevar el coche al taller', date: '2026-09-15', time: '08:00', reminders: ['2026-09-15 07:30', '2026-09-15 07:50'] },
    ],
  },
  {
    id: 'fontanero-noche',
    text: 'Llamar al fontanero a las 9.',
    now: '21:30',
    expected: [{ title: 'Llamar al fontanero', date: '2026-09-15', time: '09:00', reminders: ['2026-09-15 09:00'] }],
  },
  {
    id: 'manzanas',
    text: 'Comprar cinco manzanas y dos litros de leche.',
    expected: [
      {
        title: ['Comprar cinco manzanas y dos litros de leche', 'Comprar 5 manzanas y 2 litros de leche'],
        date: null,
        time: null,
        reminders: [],
      },
    ],
  },
  {
    id: 'saludo',
    text: 'Hola, ¿qué tal?',
    expected: [],
  },
  {
    id: 'pedro',
    text: 'El sábado he quedado con Pedro para cenar a las nueve y media de la noche.',
    expected: [{ title: ['Cenar con Pedro', 'Cena con Pedro'], date: '2026-09-19', time: '21:30', reminders: ['2026-09-19 21:30'] }],
  },
  {
    id: 'horno',
    text: 'Recuérdame en media hora que tengo que mirar el horno.',
    expected: [{ title: 'Mirar el horno', date: '2026-09-14', time: [null, '10:30'], reminders: ['2026-09-14 10:30'] }],
  },
  {
    id: 'correo',
    text: 'Tengo que enviar el correo a Lucía antes de las 12.',
    expected: [{ title: 'Enviar el correo a Lucía', date: '2026-09-14', time: '12:00', reminders: ['2026-09-14 12:00'] }],
  },
  {
    id: 'revision',
    text: 'La semana que viene, el martes, tengo revisión del coche a las 10, avísame el día anterior por la tarde.',
    expected: [{ title: 'Revisión del coche', date: '2026-09-22', time: '10:00', reminders: ['2026-09-21 18:00'] }],
  },
  {
    id: 'hermana',
    text: 'Pasado mañana es el cumpleaños de mi hermana.',
    expected: [{ title: 'Cumpleaños de mi hermana', date: '2026-09-16', time: null, reminders: [] }],
  },
  {
    id: 'banco',
    text: 'Mañana a primera hora llamar al banco.',
    expected: [{ title: 'Llamar al banco', date: '2026-09-15', time: '08:00', reminders: ['2026-09-15 08:00'] }],
  },
  {
    id: 'marketing',
    text: 'Esta tarde a las cinco reunión con el equipo de marketing y que me avises diez minutos antes.',
    expected: [{ title: 'Reunión con el equipo de marketing', date: '2026-09-14', time: '17:00', reminders: ['2026-09-14 16:50'] }],
  },
  {
    id: 'compra',
    text: 'Tengo que hacer la compra.',
    expected: [{ title: 'Hacer la compra', date: null, time: null, reminders: [] }],
  },
  {
    id: 'ninos',
    text: 'Ir a recoger a los niños al colegio a las 5 menos cuarto.',
    expected: [
      {
        title: ['Recoger a los niños al colegio', 'Recoger a los niños'],
        date: '2026-09-14',
        time: '16:45',
        reminders: ['2026-09-14 16:45'],
      },
    ],
  },
  {
    id: 'padel',
    text: 'El 15 de octubre a las 18:30 tengo la final de pádel, recuérdamelo una hora antes y el día antes.',
    expected: [{ title: 'Final de pádel', date: '2026-10-15', time: '18:30', reminders: ['2026-10-15 17:30', '2026-10-14 18:30'] }],
  },
  {
    id: 'companeros',
    text: 'Hoy a las 20:00 horas cena con los compañeros de trabajo, avísame con media hora de antelación.',
    expected: [
      {
        title: ['Cena con los compañeros de trabajo', 'Cena con los compañeros'],
        date: '2026-09-14',
        time: '20:00',
        reminders: ['2026-09-14 19:30'],
      },
    ],
  },
  {
    id: 'plantas',
    text: 'Acordarme de regar las plantas el domingo.',
    expected: [{ title: 'Regar las plantas', date: '2026-09-20', time: null, reminders: [] }],
  },
  {
    id: 'paquete',
    text: 'Mañana tengo que ir a correos a mandar un paquete a las 12, avísame a las 11 y media.',
    expected: [
      {
        title: ['Mandar un paquete', 'Enviar un paquete', 'Mandar un paquete por Correos', 'Mandar un paquete en Correos', 'Ir a Correos a mandar un paquete'],
        date: '2026-09-15',
        time: '12:00',
        reminders: ['2026-09-15 11:30'],
      },
    ],
  },
  {
    id: 'alquiler',
    text: 'Tengo que pagar el alquiler el día 1.',
    expected: [{ title: 'Pagar el alquiler', date: '2026-10-01', time: null, reminders: [] }],
  },
  {
    id: 'boda',
    text: 'Mañana tengo que asistir a la boda de Carlos a las 13:00.',
    expected: [{ title: 'Boda de Carlos', date: '2026-09-15', time: '13:00', reminders: ['2026-09-15 13:00'] }],
  },
  {
    id: 'vuelo',
    text: 'Vuelo a Londres el jueves a las 7 de la mañana, avísame tres horas antes y la noche anterior a las 22:00.',
    expected: [{ title: 'Vuelo a Londres', date: '2026-09-17', time: '07:00', reminders: ['2026-09-17 04:00', '2026-09-16 22:00'] }],
  },
  {
    id: 'hora-con-punto',
    text: 'Cena en casa de mis padres el viernes a las 21.00.',
    expected: [{ title: 'Cena en casa de mis padres', date: '2026-09-18', time: '21:00', reminders: ['2026-09-18 21:00'] }],
  },
  {
    id: 'ana-a-las-5',
    text: 'Tengo que llamar a Ana a las 5.',
    expected: [{ title: 'Llamar a Ana', date: '2026-09-14', time: '17:00', reminders: ['2026-09-14 17:00'] }],
  },
  {
    id: 'tintoreria',
    text: 'Recuérdame que mañana tengo que llevar el traje a la tintorería.',
    expected: [{ title: 'Llevar el traje a la tintorería', date: '2026-09-15', time: null, reminders: [] }],
  },
  {
    id: 'marta',
    text: 'Que no se me olvide felicitar a Marta el miércoles por la mañana.',
    expected: [{ title: 'Felicitar a Marta', date: '2026-09-16', time: '09:00', reminders: ['2026-09-16 09:00'] }],
  },
  {
    id: 'fiesta',
    text: 'El sábado 26 hay una fiesta en casa de Nuria a las diez de la noche, recuérdamelo por la mañana.',
    expected: [{ title: 'Fiesta en casa de Nuria', date: '2026-09-26', time: '22:00', reminders: ['2026-09-26 09:00'] }],
  },
  {
    id: 'examen',
    text: 'Examen de conducir el próximo miércoles a las 8:45, avísame 45 minutos antes.',
    expected: [{ title: 'Examen de conducir', date: '2026-09-16', time: '08:45', reminders: ['2026-09-16 08:00'] }],
    // Un lunes, "el próximo miércoles" se usa tanto para pasado mañana como para el de la semana siguiente.
    alternatives: [[{ title: 'Examen de conducir', date: '2026-09-23', time: '08:45', reminders: ['2026-09-23 08:00'] }]],
  },
  {
    id: 'lunes-siendo-lunes',
    text: 'Tengo reunión el lunes a las 10.',
    expected: [{ title: 'Reunión', date: '2026-09-21', time: '10:00', reminders: ['2026-09-21 10:00'] }],
  },
  {
    id: 'amazon',
    text: 'Hoy, a las 18:00, recoger el paquete de Amazon. Recuérdamelo 15 minutos antes.',
    expected: [{ title: 'Recoger el paquete de Amazon', date: '2026-09-14', time: '18:00', reminders: ['2026-09-14 17:45'] }],
  },
  {
    id: 'veterinario',
    text: 'Tengo que llevar al perro al veterinario el jueves a las 17:30 y avisarme una hora y media antes.',
    expected: [{ title: 'Llevar al perro al veterinario', date: '2026-09-17', time: '17:30', reminders: ['2026-09-17 16:00'] }],
  },
  {
    id: 'seguro',
    text: 'Esta tarde llamar al seguro.',
    expected: [{ title: 'Llamar al seguro', date: '2026-09-14', time: '18:00', reminders: ['2026-09-14 18:00'] }],
  },
  {
    id: 'entradas',
    text: 'Recoger las entradas del concierto el viernes, recuérdamelo el día antes a las 8 de la tarde.',
    expected: [{ title: 'Recoger las entradas del concierto', date: '2026-09-18', time: null, reminders: ['2026-09-17 20:00'] }],
  },
  {
    id: 'dentista-antelacion',
    text: 'Oye, pasado mañana a las cuatro tengo dentista, avísame con una hora de antelación.',
    expected: [{ title: 'Dentista', date: '2026-09-16', time: '16:00', reminders: ['2026-09-16 15:00'] }],
  },
  {
    id: 'pizza',
    text: 'Esta noche a las nueve pedir pizza.',
    expected: [{ title: 'Pedir pizza', date: '2026-09-14', time: '21:00', reminders: ['2026-09-14 21:00'] }],
  },
  {
    id: 'factura',
    text: 'Recuérdame pagar la factura del móvil el viernes a las 10 de la mañana.',
    expected: [{ title: 'Pagar la factura del móvil', date: '2026-09-18', time: ['10:00', null], reminders: ['2026-09-18 10:00'] }],
  },
  {
    id: 'partido',
    text: 'El domingo a las 6 juega el Madrid, avísame 10 minutos antes.',
    expected: [
      {
        title: ['Partido del Madrid', 'Juega el Madrid', 'Ver el partido del Madrid', 'Partido del Real Madrid'],
        date: '2026-09-20',
        time: '18:00',
        reminders: ['2026-09-20 17:50'],
      },
    ],
  },
  {
    id: 'jefe',
    text: 'Mañana tengo una reunión con mi jefe a las 9 y cuarto, me lo recuerdas a las 9.',
    expected: [{ title: 'Reunión con mi jefe', date: '2026-09-15', time: '09:15', reminders: ['2026-09-15 09:00'] }],
  },
  {
    id: 'madre',
    text: 'Hoy tengo que llamar a mi madre.',
    expected: [{ title: 'Llamar a mi madre', date: '2026-09-14', time: null, reminders: [] }],
  },
  {
    id: 'peluqueria',
    text: 'El jueves 24 a las 17:30 peluquería, recuérdamelo el día antes y dos horas antes.',
    expected: [{ title: 'Peluquería', date: '2026-09-24', time: '17:30', reminders: ['2026-09-23 17:30', '2026-09-24 15:30'] }],
  },
  {
    id: 'antibiotico',
    text: 'Dentro de 45 minutos tomarme el antibiótico.',
    expected: [
      { title: ['Tomar el antibiótico', 'Tomarme el antibiótico'], date: '2026-09-14', time: [null, '10:45'], reminders: ['2026-09-14 10:45'] },
    ],
  },
  {
    id: 'itv',
    text: 'Tengo que pasar la ITV del coche antes del 15 de octubre.',
    expected: [{ title: 'Pasar la ITV del coche', date: '2026-10-15', time: null, reminders: [] }],
  },
  {
    id: 'cafe',
    text: 'He quedado con Irene para tomar un café mañana a las 11.',
    expected: [{ title: ['Tomar un café con Irene', 'Café con Irene'], date: '2026-09-15', time: '11:00', reminders: ['2026-09-15 11:00'] }],
  },
  {
    id: 'regalo-y-cumple',
    text: 'Hoy comprar el regalo de Pablo y mañana a las 7 de la tarde ir a su cumpleaños.',
    expected: [
      { title: 'Comprar el regalo de Pablo', date: '2026-09-14', time: null, reminders: [] },
      { title: ['Cumpleaños de Pablo', 'Ir al cumpleaños de Pablo'], date: '2026-09-15', time: '19:00', reminders: ['2026-09-15 19:00'] },
    ],
  },
  {
    id: 'basura-tarde',
    text: 'Sacar la basura a las 11 de la noche.',
    now: '22:30',
    expected: [{ title: 'Sacar la basura', date: '2026-09-14', time: '23:00', reminders: ['2026-09-14 23:00'] }],
  },
  {
    id: 'traje',
    text: 'Acuérdate de que el sábado por la mañana tengo que recoger el traje.',
    expected: [{ title: 'Recoger el traje', date: '2026-09-19', time: '09:00', reminders: ['2026-09-19 09:00'] }],
  },
  {
    id: 'abuelos',
    text: 'Comida con los abuelos el domingo al mediodía, recuérdamelo el sábado por la noche.',
    expected: [{ title: 'Comida con los abuelos', date: '2026-09-20', time: '14:00', reminders: ['2026-09-19 21:00'] }],
  },
  {
    id: 'presupuesto',
    text: 'Enviar el presupuesto a Javier en una hora.',
    expected: [{ title: 'Enviar el presupuesto a Javier', date: '2026-09-14', time: [null, '11:00'], reminders: ['2026-09-14 11:00'] }],
  },
  {
    id: 'entrevista',
    text: 'Mañana a las 12 del mediodía entrevista de trabajo, avísame una hora antes y a las 9.',
    expected: [{ title: 'Entrevista de trabajo', date: '2026-09-15', time: '12:00', reminders: ['2026-09-15 09:00', '2026-09-15 11:00'] }],
  },
  {
    id: 'hora-con-punto-sin-dia',
    text: 'A las 19.30 recoger a Lucas del fútbol.',
    expected: [{ title: 'Recoger a Lucas del fútbol', date: '2026-09-14', time: '19:30', reminders: ['2026-09-14 19:30'] }],
  },
  {
    id: 'lugar-mercadona',
    text: 'Recuérdame al pasar por Mercadona de comprar pan.',
    expected: [{ title: 'Comprar pan', date: null, time: null, reminders: [], place: { name: 'Mercadona', on: 'arrive' } }],
  },
  {
    id: 'lugar-universidad',
    text: 'Recuérdame al llegar a la universidad de que tengo que reunirme con José.',
    expected: [
      { title: 'Reunirme con José', date: null, time: null, reminders: [], place: { name: ['Universidad', 'Uni'], on: 'arrive' } },
    ],
  },
  {
    id: 'lugar-salir-casa',
    text: 'Cuando salga de casa, que no se me olvide coger las llaves del coche.',
    expected: [{ title: 'Coger las llaves del coche', date: null, time: null, reminders: [], place: { name: 'Casa', on: 'leave' } }],
  },
  {
    id: 'lugar-con-dia',
    text: 'Mañana cuando llegue al trabajo llamar a Marta.',
    expected: [{ title: 'Llamar a Marta', date: '2026-09-15', time: null, reminders: [], place: { name: 'Trabajo', on: 'arrive' } }],
  },
  {
    id: 'sitio-sin-aviso',
    text: 'Comprar fruta en Mercadona mañana.',
    expected: [{ title: 'Comprar fruta en Mercadona', date: '2026-09-15', time: null, reminders: [] }],
  },
  {
    id: 'reunion-hoy-pasada',
    text: 'Hoy a las 9 tenía que llamar a Rocío.',
    expected: [{ title: 'Llamar a Rocío', date: '2026-09-14', time: '09:00', reminders: ['2026-09-14 09:00'] }],
  },
]
