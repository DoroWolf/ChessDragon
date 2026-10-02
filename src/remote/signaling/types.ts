import type { RemoteTransport } from '../transport'

export type SignalingName = 'peerjs' | 'mqtt-relay'

export interface SignalingContext {
  code: string
  /** 中断建连（用于「另一条信令先连上」时取消本信令） */
  signal?: AbortSignal
}

export interface SignalingProvider {
  readonly name: SignalingName
  /** 当前环境是否可用（如缺少所需的浏览器能力） */
  isSupported(): boolean
  /** 加入方建连超时；缺省使用 SIGNALING_CONNECT_TIMEOUT_MS */
  readonly guestTimeoutMs?: number
  createHost(context: SignalingContext): Promise<RemoteTransport>
  /** 加入方：主动接入房主；超时抛 not-found */
  createGuest(context: SignalingContext, timeoutMs: number): Promise<RemoteTransport>
}
