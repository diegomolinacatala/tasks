import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { isNative } from '../../lib/platform'
import { clearDeviceLink, loadDeviceLink, saveDeviceLink } from '../../lib/sync/deviceLink'
import type { Invitation, LinkRequest } from '../../lib/sync/links'
import { parseLink } from '../../lib/sync/links'
import { PERSONAL, basketRecords, personalRecords } from '../../lib/sync/records'
import type { MemberView, PairSession, RoomSync, SyncStatus } from '../../lib/sync/runtime'
import { pick } from '../../lib/i18n'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { RoomLink, SharedBasket } from '../../types'
import { useToast } from '../ui/Toast'

const API = import.meta.env.VITE_PUSH_API ?? ''
const loadRuntime = () => import('../../lib/sync/runtime')
const LinkPrompt = lazy(() => import('./LinkPrompt').then((module) => ({ default: module.LinkPrompt })))

export type Connection = SyncStatus | 'off'

export interface SyncApi {
  /** Hay servidor: se puede vincular y compartir. */
  available: boolean
  /** Las credenciales de este dispositivo en tu grupo, o `null` si no está vinculado. */
  link: RoomLink | null
  /** Ya se sabe si este dispositivo está vinculado (se lee del almacenamiento al arrancar). */
  ready: boolean
  /** Cómo va la conexión de tu grupo (`off` sin vincular). */
  status: Connection
  /** Cómo va cada cesta compartida, por su id. */
  basketStatus: Readonly<Record<string, Connection>>
  /** Un enlace abierto (un QR escaneado, una invitación) que espera a que se confirme. */
  request: LinkRequest | null
  clearRequest: () => void
  /** Este dispositivo, nuevo, enseña un QR para que lo vinculen. */
  pair: () => Promise<PairSession>
  /**
   * El dispositivo del QR escaneado: las cifras que tiene que enseñar y vincularlo (crea tu grupo si aún no
   * existe).
   */
  preparePair: (request: { id: string; pub: string }) => Promise<{ code: string; approve: () => Promise<void> }>
  /** Entra en tu grupo: lo de aquí se sustituye por lo de tus otros dispositivos. */
  joinDevices: (invitation: Invitation) => Promise<void>
  unlink: () => Promise<void>
  devices: () => Promise<MemberView[]>
  removeDevice: (member: string) => Promise<void>
  /** Invitación a tu grupo, para un dispositivo nuevo que escanea en vez de enseñar (un iPhone nuevo). */
  inviteDevice: () => Promise<Invitation>
  createBasket: (name: string, me: string) => Promise<string>
  joinBasket: (invitation: Invitation, me: string) => Promise<string>
  inviteBasket: (id: string) => Promise<Invitation>
  basketMembers: (id: string) => Promise<MemberView[]>
  removeBasketMember: (id: string, member: string) => Promise<void>
  leaveBasket: (id: string) => Promise<void>
}

const SyncContext = createContext<SyncApi | null>(null)

export function useSync(): SyncApi {
  const value = useContext(SyncContext)
  if (!value) throw new Error('useSync debe usarse dentro de <SyncProvider>')
  return value
}

const TEXT = {
  removed: { es: 'Este dispositivo ya no está vinculado.', en: 'This device is no longer linked.' },
  basketGone: (name: string) => ({ es: `Ya no estás en la cesta «${name}».`, en: `You’re no longer in the “${name}” basket.` }),
}

/** Lee un enlace de la dirección de la web (`#join=…`) y lo quita: lo secreto no se queda en el historial. */
function takeHashLink(): LinkRequest | null {
  const request = parseLink(window.location.href)
  if (request) history.replaceState(null, '', window.location.pathname + window.location.search)
  return request
}

const basketKey = (baskets: readonly SharedBasket[]) => baskets.map((basket) => `${basket.id}:${basket.link.token}`).join(',')

