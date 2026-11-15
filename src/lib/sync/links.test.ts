import { describe, expect, it } from 'vitest'
import { fromBase64Url, newPairKeys, newRoomKey, pairCode, pairSecret, recordId, roomKeys, seal, toBase64Url, unseal } from './crypto'
import { joinAppUrl, joinWebUrl, pairUrl, parseLink } from './links'

const room = 'A'.repeat(22)
const key = 'b'.repeat(43)
const invite = 'c'.repeat(43)

describe('parseLink', () => {
  it('entiende el QR de emparejar', async () => {
    const { pub } = await newPairKeys()
    expect(parseLink(pairUrl('x'.repeat(22), pub))).toEqual({ kind: 'pair', id: 'x'.repeat(22), pub })
  })

  it('entiende la invitación en QR y en la web', () => {
    const invitation = { room, key, invite, scope: 'basket' as const }
    const expected = { kind: 'join', ...invitation }
    expect(parseLink(joinAppUrl(invitation))).toEqual(expected)
    expect(parseLink(joinWebUrl(invitation))).toEqual(expected)
    expect(parseLink(joinWebUrl({ ...invitation, scope: 'devices' }, 'http://localhost:5173/tasks/'))).toEqual({ ...expected, scope: 'devices' })
  })

  it('rechaza lo que no es nuestro o está roto', () => {
    expect(parseLink('https://example.com/#join=nope')).toBeNull()
    expect(parseLink(`io.github.diegomolinacatala.tasks://today`)).toBeNull()
    expect(parseLink(`io.github.diegomolinacatala.tasks://join/${room}#${key}`)).toBeNull()
    expect(parseLink(`io.github.diegomolinacatala.tasks://join/${room}#${key}.${invite}.z`)).toBeNull()
    expect(parseLink(`io.github.diegomolinacatala.tasks://link/short#abc`)).toBeNull()
  })
})

describe('crypto', () => {
  it('base64url va y vuelve', () => {
    const bytes = new Uint8Array([0, 255, 62, 63, 1])
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes)
  })

  it('lo sellado solo se abre con la misma clave', async () => {
    const keys = await roomKeys(newRoomKey())
    const other = await roomKeys(newRoomKey())
    const sealed = await seal(keys.enc, { a: 1 })
    expect(await unseal(keys.enc, sealed)).toEqual({ a: 1 })
    expect(await unseal(other.enc, sealed)).toBeNull()
  })

  it('el id de un registro es estable, corto y distinto por sala', async () => {
    const keys = await roomKeys(newRoomKey())
    const other = await roomKeys(newRoomKey())
    const id = await recordId(keys, 't:1')
    expect(id).toHaveLength(22)
    expect(await recordId(keys, 't:1')).toBe(id)
    expect(await recordId(other, 't:1')).not.toBe(id)
  })

  it('los dos lados de un emparejamiento llegan a la misma clave', async () => {
    const fresh = await newPairKeys()
    const linked = await newPairKeys()
    const a = await pairSecret(fresh.privateKey, linked.pub)
    const b = await pairSecret(linked.privateKey, fresh.pub)
    expect(await unseal(a, await seal(b, 'hola'))).toBe('hola')
    const code = await pairCode(fresh.pub, linked.pub)
    expect(code).toMatch(/^\d{4}$/)
    expect(await pairCode(fresh.pub, linked.pub)).toBe(code)
  })
})
