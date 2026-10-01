// ============================================================
// 远程对局：PeerJS 信令后端
//   - 默认使用 PeerJS 公共云；配置 VITE_SIGNALING_PEERJS_HOST 可切到自建 PeerServer
//   - 房间码即节点 id
//   - 数据通道为 reliable + ordered，因此上层可以按顺序应用消息
//   - 需要 TURN 的网络环境可能连接失败，此时统一抛出 connection-failed
// ============================================================
import Peer, { type DataConnection, PeerErrorType } from 'peerjs'
import { roomPeerId } from '../roomCode'
import { RemoteTransportError, type RemoteTransport } from '../transport'
import { createChannelTransport, type RawChannel } from './channelTransport'
import { iceServers } from './iceServers'
import type { SignalingContext, SignalingProvider } from './types'

/** 组装 PeerJS 客户端；未配置自建服务时走公共云 */
const createPeer = (id?: string): Peer => {
  const baseOptions = { config: { iceServers } }
  const host = import.meta.env.VITE_SIGNALING_PEERJS_HOST

  if (!host) {
    return id ? new Peer(id, baseOptions) : new Peer(baseOptions)
  }

  const options = {
    host,
    port: Number(import.meta.env.VITE_SIGNALING_PEERJS_PORT ?? 443),
    path: import.meta.env.VITE_SIGNALING_PEERJS_PATH ?? '/',
    secure: import.meta.env.VITE_SIGNALING_PEERJS_SECURE !== 'false',
    key: import.meta.env.VITE_SIGNALING_PEERJS_KEY ?? 'peerjs',
    config: { iceServers },
  }
  return id ? new Peer(id, options) : new Peer(options)
}

/** 把 PeerJS 数据连接适配成通用原始通道 */
const toRawChannel = (peer: Peer, conn: DataConnection): RawChannel => ({
  send: (data) => {
    if (conn.open) conn.send(data)
  },
  onData: (handler) => {
    conn.on('data', (data: unknown) => handler(data))
  },
  onClose: (handler) => {
    conn.on('close', handler)
    conn.on('error', handler)
  },
  close: () => {
    try {
      conn.close()
    } catch {
      // 忽略重复关闭
    }
    peer.destroy()
  },
})

const isFatalPeerError = (type: string): boolean =>
  type === PeerErrorType.BrowserIncompatible ||
  type === PeerErrorType.InvalidID ||
  type === PeerErrorType.InvalidKey ||
  type === PeerErrorType.ServerError ||
  type === PeerErrorType.SocketError ||
  type === PeerErrorType.SocketClosed ||
  type === PeerErrorType.SslUnavailable ||
  type === PeerErrorType.Network

/**
 * 与 PeerJS 信令服务建立连接的时间上限。
 * 超过它仍没 open，说明信令服务不可达（常见于受限网络），
 * 此时快速失败，把时间让给后续的 mqtt-relay 兜底。
 */
const SIGNALING_READY_TIMEOUT_MS = 6_000

const closeQuietly = (conn: DataConnection): void => {
  try {
    conn.close()
  } catch {
    // 忽略
  }
}

/** 房主侧：注册房间节点 id 并等待加入方发起连接 */
const createHost = (context: SignalingContext): Promise<RemoteTransport> =>
  new Promise<RemoteTransport>((resolve, reject) => {
    let settled = false
    const peer = createPeer(roomPeerId(context.code))

    // 信令服务连不上时给出明确警告；房主不能直接失败，否则会丢掉唯一的等待机会
    const readyTimer = window.setTimeout(() => {
      if (!settled && !peer.open) {
        console.warn('[remote] host @ peerjs 信令服务连接较慢或不可达，继续等待其它信令')
      }
    }, SIGNALING_READY_TIMEOUT_MS)

    const fail = (error: RemoteTransportError) => {
      if (settled) return
      settled = true
      window.clearTimeout(readyTimer)
      context.signal?.removeEventListener('abort', handleAbort)
      peer.destroy()
      reject(error)
    }

    const handleAbort = () => fail(new RemoteTransportError('connection-failed', 'aborted'))
    context.signal?.addEventListener('abort', handleAbort, { once: true })

    peer.on('error', (error) => {
      if (error.type === PeerErrorType.UnavailableID) {
        fail(new RemoteTransportError('code-taken'))
        return
      }
      if (isFatalPeerError(error.type) || !settled) {
        fail(new RemoteTransportError('connection-failed', error.type))
      }
    })

    peer.on('connection', (conn) => {
      if (settled) {
        closeQuietly(conn)
        return
      }

      const onOpen = () => {
        if (settled) {
          closeQuietly(conn)
          return
        }
        settled = true
        window.clearTimeout(readyTimer)
        context.signal?.removeEventListener('abort', handleAbort)
        conn.off('open', onOpen)
        resolve(createChannelTransport(toRawChannel(peer, conn)))
      }

      if (conn.open) {
        onOpen()
      } else {
        conn.on('open', onOpen)
      }
    })
  })

/** 加入方侧：连接房主节点 */
const createGuest = (context: SignalingContext, timeoutMs: number): Promise<RemoteTransport> =>
  new Promise<RemoteTransport>((resolve, reject) => {
    let settled = false
    let retryTimer: number | null = null
    let connecting: DataConnection | null = null
    const peer = createPeer()

    const fail = (error: RemoteTransportError) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      window.clearTimeout(signalingTimer)
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      context.signal?.removeEventListener('abort', handleAbort)
      peer.destroy()
      reject(error)
    }

    const handleAbort = () => fail(new RemoteTransportError('connection-failed', 'aborted'))
    context.signal?.addEventListener('abort', handleAbort, { once: true })

    const timer = window.setTimeout(() => fail(new RemoteTransportError('not-found')), timeoutMs)

    // 信令服务本身连不上时快速失败，把剩余时间让给后续的兜底信令
    const signalingTimer = window.setTimeout(() => {
      if (!peer.open) fail(new RemoteTransportError('connection-failed', 'signaling-unreachable'))
    }, SIGNALING_READY_TIMEOUT_MS)

    peer.on('error', (error) => {
      if (error.type === PeerErrorType.PeerUnavailable) {
        if (connecting) {
          connecting.close()
          connecting = null
        }
        if (retryTimer === null) {
          retryTimer = window.setTimeout(() => {
            retryTimer = null
            connectToHost()
          }, 500)
        }
        return
      }
      fail(new RemoteTransportError('connection-failed', error.type))
    })

    const connectToHost = () => {
      if (settled || !peer.open) return
      const conn = peer.connect(roomPeerId(context.code), { serialization: 'json', reliable: true })
      connecting = conn

      const onOpen = () => {
        if (settled) {
          closeQuietly(conn)
          return
        }
        settled = true
        window.clearTimeout(timer)
        if (retryTimer !== null) window.clearTimeout(retryTimer)
        context.signal?.removeEventListener('abort', handleAbort)
        conn.off('open', onOpen)
        connecting = null
        resolve(createChannelTransport(toRawChannel(peer, conn)))
      }

      if (conn.open) {
        onOpen()
      } else {
        conn.on('open', onOpen)
      }
    }

    peer.on('open', () => {
      window.clearTimeout(signalingTimer)
      connectToHost()
    })
  })

export const peerjsProvider: SignalingProvider = {
  name: 'peerjs',
  isSupported: () => typeof RTCPeerConnection !== 'undefined',
  createHost,
  createGuest,
}
