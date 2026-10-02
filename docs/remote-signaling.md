# 远程对局部署与配置指南

本文面向自建部署用户，介绍远程对局所依赖的网络组件、推荐配置方式，以及常见问题的排查方法。大多数部署场景下系统开箱即用，无需额外配置；只有在需要更高连通率、完全自托管或更严格的隐私控制时，才建议配置自建服务。

## 连接方式概览

远程对局支持两种连接方式。一种是 PeerJS + WebRTC，由玩家之间直接建立 P2P 连接，适合追求最低延迟、希望数据不经过中继服务器的场景；另一种是 MQTT Relay，通过 MQTT Broker 转发消息，适合网络环境复杂、企业网络、移动网络或 P2P 建连困难的场景。系统会自动选择可用连接方式，通常优先尝试 PeerJS（P2P），如果 P2P 无法建立则自动切换到 MQTT Relay，用户无需手动选择。对于棋类等回合制游戏，两种方式在实际体验上的差异通常不明显。

## 推荐部署方案

**方案一：默认配置（推荐）**。不配置任何额外服务，无需维护服务器，配置最简单，大部分网络环境可正常使用，适合个人部署、小规模玩家群体和测试环境。

**方案二：自建 PeerServer**。如果希望控制信令服务，可以部署自己的 PeerServer。配置后不依赖公共 PeerJS 服务，可避免公共服务不可达的问题，同时保持 WebRTC P2P 特性。需要配置以下环境变量：

```env
VITE_SIGNALING_PEERJS_HOST=peer.example.com
VITE_SIGNALING_PEERJS_PORT=443
VITE_SIGNALING_PEERJS_PATH=/
VITE_SIGNALING_PEERJS_SECURE=true
VITE_SIGNALING_PEERJS_KEY=peerjs
```

其中 `HOST` 为 PeerServer 域名，`PORT` 为服务端口，`PATH` 为服务路径，`SECURE` 表示是否使用 HTTPS/WSS，`KEY` 为 PeerServer 配置的 key。建议使用 HTTPS 和 WSS，并将 PeerServer 放在公网环境。

**方案三：配置 TURN（高连通率）**。如果发现部分用户无法建立 P2P 连接，建议配置 TURN。TURN 的作用是帮助 WebRTC 穿透复杂 NAT，解决企业网络限制和运营商网络限制，提高 PeerJS 成功率。配置如下：

```env
VITE_TURN_URL=turn:turn.example.com:3478
VITE_TURN_USERNAME=username
VITE_TURN_CREDENTIAL=password
```

建议使用专用 TURN 服务，开启 TLS（turns），并为公网部署设置认证。该方案适合企业环境、校园网、移动网络用户较多的场景，以及希望尽量保持 P2P 连接的情况。

**方案四：完全自托管**。如果希望所有基础设施均由自己维护，可以同时部署 PeerServer、TURN Server 和 MQTT Broker，并配置：

```env
VITE_SIGNALING_PEERJS_HOST=peer.example.com

VITE_TURN_URL=turn:turn.example.com:3478
VITE_TURN_USERNAME=username
VITE_TURN_CREDENTIAL=password

VITE_MQTT_RELAY_URLS=wss://mqtt.example.com:8084/mqtt
```

这样可以避免依赖任何公共服务。

## MQTT Relay 配置

默认情况下，系统会启用 MQTT Relay 作为备用连接方式；当 PeerJS 无法建立连接时，会自动使用 MQTT Relay。使用自建 MQTT Broker 时配置如下：

```env
VITE_MQTT_RELAY_URLS=wss://mqtt.example.com:8084/mqtt
```

也支持多个地址：

```env
VITE_MQTT_RELAY_URLS=wss://mqtt1.example.com/mqtt,wss://mqtt2.example.com/mqtt
```

建议使用 WSS、配置反向代理并开启访问控制。如果希望所有连接都通过 WebRTC P2P 建立，可以关闭 MQTT Relay：

```env
VITE_DISABLE_MQTT_RELAY=true
```

注意关闭后必须依赖 PeerJS/WebRTC，建议同时配置 TURN，且某些网络环境下可能无法连接。

## 环境变量汇总

PeerServer 相关变量：

```env
VITE_SIGNALING_PEERJS_HOST=
VITE_SIGNALING_PEERJS_PORT=443
VITE_SIGNALING_PEERJS_PATH=/
VITE_SIGNALING_PEERJS_SECURE=true
VITE_SIGNALING_PEERJS_KEY=peerjs
```

TURN 相关变量：

```env
VITE_TURN_URL=
VITE_TURN_USERNAME=
VITE_TURN_CREDENTIAL=
```

MQTT Relay 相关变量：

```env
VITE_DISABLE_MQTT_RELAY=false
VITE_MQTT_RELAY_URLS=
```

所有变量均为可选，未配置时系统会使用默认公共基础设施。

## 常见部署问题

**PeerJS 经常连接失败**。表现为建房或加入耗时较长，最终通过 MQTT Relay 连接成功。原因通常是 NAT 类型受限、企业网络限制或移动运营商网络限制。建议配置 TURN、检查 PeerServer 是否可访问，并确认 WebSocket/WSS 未被拦截。

**MQTT Relay 无法连接**。表现为提示 `mqtt-relay 不可用`，原因可能是 Broker 不可访问、WSS 配置错误或防火墙阻断。建议检查 Broker 地址，确认 MQTT WebSocket 端口已开放，并使用浏览器直接验证 WSS 可达性。

**浏览器出现 WebSocket 错误**，例如 `WebSocket connection failed` 或 `Firefox 无法建立到 wss://... 的连接`。这通常表示某个 MQTT Broker 无法访问；如果系统随后成功建立连接，则可以忽略该错误。若频繁出现，建议通过 `VITE_MQTT_RELAY_URLS=wss://your-broker.example.com/mqtt` 改为部署环境中可访问的 Broker。

## 隐私与安全建议

**最高隐私方案**：部署自建 PeerServer 和自建 TURN，并关闭 MQTT Relay（`VITE_DISABLE_MQTT_RELAY=true`），此时所有对局数据均通过 WebRTC 传输。

**最高连通率方案**：部署自建 PeerServer、自建 TURN 和自建 MQTT Broker，保留 MQTT Relay 作为兜底。这是生产环境最推荐的配置。

## 推荐配置总结

| 场景 | 推荐配置 |
| --- | --- |
| 个人部署 | 默认配置即可 |
| 小规模社区 | 自建 PeerServer |
| 公网生产环境 | PeerServer + TURN |
| 企业/校园网络用户较多 | PeerServer + TURN + MQTT Broker |
| 完全自托管 | PeerServer + TURN + MQTT Broker |
| 强隐私要求 | PeerServer + TURN，关闭 MQTT Relay |
