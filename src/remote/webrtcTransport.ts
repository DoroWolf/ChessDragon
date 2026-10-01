// ============================================================
// 远程对局：WebRTC 传输（真正跨设备 / 跨浏览器，点对点）
//   - 使用 PeerJS 公共信令服务做握手，房间码即节点 id
//   - 数据通道为 reliable + ordered，因此上层可以按顺序应用消息
//   - 需要 TURN 的网络环境可能连接失败，此时统一抛出 connection-failed
// ============================================================
import Peer, { type DataConnection, PeerErrorType } from 'peerjs'
import { roomPeerId } from './roomCode'
import {
  MessageBuffer,
  RemoteTransportError,
  isRemoteMessage,
  toPlainMessage,
  type RemoteTransport,
  type TransportOptions,
} from './transport'
import type { RemoteMessage } from './types'

class WebRtcTransport implements RemoteTransport {
  readonly kind = 'webrtc' as const

  private readonly peer: Peer
  private readonly conn: DataConnection
  private readonly buffer = new MessageBuffer()
  private closeHandler: (() => void) | null = null
  private closed = false

  constructor(peer: Peer, conn: DataConnection) {
    this.peer = peer
    this.conn = conn

    this.conn.on('data', (data: unknown) => {
      if (this.closed || !isRemoteMessage(data)) return
      this.buffer.push(data)
    })
    this.conn.on('close', () => this.handleClose())
    this.conn.on('error', () => this.handleClose())
  }

  private handleClose(): void {
    if (this.closed) return
    this.closed = true
    this.buffer.clear()
    this.closeHandler?.()
  }

  send(message: RemoteMessage): void {
    if (this.closed) return
    if (!this.conn.open) return
    try {
      this.conn.send(toPlainMessage(message))
    } catch (error) {
      console.error('[remote] WebRTC 发送失败', error)
    }
  }

  onMessage(handler: (message: RemoteMessage) => void): void {
    this.buffer.setHandler(handler)
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    try {
      this.conn.close()
    } catch {
      // 忽略重复关闭
    }
    this.peer.destroy()
    this.buffer.clear()
    this.closeHandler?.()
  }
}

const isFatalPeerError = (type: string): boolean =>
  type === PeerErrorType.BrowserIncompatible ||
  type === PeerErrorType.InvalidID ||
  type === PeerErrorType.InvalidKey ||
  type === PeerErrorType.ServerError ||
  type === PeerErrorType.SocketError ||
  type === PeerErrorType.SocketClosed ||
  type === PeerErrorType.SslUnavailable ||
  type === PeerErrorType.Network

/** 房主侧：注册房间节点 id 并等待加入方发起连接 */
export const createWebrtcHostTransport = (options: TransportOptions): Promise<RemoteTransport> =>
  new Promise<RemoteTransport>((resolve, reject) => {
    let settled = false
    const peer = new Peer(roomPeerId(options.code))

    const fail = (error: RemoteTransportError) => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', handleAbort)
      peer.destroy()
      reject(error)
    }

    const handleAbort = () => fail(new RemoteTransportError('connection-failed', 'aborted'))
    options.signal?.addEventListener('abort', handleAbort, { once: true })

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
        try {
          conn.close()
        } catch {
          // 忽略
        }
        return
      }

      const onOpen = () => {
        if (settled) {
          try {
            conn.close()
          } catch {
            // 忽略
          }
          return
        }
        settled = true
        options.signal?.removeEventListener('abort', handleAbort)
        conn.off('open', onOpen)
        resolve(new WebRtcTransport(peer, conn))
      }

      if (conn.open) {
        onOpen()
      } else {
        conn.on('open', onOpen)
      }
    })
  })

/** 加入方侧：连接房主节点 */
export const createWebrtcGuestTransport = (
  options: TransportOptions,
  timeoutMs: number,
): Promise<RemoteTransport> =>
  new Promise<RemoteTransport>((resolve, reject) => {
    let settled = false
    const peer = new Peer()

    const fail = (error: RemoteTransportError) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      options.signal?.removeEventListener('abort', handleAbort)
      peer.destroy()
      reject(error)
    }

    const handleAbort = () => fail(new RemoteTransportError('connection-failed', 'aborted'))
    options.signal?.addEventListener('abort', handleAbort, { once: true })

    const timer = window.setTimeout(() => fail(new RemoteTransportError('not-found')), timeoutMs)

    peer.on('error', (error) => {
      if (error.type === PeerErrorType.PeerUnavailable) {
        fail(new RemoteTransportError('not-found'))
        return
      }
      fail(new RemoteTransportError('connection-failed', error.type))
    })

    peer.on('open', () => {
      if (settled) return

      const conn = peer.connect(roomPeerId(options.code), { serialization: 'json', reliable: true })

      const onOpen = () => {
        if (settled) {
          try {
            conn.close()
          } catch {
            // 忽略
          }
          return
        }
        settled = true
        window.clearTimeout(timer)
        options.signal?.removeEventListener('abort', handleAbort)
        resolve(new WebRtcTransport(peer, conn))
      }

      if (conn.open) {
        onOpen()
      } else {
        conn.on('open', onOpen)
      }
    })
  })