/**
 * Vincular dispositivos y cestas compartidas (`docs/sincronizacion.md`): mantiene una conexión por sala
 * (tu grupo y cada cesta), le pasa lo que cambia en el estado y aplica lo que llega. Lo pesado (red,
 * cifrado) se carga solo si hay algo vinculado o compartido.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const [link, setLink] = useState<RoomLink | null>(null)
  const [ready, setReady] = useState(!API)
  const [status, setStatus] = useState<Connection>('off')
  const [basketStatus, setBasketStatus] = useState<Record<string, Connection>>({})
  const [request, setRequest] = useState<LinkRequest | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const personal = useRef<RoomSync | null>(null)
  const baskets = useRef(new Map<string, RoomSync>())
  /** El grupo se acaba de crear aquí: lo de este dispositivo es lo que vale (no se sella como lo más antiguo). */
  const created = useRef(false)
  /** Cestas creadas aquí: su nombre es el de verdad (quien entra después lleva uno provisional, «…»). */
  const createdBaskets = useRef(new Set<string>())

  useEffect(() => {
    if (!API) return
    void loadDeviceLink().then((loaded) => {
      setLink(loaded)
      setReady(true)
    })
  }, [])

  // Los enlaces que se abren: en el iPhone, el QR escaneado con la cámara; en la web, una invitación.
  useEffect(() => {
    if (!API) return
    const open = (url: string) => {
      const parsed = parseLink(url)
      if (parsed) setRequest(parsed)
    }
    if (!isNative) {
      const first = takeHashLink()
      if (first) setRequest(first)
      const onHash = () => {
        const next = takeHashLink()
        if (next) setRequest(next)
      }
      window.addEventListener('hashchange', onHash)
      return () => window.removeEventListener('hashchange', onHash)
    }
    let remove: (() => void) | undefined
    let cancelled = false
    void import('@capacitor/app').then(async ({ App }) => {
      const handle = await App.addListener('appUrlOpen', (event) => open(event.url))
      if (cancelled) void handle.remove()
      else remove = () => void handle.remove()
      const launch = await App.getLaunchUrl().catch(() => undefined)
      if (launch?.url && !cancelled) open(launch.url)
    })
    return () => {
      cancelled = true
      remove?.()
    }
  }, [])

  const forgetLink = useCallback(async (room: string) => {
    personal.current?.stop(false)
    personal.current = null
    await clearDeviceLink()
    const runtime = await loadRuntime()
    await runtime.forgetRoom(room)
    setLink(null)
    setStatus('off')
  }, [])

  // Tu grupo.
  useEffect(() => {
    if (!link) return
    let cancelled = false
    void loadRuntime().then((runtime) => {
      if (cancelled) return
      const engine = new runtime.RoomSync({
        base: API,
        link,
        initialT: created.current ? null : 1,
        apply: (changes) => dispatch({ type: 'sync/apply', scope: PERSONAL, changes }),
        onStatus: setStatus,
        onGone: () => {
          toast({ message: pick(TEXT.removed) })
          void forgetLink(link.room)
        },
      })
      created.current = false
      personal.current = engine
      engine.update(personalRecords(stateRef.current))
      void engine.start()
    })
    return () => {
      cancelled = true
      personal.current?.stop()
      personal.current = null
    }
  }, [link, dispatch, toast, forgetLink])

  // Una conexión por cesta compartida.
  const basketsKey = basketKey(state.baskets)
  useEffect(() => {
    if (!API) return
    const wanted = new Map(stateRef.current.baskets.map((basket) => [basket.id, basket]))
    const running = baskets.current
    for (const [id, engine] of running) {
      if (wanted.has(id)) continue
      // Ya no está (has salido desde otro de tus dispositivos): lo guardado de esa sala se olvida.
      engine.stop(false)
      running.delete(id)
      void loadRuntime().then((runtime) => runtime.forgetRoom(id))
    }
    const missing = [...wanted.values()].filter((basket) => !running.has(basket.id))
    if (!missing.length) return
    void loadRuntime().then((runtime) => {
      for (const basket of missing) {
        if (running.has(basket.id) || !stateRef.current.baskets.some((item) => item.id === basket.id)) continue
        const engine = new runtime.RoomSync({
          base: API,
          link: basket.link,
          initialT: createdBaskets.current.delete(basket.id) ? null : 1,
          apply: (changes) => dispatch({ type: 'sync/apply', scope: basket.id, changes }),
          onStatus: (next) => setBasketStatus((current) => ({ ...current, [basket.id]: next })),
          onGone: () => {
            const current = stateRef.current.baskets.find((item) => item.id === basket.id)
            toast({ message: pick(TEXT.basketGone(current?.name ?? basket.name)) })
            running.get(basket.id)?.stop(false)
            running.delete(basket.id)
            dispatch({ type: 'basket/remove', id: basket.id })
            void runtime.forgetRoom(basket.id)
          },
        })
        running.set(basket.id, engine)
        engine.update(basketRecords(stateRef.current.baskets.find((item) => item.id === basket.id) ?? basket))
        void engine.start()
      }
    })
  }, [basketsKey, dispatch, toast])

  useEffect(
    () => () => {
      for (const engine of baskets.current.values()) engine.stop()
      baskets.current.clear()
    },
    [],
  )

  // Cada cambio del estado va a su sala.
  useEffect(() => {
    personal.current?.update(personalRecords(state))
    for (const basket of state.baskets) baskets.current.get(basket.id)?.update(basketRecords(basket))
  }, [state])

  const linkOrCreate = useCallback(async (): Promise<RoomLink> => {
    if (link) return link
    const runtime = await loadRuntime()
    const next = await runtime.createLinkedRoom(API, 'personal', runtime.deviceLabel())
    await saveDeviceLink(next)
    created.current = true
    setLink(next)
    return next
  }, [link])

  const api = useMemo<SyncApi>(() => {
    const basketLink = (id: string) => {
      const basket = stateRef.current.baskets.find((item) => item.id === id)
      if (!basket) throw new Error('cesta desconocida')
      return basket.link
    }
    return {
      available: Boolean(API),
      link,
      ready,
      status,
      basketStatus,
      request,
      clearRequest: () => setRequest(null),
      pair: async () => (await loadRuntime()).startPairSession(API),
      preparePair: async (pairRequest) => {
        const runtime = await loadRuntime()
        const reply = await runtime.preparePairing(pairRequest)
        return {
          code: reply.code,
          approve: async () => runtime.approvePairing(API, await linkOrCreate(), pairRequest, reply.own),
        }
      },
      joinDevices: async (invitation) => {
        const runtime = await loadRuntime()
        const joined = await runtime.joinLinkedRoom(API, invitation, runtime.deviceLabel())
        if (joined.kind !== 'personal') throw new Error('no es un grupo de dispositivos')
        const { kind: _kind, ...next } = joined
        await saveDeviceLink(next)
        // Lo de los vinculados manda: lo de aquí se vacía y llega lo del grupo.
        dispatch({ type: 'sync/adopt' })
        setLink(next)
      },
      unlink: async () => {
        if (!link) return
        const runtime = await loadRuntime()
        await runtime.removeFromRoom(API, link, link.member).catch(() => undefined)
        await forgetLink(link.room)
      },
      devices: async () => {
        if (!link) return []
        return (await loadRuntime()).membersOf(API, link)
      },
      removeDevice: async (member) => {
        if (!link) return
        await (await loadRuntime()).removeFromRoom(API, link, member)
      },
      inviteDevice: async () => (await loadRuntime()).inviteTo(API, await linkOrCreate(), 'devices'),
      createBasket: async (name, me) => {
        const runtime = await loadRuntime()
        const room = await runtime.createLinkedRoom(API, 'basket', me)
        createdBaskets.current.add(room.room)
        dispatch({ type: 'basket/add', basket: { id: room.room, name, items: [], history: [], placeId: null, order: 0, link: room } })
        return room.room
      },
      joinBasket: async (invitation, me) => {
        const runtime = await loadRuntime()
        const joined = await runtime.joinLinkedRoom(API, invitation, me)
        if (joined.kind !== 'basket') throw new Error('no es una cesta')
        const { kind: _kind, ...room } = joined
        dispatch({ type: 'basket/add', basket: { id: room.room, name: '…', items: [], history: [], placeId: null, order: 0, link: room } })
        return room.room
      },
      inviteBasket: async (id) => (await loadRuntime()).inviteTo(API, basketLink(id), 'basket'),
      basketMembers: async (id) => (await loadRuntime()).membersOf(API, basketLink(id)),
      removeBasketMember: async (id, member) => (await loadRuntime()).removeFromRoom(API, basketLink(id), member),
      leaveBasket: async (id) => {
        const runtime = await loadRuntime()
        const room = basketLink(id)
        await runtime.removeFromRoom(API, room, room.member)
        baskets.current.get(id)?.stop(false)
        baskets.current.delete(id)
        dispatch({ type: 'basket/remove', id })
        await runtime.forgetRoom(id)
      },
    }
  }, [link, ready, status, basketStatus, request, linkOrCreate, dispatch, forgetLink])

  return (
    <SyncContext.Provider value={api}>
      {children}
      {request && ready && (
        <Suspense fallback={null}>
          <LinkPrompt />
        </Suspense>
      )}
    </SyncContext.Provider>
  )
}
