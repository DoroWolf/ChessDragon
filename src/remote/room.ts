// ============================================================
// 远程对局：混合建连编排
//   - 房主：同时监听 BroadcastChannel 与各信令后端，先连上的那条成为正式链路
//   - 加入方：先用 BroadcastChannel 试探（同浏览器最快），失败再按优先级回退信令
//   - 全局唯一信令（PeerJS）报告房间码占用时立即抛出 RoomCodeTakenError，由上层换码重试
// ============================================================
import {
  createBroadcastGuestTransport,
  createBroadcastHostTransport,
  isBroadcastChannelSupported,
} from './broadcastTransport'
import { getSignalingProviders } from './signaling'
import {
  LOCAL_HANDSHAKE_TIMEOUT_MS,
  RemoteTransportError,
  SIGNALING_CONNECT_TIMEOUT_MS,
  type RemoteTransport,
} from './transport'
import type { RemoteLinkKind, RemoteRole } from './types'

/** 房间码已在 PeerJS 信令服务上被占用 */
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
  /** 实际生效的链路类型 */
  kind: RemoteLinkKind
  transport: RemoteTransport
}

/** 房主建房时参与竞速的一条候选链路 */
interface HostCandidate {
  controller: AbortController
  promise: Promise<RemoteTransport>
}

/** 全部候选都失败时，把错误归类成上层可识别的形态 */
const toHostError = (errors: unknown[], code: string): Error => {
  const transportError = errors.find((error) => error instanceof RemoteTransportError)
  if (transportError instanceof Error) return transportError
  return new RemoteTransportError('connection-failed', `all signaling failed: ${code}`)
}

/** 房主建房：等待任意一条链路连上 */
export const createRoomHost = (code: string, signal?: AbortSignal): Promise<RoomSession> =>
  new Promise<RoomSession>((resolve, reject) => {
    const candidates: HostCandidate[] = []

    const addCandidate = (start: (controller: AbortController) => Promise<RemoteTransport>) => {
      const controller = new AbortController()
      candidates.push({ controller, promise: start(controller) })
    }

    if (isBroadcastChannelSupported()) {
      addCandidate((controller) =>
        createBroadcastHostTransport({ code, signal: controller.signal }),
      )
    }

    for (const provider of getSignalingProviders()) {
      addCandidate((controller) => provider.createHost({ code, signal: controller.signal }))
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

    // 胜出者：关闭其余所有候选链路
    const finish = (winner: HostCandidate, transport: RemoteTransport) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', handleAbort)
      for (const candidate of candidates) {
        if (candidate !== winner) candidate.controller.abort()
      }
      resolve({ role: 'host', kind: transport.kind, transport })
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
    try {
      const transport = await createBroadcastGuestTransport(
        { code, signal },
        LOCAL_HANDSHAKE_TIMEOUT_MS,
      )
      return { role: 'guest', kind: 'local', transport }
    } catch (error) {
      // 只有「同浏览器里找不到房主」才值得回退到跨设备信令
      if (!(error instanceof RemoteTransportError) || error.code !== 'not-found') {
        throw error
      }
    }
  }

  const errors: unknown[] = []
  for (const provider of getSignalingProviders()) {
    if (signal?.aborted) throw new RemoteTransportError('connection-failed', 'aborted')

    try {
      const transport = await provider.createGuest({ code, signal }, SIGNALING_CONNECT_TIMEOUT_MS)
      return { role: 'guest', kind: transport.kind, transport }
    } catch (error) {
      if (signal?.aborted) throw new RemoteTransportError('connection-failed', 'aborted')
      errors.push(error)
    }
  }

  throw toGuestError(errors)
}
