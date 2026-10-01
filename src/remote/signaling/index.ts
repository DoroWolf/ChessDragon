// ============================================================
// 远程对局：信令后端注册表
//   - 统一在这里决定启用哪些信令与它们的优先级
//   - room.ts 只依赖本文件，不感知具体实现
// ============================================================
import { mqttRelayProvider } from './mqttRelay'
import { peerjsProvider } from './peerjs'
import type { SignalingProvider } from './types'

export type { SignalingContext, SignalingName, SignalingProvider } from './types'

/**
 * 当前可用的信令后端，按回退优先级排序：
 *   1. PeerJS（公共云 / 自建 PeerServer）：真 P2P，成功时延迟最低
 *   2. MQTT 纯中继：不走 WebRTC、不需 NAT 穿透与发现，连通率最高
 */
export const getSignalingProviders = (): SignalingProvider[] => {
  const providers: SignalingProvider[] = []

  if (peerjsProvider.isSupported()) {
    providers.push(peerjsProvider)
  }

  if (import.meta.env.VITE_DISABLE_MQTT_RELAY !== 'true' && mqttRelayProvider.isSupported()) {
    providers.push(mqttRelayProvider)
  }

  return providers
}
