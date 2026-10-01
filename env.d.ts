/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module '*.json' {
  const value: unknown
  export default value
}

interface ImportMetaEnv {
  /** 自建 PeerServer 主机名（不配置则使用 PeerJS 公共云） */
  readonly VITE_SIGNALING_PEERJS_HOST?: string
  readonly VITE_SIGNALING_PEERJS_PORT?: string
  readonly VITE_SIGNALING_PEERJS_PATH?: string
  readonly VITE_SIGNALING_PEERJS_SECURE?: string
  readonly VITE_SIGNALING_PEERJS_KEY?: string
  /** TURN 服务器，用于穿透对称型 NAT / 企业网络 */
  readonly VITE_TURN_URL?: string
  readonly VITE_TURN_USERNAME?: string
  readonly VITE_TURN_CREDENTIAL?: string
  /** 设为 'true' 可关闭 MQTT 纯中继兜底 */
  readonly VITE_DISABLE_MQTT_RELAY?: string
  /** 覆盖 MQTT 中继 broker 地址（逗号分隔，含路径，如 wss://host:8084/mqtt） */
  readonly VITE_MQTT_RELAY_URLS?: string
}
