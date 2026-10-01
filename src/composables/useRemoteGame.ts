// ============================================================
// 远程对局：房间会话（传输层 ⇄ 游戏状态 的桥梁）
//   - 单例：整个应用只有一个对局实例，因此状态放在模块作用域
//   - 负责建房/加入/离开、心跳保活、消息路由
// ============================================================
import { ref, type Ref } from 'vue'
import type { Color } from '../models/chess'
import type { GameSetupConfig } from '../components/GameSetup.vue'
import { RoomCodeTakenError, createRoomHost, joinRoom, type RoomSession } from '../remote/room'
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '../remote/roomCode'
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  RemoteTransportError,
} from '../remote/transport'
import {
  PROTOCOL_VERSION,
  type RemoteConnectionState,
  type RemoteErrorCode,
  type RemoteLinkKind,
  type RemoteMessage,
  type RoomConfigPayload,
} from '../remote/types'

/** useGameState 暴露给远程会话的最小接口，避免两个模块互相 import */
export interface RemoteGameBridge {
  playerColor: Ref<Color>
  setRemoteSender: (sender: ((message: RemoteMessage) => void) | null) => void
  setRemoteLinkKind: (kind: RemoteLinkKind | null) => void
  setRemoteConnected: (connected: boolean) => void
  startRemoteHost: (code: string, config: GameSetupConfig, hostColor: Color) => RoomConfigPayload
  handleRemoteMessage: (message: RemoteMessage) => void
  handleRemoteOpponentLeft: () => void
  resetRemoteSession: () => void
}

/** 建房失败（房间码连续被占用）时的重试次数 */
const MAX_CREATE_ATTEMPTS = 4

// ---- 模块级单例状态 ----
const state = ref<RemoteConnectionState>('idle')
const roomCode = ref<string>('')
const errorCode = ref<RemoteErrorCode | null>(null)
const linkKind = ref<RemoteLinkKind | null>(null)

let bridge: RemoteGameBridge | null = null
let session: RoomSession | null = null
let heartbeatTimer: number | null = null
let lastPongAt = 0
/** 建连进行中的取消句柄（建房等待 / 加入房间） */
let pendingAbort: AbortController | null = null

const send = (message: RemoteMessage): void => {
  session?.transport.send(message)
}

