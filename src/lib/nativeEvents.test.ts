import { describe, expect, test } from 'vitest'
import { parseNativeAction, parseNotificationEvent } from './nativeEvents'

describe('parseNativeAction', () => {
  test('Siri: añadir con texto', () => {
    expect(parseNativeAction({ type: 'add', text: '  comprar pan mañana ' })).toEqual({ type: 'add', text: 'comprar pan mañana' })
  })

  test('accesos rápidos del icono', () => {
    expect(parseNativeAction({ type: 'compose' })).toEqual({ type: 'compose' })
    expect(parseNativeAction({ type: 'week' })).toEqual({ type: 'week' })
  })

  test.each([null, 'add', { type: 'add' }, { type: 'add', text: '   ' }, { type: 'borrar' }])('ignora %j', (raw) => {
    expect(parseNativeAction(raw)).toBeNull()
  })

  test('recorta textos enormes', () => {
    const parsed = parseNativeAction({ type: 'add', text: 'x'.repeat(2000) })
    expect(parsed?.type === 'add' && parsed.text.length).toBe(500)
  })
})

describe('parseNotificationEvent', () => {
  test('tocar un aviso por hora abre su tarea', () => {
    expect(parseNotificationEvent('tap', { taskId: 't1', entryId: 'r1' })).toEqual({ action: 'open', taskIds: ['t1'], placeId: null })
  })

  test('los botones marcan como hecha o posponen', () => {
    expect(parseNotificationEvent('done', { taskId: 't1', entryId: 'r1' })?.action).toBe('done')
    expect(parseNotificationEvent('snooze', { taskId: 't1', entryId: 'r1' })?.action).toBe('snooze')
  })

  test('un aviso de lugar lleva el lugar y todas sus tareas', () => {
    expect(parseNotificationEvent('tap', { placeId: 'm', on: 'arrive', taskIds: 'pan,leche' })).toEqual({
      action: 'open',
      taskIds: ['pan', 'leche'],
      placeId: 'm',
    })
  })

  test('el resumen diario abre la app sin tarea', () => {
    expect(parseNotificationEvent('tap', { taskId: '', entryId: 'digest-20260911' })).toEqual({ action: 'open', taskIds: [], placeId: null })
  })

  test('descartar el aviso o datos desconocidos no hacen nada', () => {
    expect(parseNotificationEvent('dismiss', { taskId: 't1' })).toBeNull()
    expect(parseNotificationEvent('tap', 'basura')).toBeNull()
  })
})
