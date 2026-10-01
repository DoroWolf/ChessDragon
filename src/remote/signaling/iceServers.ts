// ============================================================
// 远程对局：统一 ICE 服务器配置
//   - 默认只用公共 STUN（发现公网地址）
//   - 若配置了 TURN 环境变量则追加，用于穿透对称型 NAT / 企业网络
//   - PeerJS 与 Trystero 共用同一份配置
// ============================================================

/** 公共 STUN 服务器 */
const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

const buildIceServers = (): RTCIceServer[] => {
  const servers = [...DEFAULT_STUN_SERVERS]
  const turnUrl = import.meta.env.VITE_TURN_URL
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    })
  }
  return servers
}

/** 全局共用的 ICE 配置 */
export const iceServers: RTCIceServer[] = buildIceServers()
