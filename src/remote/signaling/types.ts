// ============================================================
// 远程对局：信令提供方接口
//   - 传输层与业务层都不感知具体的信令后端（PeerJS / MQTT 纯中继）
//   - 每个提供方都要产出统一的 RemoteTransport
//   - host / guest 的非对称模型与 room.ts 的编排保持一致
// ============================================================
import type { RemoteTransport } from '../transport'

/** 可插拔的信令后端名称 */
export type SignalingName = 'peerjs' | 'mqtt-relay'

export interface SignalingContext {
  /** 房间码 */
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
  /** 房主：注册房间并等待对手接入 */
  createHost(context: SignalingContext): Promise<RemoteTransport>
  /** 加入方：主动接入房主；超时抛 not-found */
  createGuest(context: SignalingContext, timeoutMs: number): Promise<RemoteTransport>
}
