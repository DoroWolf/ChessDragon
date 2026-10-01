// ============================================================
// 远程对局：信令后端注册表
//   - 统一在这里决定启用哪些信令与它们的优先级
//   - room.ts 只依赖本文件，不感知具体实现
// ============================================================
import { peerjsProvider } from './peerjs'
import { trysteroMqttProvider, trysteroNostrProvider } from './trystero'
import type { SignalingProvider } from './types'

export type { SignalingContext, SignalingName, SignalingProvider } from './types'

/**
 * 当前可用的信令后端，按回退优先级排序：
 *   1. PeerJS（公共云 / 自建 PeerServer，代码路径最成熟）
 *   2. Trystero / Nostr（公共中继冗余最高）
 *   3. Trystero / MQTT（Nostr 不可用时的最后兜底）
 */
export const getSignalingProviders = (): SignalingProvider[] => {
  const providers: SignalingProvider[] = []

  if (peerjsProvider.isSupported()) {
    providers.push(peerjsProvider)
  }

  if (import.meta.env.VITE_DISABLE_TRYSTERO !== 'true') {
    if (trysteroNostrProvider.isSupported()) providers.push(trysteroNostrProvider)
    if (trysteroMqttProvider.isSupported()) providers.push(trysteroMqttProvider)
  }

  return providers
}
