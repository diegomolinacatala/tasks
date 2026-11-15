/**
 * Lo que solo hace falta con algo vinculado o compartido (red, cifrado, emparejar): va en su propio trozo,
 * que `SyncProvider` pide cuando hace falta. Quien no vincula nada no lo descarga.
 */
export { RoomSync, forgetRoom } from './engine'
export type { GoneReason, SyncStatus } from './engine'
export {
  approvePairing,
  preparePairing,
  createLinkedRoom,
  deviceLabel,
  inviteTo,
  joinLinkedRoom,
  membersOf,
  removeFromRoom,
  startPairSession,
} from './flows'
export type { MemberView, PairReply, PairSession } from './flows'
export { SyncHttpError } from './api'
