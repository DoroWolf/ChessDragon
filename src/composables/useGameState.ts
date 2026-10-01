import { ref, computed, onUnmounted, watch, type CSSProperties, nextTick } from 'vue'
import type { Board, Color, Piece, PieceType, Move } from '../models/chess'
import {
  createInitialBoard,
  getEnPassantTarget,
  getLegalMoves,
  cloneBoard,
  isKingInCheck,
  isCheckmate,
  isStalemate,
  hasInsufficientMaterial,
  getPositionKey,
  generateMoveNotation,
} from '../models/chess'
import type { GameSetupConfig, AIStyle } from '../components/GameSetup.vue'
import { parseFen } from '../models/fen'
import { getPromotionChoice, type AIDifficulty } from '../models/ai'
import type { AIDetailedMove } from '../models/ai'
import type {
  ClockSnapshot,
  RemoteLinkKind,
  RemoteMessage,
  RemoteRole,
  RemoteStateSnapshot,
  RoomConfigPayload,
} from '../remote/types'
import { PROTOCOL_VERSION } from '../remote/types'
import AIWorker from '../workers/ai-worker?worker'
import { useI18n } from './useI18n'
import {
  soundMove,
  soundCapture,
  soundCheck,
  soundVictory,
  soundDefeat,
  soundDraw,
  soundLowTime,
} from '../assets/resourcePaths'

// ============================================================
// 音频资源（模块级，避免重复创建 Audio 对象）
// ============================================================
const sounds = {
  move: new Audio(soundMove),
  capture: new Audio(soundCapture),
  check: new Audio(soundCheck),
  victory: new Audio(soundVictory),
  defeat: new Audio(soundDefeat),
  draw: new Audio(soundDraw),
  lowTime: new Audio(soundLowTime),
}

const INITIAL_CLOCK_SECONDS: number | null = null

/** 房主向客方广播权威棋钟的间隔（毫秒） */
const REMOTE_CLOCK_BROADCAST_MS = 250

/** 可发起请求的对局行为 */
type RemoteRequestKind = 'undo' | 'draw' | 'rematch'

/** 请求被拒绝后的冷却时长（毫秒）：冷却期内只在本机显示「已发送」，不打扰对手 */
const REQUEST_COOLDOWN_MS = 60_000

// 对局结束原因（与文案解耦，供本地化与台词选择使用）
export type GameEndReason = 'resign' | 'timeout' | 'checkmate' | 'draw'

