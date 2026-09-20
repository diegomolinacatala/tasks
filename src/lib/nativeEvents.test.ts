import { describe, expect, test } from 'vitest'
import { parseNativeAction, parseNotificationEvent, parseWidgetChanges } from './nativeEvents'

describe('parseNativeAction', () => {
  test('Siri: añadir con texto', () => {
    expect(parseNativeAction({ type: 'add', text: '  comprar pan mañana ' })).toEqual({ type: 'add', text: 'comprar pan mañana' })
  })

  test('accesos rápidos del icono', () => {
    expect(parseNativeAction({ type: 'compose' })).toEqual({ type: 'compose' })
    expect(parseNativeAction({ type: 'week' })).toEqual({ type: 'week' })
  })

  test('widget: tocarlo abre hoy y tocar una tarea la abre', () => {
    expect(parseNativeAction({ type: 'today' })).toEqual({ type: 'today' })
    expect(parseNativeAction({ type: 'open', taskId: 't1' })).toEqual({ type: 'open', taskId: 't1' })
  })

  test('Siri o un atajo han apuntado algo sin abrir la app', () => {
    expect(parseNativeAction({ type: 'inbox' })).toEqual({ type: 'inbox' })
  })

  test.each([
    null,
    'add',
    { type: 'add' },
    { type: 'add', text: '   ' },
    { type: 'borrar' },
    { type: 'open' },
    { type: 'open', taskId: '' },
    { type: 'open', taskId: 'x'.repeat(101) },
  ])('ignora %j', (raw) => {
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

  test('"Pasar a hoy": en un aviso de tarea lleva la tarea; en el resumen, ninguna', () => {
    expect(parseNotificationEvent('today', { taskId: 't1', entryId: 'r1' })).toEqual({ action: 'today', taskIds: ['t1'], placeId: null })
    expect(parseNotificationEvent('today', { taskId: '', entryId: 'digest-20260911' })).toEqual({ action: 'today', taskIds: [], placeId: null })
  })

  test('el resumen diario abre la app sin tarea', () => {
    expect(parseNotificationEvent('tap', { taskId: '', entryId: 'digest-20260911' })).toEqual({ action: 'open', taskIds: [], placeId: null })
  })

  test('descartar el aviso o datos desconocidos no hacen nada', () => {
    expect(parseNotificationEvent('dismiss', { taskId: 't1' })).toBeNull()
    expect(parseNotificationEvent('tap', 'basura')).toBeNull()
  })
})

describe('parseWidgetChanges', () => {
  test('lee las tareas marcadas y desmarcadas en el widget', () => {
    expect(
      parseWidgetChanges([
        { taskId: 't1', done: true },
        { taskId: 't2', done: false },
      ]),
    ).toEqual([
      { taskId: 't1', done: true },
      { taskId: 't2', done: false },
    ])
  })

  test('descarta lo que no tiene forma de cambio', () => {
    expect(parseWidgetChanges([{ taskId: 't1' }, { taskId: '', done: true }, { done: true }, 'basura', null])).toEqual([])
    expect(parseWidgetChanges({ taskId: 't1', done: true })).toEqual([])
    expect(parseWidgetChanges(undefined)).toEqual([])
  })
})

describe('aviso de cierre', () => {
  test('lo marca para poder repetir la pregunta dentro de la app', () => {
    expect(parseNotificationEvent('tap', { taskId: 'r', entryId: 'ask-r', ask: '1' })).toEqual({
      action: 'open',
      taskIds: ['r'],
      placeId: null,
      ask: true,
    })
  })

  test('«Todavía no» llega como `again`', () => {
    expect(parseNotificationEvent('again', { taskId: 'r', entryId: 'ask-r', ask: '1' })?.action).toBe('again')
  })
})
