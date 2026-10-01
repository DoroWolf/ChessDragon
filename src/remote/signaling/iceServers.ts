// ============================================================
// 远程对局：ICE 服务器配置（供 PeerJS 使用）
//   - STUN 只负责「发现公网地址」，无法穿透对称型 NAT / 企业网络
//   - TURN 负责「中继转发」，是上述网络下 P2P 唯一能连通的途径
//   - 未配置 VITE_TURN_* 时，若对端处于对称型 NAT 会 ICE 失败；
//     此时默认信令顺序里的 mqtt-relay 会接手，因此不配 TURN 通常也能开局
// ============================================================

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

const buildIceServers = (): RTCIceServer[] => {
  const servers = [...STUN_SERVERS]
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

/** PeerJS 使用的 ICE 配置（STUN + 可选 TURN） */
export const iceServers: RTCIceServer[] = buildIceServers()
