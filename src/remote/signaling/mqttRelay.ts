// ============================================================
// 远程对局：MQTT over WSS 纯中继传输
//   - 不依赖 WebRTC / NAT / TURN，也不存在「双方互相发现」这一步：
//     两端只是往同一公共 broker 上的两个主题收发消息
//   - 棋类是回合制，走中继的延迟完全可接受，换来的是极高的连通率
//   - 握手沿用既有协议：guest 发 hello，host 回 welcome（与 BroadcastChannel 一致）
//   - 消息经由公共 broker，仅适合非敏感数据（详见 docs/remote-signaling.md）
// ============================================================
import type { IClientOptions, MqttClient } from 'mqtt'
import {
  RemoteTransportError,
  isRemoteMessage,
  toPlainMessage,
  type RemoteTransport,
} from '../transport'
import { PROTOCOL_VERSION, type RemoteMessage } from '../types'
import { createChannelTransport, type RawChannel } from './channelTransport'
import type { SignalingContext, SignalingProvider } from './types'

/** 默认公共 broker（WSS），按顺序尝试 */
const DEFAULT_BROKER_URLS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker-cn.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
]

const TOPIC_PREFIX = 'chessdragon'

/** 单个 broker 的连接超时 */
const BROKER_CONNECT_TIMEOUT_MS = 4_000
/**
 * guest 建连总超时。没有 ICE、没有发现过程，因此可以比其它信令短很多；
 * 失败也意味着「房主确实不在」，能更快给出结论。
 */
const GUEST_TIMEOUT_MS = 6_000
/** guest 重发 hello 的间隔，覆盖「房主尚未订阅完成」的窗口 */
const HELLO_REPEAT_INTERVAL_MS = 1_500

const configuredBrokerUrls = (import.meta.env.VITE_MQTT_RELAY_URLS ?? '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean)

const brokerUrls = configuredBrokerUrls.length > 0 ? configuredBrokerUrls : DEFAULT_BROKER_URLS

/** host 收 to-host、发 to-guest，guest 反之；分主题可彻底避开 broker 回显问题 */
const topicFor = (code: string, side: 'host' | 'guest'): string =>
  `${TOPIC_PREFIX}/${code.toUpperCase()}/${side === 'host' ? 'to-host' : 'to-guest'}`

type MqttConnect = (url: string, options?: IClientOptions) => MqttClient

/**
 * 取得 `connect` 函数。
 * 注意：mqtt 的「浏览器 ESM 构建」只有 default 导出，只有 Node 构建才有具名
 * `connect`（而 TS 类型来自 Node 构建），因此两种形态都要兼容，
 * 否则会在运行时抛 “xxx is not a function”。
 */
const loadMqtt = async (): Promise<MqttConnect> => {
  const module = (await import('mqtt')) as unknown as {
    default?: MqttConnect | { connect?: MqttConnect }
    connect?: MqttConnect
  }

  const fallback = module.default
  const connect = typeof fallback === 'function' ? fallback : (fallback?.connect ?? module.connect)

  if (typeof connect !== 'function') {
    throw new RemoteTransportError('connection-failed', 'mqtt-connect-unavailable')
  }

  return connect
}

/** 覆盖 mqtt.js 回调风格的订阅 */
const subscribe = (client: MqttClient, topic: string): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    client.subscribe(topic, { qos: 0 }, (error) => {
      if (error) reject(new RemoteTransportError('connection-failed', `subscribe-failed: ${topic}`))
      else resolve()
    })
  })

const connectOnce = (connect: MqttConnect, url: string, clientId: string): Promise<MqttClient> =>
  new Promise<MqttClient>((resolve, reject) => {
    const client = connect(url, {
      clientId,
      clean: true,
      protocolVersion: 4,
      keepalive: 30,
      reconnectPeriod: 0,
      connectTimeout: BROKER_CONNECT_TIMEOUT_MS,
    })

    let done = false
    const finish = (error?: RemoteTransportError) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      if (error) {
        client.end(true)
        reject(error)
      } else {
        resolve(client)
      }
    }

    const timer = window.setTimeout(
      () => finish(new RemoteTransportError('connection-failed', `broker-timeout: ${url}`)),
      BROKER_CONNECT_TIMEOUT_MS,
    )

    client.once('connect', () => finish())
    client.once('error', (error: Error) =>
      finish(
        new RemoteTransportError('connection-failed', `broker-error: ${url} ${error.message}`),
      ),
    )
  })

/** 依次尝试各公共 broker，返回第一个连上的客户端 */
const connectToAnyBroker = async (
  connect: MqttConnect,
  clientId: string,
  signal?: AbortSignal,
): Promise<MqttClient> => {
  let lastMessage = 'all-brokers-unreachable'

  for (const url of brokerUrls) {
    if (signal?.aborted) throw new RemoteTransportError('connection-failed', 'aborted')
    try {
      return await connectOnce(connect, url, clientId)
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : String(error)
      console.info(`[remote] mqtt-relay 中继 ${url} 不可用（${lastMessage}），尝试下一个`)
    }
  }

  throw new RemoteTransportError('connection-failed', lastMessage)
}