const stopHeartbeat = (): void => {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

const cancelPendingConnect = (): void => {
  pendingAbort?.abort()
  pendingAbort = null
}

const handlePeerGone = (): void => {
  if (state.value !== 'connected') return
  state.value = 'opponent-left'

  stopHeartbeat()
  const active = session
  session = null
  linkKind.value = null
  bridge?.setRemoteSender(null)
  bridge?.setRemoteLinkKind(null)
  bridge?.setRemoteConnected(false)
  bridge?.handleRemoteOpponentLeft()

  if (active) {
    try {
      active.transport.close()
    } catch {
      // 忽略
    }
  }
}

const handleIncoming = (message: RemoteMessage): void => {
  // 心跳与道别属于会话层职责，不打扰业务层
  if (message.type === 'ping') {
    send({ type: 'pong' })
    return
  }
  if (message.type === 'pong') {
    lastPongAt = Date.now()
    return
  }
  if (message.type === 'bye') {
    handlePeerGone()
    return
  }
  bridge?.handleRemoteMessage(message)
}

const startHeartbeat = (): void => {
  stopHeartbeat()
  lastPongAt = Date.now()
  heartbeatTimer = window.setInterval(() => {
    if (!session) return
    send({ type: 'ping' })
    if (Date.now() - lastPongAt > HEARTBEAT_TIMEOUT_MS) {
      handlePeerGone()
    }
  }, HEARTBEAT_INTERVAL_MS)
}

const toErrorCode = (error: unknown): RemoteErrorCode =>
  error instanceof RemoteTransportError ? error.code : 'connection-failed'

/** 链路建立后的公共装配：注册回调 + 心跳 + 标记在线 */
const attachSession = (active: RoomSession): void => {
  session = active
  linkKind.value = active.kind
  bridge?.setRemoteLinkKind(active.kind)
  bridge?.setRemoteSender((message) => session?.transport.send(message))

  active.transport.onMessage(handleIncoming)
  active.transport.onClose(() => handlePeerGone())
  bridge?.setRemoteConnected(true)
  startHeartbeat()
  state.value = 'connected'
}

const teardownSession = (): void => {
  cancelPendingConnect()
  stopHeartbeat()
  bridge?.setRemoteSender(null)
  if (session) {
    try {
      session.transport.close()
    } catch {
      // 忽略
    }
    session = null
  }
  linkKind.value = null
}

const registerGame = (api: RemoteGameBridge): void => {
  bridge = api
}

/** 房主：生成房间码并等待对手加入 */
const createRoom = async (
  config: GameSetupConfig,
  hostColorChoice: 'white' | 'black' | 'random',
): Promise<void> => {
  teardownSession()
  bridge?.resetRemoteSession()

  const hostColor: Color =
    hostColorChoice === 'random' ? (Math.random() > 0.5 ? 'white' : 'black') : hostColorChoice

  errorCode.value = null
  state.value = 'creating'

  pendingAbort = new AbortController()
  const signal = pendingAbort.signal

  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
    const code = generateRoomCode()
    roomCode.value = code
    state.value = 'waiting'

    try {
      const active = await createRoomHost(code, signal)
      if (signal.aborted) {
        active.transport.close()
        return
      }

      pendingAbort = null
      attachSession(active)
      const payload = bridge?.startRemoteHost(code, config, hostColor)
      if (payload) {
        send({ type: 'welcome', protocol: PROTOCOL_VERSION, config: payload })
      }
      return
    } catch (error) {
      // 用户取消：保持取消后的状态，不当作错误上报
      if (signal.aborted) return

      if (error instanceof RoomCodeTakenError) {
        // 房间码被占用（多为旧标签页残留），换一个再试
        continue
      }
      pendingAbort = null
      errorCode.value = toErrorCode(error)
      state.value = 'error'
      return
    }
  }

  pendingAbort = null
  errorCode.value = 'code-taken'
  state.value = 'error'
}

/** 加入方：凭房间码加入房间 */
const joinRoomByCode = async (rawCode: string): Promise<boolean> => {
  const code = normalizeRoomCode(rawCode)
  if (!isValidRoomCode(code)) {
    errorCode.value = 'not-found'
    state.value = 'idle'
    return false
  }

  teardownSession()
  bridge?.resetRemoteSession()

  roomCode.value = code
  errorCode.value = null
  state.value = 'connecting'

  pendingAbort = new AbortController()
  const signal = pendingAbort.signal

  try {
    const active = await joinRoom(code, signal)
    if (signal.aborted) {
      active.transport.close()
      return false
    }
    pendingAbort = null
    attachSession(active)
    return true
  } catch (error) {
    if (signal.aborted) return false
    pendingAbort = null
    errorCode.value = toErrorCode(error)
    state.value = 'error'
    return false
  }
}

/** 主动离开房间（返回首页 / 放弃等待） */
const leaveRoom = (): void => {
  if (session) {
    try {
      session.transport.send({ type: 'bye', reason: 'leaving' })
    } catch {
      // 忽略
    }
  }
  teardownSession()
  bridge?.resetRemoteSession()
  roomCode.value = ''
  errorCode.value = null
  state.value = 'closed'
}

/** 建房等待期间取消 */
const cancelWaiting = (): void => {
  leaveRoom()
  state.value = 'idle'
}

const resetError = (): void => {
  errorCode.value = null
}

export function useRemoteGame() {
  return {
    // 状态
    state,
    roomCode,
    errorCode,
    linkKind,
    // 动作
    registerGame,
    createRoom,
    joinRoomByCode,
    leaveRoom,
    cancelWaiting,
    resetError,
  }
}

