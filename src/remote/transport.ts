import type { RemoteErrorCode, RemoteLinkKind, RemoteMessage } from './types'

export class RemoteTransportError extends Error {
  readonly code: RemoteErrorCode

  constructor(code: RemoteErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'RemoteTransportError'
    this.code = code
  }
}

export interface RemoteTransport {
  readonly kind: RemoteLinkKind
  send(message: RemoteMessage): void
  /** 注册消息回调；注册前收到的消息会在注册时按序补发 */
  onMessage(handler: (message: RemoteMessage) => void): void
  onClose(handler: () => void): void
  close(): void
}

export interface TransportOptions {
  code: string
  /** 中断建连流程（用于「另一条链路先连上」时取消本链路） */
  signal?: AbortSignal
}

/**
 * 消息缓冲：transport 建连成功与业务层注册回调之间存在时间差，
 * 用它可以保证消息不丢失且保持先后顺序。
 */
export class MessageBuffer {
  private handler: ((message: RemoteMessage) => void) | null = null
  private pending: RemoteMessage[] = []

  setHandler(handler: (message: RemoteMessage) => void): void {
    this.handler = handler
    if (this.pending.length > 0) {
      const queued = this.pending
      this.pending = []
      for (const message of queued) handler(message)
    }
  }

  push(message: RemoteMessage): void {
    if (this.handler) {
      this.handler(message)
      return
    }
    this.pending.push(message)
  }

  clear(): void {
    this.pending = []
    this.handler = null
  }
}

/** 同浏览器标签页握手等待时间：超时即回退到跨设备链路 */
export const LOCAL_HANDSHAKE_TIMEOUT_MS = 900

/** 单个信令后端的建连超时（加入方逐个回退时使用） */
export const SIGNALING_CONNECT_TIMEOUT_MS = 10_000

export const HEARTBEAT_INTERVAL_MS = 2_000
export const HEARTBEAT_TIMEOUT_MS = 6_000

export const isRemoteMessage = (value: unknown): value is RemoteMessage => {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return typeof type === 'string'
}

/** 把消息转为纯 JSON，避免 Vue 响应式 Proxy 无法被结构化克隆 / postMessage */
export const toPlainMessage = (message: RemoteMessage): RemoteMessage =>
  JSON.parse(JSON.stringify(message)) as RemoteMessage
