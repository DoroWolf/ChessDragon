// ============================================================
// 远程对局：混合建连编排
//   - 房主：同时监听 BroadcastChannel 与 WebRTC，先连上的那条成为正式链路
//   - 加入方：先用 BroadcastChannel 试探（同浏览器最快），失败再回退 WebRTC
//   - 房间码被占用时抛出 RoomCodeTakenError，由上层换码重试
// ============================================================
import {
  createBroadcastGuestTransport,
  createBroadcastHostTransport,
  isBroadcastChannelSupported,
} from './broadcastTransport'
import {
  LOCAL_HANDSHAKE_TIMEOUT_MS,
  RemoteTransportError,
  WEBRTC_CONNECT_TIMEOUT_MS,
  type RemoteTransport,
} from './transport'
import type { RemoteLinkKind, RemoteRole } from './types'
import { createWebrtcGuestTransport, createWebrtcHostTransport } from './webrtcTransport'

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

/** 房主建房：等待任意一条链路连上 */
export const createRoomHost = (code: string, signal?: AbortSignal): Promise<RoomSession> =>
  new Promise<RoomSession>((resolve, reject) => {
    const localAbort = new AbortController()
    const webrtcAbort = new AbortController()
    const localSupported = isBroadcastChannelSupported()
    let settled = false

    const handleAbort = () => {
      if (settled) return
      settled = true
      localAbort.abort()
      webrtcAbort.abort()
      reject(new RemoteTransportError('connection-failed', 'aborted'))
    }

    if (signal) {
      if (signal.aborted) {
        handleAbort()
        return
      }
      signal.addEventListener('abort', handleAbort, { once: true })
    }

    // 胜出者：关闭另一条链路
    const finish = (session: RoomSession, loser: AbortController) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', handleAbort)
      loser.abort()
      resolve(session)
    }

    if (localSupported) {
      void createBroadcastHostTransport({ code, signal: localAbort.signal })
        .then((transport) => finish({ role: 'host', kind: 'local', transport }, webrtcAbort))
        .catch(() => {
          // 竞速失败或被取消：忽略即可
        })
    }

    void createWebrtcHostTransport({ code, signal: webrtcAbort.signal })
      .then((transport) => finish({ role: 'host', kind: 'webrtc', transport }, localAbort))
      .catch((error: unknown) => {
        if (settled) return

        if (error instanceof RemoteTransportError && error.code === 'code-taken') {
          settled = true
          signal?.removeEventListener('abort', handleAbort)
          localAbort.abort()
          reject(new RoomCodeTakenError(code))
          return
        }

        // 信令不可用等错误：若本地链路也不可用，则整体失败
        if (!localSupported) {
          settled = true
          signal?.removeEventListener('abort', handleAbort)
          reject(error instanceof Error ? error : new RemoteTransportError('connection-failed'))
        }
        // 否则静默忽略，继续等待同浏览器的加入方
      })
  })

/** 加入房间：先试同浏览器，再回退 WebRTC */
export const joinRoom = async (code: string, signal?: AbortSignal): Promise<RoomSession> => {
  if (isBroadcastChannelSupported()) {
    try {
      const transport = await createBroadcastGuestTransport(
        { code, signal },
        LOCAL_HANDSHAKE_TIMEOUT_MS,
      )
      return { role: 'guest', kind: 'local', transport }
    } catch (error) {
      // 只有「同浏览器里找不到房主」才值得回退到 WebRTC
      if (!(error instanceof RemoteTransportError) || error.code !== 'not-found') {
        throw error
      }
    }
  }

  const transport = await createWebrtcGuestTransport({ code, signal }, WEBRTC_CONNECT_TIMEOUT_MS)
  return { role: 'guest', kind: 'webrtc', transport }
}