// ============================================================
// 游戏状态 Composable
// ============================================================
export function useGameState(
  isSoundEnabled: import('vue').Ref<boolean>,
  isFlipped: import('vue').Ref<boolean>,
) {
  const { t } = useI18n()

  // ---- 初始设置 ----
  const showSetup = ref(true)
  const playerColor = ref<Color>('white')
  const isClockEnabled = ref(true)
  const lastSetupConfig = ref<GameSetupConfig | null>(null)
  const isChess960 = computed(() => lastSetupConfig.value?.boardMode === 'chess960')

  // ---- 核心游戏状态 ----
  const board = ref<Board>(createInitialBoard())
  const currentTurn = ref<Color>('white')
  const selectedSquare = ref<{ row: number; col: number } | null>(null)
  const hoverSquare = ref<{ row: number; col: number } | null>(null)
  const lastMove = ref<{ from: { row: number; col: number }; to: { row: number; col: number } } | null>(null)
  const positionHistory = ref<string[]>([getPositionKey(board.value, currentTurn.value, lastMove.value)])
  const halfmoveClock = ref<number>(0)
  const startingTurn = ref<Color>('white')
  const startingFullmoveNumber = ref(1)

  // ---- 对局历史（用于悔棋） ----
  const moveHistory = ref<string[]>([])
  /**
   * 本局各方是否已经走出过至少一步（按颜色记录，只增不减）。
   * 与会被悔棋清空的 moveHistory 不同：悔棋一路撤到初始局面后仍保持 true，
   * 供 UI 区分「尚未开局」与「已开局但撤回了全部走子」。
   */
  const hasMovedByColor = ref<Record<Color, boolean>>({ white: false, black: false })
  const boardHistory = ref<
    Array<{
      board: Board
      currentTurn: Color
      lastMove: { from: { row: number; col: number }; to: { row: number; col: number } } | null
      halfmoveClock: number
      whiteTimeSeconds: number | null
      blackTimeSeconds: number | null
      hasGameStarted: boolean
      clockStarted: boolean
      activeClockColor: Color | null
      timeoutWinner: Color | null
    }>
  >([])

  // ---- 棋钟状态 ----
  const hasGameStarted = ref(false)
  const clockStarted = ref(false)
  const activeClockColor = ref<Color | null>(null)
  const timeoutWinner = ref<Color | null>(null)
  const whiteTimeSeconds = ref<number | null>(INITIAL_CLOCK_SECONDS)
  const blackTimeSeconds = ref<number | null>(INITIAL_CLOCK_SECONDS)
  const clockIncrementSeconds = ref(0)
  let clockTimer: number | null = null
  let lowTimePlayedWhite = false
  let lowTimePlayedBlack = false

  // ---- 游戏终止标记 ----
  const isAgreedDraw = ref(false)
  const hasResigned = ref<Color | null>(null)

  // ---- 升变状态 ----
  const promotionPending = ref<null | {
    from: { row: number; col: number }
    to: { row: number; col: number }
    color: Color
  }>(null)
  const promotionStyle = ref<CSSProperties>({})

  // ---- 拖拽状态 ----
  const isMouseDown = ref(false)
  const isDragging = ref(false)
  const dragStartSquare = ref<{ row: number; col: number } | null>(null)
  const dragStartPos = ref({ x: 0, y: 0 })
  const mousePos = ref({ x: 0, y: 0 })
  let wasAlreadySelected = false
  let touchStartSquare: { row: number; col: number } | null = null

  // ---- AI 对局状态 ----
  const gameMode = ref<'ai' | 'human' | 'remote'>('human')
  const aiDifficulty = ref<AIDifficulty>(3)
  const aiStyle = ref<AIStyle>('balanced')
  const isAIThinking = ref(false)
  let aiMoveTimer: number | null = null
  let aiWorker: Worker | null = null

  // ---- 远程对局状态 ----
  const roomCode = ref<string>('')
  const remoteRole = ref<RemoteRole | null>(null)
  const remoteLinkKind = ref<RemoteLinkKind | null>(null)
  /** 对手是否在线（心跳与链路事件共同维护） */
  const remoteConnected = ref(false)
  /** 房主执棋方，重赛交换颜色时以它为准，保证双方推导一致 */
  const remoteHostColor = ref<Color>('white')
  /** 对方发起的悔棋请求，等待我方回应 */
  const pendingUndoRequest = ref(false)
  /** 对方发起的和棋提议，等待我方回应 */
  const pendingDrawOffer = ref(false)
  /** 对方发起的重赛请求，等待我方回应 */
  const pendingRematchRequest = ref(false)
  /** 我方已发出的请求，等待对方回应 */
  const outgoingRequest = ref<'undo' | 'draw' | 'rematch' | null>(null)

  /** 各行为的冷却截止时间戳（毫秒），被拒绝后 60 秒内不再真正打扰对手 */
  const requestCooldownUntil = ref<Record<RemoteRequestKind, number>>({
    undo: 0,
    draw: 0,
    rematch: 0,
  })
  /** 当前未决请求是否真的发给了对方（冷却期内的「已发送」是纯本机提示） */
  let outgoingRequestWasSent = false
  /** 冷却期内伪造的「已发送」提示到期后自动收起 */
  let localOnlyRequestTimer: number | null = null

  const isRemote = computed(() => gameMode.value === 'remote')
  const isRemoteHost = computed(() => isRemote.value && remoteRole.value === 'host')
  const isRemoteGuest = computed(() => isRemote.value && remoteRole.value === 'guest')

  // 远程发送通道由 useRemoteGame 注入，避免与传输层产生循环依赖
  let remoteSender: ((message: RemoteMessage) => void) | null = null
  let remoteClockBroadcastTimer: number | null = null

  const setRemoteSender = (sender: ((message: RemoteMessage) => void) | null): void => {
    remoteSender = sender
  }

  const sendRemote = (message: RemoteMessage): void => {
    remoteSender?.(message)
  }

  const buildClockSnapshot = (): ClockSnapshot => ({
    whiteTimeSeconds: whiteTimeSeconds.value,
    blackTimeSeconds: blackTimeSeconds.value,
    activeColor: activeClockColor.value,
    hasGameStarted: hasGameStarted.value,
    clockStarted: clockStarted.value,
    timeoutWinner: timeoutWinner.value,
    at: Date.now(),
  })


  // ---- Premove 状态 ----
  const premove = ref<{ from: { row: number; col: number }; to: { row: number; col: number } } | null>(null)

  // ============================================================
  // 辅助函数
  // ============================================================
  const getStarterColor = (starter: GameSetupConfig['starter']): Color => {
    if (starter === 'black') return 'black'
    if (starter === 'white') return 'white'
    return Math.random() > 0.5 ? 'white' : 'black'
  }

  const parseFenToBoard = (fen: string) => parseFen(fen)

  // ============================================================
  // 音效
  // ============================================================
  const playSound = (soundName: keyof typeof sounds) => {
    if (!isSoundEnabled.value) return
    const audio = sounds[soundName]
    if (audio) {
      audio.currentTime = 0
      audio.play().catch(() => {})
    }
  }

  const triggerGameStateAudio = (isCapture: boolean, nextTurn: Color, nextBoard: Board) => {
    if (isCheckmate(nextBoard, nextTurn)) {
      playSound(nextTurn === playerColor.value ? 'defeat' : 'victory')
      return
    }

    const checkDraw =
      isStalemate(nextBoard, nextTurn, {
        lastMove: lastMove.value,
        enPassantTarget: getEnPassantTarget(lastMove.value),
      }) ||
      hasInsufficientMaterial(nextBoard) ||
      halfmoveClock.value >= 150 ||
      positionHistory.value.filter(
        (key) => key === getPositionKey(nextBoard, nextTurn, lastMove.value),
      ).length >= 5

    if (checkDraw) {
      playSound('draw')
      return
    }

    if (isKingInCheck(nextBoard, nextTurn)) {
      playSound('check')
      return
    }

    playSound(isCapture ? 'capture' : 'move')
  }

  // ============================================================
  // 棋钟逻辑
  // ============================================================
  const canColorCheckmate = (boardVal: Board, attackerColor: Color): boolean => {
    const attackerPieces: Piece[] = []
    const victimPieces: Piece[] = []

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = boardVal[r]?.[c]
        if (piece && piece.type !== 'king') {
          if (piece.color === attackerColor) {
            attackerPieces.push(piece)
          } else {
            victimPieces.push(piece)
          }
        }
      }
    }

    if (attackerPieces.length === 0) return false

    if (
      attackerPieces.some((p) => p.type === 'pawn' || p.type === 'rook' || p.type === 'queen') ||
      attackerPieces.length >= 2
    ) {
      return true
    }

    if (attackerPieces.length === 1) {
      return victimPieces.length > 0
    }

    return false
  }

  const stopClock = () => {
    if (clockTimer !== null) {
      window.clearInterval(clockTimer)
      clockTimer = null
    }
    stopRemoteClockBroadcast()
    clockStarted.value = false
    activeClockColor.value = null
  }

  /** 房主：立即广播一次权威棋钟 */
  const broadcastRemoteClock = () => {
    if (!isRemoteHost.value || remoteSender === null) return
    sendRemote({ type: 'clock', clock: buildClockSnapshot() })
  }

  const stopRemoteClockBroadcast = () => {
    if (remoteClockBroadcastTimer !== null) {
      window.clearInterval(remoteClockBroadcastTimer)
      remoteClockBroadcastTimer = null
    }
  }

  const startRemoteClockBroadcast = () => {
    if (!isRemoteHost.value) return
    if (remoteClockBroadcastTimer !== null) return
    remoteClockBroadcastTimer = window.setInterval(broadcastRemoteClock, REMOTE_CLOCK_BROADCAST_MS)
  }

  const cancelAIMove = () => {
    if (aiMoveTimer !== null) {
      window.clearTimeout(aiMoveTimer)
      aiMoveTimer = null
    }
    if (aiWorker !== null) {
      aiWorker.terminate()
      aiWorker = null
    }
    isAIThinking.value = false
  }

  const handleClockTimeout = (expiredColor: Color) => {
    // 客方不自行判定超时，一切以房主广播的快照为准
    if (isRemoteGuest.value) {
      stopClock()
      return
    }

    if (isGameOver.value) {
      stopClock()
      return
    }

    const opponentColor = expiredColor === 'white' ? 'black' : 'white'
    const opponentCanMate = canColorCheckmate(board.value, opponentColor)

    if (opponentCanMate) {
      timeoutWinner.value = opponentColor
      playSound(opponentColor === playerColor.value ? 'victory' : 'defeat')
    } else {
      isAgreedDraw.value = true
      playSound('draw')
    }

    stopClock()
    broadcastRemoteClock()
  }

  const startClock = (color: Color) => {
    if (whiteTimeSeconds.value === null || whiteTimeSeconds.value === 0 || isGameOver.value) {
      stopClock()
      return
    }

    stopClock()
    clockStarted.value = true
    activeClockColor.value = color
    startRemoteClockBroadcast()

    clockTimer = window.setInterval(() => {
      if (!clockStarted.value || !activeClockColor.value || isGameOver.value) {
        stopClock()
        return
      }

      if (activeClockColor.value === 'white') {
        if (whiteTimeSeconds.value !== null) {
          whiteTimeSeconds.value = Math.max(0, +(whiteTimeSeconds.value - 0.1).toFixed(1))
          if (whiteTimeSeconds.value <= 10 && whiteTimeSeconds.value > 0 && !lowTimePlayedWhite) {
            lowTimePlayedWhite = true
            playSound('lowTime')
          }
          if (whiteTimeSeconds.value === 0) {
            handleClockTimeout('white')
          }
        }
      } else {
        if (blackTimeSeconds.value !== null) {
          blackTimeSeconds.value = Math.max(0, +(blackTimeSeconds.value - 0.1).toFixed(1))
          if (blackTimeSeconds.value <= 10 && blackTimeSeconds.value > 0 && !lowTimePlayedBlack) {
            lowTimePlayedBlack = true
            playSound('lowTime')
          }
          if (blackTimeSeconds.value === 0) {
            handleClockTimeout('black')
          }
        }
      }
    }, 100)
  }

  const applyClockAfterMove = (moverColor: Color, nextTurn: Color, nextBoard: Board) => {
    const terminalPosition =
      isCheckmate(nextBoard, nextTurn) ||
      isStalemate(nextBoard, nextTurn, {
        lastMove: lastMove.value,
        enPassantTarget: getEnPassantTarget(lastMove.value),
      }) ||
      hasInsufficientMaterial(nextBoard) ||
      positionHistory.value.filter(
        (key) => key === getPositionKey(nextBoard, nextTurn, lastMove.value),
      ).length >= 5

    // 「一个回合」（黑白各走一步）之后提和 / 认输即可用。
    // 这里必须与棋钟是否启用解耦，否则无限制对局下按钮会永久禁用。
    const isRoundComplete = moveHistory.value.length >= 2
    const wasStarted = hasGameStarted.value
    if (!terminalPosition && !wasStarted && isRoundComplete) {
      hasGameStarted.value = true
    }

    if (terminalPosition || whiteTimeSeconds.value === 0) {
      stopClock()
      return
    }

    if (wasStarted) {
      if (moverColor === 'white') {
        if (whiteTimeSeconds.value !== null) {
          whiteTimeSeconds.value += clockIncrementSeconds.value
        }
      } else {
        if (blackTimeSeconds.value !== null) {
          blackTimeSeconds.value += clockIncrementSeconds.value
        }
      }
      startClock(nextTurn)
    } else if (isRoundComplete) {
      startClock(nextTurn)
    }
  }

  // ============================================================
  // 终止状态计算（computed）
  // ============================================================
  const isDrawByStalemate = computed(() =>
    isStalemate(board.value, currentTurn.value, {
      lastMove: lastMove.value,
      enPassantTarget: getEnPassantTarget(lastMove.value),
    }),
  )

  const isDrawByInsufficientMaterial = computed(() => hasInsufficientMaterial(board.value))

  const isDrawByFivefoldRepetition = computed(() => {
    const currentKey = getPositionKey(board.value, currentTurn.value, lastMove.value)
    return positionHistory.value.filter((key) => key === currentKey).length >= 5
  })

  const isDrawBy75MoveRule = computed(() => halfmoveClock.value >= 150)

  const isDraw = computed(
    () =>
      isAgreedDraw.value ||
      isDrawByStalemate.value ||
      isDrawByInsufficientMaterial.value ||
      isDrawByFivefoldRepetition.value ||
      isDrawBy75MoveRule.value,
  )

  // 对局结束原因与胜方（语义化，不随语言变化）
  const gameEndReason = computed<GameEndReason | null>(() => {
    if (hasResigned.value) return 'resign'
    if (timeoutWinner.value) return 'timeout'
    if (isCheckmate(board.value, currentTurn.value)) return 'checkmate'
    if (isDraw.value) return 'draw'
    return null
  })

  const gameWinner = computed<Color | null>(() => {
    if (hasResigned.value) return hasResigned.value === 'white' ? 'black' : 'white'
    if (timeoutWinner.value) return timeoutWinner.value
    if (isCheckmate(board.value, currentTurn.value)) {
      return currentTurn.value === 'white' ? 'black' : 'white'
    }
    return null
  })

  const gameResult = computed(() => {
    if (gameWinner.value === 'white') return '1-0'
    if (gameWinner.value === 'black') return '0-1'
    if (gameEndReason.value === 'draw') return '1/2-1/2'
    return ''
  })

  const gameStatusMessage = computed(() => {
    const sideName = (color: Color) =>
      t(color === 'white' ? 'status.sideWhite' : 'status.sideBlack')

    if (hasResigned.value) {
      const winner: Color = hasResigned.value === 'white' ? 'black' : 'white'
      return t('status.winByResign', { side: sideName(winner) })
    }
    if (timeoutWinner.value) {
      return t('status.winByTimeout', { side: sideName(timeoutWinner.value) })
    }
    if (isCheckmate(board.value, currentTurn.value)) {
      const winner: Color = currentTurn.value === 'white' ? 'black' : 'white'
      return t('status.winByCheckmate', { side: sideName(winner) })
    }
    if (isDraw.value) {
      return t('status.draw')
    }
    return undefined
  })

  const isGameOver = computed(
    () =>
      !!hasResigned.value ||
      !!timeoutWinner.value ||
      isDraw.value ||
      isCheckmate(board.value, currentTurn.value),
  )

  // 交互控制：setup 未结束 或 游戏结束 或 AI 正在思考 或 当前回合轮到 AI
  // 远程模式下还要求「轮到我方」且对手在线
  const isAITurn = computed(() => {
    if (gameMode.value !== 'ai') return false
    const aiColor = playerColor.value === 'white' ? 'black' : 'white'
    return currentTurn.value === aiColor
  })

  /** 远程模式下是否轮到我方走子 */
  const isRemoteMyTurn = computed(
    () => isRemote.value && currentTurn.value === playerColor.value,
  )

  const canInteract = computed(
    () =>
      !showSetup.value &&
      !isGameOver.value &&
      !isAIThinking.value &&
      !isAITurn.value &&
      (!isRemote.value || (isRemoteMyTurn.value && remoteConnected.value)),
  )

  // premove 允许在 AI 回合时点击己方棋子并预设走法
  const canPremove = computed(
    () =>
      !showSetup.value &&
      !isGameOver.value &&
      isAITurn.value &&
      gameMode.value === 'ai',
  )

  // ============================================================
  // 走棋逻辑
  // ============================================================
  const possibleMoves = computed<Move[]>(() => {
    if (!selectedSquare.value) return []
    if (!canInteract.value && !canPremove.value) return []
    
    const { row, col } = selectedSquare.value
    const piece = board.value[row]?.[col]
    if (!piece) return []

    // 在 premove 模式下，必须确保选中的是玩家自己的棋子
    if (canPremove.value && piece.color !== playerColor.value) return []

    const enPassantTarget = getEnPassantTarget(lastMove.value)
    return getLegalMoves(board.value, row, col, { lastMove: lastMove.value, enPassantTarget })
  })

  const highlightedPositions = computed(() =>
    new Set(possibleMoves.value.map((move) => `${move.row}-${move.col}`)),
  )

  const isCastlingRookTarget = (
    move: Move,
    row: number,
    col: number,
    kingSquare: { row: number; col: number },
  ): boolean =>
    move.special === 'castle' &&
    move.rookFrom?.row === row &&
    move.rookFrom.col === col &&
    (isChess960.value || Math.abs(move.rookFrom.col - kingSquare.col) <= 2)

  const findMoveForTarget = (row: number, col: number): Move | undefined =>
    possibleMoves.value.find(
      (move) =>
        (move.row === row && move.col === col) ||
        (selectedSquare.value !== null &&
          isCastlingRookTarget(move, row, col, selectedSquare.value)),
    )

  const canMoveTo = (row: number, col: number): boolean =>
    highlightedPositions.value.has(`${row}-${col}`) || !!findMoveForTarget(row, col)

  const canPremoveTo = (row: number, col: number): boolean =>
    highlightedPositions.value.has(`${row}-${col}`) || !!findMoveForTarget(row, col)

  const isSelectedSquare = (row: number, col: number): boolean =>
    selectedSquare.value?.row === row && selectedSquare.value?.col === col

  const pushBoardHistory = (mover: Color) => {
    // 记录一次走子即视为「该方已走出过半回合」，此后即便悔棋到底也不再视为未开局
    hasMovedByColor.value[mover] = true
    boardHistory.value.push({
      board: cloneBoard(board.value),
      currentTurn: currentTurn.value,
      lastMove: lastMove.value,
      halfmoveClock: halfmoveClock.value,
      whiteTimeSeconds: whiteTimeSeconds.value,
      blackTimeSeconds: blackTimeSeconds.value,
      hasGameStarted: hasGameStarted.value,
      clockStarted: clockStarted.value,
      activeClockColor: activeClockColor.value,
      timeoutWinner: timeoutWinner.value,
    })
  }

  /** 本地走子后广播给对手（远程对局） */
  const broadcastLocalMove = (from: { row: number; col: number }, to: { row: number; col: number }, promotion?: PieceType) => {
    if (!isRemote.value || remoteSender === null) return
    sendRemote({
      type: 'move',
      ply: moveHistory.value.length,
      from: { row: from.row, col: from.col },
      to: { row: to.row, col: to.col },
      ...(promotion ? { promotion } : {}),
      positionKey: getPositionKey(board.value, currentTurn.value, lastMove.value),
      clock: buildClockSnapshot(),
    })
  }

  const executeMove = (
    nextBoard: Board,
    move: Move,
    from: { row: number; col: number },
    isPawnMove: boolean,
    isCapture: boolean,
    origin: 'local' | 'remote' = 'local',
  ) => {

    const sourceRow = nextBoard[from.row]!
    const targetRow = nextBoard[move.row]!
    const selectedPiece = board.value[from.row]?.[from.col]!

    // ---- 执行移动 ----
    if (move.special === 'castle' && move.rookFrom && move.rookTo) {
      const rook = nextBoard[move.rookFrom.row]?.[move.rookFrom.col] ?? null
      sourceRow[from.col] = null
      nextBoard[move.rookFrom.row]![move.rookFrom.col] = null
      targetRow[move.col] = { ...selectedPiece, hasMoved: true }
      if (rook) {
        nextBoard[move.rookTo.row]![move.rookTo.col] = { ...rook, hasMoved: true }
      }
    } else if (move.special === 'enPassant') {
      targetRow[move.col] = { ...selectedPiece, hasMoved: true }
      sourceRow[from.col] = null
      nextBoard[from.row]![move.col] = null
    } else {
      targetRow[move.col] = { ...selectedPiece, hasMoved: true }
      sourceRow[from.col] = null
    }

    // ---- 将/将死检测 ----
    const nextTurn = currentTurn.value === 'white' ? 'black' : 'white'
    let checkStatus: 'check' | 'checkmate' | undefined = undefined
    if (isCheckmate(nextBoard, nextTurn)) {
      checkStatus = 'checkmate'
    } else if (isKingInCheck(nextBoard, nextTurn)) {
      checkStatus = 'check'
    }

    // ---- 记录棋谱 ----
    const notation = generateMoveNotation(
      board.value,
      from.row,
      from.col,
      move.row,
      move.col,
      move.special,
      undefined,
      checkStatus,
    )
    moveHistory.value.push(notation)
    pushBoardHistory(selectedPiece.color)

    // ---- 更新状态 ----
    board.value = nextBoard
    lastMove.value = { from: { row: from.row, col: from.col }, to: { row: move.row, col: move.col } }
    if (isPawnMove || isCapture) {
      halfmoveClock.value = 0
    } else {
      halfmoveClock.value += 1
    }
    positionHistory.value.push(getPositionKey(nextBoard, nextTurn, lastMove.value))
    selectedSquare.value = null
    currentTurn.value = nextTurn

    // ---- 时钟与音效 ----
    applyClockAfterMove(selectedPiece.color, nextTurn, nextBoard)
    triggerGameStateAudio(isCapture, nextTurn, nextBoard)

    // ---- 远程对局：走子即视为拒绝对方请求，并把本地走子同步给对手 ----
    if (origin === 'local') {
      clearPendingRequestsOnMove()
      broadcastLocalMove({ row: from.row, col: from.col }, { row: move.row, col: move.col })
    }

    // ---- 触发 AI（如果当前轮次是 AI 的回合） ----
    void nextTick(() => {
      checkAndTriggerAI()
    })
  }

  // ---- Premove 状态验证 ----
  // AI 走棋后调用：检查玩家正在进行的选中/拖拽/预设走法是否仍然有效
  const validatePremoveState = () => {
    // 1. 检查拖拽状态：如果正在拖拽的棋子已被吃或位置被占据，取消拖拽
    if (isDragging.value && dragStartSquare.value) {
      const dragPiece = board.value[dragStartSquare.value.row]?.[dragStartSquare.value.col]
      if (!dragPiece || dragPiece.color !== playerColor.value) {
        // 清除拖拽状态
        isMouseDown.value = false
        isDragging.value = false
        dragStartSquare.value = null
        selectedSquare.value = null
        premove.value = null
        // 移除可能残留的事件监听器
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }

    // 2. 检查已选中但尚未设定目标格的棋子是否仍然存在
    if (!premove.value && selectedSquare.value) {
      const sel = selectedSquare.value
      const selPiece = board.value[sel.row]?.[sel.col]
      if (!selPiece || selPiece.color !== playerColor.value) {
        // 棋子被吃或位置被占，取消选中
        selectedSquare.value = null
      }
      // 如果棋子仍然存在，保留选中状态（继续等待玩家选择目标格）
    }
  }

  // ---- Premove 执行逻辑 ----
  // 在 AI 走棋后，尝试执行预设的 premove
  const tryExecutePremove = () => {
    // 先验证当前 premove 状态（处理选中/拖拽被吃等情形）
    validatePremoveState()

    if (!premove.value) return

    const { from, to } = premove.value
    const piece = board.value[from.row]?.[from.col]

    // 检查 premove 是否仍然合法
    if (!piece || piece.color !== playerColor.value) {
      premove.value = null
      selectedSquare.value = null
      return
    }

    const enPassantTarget = getEnPassantTarget(lastMove.value)
    const legalMoves = getLegalMoves(board.value, from.row, from.col, {
      lastMove: lastMove.value,
      enPassantTarget,
    })

    const matchingMove = legalMoves.find(
      (move) =>
        (move.row === to.row && move.col === to.col) ||
        isCastlingRookTarget(move, to.row, to.col, from),
    )

    if (!matchingMove) {
      // premove 不再合法，清除
      premove.value = null
      selectedSquare.value = null
      return
    }

    // 执行 premove
    const targetPiece = board.value[to.row]?.[to.col] ?? null
    const isPawnMove = piece.type === 'pawn'
    const isCapture =
      matchingMove.special !== 'castle' &&
      (targetPiece !== null || matchingMove.special === 'enPassant')

    // 兵升变：premove 不支持自动升变（需要玩家选择），清除 premove
    if (isPawnMove && (to.row === 0 || to.row === 7)) {
      premove.value = null
      selectedSquare.value = { row: from.row, col: from.col }
      return
    }

    premove.value = null

    const nextBoard = cloneBoard(board.value)
    executeMove(nextBoard, matchingMove, { row: from.row, col: from.col }, isPawnMove, isCapture)
  }

  const handleSquareClick = (row: number, col: number): void => { 
    // ---- Premove 模式：在 AI 回合时预设走法 ----
    if (canPremove.value) {
      const targetPiece = board.value[row]?.[col] ?? null
      const selected = selectedSquare.value
      const selectedPiece = selected ? board.value[selected.row]?.[selected.col] ?? null : null

      if (selected && selectedPiece && canPremoveTo(row, col)) {
        // 设置 premove
        premove.value = {
          from: { row: selected.row, col: selected.col },
          to: { row, col },
        }
        selectedSquare.value = null
        return
      }

      // 选中己方棋子用于 premove
      if (targetPiece && targetPiece.color === playerColor.value) {
        selectedSquare.value = { row, col }
        premove.value = null
      } else {
        selectedSquare.value = null
        premove.value = null
      }
      return
    }

    // ---- 正常模式 ----
    if (!canInteract.value) return

    const targetPiece = board.value[row]?.[col] ?? null
    const selected = selectedSquare.value
    const selectedPiece = selected ? board.value[selected.row]?.[selected.col] ?? null : null

    if (selected && selectedPiece && canMoveTo(row, col)) {
      const move = findMoveForTarget(row, col)
      if (!move) return

      const isPawnMove = selectedPiece.type === 'pawn'
      const isCapture =
        move.special !== 'castle' &&
        (targetPiece !== null || move.special === 'enPassant')

      // ---- 兵升变：弹出选择器 ----
      if (isPawnMove && (row === 0 || row === 7)) {
        promotionPending.value = {
          from: { row: selected.row, col: selected.col },
          to: { row, col },
          color: selectedPiece.color,
        }
        computePromotionStyle(row, col)
        return
      }

      // 清除 premove（如果玩家手动走棋）
      premove.value = null

      const nextBoard = cloneBoard(board.value)
      executeMove(nextBoard, move, { row: selected.row, col: selected.col }, isPawnMove, isCapture)
    } else {
      // ---- 选中/取消选中 ----
      if (targetPiece && targetPiece.color === currentTurn.value && !isAITurn.value) {
        selectedSquare.value = { row, col }
      } else {
        selectedSquare.value = null
      }
    }
  }

  // ---- 升变 ----
  const cancelPromotion = () => {
    promotionPending.value = null
    promotionStyle.value = {}
  }

  const computePromotionStyle = (toRow: number, toCol: number) => {
    const displayCol = isFlipped.value ? 7 - toCol : toCol
    const displayRow = isFlipped.value ? 7 - toRow : toRow

    const leftPercent = displayCol * 12.5
    let topPercent = displayRow * 12.5
    if (displayRow === 7) {
      topPercent = (displayRow - 3) * 12.5
    }

    promotionStyle.value = {
      left: `${leftPercent}%`,
      top: `${topPercent}%`,
      width: '12.5%',
      height: '50%',
    }
  }

  // 棋盘翻转时，重新计算升变 UI 位置
  watch(isFlipped, () => {
    if (promotionPending.value) {
      computePromotionStyle(promotionPending.value.to.row, promotionPending.value.to.col)
    }
  })

  const applyPromotion = (newType: string, origin: 'local' | 'remote' = 'local') => {
    if (!promotionPending.value) return
    const { from, to } = promotionPending.value
    const selectedPiece = board.value[from.row]?.[from.col] ?? null
    if (!selectedPiece) {
      cancelPromotion()
      return
    }

    const targetPiece = board.value[to.row]?.[to.col] ?? null
    const isCapture = targetPiece !== null

    const nextBoard = cloneBoard(board.value)
    nextBoard[to.row]![to.col] = {
      type: newType as Piece['type'],
      color: selectedPiece.color,
      hasMoved: true,
    }
    nextBoard[from.row]![from.col] = null

    const nextTurn = currentTurn.value === 'white' ? 'black' : 'white'

    // 将/将死检测
    let checkStatus: 'check' | 'checkmate' | undefined = undefined
    if (isCheckmate(nextBoard, nextTurn)) {
      checkStatus = 'checkmate'
    } else if (isKingInCheck(nextBoard, nextTurn)) {
      checkStatus = 'check'
    }

    // 记录棋谱
    const notation = generateMoveNotation(
      board.value,
      from.row,
      from.col,
      to.row,
      to.col,
      undefined,
      newType as Piece['type'],
      checkStatus,
    )
    moveHistory.value.push(notation)
    pushBoardHistory(selectedPiece.color)

    // 更新状态
    board.value = nextBoard
    lastMove.value = { from: { row: from.row, col: from.col }, to: { row: to.row, col: to.col } }
    halfmoveClock.value = 0
    positionHistory.value.push(getPositionKey(nextBoard, nextTurn, lastMove.value))
    promotionPending.value = null
    promotionStyle.value = {}
    selectedSquare.value = null
    currentTurn.value = nextTurn

    applyClockAfterMove(selectedPiece.color, nextTurn, nextBoard)
    triggerGameStateAudio(isCapture, nextTurn, nextBoard)

    // ---- 远程对局：走子即视为拒绝对方请求，并把本地走子（含升变）同步给对手 ----
    if (origin === 'local') {
      clearPendingRequestsOnMove()
      broadcastLocalMove(
        { row: from.row, col: from.col },
        { row: to.row, col: to.col },
        newType as PieceType,
      )
    }

    // ---- 触发 AI（如果当前轮次是 AI 的回合） ----
    void nextTick(() => {
      checkAndTriggerAI()
    })
  }

  // ============================================================
  // 拖拽处理
  // ============================================================
  const handleMouseDown = (row: number, col: number, event: MouseEvent) => {
    if (event.button !== 0) return

    // 既不能正常交互，也不能 premove 时直接返回
    if (!canInteract.value && !canPremove.value) return

    const piece = board.value[row]?.[col]
    const selectedMove = findMoveForTarget(row, col)
    if (piece?.type === 'rook' && selectedMove?.special === 'castle') {
      handleSquareClick(row, col)
      return
    }

    const isPlayerPiece = piece && piece.color === (canPremove.value ? playerColor.value : currentTurn.value)

    if (isPlayerPiece) {
      wasAlreadySelected = selectedSquare.value?.row === row && selectedSquare.value?.col === col
      if (!wasAlreadySelected) {
        selectedSquare.value = { row, col }
      }

      isMouseDown.value = true
      isDragging.value = false
      dragStartSquare.value = { row, col }
      dragStartPos.value = { x: event.clientX, y: event.clientY }
      mousePos.value = { x: event.clientX, y: event.clientY }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    } else {
      // 点击空格或对方棋子
      handleSquareClick(row, col)
    }
  }

  const handleMouseMove = (event: MouseEvent) => {
    if (!isMouseDown.value) return

    mousePos.value = { x: event.clientX, y: event.clientY }

    if (!isDragging.value) {
      const dx = event.clientX - dragStartPos.value.x
      const dy = event.clientY - dragStartPos.value.y
      if (Math.sqrt(dx * dx + dy * dy) > 1) {
        isDragging.value = true
        selectedSquare.value = dragStartSquare.value
      }
    }
  }

  const handleDropResult = (from: { row: number; col: number }, toSquare: { row: number; col: number } | null) => {
    if (toSquare) {
      if (from.row === toSquare.row && from.col === toSquare.col) {
        if (wasAlreadySelected) selectedSquare.value = null
        return
      }

      if (canMoveTo(toSquare.row, toSquare.col)) {
        handleSquareClick(toSquare.row, toSquare.col)
      } else {
        // 修复：拖拽到不合法棋格（包括己方棋子格）时，取消选择
        selectedSquare.value = null
      }
    } else {
      selectedSquare.value = null
    }
  }

  const handleMouseUp = () => {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)

    const from = dragStartSquare.value
    const to = hoverSquare.value
    const hadDragged = isDragging.value

    isMouseDown.value = false
    isDragging.value = false
    dragStartSquare.value = null

    if (!from) return

    // ---- 1. 单击（没有发生拖拽） ----
    if (!hadDragged) {
      if (wasAlreadySelected) {
        // 再次点击已选中的棋子则取消选择并清除 premove
        selectedSquare.value = null
        premove.value = null
      }
      return
    }

    // ---- 2. 拖拽释放 ----
    if (to) {
      // 拖回原位
      if (from.row === to.row && from.col === to.col) {
        if (wasAlreadySelected) selectedSquare.value = null
        return
      }

      // A. 处于 Premove 模式下的拖拽释放
      if (canPremove.value) {
        if (canPremoveTo(to.row, to.col)) {
          // 拖拽到合法格：成功设置 premove
          premove.value = {
            from: { row: from.row, col: from.col },
            to: { row: to.row, col: to.col },
          }
        } else {
          // 拖拽到非法格：清除 premove
          premove.value = null
        }
        selectedSquare.value = null
        return
      }

      // B. 处于正常玩家回合下的拖拽释放
      handleDropResult(from, to)
    } else {
      // 拖到棋盘外，清空选择
      selectedSquare.value = null
      premove.value = null
    }
  }

  // ============================================================
  // 触摸事件处理（移动端拖拽支持）
  // ============================================================
  const findSquareFromPoint = (clientX: number, clientY: number): { row: number; col: number } | null => {
    const el = document.elementFromPoint(clientX, clientY)
    if (!el) return null

    // 查找最近的带有 data-row/data-col 的 button.board-square 元素
    const squareBtn = el.closest('.board-square') as HTMLElement | null
    if (!squareBtn) return null

    const rowStr = squareBtn.getAttribute('data-row')
    const colStr = squareBtn.getAttribute('data-col')
    if (rowStr === null || colStr === null) return null

    const row = parseInt(rowStr, 10)
    const col = parseInt(colStr, 10)
    if (isNaN(row) || isNaN(col)) return null

    return { row, col }
  }

  const handleTouchStart = (row: number, col: number, event: TouchEvent) => {
    // 既不能正常交互，也不能 premove 时直接返回
    if (!canInteract.value && !canPremove.value) return

    const piece = board.value[row]?.[col]
    const selectedMove = findMoveForTarget(row, col)
    if (piece?.type === 'rook' && selectedMove?.special === 'castle') {
      handleSquareClick(row, col)
      return
    }
    const isPlayerPiece = piece && piece.color === (canPremove.value ? playerColor.value : currentTurn.value)

    if (isPlayerPiece) {
      wasAlreadySelected = selectedSquare.value?.row === row && selectedSquare.value?.col === col
      touchStartSquare = { row, col }

      isMouseDown.value = true
      isDragging.value = false
      dragStartSquare.value = { row, col }

      const touch = event.touches[0]
      if (touch) {
        dragStartPos.value = { x: touch.clientX, y: touch.clientY }
        mousePos.value = { x: touch.clientX, y: touch.clientY }
      }
    } else {
      // 点击空格或对方棋子
      handleSquareClick(row, col)
    }
  }

  const handleTouchMove = (event: TouchEvent) => {
    if (!isMouseDown.value) return

    const touch = event.touches[0]
    if (!touch) return

    mousePos.value = { x: touch.clientX, y: touch.clientY }

    if (!isDragging.value) {
      const dx = touch.clientX - dragStartPos.value.x
      const dy = touch.clientY - dragStartPos.value.y
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        isDragging.value = true
        selectedSquare.value = dragStartSquare.value
      }
    }

    // 更新 hoverSquare（通过触摸点查找下方方格）
    const square = findSquareFromPoint(touch.clientX, touch.clientY)
    if (square) {
      hoverSquare.value = square
    } else {
      hoverSquare.value = null
    }
  }

  const handleTouchEnd = (_event: TouchEvent) => {
    const from = dragStartSquare.value
    const to = hoverSquare.value
    const hadDragged = isDragging.value

    isMouseDown.value = false
    isDragging.value = false
    dragStartSquare.value = null
    touchStartSquare = null

    if (!from) return

    // ---- 1. 单击（没有发生拖拽） ----
    if (!hadDragged) {
      if (wasAlreadySelected) {
        // 再次点击已选中的棋子则取消选择
        selectedSquare.value = null
        premove.value = null
      } else {
        // 点击未选中的棋子：选中它
        selectedSquare.value = { row: from.row, col: from.col }
      }
      return
    }

    // ---- 2. 拖拽释放 ----
    if (to) {
      // 拖回原位
      if (from.row === to.row && from.col === to.col) {
        if (wasAlreadySelected) selectedSquare.value = null
        return
      }

      // A. Premove 模式下的拖拽释放
      if (canPremove.value) {
        if (canPremoveTo(to.row, to.col)) {
          premove.value = {
            from: { row: from.row, col: from.col },
            to: { row: to.row, col: to.col },
          }
        } else {
          premove.value = null
        }
        selectedSquare.value = null
        return
      }

      // B. 正常玩家回合下的拖拽释放
      handleDropResult(from, to)
    } else {
      // 拖到棋盘外
      selectedSquare.value = null
      premove.value = null
    }
  }

  // ============================================================
  // 游戏操作：悔棋 / 认输 / 和棋 / 重新开始
  // ============================================================
  const handleUndo = (): void => {
    if (boardHistory.value.length === 0) return

    // ---- 远程对局：悔棋需要先取得对方同意 ----
    if (isRemote.value) {
      if (outgoingRequest.value !== null || pendingUndoRequest.value) return
      if (beginRemoteRequest('undo')) {
        sendRemote({ type: 'undo-request' })
      }
      return
    }

    // 清除 premove
    premove.value = null

    // AI 对局中，悔棋撤回两步（撤消 AI 的走棋 + 玩家的上一步）
    if (gameMode.value === 'ai') {
      // 取消可能正在等待的 AI 走棋
      cancelAIMove()

      // 撤回 AI 的走棋（如果最后一步是 AI 走的）
      if (boardHistory.value.length > 0) {
        const lastTurnBefore = boardHistory.value[boardHistory.value.length - 1]!.currentTurn
        const aiColor = playerColor.value === 'white' ? 'black' : 'white'
        // boardHistory 记录了走棋前的状态，若上一条记录的 turn 是 AI，则最后一步是 AI 走的
        if (lastTurnBefore === aiColor) {
          // 玩家执黑时，不能撤回 AI 的第一步走棋，否则会导致死锁
          if (playerColor.value === 'black' && boardHistory.value.length <= 1) return
          restoreHistoryState(boardHistory.value.pop()!)
          moveHistory.value.pop()
          if (positionHistory.value.length > 1) {
            positionHistory.value.pop()
          }
        }
      }

      // 再撤回一步（玩家的上一步）
      if (boardHistory.value.length > 0) {
        // 玩家执黑时不能撤回 AI 的第一步
        if (playerColor.value === 'black' && boardHistory.value.length <= 1) {
          const lastTurnBefore = boardHistory.value[boardHistory.value.length - 1]!.currentTurn
          if (lastTurnBefore === 'white') {
            selectedSquare.value = null
            return
          }
        }
        restoreHistoryState(boardHistory.value.pop()!)
        moveHistory.value.pop()
        if (positionHistory.value.length > 1) {
          positionHistory.value.pop()
        }
      }
    } else {
      const previousState = boardHistory.value.pop()
      if (!previousState) return

      restoreHistoryState(previousState)
      moveHistory.value.pop()
      if (positionHistory.value.length > 1) {
        positionHistory.value.pop()
      }
    }

    selectedSquare.value = null
    promotionPending.value = null
    promotionStyle.value = {}

    // 悔棋后若游戏未结束，确保"已开始"状态和棋钟保持运行
    // （解决悔棋到初始状态时 hasGameStarted 被恢复为 false 的问题）
    if (!isGameOver.value && boardHistory.value.length >= 0) {
      if (!hasGameStarted.value) {
        hasGameStarted.value = true
      }
      if (!clockStarted.value && isClockEnabled.value) {
        startClock(currentTurn.value)
      }
    }
  }

  const restoreHistoryState = (state: NonNullable<typeof boardHistory.value[number]>) => {
    board.value = state.board
    currentTurn.value = state.currentTurn
    lastMove.value = state.lastMove
    halfmoveClock.value = state.halfmoveClock
    whiteTimeSeconds.value = state.whiteTimeSeconds
    blackTimeSeconds.value = state.blackTimeSeconds
    timeoutWinner.value = state.timeoutWinner
    hasGameStarted.value = state.hasGameStarted

    if (state.hasGameStarted) {
      startClock(state.currentTurn)
    } else {
      stopClock()
    }
  }

  const handleResign = (): void => {
    // 远程对局：立即生效，同时通知对手
    if (isRemote.value) {
      const color = playerColor.value
      stopClock()
      cancelAIMove()
      hasResigned.value = color
      playSound('defeat')
      sendRemote({ type: 'resign', color })
      broadcastRemoteClock()
      return
    }

    stopClock()
    cancelAIMove()
    hasResigned.value = currentTurn.value
    playSound(currentTurn.value === playerColor.value ? 'defeat' : 'victory')
  }

  const handleDrawOffer = (): void => {
    // 远程对局：和棋需要双方同意
    if (isRemote.value) {
      if (outgoingRequest.value !== null || pendingDrawOffer.value) return
      if (beginRemoteRequest('draw')) {
        sendRemote({ type: 'draw-offer' })
      }
      return
    }

    stopClock()
    cancelAIMove()
    isAgreedDraw.value = true
    playSound('draw')
  }

  /** 双方达成和棋（远程对局） */
  const applyAgreedDraw = (): void => {
    stopClock()
    cancelAIMove()
    isAgreedDraw.value = true
    playSound('draw')
    broadcastRemoteClock()
  }

  const handleRestart = (): void => {
    // 远程对局：重赛需要对方同意
    if (isRemote.value) {
      if (outgoingRequest.value !== null || pendingRematchRequest.value) return
      if (beginRemoteRequest('rematch')) {
        sendRemote({ type: 'rematch-request' })
      }
      return
    }

    performRestart()
  }

  const performRestart = (): void => {
    cancelAIMove()
    // 新的一局：清掉上一局残留的请求状态，避免旧提示串场
    clearRemoteRequestState()
    if (!lastSetupConfig.value) {
      showSetup.value = true
      return
    }

    const config = lastSetupConfig.value

    // 本地双人对局：不交换先手方，白方始终先行，不翻转棋盘
    if (config.gameMode === 'human') {
      applyGameSetup(config)
      return
    }

    // 远程对局：双方各自交换执棋方，双方推导结果一致
    if (config.gameMode === 'remote') {
      const nextHostColor: Color = remoteHostColor.value === 'white' ? 'black' : 'white'
      applyRemoteColors(nextHostColor)
      applyGameSetup(config)
      return
    }

    const swappedStarter: GameSetupConfig['starter'] =
      config.starter === 'black' ? 'white' : config.starter === 'white' ? 'black' : config.starter
    const swappedConfig: GameSetupConfig = { ...config, starter: swappedStarter }

    applyGameSetup(swappedConfig)
  }

  const handleBackToHome = (): void => {
    cancelAIMove()
    stopClock()
    resetRemoteSession()
    showSetup.value = true
  }

  // ============================================================
  // 对局初始化
  // ============================================================
  const applyGameSetup = (config: GameSetupConfig) => {
    let initialBoard: Board
    let fenPosition: ReturnType<typeof parseFen> = null

    if (config.boardMode === 'standard') {
      initialBoard = createInitialBoard()
    } else {
      const parsed = parseFenToBoard(config.fen)
      if (!parsed) return
      initialBoard = parsed.board
      fenPosition = parsed
    }

    cancelAIMove()

    // 保存本次配置，供重赛使用
    lastSetupConfig.value = config

    // 设置 AI 参数
    gameMode.value = config.gameMode
    if (config.gameMode === 'ai') {
      aiDifficulty.value = config.difficulty as AIDifficulty
      aiStyle.value = config.aiStyle
    }

    isClockEnabled.value = config.timeMinutes > 0

    board.value = initialBoard

    // 自定义棋盘时使用 FEN 中的走棋方，否则使用随机/手动指定的走棋方
    // （远程对局始终遵循棋规：白方先行，自定义 FEN 则以 FEN 为准）
    const fenTurn = fenPosition?.turn ?? null
    const starterColor =
      config.gameMode === 'remote' ? (fenTurn ?? 'white') : (fenTurn ?? getStarterColor(config.starter))
    currentTurn.value = starterColor
    startingFullmoveNumber.value = fenPosition?.fullmoveNumber ?? 1

    // 远程模式的 playerColor 由 applyRemoteColors 决定；本地双人则直接等于先手方
    // AI 模式在下方的代码块中单独处理
    if (config.gameMode === 'remote') {
      isFlipped.value = playerColor.value === 'black'
    } else if (config.gameMode !== 'ai') {
      isFlipped.value = starterColor === 'black'
      playerColor.value = starterColor
    }
    selectedSquare.value = null
    hoverSquare.value = null
    lastMove.value = fenPosition?.lastMove ?? null
    halfmoveClock.value = fenPosition?.halfmoveClock ?? 0
    premove.value = null

    whiteTimeSeconds.value = config.timeMinutes * 60
    blackTimeSeconds.value = config.timeMinutes * 60
    clockIncrementSeconds.value = config.incrementSeconds
    lowTimePlayedWhite = false
    lowTimePlayedBlack = false

    hasGameStarted.value = false
    hasMovedByColor.value = { white: false, black: false }
    stopClock()
    timeoutWinner.value = null
    moveHistory.value = []
    boardHistory.value = []
    isAgreedDraw.value = false
    hasResigned.value = null
    promotionPending.value = null
    promotionStyle.value = {}
    positionHistory.value = [getPositionKey(board.value, currentTurn.value, lastMove.value)]
    showSetup.value = false

    // ---- AI 模式下，确定玩家执棋方 ----
    // currentTurn 已在上面由 fenTurn（FEN 自定义棋盘）或 starterColor 设定，此处仅设定 playerColor
    if (config.gameMode === 'ai') {
      const resolvedPlayerColor = getStarterColor(config.starter)

      if (config.starter === 'black') {
        playerColor.value = 'black'
        isFlipped.value = true
      } else if (config.starter === 'white') {
        playerColor.value = 'white'
        isFlipped.value = false
      } else {
        playerColor.value = resolvedPlayerColor
        isFlipped.value = resolvedPlayerColor === 'black'
      }

      // 标准棋盘（无 FEN）时，始终白方先行
      if (!fenTurn) {
        currentTurn.value = 'white'
      }
    }

    startingTurn.value = currentTurn.value

    // ---- AI 先走的触发 ----
    void nextTick(() => {
      checkAndTriggerAI()
    })
  }
  // ============================================================
  // 远程对局：会话生命周期
  // ============================================================
  /** 依据房主执棋方推导双方的执棋方与棋盘朝向 */
  const applyRemoteColors = (hostColor: Color) => {
    remoteHostColor.value = hostColor
    playerColor.value =
      remoteRole.value === 'host' ? hostColor : hostColor === 'white' ? 'black' : 'white'
    isFlipped.value = playerColor.value === 'black'
  }

  /** 把房主下发的配置转换成内部对局配置 */
  const toRemoteSetupConfig = (payload: RoomConfigPayload): GameSetupConfig => ({
    boardMode: payload.boardMode,
    fen: payload.fen,
    timeMinutes: payload.timeMinutes,
    incrementSeconds: payload.incrementSeconds,
    starter: 'white',
    gameMode: 'remote',
    difficulty: 3,
    aiStyle: 'balanced',
  })

  const buildRoomConfigPayload = (
    code: string,
    config: GameSetupConfig,
    hostColor: Color,
  ): RoomConfigPayload => {
    const parsed = config.boardMode === 'standard' ? null : parseFenToBoard(config.fen)
    return {
      roomCode: code,
      boardMode: config.boardMode,
      fen: config.fen,
      isChess960: config.boardMode === 'chess960',
      timeMinutes: config.timeMinutes,
      incrementSeconds: config.incrementSeconds,
      hostColor,
      startingTurn: config.boardMode === 'standard' ? 'white' : (parsed?.turn ?? 'white'),
      startingFullmoveNumber: parsed?.fullmoveNumber ?? 1,
      halfmoveClock: parsed?.halfmoveClock ?? 0,
    }
  }

  /** 房主：房间创建完成，进入对局，并把配置回传给会话层用于下发 */
  const startRemoteHost = (
    code: string,
    config: GameSetupConfig,
    hostColor: Color,
  ): RoomConfigPayload => {
    roomCode.value = code
    remoteRole.value = 'host'
    applyRemoteColors(hostColor)
    const payload = buildRoomConfigPayload(code, config, hostColor)
    applyGameSetup(toRemoteSetupConfig(payload))
    return payload
  }

  /** 客方：收到 welcome 后进入对局 */
  const startRemoteGuest = (code: string, payload: RoomConfigPayload) => {
    roomCode.value = code
    remoteRole.value = 'guest'
    applyRemoteColors(payload.hostColor)
    applyGameSetup(toRemoteSetupConfig(payload))
  }

  const setRemoteLinkKind = (kind: RemoteLinkKind | null) => {
    remoteLinkKind.value = kind
  }

  const setRemoteConnected = (connected: boolean) => {
    remoteConnected.value = connected
  }

  /** 对手离开：停止棋钟并标记离线 */
  const handleRemoteOpponentLeft = () => {
    remoteConnected.value = false
    stopClock()
  }

  /** 清空一切的远程请求状态（新的一局 / 离开房间时调用） */
  const clearRemoteRequestState = () => {
    finishOutgoingRequest()
    pendingUndoRequest.value = false
    pendingDrawOffer.value = false
    pendingRematchRequest.value = false
  }

  /** 重置远程会话（返回首页 / 主动离开时调用） */
  const resetRemoteSession = () => {
    stopClock()
    remoteConnected.value = false
    remoteRole.value = null
    remoteLinkKind.value = null
    roomCode.value = ''
    clearRemoteRequestState()
    requestCooldownUntil.value = { undo: 0, draw: 0, rematch: 0 }
  }

  /** 应用房主下发的权威棋钟快照（客方） */
  const applyRemoteClock = (snapshot: ClockSnapshot) => {
    whiteTimeSeconds.value = snapshot.whiteTimeSeconds
    blackTimeSeconds.value = snapshot.blackTimeSeconds
    hasGameStarted.value = snapshot.hasGameStarted

    if (snapshot.timeoutWinner && !timeoutWinner.value) {
      timeoutWinner.value = snapshot.timeoutWinner
      playSound(snapshot.timeoutWinner === playerColor.value ? 'victory' : 'defeat')
      stopClock()
      return
    }

    timeoutWinner.value = snapshot.timeoutWinner
    clockStarted.value = snapshot.clockStarted
    activeClockColor.value = snapshot.activeColor

    // 房主仍在走表时，客方用自己的 ticker 平滑渲染，避免数值长时间冻结
    if (
      snapshot.clockStarted &&
      snapshot.activeColor &&
      clockTimer === null &&
      !isGameOver.value &&
      isClockEnabled.value
    ) {
      startClock(snapshot.activeColor)
    } else if (!snapshot.clockStarted) {
      stopClock()
    }
  }

  /** 两种执棋方互为对方 */
  const oppositeColor = (color: Color): Color => (color === 'white' ? 'black' : 'white')

  /**
   * 远程悔棋：回退到「请求方自己走棋之前」。
   *
   * 例如白黑各走一轮后轮到白方悔棋并通过，会把整个回合一起撤回（2 手），
   * 而不是只撤掉黑方那一步 —— 撤回后正好轮到白方重新走那一手。
   * 若请求方刚走完（当前轮到对方），则只回退 1 手。
   *
   * 本地 / 人机模式不走这里，仍然只回退 1 手。
   */
  const applyRemoteUndoStep = (requesterColor: Color) => {
    premove.value = null

    let targetState: (typeof boardHistory.value)[number] | null = null
    let poppedPlies = 0

    while (boardHistory.value.length > 0) {
      const previousState = boardHistory.value.pop()
      if (!previousState) break

      targetState = previousState
      poppedPlies += 1

      // previousState.currentTurn 即「被撤销这一手的走子方」
      if (previousState.currentTurn === requesterColor) break
    }

    if (!targetState) return

    restoreHistoryState(targetState)
    for (let i = 0; i < poppedPlies; i += 1) {
      moveHistory.value.pop()
      if (positionHistory.value.length > 1) {
        positionHistory.value.pop()
      }
    }

    selectedSquare.value = null
    promotionPending.value = null
    promotionStyle.value = {}

    // 与本地悔棋保持一致：回退后仍视为「已开始」，提和 / 认输保持可用
    if (!isGameOver.value && !hasGameStarted.value) {
      hasGameStarted.value = true
    }

    broadcastRemoteClock()
  }

  /** 应用对手广播的走子 */
  const applyRemoteMove = (
    from: { row: number; col: number },
    to: { row: number; col: number },
    promotion?: PieceType,
    expectedPositionKey?: string,
  ) => {
    const piece = board.value[from.row]?.[from.col] ?? null
    if (!piece) {
      console.error('[remote] 收到非法走子：起点无棋子', from)
      return
    }

    const enPassantTarget = getEnPassantTarget(lastMove.value)
    const legalMoves = getLegalMoves(board.value, from.row, from.col, {
      lastMove: lastMove.value,
      enPassantTarget,
    })

    // 与本地走子保持一致：王车易位允许点击王的目标格或车所在的格
    const move = legalMoves.find(
      (candidate) =>
        (candidate.row === to.row && candidate.col === to.col) ||
        isCastlingRookTarget(candidate, to.row, to.col, from),
    )
    if (!move) {
      console.error('[remote] 收到非法走子：目标格不合法', from, to)
      return
    }

    if (promotion) {
      promotionPending.value = { from, to, color: piece.color }
      applyPromotion(promotion, 'remote')
      promotionPending.value = null
      promotionStyle.value = {}
    } else {
      const targetPiece = board.value[to.row]?.[to.col] ?? null
      const isPawnMove = piece.type === 'pawn'
      const isCapture =
        move.special !== 'castle' && (targetPiece !== null || move.special === 'enPassant')

      executeMove(cloneBoard(board.value), move, from, isPawnMove, isCapture, 'remote')
    }

    // 校验双方是否仍然同步
    if (expectedPositionKey) {
      const localKey = getPositionKey(board.value, currentTurn.value, lastMove.value)
      if (localKey !== expectedPositionKey) {
        console.error('[remote] 局面不同步，请重新开始对局')
      }
    }
  }

  /** 应用房主下发的全量状态（异常恢复用） */
  const applyRemoteState = (snapshot: RemoteStateSnapshot) => {
    board.value = snapshot.board
    currentTurn.value = snapshot.currentTurn
    lastMove.value = snapshot.lastMove
      ? {
          from: { row: snapshot.lastMove.from.row, col: snapshot.lastMove.from.col },
          to: { row: snapshot.lastMove.to.row, col: snapshot.lastMove.to.col },
        }
      : null
    halfmoveClock.value = snapshot.halfmoveClock
    moveHistory.value = [...snapshot.moveHistory]
    // 重同步快照里有走子记录就说明对应方已开局（粘性，不因快照为空而复位）
    const firstMover: Color = snapshot.startingTurn
    const plyCount = snapshot.moveHistory.length
    if (plyCount > 0) hasMovedByColor.value[firstMover] = true
    if (plyCount > 1) hasMovedByColor.value[oppositeColor(firstMover)] = true
    startingTurn.value = snapshot.startingTurn
    boardHistory.value = []
    positionHistory.value = [getPositionKey(board.value, currentTurn.value, lastMove.value)]
    selectedSquare.value = null
    promotionPending.value = null
    promotionStyle.value = {}
    applyRemoteClock(snapshot.clock)
  }

  /** 统一处理来自对手的消息 */
  const handleRemoteMessage = (message: RemoteMessage) => {
    switch (message.type) {
      case 'welcome': {
        if (message.protocol !== PROTOCOL_VERSION) {
          console.error('[remote] 协议版本不一致', message.protocol)
          return
        }
        startRemoteGuest(message.config.roomCode, message.config)
        sendRemote({ type: 'ready' })
        break
      }
      case 'move':
        applyRemoteMove(message.from, message.to, message.promotion, message.positionKey)
        // 客方直接采用房主走子后权威的棋钟数值，减少漂移
        if (isRemoteGuest.value) applyRemoteClock(message.clock)
        break
      case 'clock':
        if (isRemoteGuest.value) applyRemoteClock(message.clock)
        break
      case 'state':
        if (isRemoteGuest.value) applyRemoteState(message.snapshot)
        break
      case 'undo-request':
        pendingUndoRequest.value = true
        break
      case 'undo-response':
        if (outgoingRequest.value !== 'undo') break
        finishOutgoingRequest()
        if (message.accepted) {
          // 本方是请求方：回退到自己走棋之前
          applyRemoteUndoStep(playerColor.value)
          sendRemote({ type: 'commit', kind: 'undo' })
        } else {
          startRequestCooldown('undo')
        }
        break
      case 'draw-offer':
        pendingDrawOffer.value = true
        break
      case 'draw-response':
        if (outgoingRequest.value !== 'draw') break
        finishOutgoingRequest()
        if (message.accepted) {
          applyAgreedDraw()
          sendRemote({ type: 'commit', kind: 'draw' })
        } else {
          startRequestCooldown('draw')
        }
        break
      case 'resign':
        stopClock()
        hasResigned.value = message.color
        playSound(message.color === playerColor.value ? 'defeat' : 'victory')
        break
      case 'rematch-request':
        pendingRematchRequest.value = true
        break
      case 'rematch-response':
        if (outgoingRequest.value !== 'rematch') break
        finishOutgoingRequest()
        if (message.accepted) {
          performRestart()
          sendRemote({ type: 'commit', kind: 'rematch' })
        } else {
          startRequestCooldown('rematch')
        }
        break
      case 'commit':
        // 发起方已确认执行，本方跟随落地
        if (message.kind === 'undo') {
          // 本方是应答方，请求方是对方，回退基准按其执棋方计算
          applyRemoteUndoStep(oppositeColor(playerColor.value))
        } else if (message.kind === 'draw') {
          applyAgreedDraw()
        } else {
          performRestart()
        }
        break
      case 'cancel-request':
        // 对方撤回了请求，收起提示（已经表态过则无事发生）
        pendingUndoRequest.value = false
        pendingDrawOffer.value = false
        pendingRematchRequest.value = false
        break
      default:
        break
    }
  }

  /** 回应对方的悔棋请求（仅表态，实际回退由发起方 commit） */
  const respondToUndoRequest = (accepted: boolean) => {
    if (!pendingUndoRequest.value) return
    pendingUndoRequest.value = false
    sendRemote({ type: 'undo-response', accepted })
  }

  /** 回应对方的和棋提议（仅表态，实际判和由发起方 commit） */
  const respondToDrawOffer = (accepted: boolean) => {
    if (!pendingDrawOffer.value) return
    pendingDrawOffer.value = false
    sendRemote({ type: 'draw-response', accepted })
  }

  /** 回应对方的重赛请求（仅表态，实际重开由发起方 commit） */
  const respondToRematchRequest = (accepted: boolean) => {
    if (!pendingRematchRequest.value) return
    pendingRematchRequest.value = false
    sendRemote({ type: 'rematch-response', accepted })
  }

  /** 该行为的请求是否仍在冷却期内 */
  const isRequestOnCooldown = (kind: RemoteRequestKind): boolean =>
    Date.now() < requestCooldownUntil.value[kind]

  /** 请求被拒绝后进入冷却，避免连续骚扰对手 */
  const startRequestCooldown = (kind: RemoteRequestKind) => {
    requestCooldownUntil.value = {
      ...requestCooldownUntil.value,
      [kind]: Date.now() + REQUEST_COOLDOWN_MS,
    }
  }

  const clearLocalOnlyRequestTimer = () => {
    if (localOnlyRequestTimer !== null) {
      window.clearTimeout(localOnlyRequestTimer)
      localOnlyRequestTimer = null
    }
  }

  /** 结束我方未决请求的本机状态（不发送任何消息） */
  const finishOutgoingRequest = () => {
    clearLocalOnlyRequestTimer()
    outgoingRequest.value = null
    outgoingRequestWasSent = false
  }

  /**
   * 发起一次请求。
   * 处于冷却期时只在本机显示「已发送」，对方收不到对应请求；返回是否真的发出了消息。
   */
  const beginRemoteRequest = (kind: RemoteRequestKind): boolean => {
    outgoingRequest.value = kind

    if (!isRequestOnCooldown(kind)) {
      outgoingRequestWasSent = true
      return true
    }

    outgoingRequestWasSent = false
    clearLocalOnlyRequestTimer()

    // 冷却结束即收起这条纯本机提示
    const remaining = Math.max(requestCooldownUntil.value[kind] - Date.now(), 0)
    localOnlyRequestTimer = window.setTimeout(() => {
      localOnlyRequestTimer = null
      if (outgoingRequest.value === kind) {
        outgoingRequest.value = null
      }
    }, remaining)

    return false
  }

  /** 撤销我方尚未被回应的请求（真的发出过才通知对方收起提示） */
  const cancelOutgoingRequest = (notify = true) => {
    if (outgoingRequest.value === null) return
    const wasSent = outgoingRequestWasSent
    finishOutgoingRequest()
    if (notify && wasSent && isRemote.value) {
      sendRemote({ type: 'cancel-request' })
    }
  }

  /**
   * 走子即视为「拒绝对方请求 + 撤回自己未决的请求」。
   * 由于执行权统一在发起方的 commit，撤回不会造成双方状态不同步。
   */
  const clearPendingRequestsOnMove = () => {
    if (!isRemote.value) return
    respondToUndoRequest(false)
    respondToDrawOffer(false)
    respondToRematchRequest(false)
    cancelOutgoingRequest()
  }

  // ============================================================
  // AI 走棋调度
  // ============================================================
  const executeAIMoveOnBoard = (aiMove: AIDetailedMove) => {
    const from = { row: aiMove.fromRow, col: aiMove.fromCol }
    const piece = board.value[aiMove.fromRow]?.[aiMove.fromCol]
    if (!piece) return

    const isPawnMove = piece.type === 'pawn'
    const targetPiece = board.value[aiMove.toRow]?.[aiMove.toCol]
    const isCapture = targetPiece !== null || aiMove.special === 'enPassant'

    // 兵升变：AI 自动选择
    if (isPawnMove && (aiMove.toRow === 0 || aiMove.toRow === 7)) {
      const promoChoice = getPromotionChoice(board.value, aiMove.toRow, aiMove.toCol, piece.color)
      const newType = promoChoice as Piece['type']
      const nextBoard = cloneBoard(board.value)
      nextBoard[aiMove.toRow]![aiMove.toCol] = {
        type: newType,
        color: piece.color,
        hasMoved: true,
      }
      nextBoard[aiMove.fromRow]![aiMove.fromCol] = null

      const nextTurn: Color = piece.color === 'white' ? 'black' : 'white'
      let checkStatus: 'check' | 'checkmate' | undefined = undefined
      if (isCheckmate(nextBoard, nextTurn)) {
        checkStatus = 'checkmate'
      } else if (isKingInCheck(nextBoard, nextTurn)) {
        checkStatus = 'check'
      }

      const notation = generateMoveNotation(
        board.value,
        aiMove.fromRow,
        aiMove.fromCol,
        aiMove.toRow,
        aiMove.toCol,
        undefined,
        newType,
        checkStatus,
      )
      moveHistory.value.push(notation)
      pushBoardHistory(piece.color)

      board.value = nextBoard
      lastMove.value = { from: { row: aiMove.fromRow, col: aiMove.fromCol }, to: { row: aiMove.toRow, col: aiMove.toCol } }
      halfmoveClock.value = 0
      positionHistory.value.push(getPositionKey(nextBoard, nextTurn, lastMove.value))
      currentTurn.value = nextTurn

      applyClockAfterMove(piece.color, nextTurn, nextBoard)
      triggerGameStateAudio(isCapture, nextTurn, nextBoard)
    } else {
      const move: Move = {
        row: aiMove.toRow,
        col: aiMove.toCol,
        special: aiMove.special,
        rookFrom: aiMove.rookFrom,
        rookTo: aiMove.rookTo,
      }
      const nextBoard = cloneBoard(board.value)
      executeMove(nextBoard, move, from, isPawnMove, isCapture)
    }
  }

  const scheduleAIMove = () => {
    if (isGameOver.value) return
    if (gameMode.value !== 'ai') return

    const aiColor = playerColor.value === 'white' ? 'black' : 'white'
    if (currentTurn.value !== aiColor) return

    cancelAIMove()
    isAIThinking.value = true

    // 获取 AI 方当前棋钟剩余时间（秒），转换为毫秒
    const aiTimeRemainingSec = aiColor === 'white' ? whiteTimeSeconds.value : blackTimeSeconds.value
    const aiTimeRemainingMs = aiTimeRemainingSec !== null ? aiTimeRemainingSec * 1000 : null

    // 模拟 AI 思考延迟（让棋钟有时间走动）
    // 基础延迟 1000ms + 根据难度随机追加，并根据剩余时间动态缩减
    let baseDelay = 1000
    if (aiTimeRemainingMs !== null) {
      if (aiTimeRemainingMs < 10_000) {
        baseDelay = 100   // 不足 10 秒：几乎立即响应
      } else if (aiTimeRemainingMs < 30_000) {
        baseDelay = 200   // 不足 30 秒：快速响应
      } else if (aiTimeRemainingMs < 60_000) {
        baseDelay = 500   // 不足 60 秒：较快响应
      }
    }
    const randomExtra = Math.random() * (6 - aiDifficulty.value) * 500
    const thinkDelay = baseDelay + randomExtra

    aiMoveTimer = window.setTimeout(() => {
      aiMoveTimer = null
      if (isGameOver.value) {
        isAIThinking.value = false
        return
      }

      if (currentTurn.value !== aiColor) {
        isAIThinking.value = false
        return
      }

      // ---- AI 主动宣告和棋：3 次重复局面 或 50 步规则 ----
      const currentKey = getPositionKey(board.value, currentTurn.value, lastMove.value)
      const positionRepeatCount = positionHistory.value.filter((key) => key === currentKey).length

      if (positionRepeatCount >= 3 || halfmoveClock.value >= 100) {
        isAIThinking.value = false
        // AI 宣告和棋
        stopClock()
        isAgreedDraw.value = true
        playSound('draw')
        return
      }

      // 创建新的 Web Worker 用于 AI 计算，避免阻塞 UI 线程
      // 终止可能残留的旧 Worker（防御性编程）
      if (aiWorker !== null) {
        aiWorker.terminate()
        aiWorker = null
      }

      try {
        aiWorker = new AIWorker()
      } catch (err) {
        console.error('Failed to create AI Worker:', err)
        isAIThinking.value = false
        return
      }

      aiWorker.onmessage = (e: MessageEvent<{ type: string; move: AIDetailedMove | null }>) => {
        aiWorker = null
        isAIThinking.value = false

        if (e.data.type === 'bestMove' && e.data.move) {
          // 保存玩家的 premove / 选中 / 拖拽状态
          // （executeAIMoveOnBoard -> executeMove 会清除 selectedSquare，需提前保存）
          const savedSelectedSquare = selectedSquare.value
          const savedPremove = premove.value
          const savedIsDragging = isDragging.value
          const savedDragStartSquare = dragStartSquare.value
          const savedIsMouseDown = isMouseDown.value

          executeAIMoveOnBoard(e.data.move)

          const resultingPositionKey = getPositionKey(board.value, currentTurn.value, lastMove.value)
          if (
            !isGameOver.value &&
            positionHistory.value.filter((key) => key === resultingPositionKey).length >= 3
          ) {
            stopClock()
            isAgreedDraw.value = true
            playSound('draw')
          }

          // 恢复玩家状态，后续 tryExecutePremove 会验证是否仍然合法
          selectedSquare.value = savedSelectedSquare
          premove.value = savedPremove
          isDragging.value = savedIsDragging
          dragStartSquare.value = savedDragStartSquare
          isMouseDown.value = savedIsMouseDown

          // AI 走棋完成后，尝试执行玩家预设的 premove
          if (!isGameOver.value && gameMode.value === 'ai') {
            void nextTick(() => {
              tryExecutePremove()
            })
          }
        }
      }

      aiWorker.onmessageerror = () => {
        console.error('AI Worker: message could not be deserialized')
        aiWorker?.terminate()
        aiWorker = null
        isAIThinking.value = false
      }

      aiWorker.onerror = (err) => {
        console.error('AI Worker error:', err)
        aiWorker = null
        isAIThinking.value = false
      }

      // JSON 序列化确保完全剥离 Vue 响应式 Proxy，避免 postMessage 的 DataCloneError
      try {
        const plainBoard = JSON.parse(JSON.stringify(board.value)) as Board
        const plainLastMove = lastMove.value
          ? (JSON.parse(JSON.stringify(lastMove.value)) as {
              from: { row: number; col: number }
              to: { row: number; col: number }
            })
          : null

        aiWorker.postMessage({
          type: 'findBestMove',
          board: plainBoard,
          color: aiColor,
          difficulty: aiDifficulty.value,
          style: aiStyle.value,
          lastMove: plainLastMove,
          aiTimeRemainingMs: aiTimeRemainingMs ?? undefined,
          positionHistory: [...positionHistory.value],
        })
      } catch (err) {
        console.error('Failed to post message to AI Worker:', err)
        aiWorker?.terminate()
        aiWorker = null
        isAIThinking.value = false
      }
    }, thinkDelay)
  }

  const checkAndTriggerAI = () => {
    if (gameMode.value !== 'ai') return
    if (isGameOver.value) return

    const aiColor = playerColor.value === 'white' ? 'black' : 'white'
    if (currentTurn.value === aiColor) {
      scheduleAIMove()
    }
  }

  const handleGameSetupStart = (config: GameSetupConfig) => {
    applyGameSetup(config)
  }

  const getPositionCount = (): number => {
    const currentKey = getPositionKey(board.value, currentTurn.value, lastMove.value)
    return positionHistory.value.filter((key) => key === currentKey).length
  }

  // ---- 清理 ----
  onUnmounted(() => {
    stopClock()
    cancelAIMove()
  })

  // ============================================================
  // 导出
  // ============================================================
  return {
    // 设置
    showSetup,
    playerColor,
    isClockEnabled,
    isChess960,
    gameMode,
    isAIThinking,
    premove,

    // 核心状态
    board,
    currentTurn,
    startingTurn,
    startingFullmoveNumber,
    selectedSquare,
    hoverSquare,
    lastMove,
    positionHistory,
    halfmoveClock,

    // 棋钟
    hasGameStarted,
    clockStarted,
    activeClockColor,
    timeoutWinner,
    whiteTimeSeconds,
    blackTimeSeconds,
    clockIncrementSeconds,

    // 历史
    moveHistory,
    boardHistory,
    hasMovedByColor,

    // 终止
    isAgreedDraw,
    hasResigned,

    // Computed
    isDraw,
    isDrawByStalemate,
    isDrawByInsufficientMaterial,
    isDrawByFivefoldRepetition,
    isDrawBy75MoveRule,
    gameEndReason,
    gameWinner,
    gameResult,
    gameStatusMessage,
    isGameOver,
    canInteract,
    canPremove,
    isAITurn,

    // 走棋
    possibleMoves,
    highlightedPositions,
    canMoveTo,
    isSelectedSquare,
    handleSquareClick,
    pushBoardHistory,
    executeMove,

    // 升变
    promotionPending,
    promotionStyle,
    cancelPromotion,
    computePromotionStyle,
    applyPromotion,

    // 拖拽
    isMouseDown,
    isDragging,
    dragStartSquare,
    mousePos,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,

    // 操作
    handleUndo,
    handleResign,
    handleDrawOffer,
    handleRestart,
    handleBackToHome,
    handleGameSetupStart,

    // 远程对局
    isRemote,
    isRemoteHost,
    isRemoteGuest,
    isRemoteMyTurn,
    roomCode,
    remoteRole,
    remoteLinkKind,
    remoteConnected,
    remoteHostColor,
    pendingUndoRequest,
    pendingDrawOffer,
    pendingRematchRequest,
    outgoingRequest,
    setRemoteSender,
    setRemoteLinkKind,
    setRemoteConnected,
    startRemoteHost,
    startRemoteGuest,
    handleRemoteMessage,
    handleRemoteOpponentLeft,
    resetRemoteSession,
    respondToUndoRequest,
    respondToDrawOffer,
    respondToRematchRequest,
    cancelOutgoingRequest,

    // 工具
    getPositionCount,
    playSound,
    stopClock,
  }
}