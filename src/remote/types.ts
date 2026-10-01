// ============================================================
// 远程对局：消息协议与公共类型
//   - 传输层（BroadcastChannel / 各信令后端）与业务层都只依赖本文件
//   - 所有消息必须保持「纯 JSON 可序列化」，以便在两种传输间复用
// ============================================================
import type { Board, Color, PieceType } from '../models/chess'

/** 远程对局中的角色 */
export type RemoteRole = 'host' | 'guest'

/** 底层链路类型：local = 同浏览器 BroadcastChannel，webrtc = 跨设备（P2P 或中继） */
export type RemoteLinkKind = 'local' | 'webrtc'

/** 房间与连接状态机 */
export type RemoteConnectionState =
  | 'idle' // 未开始
  | 'creating' // 房主正在创建房间
  | 'waiting' // 房间已创建，等待对手加入
  | 'connecting' // 加入方正在连接
  | 'connected' // 双方已连接
  | 'opponent-left' // 对手已离开
  | 'closed' // 已关闭（主动离开）
  | 'error' // 建立连接失败

/** 建连失败原因，供 UI 映射到多语言文案 */
export type RemoteErrorCode = 'not-found' | 'code-taken' | 'connection-failed' | 'protocol-mismatch'

/** 棋盘坐标（row 0 = 第 8 横线） */
export interface RemoteSquare {
  row: number
  col: number
}

/**
 * 棋钟快照 —— 由房主权威产出。
 * 客方仅按快照渲染，超时判定也只认房主的结论。
 */
export interface ClockSnapshot {
  whiteTimeSeconds: number | null
  blackTimeSeconds: number | null
  activeColor: Color | null
  hasGameStarted: boolean
  clockStarted: boolean
  timeoutWinner: Color | null
  /** 房主本地时间戳（Date.now()），便于排查延迟 */
  at: number
}

/** 房主建房时下发到客方的完整对局配置 */
export interface RoomConfigPayload {
  roomCode: string
  boardMode: 'standard' | 'chess960' | 'custom'
  fen: string
  isChess960: boolean
  timeMinutes: number
  incrementSeconds: number
  /** 房主执棋方（随机已在建房时解析为具体颜色） */
  hostColor: Color
  /** 起始走棋方（自定义 FEN 时取 FEN 中的走棋方，否则白方） */
  startingTurn: Color
  startingFullmoveNumber: number
  halfmoveClock: number
}

/** 协议版本：握手时比对，避免新旧版本互连 */
export const PROTOCOL_VERSION = 2

/** 对局内同步的一份完整状态快照（用于异常时的全量重同步） */
export interface RemoteStateSnapshot {
  board: Board
  currentTurn: Color
  lastMove: { from: RemoteSquare; to: RemoteSquare } | null
  halfmoveClock: number
  moveHistory: string[]
  startingTurn: Color
  clock: ClockSnapshot
}

export type RemoteMessage =
  /** 加入方向房主握手 */
  | { type: 'hello'; protocol: number; role: RemoteRole }
  /** 房主确认并下发配置 */
  | { type: 'welcome'; protocol: number; config: RoomConfigPayload }
  /** 客方确认收到配置，双方可以开始 */
  | { type: 'ready' }
  /** 走子（走子方广播，双方各自本地应用） */
  | {
      type: 'move'
      ply: number
      from: RemoteSquare
      to: RemoteSquare
      promotion?: PieceType
      /** 走子后本地算出的局面指纹，用于校验双方是否同步 */
      positionKey: string
      clock: ClockSnapshot
    }
  /** 房主权威棋钟同步 */
  | { type: 'clock'; clock: ClockSnapshot }
  /** 一方请求悔棋 */
  | { type: 'undo-request' }
  /** 对悔棋请求的答复（仅表态，实际回退由发起方 commit） */
  | { type: 'undo-response'; accepted: boolean }
  /** 提议和棋 */
  | { type: 'draw-offer' }
  /** 对和棋的答复（仅表态，实际判和由发起方 commit） */
  | { type: 'draw-response'; accepted: boolean }
  /** 认输 */
  | { type: 'resign'; color: Color }
  /** 请求重赛 */
  | { type: 'rematch-request' }
  /** 对重赛的答复（仅表态，实际重开由发起方 commit） */
  | { type: 'rematch-response'; accepted: boolean }
  /**
   * 发起方确认执行：收到同意答复后由发起方广播，双方同时落地。
   * 这样「走子撤回请求」不会导致一方已执行、另一方未执行的不同步。
   */
  | { type: 'commit'; kind: 'undo' | 'draw' | 'rematch' }
  /** 发起方撤回尚未被回应的请求，对方据此收起提示 */
  | { type: 'cancel-request' }
  /** 全量状态重同步（检测到不同步时由房主下发） */
  | { type: 'state'; snapshot: RemoteStateSnapshot }
  /** 心跳 */
  | { type: 'ping' }
  | { type: 'pong' }
  /** 浏览器页面可见状态，避免后台分页的计时器节流触发假离线 */
  | { type: 'visibility'; hidden: boolean }
  /** 主动道别 / 房间已满 */
  | { type: 'bye'; reason?: 'room-full' | 'leaving' }

export type RemoteMessageType = RemoteMessage['type']
