// ============================================================
// 远程对局：原始通道 → RemoteTransport 通用适配
//   - PeerJS DataConnection / Trystero action 等只需实现 RawChannel
//   - 复用 transport.ts 的 MessageBuffer，保证回调注册前的消息不丢失
// ============================================================
import { MessageBuffer, isRemoteMessage, toPlainMessage, type RemoteTransport } from '../transport'
import type { RemoteMessage } from '../types'

/** 各信令后端需要提供的最小数据通道能力 */
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

/** 用原始通道包出一个符合业务层预期的传输层 */
export const createChannelTransport = (channel: RawChannel): RemoteTransport =>
  new ChannelTransport(channel)
