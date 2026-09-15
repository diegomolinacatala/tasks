import { describe, expect, test } from 'vitest'
import { cleanTitle } from './title'

const clean = (text: string) => cleanTitle(text, [])

describe('cleanTitle', () => {
  test('quita los tramos reconocidos y los conectores sueltos', () => {
    expect(cleanTitle('llamar a Ana mañana', [{ start: 13, end: 19 }])).toBe('llamar a Ana')
    expect(cleanTitle('para mañana preparar informe', [{ start: 5, end: 11 }])).toBe('preparar informe')
  })

  test('quita muletillas y peticiones encadenadas', () => {
    expect(clean('Venga, pues oye, hay que regar el huerto')).toBe('Regar el huerto')
    expect(clean('Me gustaría que me avisaras de pagar el seguro')).toBe('Pagar el seguro')
    expect(clean('Acuérdate de que tengo que devolver el libro')).toBe('Devolver el libro')
    expect(clean('Que no se me olvide tender la ropa')).toBe('Tender la ropa')
  })

  test('de un evento al que se va queda el evento', () => {
    expect(clean('tengo que acudir a la reunión de vecinos')).toBe('Reunión de vecinos')
    expect(clean('ir al fisio')).toBe('Fisio')
    expect(clean('Tengo la revisión del dentista')).toBe('Revisión del dentista')
    expect(clean('es el aniversario de mis padres')).toBe('Aniversario de mis padres')
    expect(clean('hay una charla en el colegio')).toBe('Charla en el colegio')
  })

  test('de ir a un sitio a hacer algo queda la acción', () => {
    expect(clean('ir a la farmacia a comprar ibuprofeno')).toBe('Comprar ibuprofeno')
    expect(clean('voy a recoger las llaves')).toBe('Recoger las llaves')
  })

  test('"he quedado con alguien para algo"', () => {
    expect(clean('he quedado con Marta para correr')).toBe('Correr con Marta')
    expect(clean('he quedado con el fontanero para que revise la caldera')).toBe('he quedado con el fontanero para que revise la caldera')
  })

  test('una petición en forma de pregunta deja solo la tarea', () => {
    expect(clean('¿Me recuerdas llamar a Ana?')).toBe('Llamar a Ana')
    expect(clean('¿Puedes recordarme comprar leche?')).toBe('Comprar leche')
    expect(clean('Bueno, pues nada, comprar pan.')).toBe('Comprar pan')
  })

  test('sin espacios colgando antes de los signos al recortar', () => {
    expect(cleanTitle('¿qué le regalo a Ana mañana?', [{ start: 21, end: 27 }])).toBe('¿qué le regalo a Ana?')
    expect(clean('¿Qué le regalo a Ana?')).toBe('¿Qué le regalo a Ana?')
  })

  test('lo escrito sin muletillas no se toca', () => {
    expect(clean('comprar pan')).toBe('comprar pan')
    expect(clean('Tengo que')).toBe('Tengo que')
    expect(clean('Irene')).toBe('Irene')
  })
})
