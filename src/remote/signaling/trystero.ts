// ============================================================
// 远程对局：Trystero 信令后端（Nostr / MQTT 公共中继）
//   - 无需自建服务，作为 PeerJS 公共云不可用时的后备
//   - 房间码同时用作 roomId 与会话加密口令（Trystero 内置 E2E 加密）
//   - 依赖体积较大，按需动态 import，不进入首屏
// ============================================================
import type { DataPayload, JoinRoom, JoinRoomConfig, MessageAction, Room } from 'trystero'
import { trysteroPassword, trysteroRoomId } from '../roomCode'
import { RemoteTransportError, type RemoteTransport } from '../transport'
import { createChannelTransport, type RawChannel } from './channelTransport'
import { iceServers } from './iceServers'
import type { SignalingContext, SignalingName, SignalingProvider } from './types'

/** Trystero appId：同一应用的所有房间共享此命名空间 */
const APP_ID = 'chessdragon'
/** 数据传输用的 action 名，双方必须一致 */
const ACTION_ID = 'm'

/** 动态加载某个策略包（保持类型安全且不影响首屏体积） */
type TrysteroLoader = () => Promise<{ joinRoom: JoinRoom }>

const roomConfig = (code: string): JoinRoomConfig => ({
  appId: APP_ID,
  password: trysteroPassword(code),
  rtcConfig: { iceServers },
})

/**
 * 加入 Trystero 房间并等待第一个对手接入。
 * timeoutMs 为 null 表示房主侧长等；加入方传超时，超时即 not-found。
 */
const joinTrystero = (
  loader: TrysteroLoader,
  context: SignalingContext,
  timeoutMs: number | null,
): Promise<RemoteTransport> =>
  new Promise<RemoteTransport>((resolve, reject) => {
    let settled = false
    let room: Room | null = null
    let timer: number | null = null

    const cleanup = (): void => {
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
      context.signal?.removeEventListener('abort', handleAbort)
    }

    const fail = (error: RemoteTransportError): void => {
      if (settled) return
      settled = true
      cleanup()
      const active = room
      room = null
      if (active) void active.leave().catch(() => {})
      reject(error)
    }

    const handleAbort = (): void => fail(new RemoteTransportError('connection-failed', 'aborted'))
    context.signal?.addEventListener('abort', handleAbort, { once: true })

    if (timeoutMs !== null) {
      timer = window.setTimeout(() => fail(new RemoteTransportError('not-found')), timeoutMs)
    }

    void loader()
      .then(({ joinRoom }) => {
        if (settled) return
        const active = joinRoom(roomConfig(context.code), trysteroRoomId(context.code))
        room = active
        const action: MessageAction = active.makeAction(ACTION_ID)

        const connectTo = (peerId: string): void => {
          if (settled) return
          settled = true
          cleanup()

          const channel: RawChannel = {
            send: (data) => {
              void action.send(data as DataPayload, { target: peerId }).catch(() => {})
            },
            onData: (handler) => {
              action.onMessage = (data) => handler(data)
            },
            onClose: (handler) => {
              active.onPeerLeave = () => handler()
            },
            close: () => {
              void active.leave().catch(() => {})
            },
          }

          resolve(createChannelTransport(channel))
        }

        active.onPeerJoin = (peerId) => connectTo(peerId)
      })
      .catch((error: unknown) => {
        fail(new RemoteTransportError('connection-failed', String(error)))
      })
  })

const createTrysteroProvider = (
  name: SignalingName,
  loader: TrysteroLoader,
): SignalingProvider => ({
  name,
  isSupported: () => typeof RTCPeerConnection !== 'undefined',
  createHost: (context) => joinTrystero(loader, context, null),
  createGuest: (context, timeoutMs) => joinTrystero(loader, context, timeoutMs),
})

/** 默认策略：Nostr 网络，公共中继冗余度最高 */
export const trysteroNostrProvider = createTrysteroProvider(
  'trystero-nostr',
  () => import('trystero'),
)

/** 次选策略：MQTT 公共中继 */
export const trysteroMqttProvider = createTrysteroProvider(
  'trystero-mqtt',
  () => import('@trystero-p2p/mqtt'),
)
