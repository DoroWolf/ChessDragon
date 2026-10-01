# 远程对局：信令架构

本文档说明远程对局的连接建立机制、可插拔信令层，以及如何配置自建服务 / TURN。

## 分层

```
useRemoteGame.ts        会话层：心跳、消息路由、状态机（不感知信令实现）
        │  RoomSession { role, kind, transport }
        ▼
room.ts                 编排层：房主多路竞速 · 加入方顺序回退
        │
        ├─ broadcastTransport.ts      同浏览器（BroadcastChannel）
        └─ signaling/                 跨设备信令后端
             ├─ peerjs.ts             PeerJS（公共云 / 自建 PeerServer）
             ├─ trystero.ts           Trystero（Nostr / MQTT 公共中继）
             └─ index.ts              注册表与优先级
        │
        └──── 统一实现 RemoteTransport（transport.ts）────┘
```

业务层只依赖 `RemoteTransport` 接口；新增信令后端只需实现 `SignalingProvider`
（见 `src/remote/signaling/types.ts`）并注册到 `signaling/index.ts`。

## 建连策略

- **房主**：同时启动 BroadcastChannel 与所有信令后端，**谁先连上用谁**，其余全部取消。
- **加入方**：先试 BroadcastChannel（同浏览器最快），失败后按优先级**顺序回退**：
  PeerJS → Trystero/Nostr → Trystero/MQTT。
  - 顺序而非并发，是为了避免「同时经两条链路连上同一房主」导致双方落在不同数据通道。
- **房间码占用**：PeerJS 的房间码是全局命名空间，一旦报告 `code-taken`，房主立即终止
  并抛出 `RoomCodeTakenError`，由上层换码重试（否则加入方可能被路由到陌生人的同名房间）。

## 握手与数据

参考 `src/remote/types.ts`：`hello` / `welcome` / `ready` 建立对局；此后走子、
棋钟、悔棋、和棋、认输、重赛、全量重同步（`state`）等均在已建立的 `RemoteTransport`
上双向传输，WebRTC 场景下为**点对点加密数据通道**，不经任何中继。

BroadcastChannel 场景下的 `hello` 由 `broadcastTransport.ts` 负责；PeerJS / Trystero
场景下房主在通道就绪后立即下发 `welcome`，加入方据此开始对局。

## 环境变量

全部为可选；不配置即使用公共基础设施。

| 变量 | 作用 |
| --- | --- |
| `VITE_SIGNALING_PEERJS_HOST` | 自建 PeerServer 主机名；不配置则用 PeerJS 公共云 |
| `VITE_SIGNALING_PEERJS_PORT` | 自建 PeerServer 端口（默认 443） |
| `VITE_SIGNALING_PEERJS_PATH` | 自建 PeerServer 路径（默认 `/`） |
| `VITE_SIGNALING_PEERJS_SECURE` | 设为 `'false'` 关闭 wss（默认开启） |
| `VITE_SIGNALING_PEERJS_KEY` | 自建 PeerServer 的 key（默认 `peerjs`） |
| `VITE_TURN_URL` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` | TURN 服务器，用于穿透对称型 NAT / 企业网络 |
| `VITE_DISABLE_TRYSTERO` | 设为 `'true'` 关闭 Trystero 兜底信令 |

未配置 TURN 时只使用公共 STUN，部分企业网络可能无法完成 P2P 穿透；此时会返回
`connection-failed`。

## 隐私与安全

- 房间码同时作为 Trystero 的会话加密口令（`chessdragon:<code>`），WebRTC 链路本身也有 DTLS 加密。
- 房间码即唯一凭证：知道房间码的人即可加入，请勿公开分享。

## 排障

- 加入方一直转圈：多为对端不在线或房间码错误；顺序回退会依次尝试各信令，最坏耗时约
  `本地 0.9s + 各信令 8s`。
- 同浏览器双标签：走 `local` 链路，与网络无关。
- 想验证回退：在 DevTools 中屏蔽 `0.peerjs.com` 后重试，应自动切到 Trystero。
