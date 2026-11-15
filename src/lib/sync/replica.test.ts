import { describe, expect, it } from 'vitest'
import { emptyState, reducer } from '../../state/reducer'
import type { AppState } from '../../types'
import type { Action } from '../../state/actions'
import { PERSONAL, applySync, personalRecords } from './records'
import { Replica } from './replica'

/** Un dispositivo: su estado y su réplica, con un reloj que se puede mover. */
function device(initialT: number | null = null, start: AppState = emptyState()) {
  let now = 1000
  let state = start
  const replica = new Replica(null, initialT, () => now)
  replica.local(personalRecords(state))
  return {
    get state() {
      return state
    },
    replica,
    at(time: number) {
      now = time
    },
    act(action: Action) {
      state = reducer(state, action)
      replica.local(personalRecords(state))
    },
    /** Lo pendiente de `other` llega aquí (como si el servidor lo repartiera) y se confirma allí. */
    pull(other: { replica: Replica }) {
      const sent = other.replica.pending()
      const changes = replica.receive(sent.map((item) => item.stamped))
      other.replica.ack(sent.map((item) => ({ key: item.stamped.key, version: item.version })))
      state = applySync(state, PERSONAL, changes)
      replica.local(personalRecords(state))
    },
  }
}

const add = (id: string, title: string): Action => ({ type: 'task/add', id, title, date: null, sectionId: null })

describe('Replica', () => {
  it('lo de un dispositivo llega al otro', () => {
    const phone = device()
    const pc = device(1)
    phone.act(add('a', 'Pan'))
    pc.pull(phone)
    expect(pc.state.tasks.map((task) => task.title)).toEqual(['Pan'])
  })

  it('aplicar lo que llega no se vuelve a subir', () => {
    const phone = device()
    const pc = device(1)
    phone.act(add('a', 'Pan'))
    pc.pull(phone)
    expect(pc.replica.pending().filter((item) => item.stamped.key.startsWith('t:'))).toEqual([])
  })

  it('cambios distintos de la misma tarea se conservan los dos', () => {
    const phone = device()
    const pc = device(1)
    phone.act(add('a', 'Pan'))
    pc.pull(phone)
    phone.at(2000)
    phone.act({ type: 'task/toggle', id: 'a' })
    pc.at(2500)
    pc.act({ type: 'task/rename', id: 'a', title: 'Pan integral' })
    pc.pull(phone)
    phone.pull(pc)
    for (const side of [phone, pc]) {
      expect(side.state.tasks[0]).toMatchObject({ title: 'Pan integral', done: true })
    }
  })

  it('borrar en uno y editar en otro sin conexión: gana la edición', () => {
    const phone = device()
    const pc = device(1)
    phone.act(add('a', 'Pan'))
    pc.pull(phone)
    phone.at(3000)
    phone.act({ type: 'task/remove', id: 'a' })
    pc.at(2000)
    pc.act({ type: 'task/rename', id: 'a', title: 'Pan integral' })
    pc.pull(phone)
    phone.pull(pc)
    expect(phone.state.tasks.map((task) => task.title)).toEqual(['Pan integral'])
    expect(pc.state.tasks.map((task) => task.title)).toEqual(['Pan integral'])
  })

  it('el que entra con initialT 1 no pisa los ajustes del grupo', () => {
    const phone = device()
    phone.act({ type: 'settings/theme', theme: 'dark' })
    const pc = device(1)
    pc.pull(phone)
    phone.pull(pc)
    expect(pc.state.settings.theme).toBe('dark')
    expect(phone.state.settings.theme).toBe('dark')
  })

  it('se recupera desde lo guardado', () => {
    const phone = device()
    phone.act(add('a', 'Pan'))
    const restored = new Replica(phone.replica.snapshot())
    expect(restored.local(personalRecords(phone.state))).toBe(false)
    expect(restored.hasPending).toBe(true)
  })

  it('lo confirmado sale de lo pendiente, salvo si cambió mientras', () => {
    const phone = device()
    phone.act(add('a', 'Pan'))
    const sent = phone.replica.pending().map((item) => ({ key: item.stamped.key, version: item.version }))
    phone.act({ type: 'task/toggle', id: 'a' })
    phone.replica.ack(sent)
    expect(phone.replica.pending().map((item) => item.stamped.key)).toEqual(['t:a'])
  })

  it('tras un reset olvida lápidas que el servidor ya no tiene y resube lo vivo', () => {
    const phone = device()
    phone.act(add('a', 'Pan'))
    phone.act(add('b', 'Leche'))
    phone.act({ type: 'task/remove', id: 'a' })
    phone.replica.ack(phone.replica.pending().map((item) => ({ key: item.stamped.key, version: item.version })))
    phone.replica.reset(new Set())
    const keys = phone.replica.pending().map((item) => item.stamped.key)
    expect(keys).toContain('t:b')
    expect(keys).not.toContain('t:a')
  })
})
