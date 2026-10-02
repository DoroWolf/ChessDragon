import { roomChannelName } from './roomCode'
import {
  MessageBuffer,
  RemoteTransportError,
  isRemoteMessage,
  toPlainMessage,
  type RemoteTransport,
  type TransportOptions,
} from './transport'
import { PROTOCOL_VERSION, type RemoteMessage } from './types'

export const isBroadcastChannelSupported = (): boolean => typeof BroadcastChannel !== 'undefined'

class BroadcastTransport implements RemoteTransport {
  readonly kind = 'local' as const

  private readonly channel: BroadcastChannel
  private readonly buffer = new MessageBuffer()
  private closeHandler: (() => void) | null = null
  private closed = false

  constructor(channel: BroadcastChannel) {
    this.channel = channel
    this.channel.onmessage = (event: MessageEvent) => {
      if (this.closed || !isRemoteMessage(event.data)) return
      this.buffer.push(event.data)
    }
  }

  /** 把握手时消费掉的那条消息补交给业务层（保持时序） */
  deliver(message: RemoteMessage): void {
    this.buffer.push(message)
  }

  send(message: RemoteMessage): void {
    if (this.closed) return
    this.channel.postMessage(toPlainMessage(message))
  }

  onMessage(handler: (message: RemoteMessage) => void): void {
    this.buffer.setHandler(handler)
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.channel.onmessage = null
    this.channel.close()
    this.buffer.clear()
    this.closeHandler?.()
  }
}

/** 房主侧：在频道上等待加入方的 hello */
export const createBroadcastHostTransport = (options: TransportOptions): Promise<RemoteTransport> =>
  new Promise<RemoteTransport>((resolve, reject) => {
    const channel = new BroadcastChannel(roomChannelName(options.code))
    let settled = false

    const handleAbort = () => {
      if (settled) return
      settled = true
      channel.onmessage = null
      channel.close()
      reject(new RemoteTransportError('connection-failed', 'aborted'))
    }

    options.signal?.addEventListener('abort', handleAbort, { once: true })

    channel.onmessage = (event: MessageEvent) => {
      if (settled || !isRemoteMessage(event.data)) return
      const message = event.data
      // 只认加入方的握手；其它消息（如另一名加入方的 hello）一律忽略
      if (message.type !== 'hello' || message.role !== 'guest') return

      settled = true
      options.signal?.removeEventListener('abort', handleAbort)
      channel.onmessage = null
      resolve(new BroadcastTransport(channel))
    }
  })

/**
 * 加入方侧：广播 hello 并等待房主下发的 welcome。
 * 只认 welcome，避免把同一频道上其它加入方的消息或对局中的广播误判为房主在线。
 * 超时未收到说明同浏览器内不存在该房间，交由上层回退到跨设备链路。
 */
export const createBroadcastGuestTransport = (
  options: TransportOptions,
  timeoutMs: number,
): Promise<RemoteTransport> =>
  new Promise<RemoteTransport>((resolve, reject) => {
    const channel = new BroadcastChannel(roomChannelName(options.code))
    let settled = false

    const clearListeners = () => {
      window.clearTimeout(timer)
      channel.onmessage = null
      options.signal?.removeEventListener('abort', handleAbort)
    }

    const handleAbort = () => {
      if (settled) return
      settled = true
      clearListeners()
      channel.close()
      reject(new RemoteTransportError('connection-failed', 'aborted'))
    }

    options.signal?.addEventListener('abort', handleAbort, { once: true })

    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      clearListeners()
      channel.close()
      reject(new RemoteTransportError('not-found'))
    }, timeoutMs)

    channel.onmessage = (event: MessageEvent) => {
      if (settled || !isRemoteMessage(event.data)) return
      // 只认房主的 welcome；其它加入方的 hello、对局中的广播都不算回应
      if (event.data.type !== 'welcome') return

      settled = true
      clearListeners()
      const transport = new BroadcastTransport(channel)
      transport.deliver(event.data)
      resolve(transport)
    }

    const hello: RemoteMessage = { type: 'hello', protocol: PROTOCOL_VERSION, role: 'guest' }
    channel.postMessage(toPlainMessage(hello))
  })
