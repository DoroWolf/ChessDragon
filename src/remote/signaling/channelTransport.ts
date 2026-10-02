import { MessageBuffer, isRemoteMessage, toPlainMessage, type RemoteTransport } from '../transport'
import type { RemoteMessage } from '../types'

export interface RawChannel {
  send(data: unknown): void
  onData(handler: (data: unknown) => void): void
  onClose(handler: () => void): void
  close(): void
}

class ChannelTransport implements RemoteTransport {
  readonly kind = 'webrtc' as const

  private readonly buffer = new MessageBuffer()
  private closeHandler: (() => void) | null = null
  private closed = false

  constructor(private readonly channel: RawChannel) {
    channel.onData((data) => {
      if (this.closed || !isRemoteMessage(data)) return
      this.buffer.push(data)
    })
    channel.onClose(() => this.handleClose())
  }

  private handleClose(): void {
    if (this.closed) return
    this.closed = true
    this.buffer.clear()
    this.closeHandler?.()
  }

  send(message: RemoteMessage): void {
    if (this.closed) return
    try {
      this.channel.send(toPlainMessage(message))
    } catch (error) {
      console.error('[remote] 信令通道发送失败', error)
    }
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
    try {
      this.channel.close()
    } catch {
      // 忽略重复关闭
    }
    this.buffer.clear()
    this.closeHandler?.()
  }
}

export const createChannelTransport = (channel: RawChannel): RemoteTransport =>
  new ChannelTransport(channel)
