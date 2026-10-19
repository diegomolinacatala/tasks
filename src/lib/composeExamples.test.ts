import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { Place } from '../types'
import { composeExamples } from './compose'
import { toInstant } from './date'
import type { Language } from './i18n'
import { setLanguage } from './i18n'
import type { ParsedTask } from './parse'
import { parseTask, provideEnglish } from './parse'
import * as englishParser from './parseEn'
import type { RoutineDraft } from './repeat'
import { parseRoutine } from './repeat'

// Lunes 19 de octubre de 2026 a las 10:00, y el domingo de esa semana por la noche: ahí "esta
// semana" ya no tiene más días y las horas de la tarde ya han pasado.
const MONDAY = toInstant('2026-10-19', '10:00')
const SUNDAY_NIGHT = toInstant('2026-10-25', '21:00')

/** En la barra cabe esto en un iPhone de 375 px; lo que pase se corta con puntos suspensivos. */
const MAX_LENGTH = 34

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7]

/** Lo que hace la barra al añadir: si dice que se repite es una rutina; si no, una tarea. */
const understand = (text: string, now: number, places: readonly Place[] | null): RoutineDraft | ParsedTask =>
  parseRoutine(text, now) ?? parseTask(text, now, places)

/** Que no se quede tal cual: de la frase salió un día, una hora, un plazo, un lugar o que se repite. */
function understood(result: RoutineDraft | ParsedTask): boolean {
  if ('days' in result) return result.days.length > 0
  return (
    result.label !== null &&
    (result.date !== null ||
      result.time !== null ||
      Boolean(result.until) ||
      result.newPlace !== undefined ||
      result.reminders.some((reminder) => reminder.kind === 'place'))
  )
}

/** Lo que tiene que entender cada frase, en el orden en que salen, el lunes a las 10:00. */
const EXPECTED: Record<Language, readonly object[]> = {
  es: [
    { title: 'Llamar a Carlota', date: '2026-10-20', time: '18:00' },
    { title: 'Sacar la basura', newPlace: { name: 'Casa', on: 'leave' } },
    { title: 'Gimnasio', time: '19:00', duration: 60 },
    { title: 'Leer', days: EVERY_DAY, time: '21:00' },
    { title: 'Renovar el DNI', date: '2026-10-19', until: '2026-10-25' },
  ],
  en: [
    { title: 'Call Carlota', date: '2026-10-20', time: '18:00' },
    { title: 'Buy milk', newPlace: { name: 'Work', on: 'leave' } },
    { title: 'Gym', date: '2026-10-20', time: '19:00', duration: 60 },
    { title: 'Read', days: EVERY_DAY, time: '21:00' },
    { title: 'Renew passport', date: '2026-10-19', until: '2026-10-25' },
  ],
}

beforeAll(() => provideEnglish(englishParser))
afterAll(() => setLanguage('es'))

describe.each(['es', 'en'] as const)('composeExamples (%s)', (lang) => {
  beforeAll(() => setLanguage(lang))

  test('cada frase se entiende como enseña', () => {
    const examples = composeExamples(true)
    expect(examples).toHaveLength(EXPECTED[lang].length)
    examples.forEach((text, index) => {
      expect(understand(text, MONDAY, []), text).toMatchObject(EXPECTED[lang][index]!)
    })
  })

  test('ninguna se queda tal cual, sea el día y la hora que sea', () => {
    for (const now of [MONDAY, SUNDAY_NIGHT]) {
      for (const text of composeExamples(true)) expect(understood(understand(text, now, [])), text).toBe(true)
      // En la PWA no hay lugares: las que se ofrecen allí se entienden igual sin ellos.
      for (const text of composeExamples(false)) expect(understood(understand(text, now, null)), text).toBe(true)
    }
  })

  test('sin avisos por lugar se quita solo la frase de lugar, y la primera sigue siendo la misma', () => {
    const all = composeExamples(true)
    const withoutPlaces = composeExamples(false)
    const dropped = all.filter((text) => !withoutPlaces.includes(text))
    expect(dropped).toHaveLength(1)
    expect(understand(dropped[0]!, MONDAY, [])).toMatchObject({ newPlace: { on: 'leave' } })
    // Sin lugares, esa frase no se entendería: por eso no se ofrece.
    expect(understood(understand(dropped[0]!, MONDAY, null))).toBe(false)
    expect(withoutPlaces).toEqual(all.filter((text) => text !== dropped[0]))
    expect(withoutPlaces[0]).toBe(all[0])
  })

  test('caben en la barra', () => {
    for (const text of composeExamples(true)) expect(text.length, text).toBeLessThanOrEqual(MAX_LENGTH)
  })
})
