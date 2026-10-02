import {
  createBroadcastGuestTransport,
  createBroadcastHostTransport,
  isBroadcastChannelSupported,
} from './broadcastTransport'
import { getSignalingProviders } from './signaling'
import { reportFailureSummary, reportSignalingAttempt } from './signaling/diagnostics'
import {
  LOCAL_HANDSHAKE_TIMEOUT_MS,
  RemoteTransportError,
  SIGNALING_CONNECT_TIMEOUT_MS,
  type RemoteTransport,
} from './transport'
import type { RemoteLinkKind, RemoteRole } from './types'

export class RoomCodeTakenError extends Error {
  readonly code: string

  constructor(code: string) {
    super(`room code taken: ${code}`)
    this.name = 'RoomCodeTakenError'
    this.code = code
  }
}

export interface RoomSession {
  role: RemoteRole
  kind: RemoteLinkKind
  transport: RemoteTransport
}

/** 被其它信令抢先后取消的候选，不算真正的失败 */
const isAbortedError = (error: unknown): boolean =>
  error instanceof RemoteTransportError && error.message === 'aborted'

interface HostCandidate {
  controller: AbortController
  promise: Promise<RemoteTransport>
}

const toHostError = (errors: unknown[], code: string): Error => {
  const transportError = errors.find((error) => error instanceof RemoteTransportError)
  if (transportError instanceof Error) return transportError
  return new RemoteTransportError('connection-failed', `all signaling failed: ${code}`)
}

export const createRoomHost = (code: string, signal?: AbortSignal): Promise<RoomSession> =>
  new Promise<RoomSession>((resolve, reject) => {
    const candidates: HostCandidate[] = []

    const addCandidate = (
      provider: string,
      start: (controller: AbortController) => Promise<RemoteTransport>,
    ) => {
      const controller = new AbortController()
      const startedAt = Date.now()
      const promise = start(controller).then(
        (transport) => {
          reportSignalingAttempt(provider, 'host', startedAt)
          return transport
        },
        (error: unknown) => {
          if (!isAbortedError(error)) reportSignalingAttempt(provider, 'host', startedAt, error)
          throw error
        },
      )
      candidates.push({ controller, promise })
    }

    if (isBroadcastChannelSupported()) {
      addCandidate('local', (controller) =>
        createBroadcastHostTransport({ code, signal: controller.signal }),
      )
    }

    for (const provider of getSignalingProviders()) {
      addCandidate(provider.name, (controller) =>
        provider.createHost({ code, signal: controller.signal }),
      )
    }

    if (candidates.length === 0) {
      reject(new RemoteTransportError('connection-failed', 'no-signaling-available'))
      return
    }

    let settled = false
    const errors: unknown[] = []

    const handleAbort = () => {
      if (settled) return
      settled = true
      for (const candidate of candidates) candidate.controller.abort()
      reject(new RemoteTransportError('connection-failed', 'aborted'))
    }

    if (signal) {
      if (signal.aborted) {
        handleAbort()
        return
      }
      signal.addEventListener('abort', handleAbort, { once: true })
    }

    const finish = (winner: HostCandidate, transport: RemoteTransport) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', handleAbort)
      for (const candidate of candidates) {
        if (candidate !== winner) candidate.controller.abort()
      }
      resolve({ role: 'host', kind: transport.kind, transport })
      console.info(`[remote] 房间已连接，房间码 ${code}（对手请用此码加入）`)
    }

    const recordFailure = (error: unknown) => {
      if (settled) return

      // 房间码在「全局唯一」的信令（如 PeerJS 公共云）上被占用时必须立即换码：
      // 否则加入方可能被该信令路由到陌生人的同名房间
      if (error instanceof RemoteTransportError && error.code === 'code-taken') {
        settled = true
        signal?.removeEventListener('abort', handleAbort)
        for (const candidate of candidates) candidate.controller.abort()
        reject(new RoomCodeTakenError(code))
        return
      }

      errors.push(error)
      if (errors.length < candidates.length) return
      settled = true
      signal?.removeEventListener('abort', handleAbort)
      reportFailureSummary(errors)
      reject(toHostError(errors, code))
    }

    for (const candidate of candidates) {
      void candidate.promise.then(
        (transport) => finish(candidate, transport),
        (error: unknown) => recordFailure(error),
      )
    }
  })

/** 全部信令都失败时，优先暴露「找不到房间」这一最具体的原因 */
const toGuestError = (errors: unknown[]): Error => {
  const notFound = errors.find(
    (error) => error instanceof RemoteTransportError && error.code === 'not-found',
  )
  if (notFound instanceof Error) return notFound

  const transportError = errors.find((error) => error instanceof RemoteTransportError)
  return transportError instanceof Error ? transportError : new RemoteTransportError('not-found')
}

/** 加入房间：先试同浏览器，再按优先级逐个回退信令后端 */
export const joinRoom = async (code: string, signal?: AbortSignal): Promise<RoomSession> => {
  if (isBroadcastChannelSupported()) {
    const startedAt = Date.now()
    try {
      const transport = await createBroadcastGuestTransport(
        { code, signal },
        LOCAL_HANDSHAKE_TIMEOUT_MS,
      )
      reportSignalingAttempt('local', 'guest', startedAt)
      return { role: 'guest', kind: 'local', transport }
    } catch (error) {
      reportSignalingAttempt('local', 'guest', startedAt, error)
      // 只有「同浏览器里找不到房主」才值得回退到跨设备信令
      if (!(error instanceof RemoteTransportError) || error.code !== 'not-found') {
        throw error
      }
    }
  }

  const errors: unknown[] = []
  for (const provider of getSignalingProviders()) {
    if (signal?.aborted) throw new RemoteTransportError('connection-failed', 'aborted')

    const startedAt = Date.now()
    try {
      const transport = await provider.createGuest(
        { code, signal },
        provider.guestTimeoutMs ?? SIGNALING_CONNECT_TIMEOUT_MS,
      )
      reportSignalingAttempt(provider.name, 'guest', startedAt)
      return { role: 'guest', kind: transport.kind, transport }
    } catch (error) {
      reportSignalingAttempt(provider.name, 'guest', startedAt, error)
      if (signal?.aborted) throw new RemoteTransportError('connection-failed', 'aborted')
      errors.push(error)
    }
  }

  reportFailureSummary(errors)
  throw toGuestError(errors)
}