/** MQTT 客户端 → 通用原始通道；握手期间的消息先缓存，注册回调后补发 */
class MqttRawChannel implements RawChannel {
  private handler: ((data: unknown) => void) | null = null
  private closeHandler: (() => void) | null = null
  private pending: unknown[] = []
  private closed = false

  constructor(
    private readonly client: MqttClient,
    private readonly outTopic: string,
  ) {}

  push(data: unknown): void {
    if (this.closed) return
    if (this.handler) this.handler(data)
    else this.pending.push(data)
  }

  notifyClose(): void {
    if (this.closed) return
    this.closed = true
    this.closeHandler?.()
  }

  send(data: unknown): void {
    if (this.closed) return
    this.client.publish(this.outTopic, JSON.stringify(data), { qos: 0 })
  }

  onData(handler: (data: unknown) => void): void {
    this.handler = handler
    const queued = this.pending
    this.pending = []
    for (const data of queued) handler(data)
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    // 优雅关闭，尽量把尚未发出的消息（例如 bye）刷出去；卡住则强制关闭
    const forceTimer = window.setTimeout(() => this.client.end(true), 600)
    this.client.end(false, {}, () => window.clearTimeout(forceTimer))
    this.closeHandler?.()
  }
}

const joinMqttRelay = (
  context: SignalingContext,
  timeoutMs: number | null,
  role: 'host' | 'guest',
): Promise<RemoteTransport> =>
  new Promise<RemoteTransport>((resolve, reject) => {
    let settled = false
    let client: MqttClient | null = null
    let timer: number | null = null
    let helloTimer: number | null = null

    const cleanup = (): void => {
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
      if (helloTimer !== null) {
        window.clearInterval(helloTimer)
        helloTimer = null
      }
      context.signal?.removeEventListener('abort', handleAbort)
    }

    const fail = (error: RemoteTransportError): void => {
      if (settled) return
      settled = true
      cleanup()
      const active = client
      client = null
      if (active) active.end(true)
      reject(error)
    }

    const handleAbort = (): void => fail(new RemoteTransportError('connection-failed', 'aborted'))
    context.signal?.addEventListener('abort', handleAbort, { once: true })

    if (timeoutMs !== null) {
      timer = window.setTimeout(() => fail(new RemoteTransportError('not-found')), timeoutMs)
    }

    const inTopic = topicFor(context.code, role)
    const outTopic = topicFor(context.code, role === 'host' ? 'guest' : 'host')

    void (async () => {
      const connect = await loadMqtt()
      if (settled) return

      const clientId = `cd${role === 'host' ? 'h' : 'g'}-${Math.random().toString(36).slice(2, 12)}`
      const active = await connectToAnyBroker(connect, clientId, context.signal)
      if (settled) {
        active.end(true)
        return
      }
      client = active

      const channel = new MqttRawChannel(active, outTopic)

      const finish = (deliver?: RemoteMessage): void => {
        if (settled) return
        settled = true
        cleanup()
        console.info(`[remote] ${role} @ mqtt-relay 已就绪`)
        if (deliver) channel.push(deliver)
        resolve(createChannelTransport(channel))
      }

      active.on('message', (_topic, payload) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(payload.toString())
        } catch {
          return
        }
        if (!isRemoteMessage(parsed)) return

        if (!settled) {
          // host 等 hello（无需回传给业务层）；guest 等 welcome 并补交给业务层
          if (role === 'host') {
            if (parsed.type === 'hello' && parsed.role === 'guest') finish()
          } else if (parsed.type === 'welcome') {
            finish(parsed)
          }
          return
        }

        channel.push(parsed)
      })

      active.on('close', () => channel.notifyClose())
      active.on('error', (error: Error) => {
        console.warn('[remote] mqtt-relay 连接错误', error.message)
        channel.notifyClose()
      })

      await subscribe(active, inTopic)
      if (settled) return

      if (role === 'host') {
        console.info(`[remote] host @ mqtt-relay 已订阅 ${inTopic}，等待对手`)
        return
      }

      // guest：反复宣告 hello，覆盖房主尚未订阅完成的窗口
      const hello: RemoteMessage = { type: 'hello', protocol: PROTOCOL_VERSION, role: 'guest' }
      const announce = (): void => {
        if (settled) return
        active.publish(outTopic, JSON.stringify(toPlainMessage(hello)), { qos: 0 })
      }
      announce()
      helloTimer = window.setInterval(announce, HELLO_REPEAT_INTERVAL_MS)
    })().catch((error: unknown) => {
      fail(
        error instanceof RemoteTransportError
          ? error
          : new RemoteTransportError('connection-failed', String(error)),
      )
    })
  })

export const mqttRelayProvider: SignalingProvider = {
  name: 'mqtt-relay',
  guestTimeoutMs: GUEST_TIMEOUT_MS,
  isSupported: () => typeof WebSocket !== 'undefined',
  createHost: (context) => joinMqttRelay(context, null, 'host'),
  createGuest: (context, timeoutMs) => joinMqttRelay(context, timeoutMs, 'guest'),
}
