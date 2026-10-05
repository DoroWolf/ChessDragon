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
import { getDifficultyProfile } from '../models/engine/difficulty'
import { buildUciMoveString, resolveMoveFromUci } from '../models/uci'
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

type RemoteRequestKind = 'undo' | 'draw' | 'rematch'

/** 请求被拒绝后的冷却时长（毫秒）：冷却期内只在本机显示「已发送」，不打扰对手 */
const REQUEST_COOLDOWN_MS = 60_000

// 对局结束原因（与文案解耦，供本地化与台词选择使用）
export type GameEndReason = 'resign' | 'timeout' | 'checkmate' | 'draw'

export function useGameState(
  isSoundEnabled: import('vue').Ref<boolean>,
  isFlipped: import('vue').Ref<boolean>,
) {
  const { t } = useI18n()

  const showSetup = ref(true)
  const playerColor = ref<Color>('white')
  const isClockEnabled = ref(true)
  const lastSetupConfig = ref<GameSetupConfig | null>(null)
  const isChess960 = computed(() => lastSetupConfig.value?.boardMode === 'chess960')

  const board = ref<Board>(createInitialBoard())
  const currentTurn = ref<Color>('white')
  const selectedSquare = ref<{ row: number; col: number } | null>(null)
  const hoverSquare = ref<{ row: number; col: number } | null>(null)
  const lastMove = ref<{
    from: { row: number; col: number }
    to: { row: number; col: number }
  } | null>(null)
  const positionHistory = ref<string[]>([
    getPositionKey(board.value, currentTurn.value, lastMove.value),
  ])
  const halfmoveClock = ref<number>(0)
  const startingTurn = ref<Color>('white')
  const startingFullmoveNumber = ref(1)

  const moveHistory = ref<string[]>([])
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
      uciMove: string
    }>
  >([])

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
  // prevBoard 保存「弹出升变选择器之前」的棋盘快照。
  // 选择器出现时，兵已（临时）移动到升变格；取消升变时据此还原：
  // 兵回到原位，若为斜走吃子则被吃的子也一并恢复。
  const promotionPending = ref<null | {
    from: { row: number; col: number }
    to: { row: number; col: number }
    color: Color
    prevBoard: Board
  }>(null)
  const promotionStyle = ref<CSSProperties>({})

  const materialBoard = computed<Board>(() => promotionPending.value?.prevBoard ?? board.value)

  const isMouseDown = ref(false)
  const isDragging = ref(false)
  const dragStartSquare = ref<{ row: number; col: number } | null>(null)
  const dragStartPos = ref({ x: 0, y: 0 })
  const mousePos = ref({ x: 0, y: 0 })
  let wasAlreadySelected = false
  let touchStartSquare: { row: number; col: number } | null = null

  const gameMode = ref<'ai' | 'human' | 'remote'>('human')
  const aiDifficulty = ref<AIDifficulty>(3)
  const aiStyle = ref<AIStyle>('balanced')
  const isAIThinking = ref(false)
  let aiMoveTimer: number | null = null
  let aiWorker: Worker | null = null

  const roomCode = ref<string>('')
  const remoteRole = ref<RemoteRole | null>(null)
  const remoteLinkKind = ref<RemoteLinkKind | null>(null)
  const remoteConnected = ref(false)
  const remoteHostColor = ref<Color>('white')
  const pendingUndoRequest = ref(false)
  const pendingDrawOffer = ref(false)
  const pendingRematchRequest = ref(false)
  const outgoingRequest = ref<'undo' | 'draw' | 'rematch' | null>(null)

  const requestCooldownUntil = ref<Record<RemoteRequestKind, number>>({
    undo: 0,
    draw: 0,
    rematch: 0,
  })
  let outgoingRequestWasSent = false
  let localOnlyRequestTimer: number | null = null

  const isRemote = computed(() => gameMode.value === 'remote')
  const isRemoteHost = computed(() => isRemote.value && remoteRole.value === 'host')
  const isRemoteGuest = computed(() => isRemote.value && remoteRole.value === 'guest')

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
  const premove = ref<{
    from: { row: number; col: number }
    to: { row: number; col: number }
  } | null>(null)

  // 辅助函数
  const getStarterColor = (starter: GameSetupConfig['starter']): Color => {
    if (starter === 'black') return 'black'
    if (starter === 'white') return 'white'
    return Math.random() > 0.5 ? 'white' : 'black'
  }

  const parseFenToBoard = (fen: string) => parseFen(fen)

  // 音效
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

  // 棋钟逻辑
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
    // 升变选择器弹出期间超时：强制取消升变（撤回临时的走子与吃子），
    // 让棋盘恢复到走子前的局面后再结算超时，避免残留未确认的升变局面。
    if (promotionPending.value) {
      cancelPromotion()
      selectedSquare.value = null
    }

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

  const isAITurn = computed(() => {
    if (gameMode.value !== 'ai') return false
    const aiColor = playerColor.value === 'white' ? 'black' : 'white'
    return currentTurn.value === aiColor
  })

  const isRemoteMyTurn = computed(() => isRemote.value && currentTurn.value === playerColor.value)

  const canInteract = computed(
    () =>
      !showSetup.value &&
      !isGameOver.value &&
      !isAIThinking.value &&
      !isAITurn.value &&
      !promotionPending.value &&
      (!isRemote.value || (isRemoteMyTurn.value && remoteConnected.value)),
  )

  const canPremove = computed(
    () =>
      !showSetup.value &&
      !isGameOver.value &&
      !promotionPending.value &&
      isAITurn.value &&
      gameMode.value === 'ai',
  )

  const possibleMoves = computed<Move[]>(() => {
    if (!selectedSquare.value) return []
    if (!canInteract.value && !canPremove.value) return []

    const { row, col } = selectedSquare.value
    const piece = board.value[row]?.[col]
    if (!piece) return []

    if (canPremove.value && piece.color !== playerColor.value) return []

    const enPassantTarget = getEnPassantTarget(lastMove.value)
    return getLegalMoves(board.value, row, col, { lastMove: lastMove.value, enPassantTarget })
  })

  const highlightedPositions = computed(
    () => new Set(possibleMoves.value.map((move) => `${move.row}-${move.col}`)),
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

  const pushBoardHistory = (mover: Color, snapshot?: Board, uciMove = '') => {
    hasMovedByColor.value[mover] = true
    boardHistory.value.push({
      board: cloneBoard(snapshot ?? board.value),
      currentTurn: currentTurn.value,
      lastMove: lastMove.value,
      halfmoveClock: halfmoveClock.value,
      whiteTimeSeconds: whiteTimeSeconds.value,
      blackTimeSeconds: blackTimeSeconds.value,
      hasGameStarted: hasGameStarted.value,
      clockStarted: clockStarted.value,
      activeClockColor: activeClockColor.value,
      timeoutWinner: timeoutWinner.value,
      uciMove,
    })
  }

  const broadcastLocalMove = (
    from: { row: number; col: number },
    to: { row: number; col: number },
    promotion?: PieceType,
  ) => {
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

    const nextTurn = currentTurn.value === 'white' ? 'black' : 'white'
    let checkStatus: 'check' | 'checkmate' | undefined = undefined
    if (isCheckmate(nextBoard, nextTurn)) {
      checkStatus = 'checkmate'
    } else if (isKingInCheck(nextBoard, nextTurn)) {
      checkStatus = 'check'
    }

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
    pushBoardHistory(
      selectedPiece.color,
      undefined,
      buildUciMoveString({
        fromRow: from.row,
        fromCol: from.col,
        toRow: move.row,
        toCol: move.col,
      }),
    )

    board.value = nextBoard
    lastMove.value = {
      from: { row: from.row, col: from.col },
      to: { row: move.row, col: move.col },
    }
    if (isPawnMove || isCapture) {
      halfmoveClock.value = 0
    } else {
      halfmoveClock.value += 1
    }
    positionHistory.value.push(getPositionKey(nextBoard, nextTurn, lastMove.value))
    selectedSquare.value = null
    currentTurn.value = nextTurn

    applyClockAfterMove(selectedPiece.color, nextTurn, nextBoard)
    triggerGameStateAudio(isCapture, nextTurn, nextBoard)

    if (origin === 'local') {
      clearPendingRequestsOnMove()
      broadcastLocalMove({ row: from.row, col: from.col }, { row: move.row, col: move.col })
    }

    void nextTick(() => {
      checkAndTriggerAI()
    })
  }

  const validatePremoveState = () => {
    if (isDragging.value && dragStartSquare.value) {
      const dragPiece = board.value[dragStartSquare.value.row]?.[dragStartSquare.value.col]
      if (!dragPiece || dragPiece.color !== playerColor.value) {
        isMouseDown.value = false
        isDragging.value = false
        dragStartSquare.value = null
        selectedSquare.value = null
        premove.value = null
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }

    if (!premove.value && selectedSquare.value) {
      const sel = selectedSquare.value
      const selPiece = board.value[sel.row]?.[sel.col]
      if (!selPiece || selPiece.color !== playerColor.value) {
        selectedSquare.value = null
      }
    }
  }

  const tryExecutePremove = () => {
    validatePremoveState()

    if (!premove.value) return

    const { from, to } = premove.value
    const piece = board.value[from.row]?.[from.col]

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
      premove.value = null
      selectedSquare.value = null
      return
    }

    const targetPiece = board.value[to.row]?.[to.col] ?? null
    const isPawnMove = piece.type === 'pawn'
    const isCapture =
      matchingMove.special !== 'castle' &&
      (targetPiece !== null || matchingMove.special === 'enPassant')

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
      const selectedPiece = selected ? (board.value[selected.row]?.[selected.col] ?? null) : null

      if (selected && selectedPiece && canPremoveTo(row, col)) {
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
    const selectedPiece = selected ? (board.value[selected.row]?.[selected.col] ?? null) : null

    if (selected && selectedPiece && canMoveTo(row, col)) {
      const move = findMoveForTarget(row, col)
      if (!move) return

      const isPawnMove = selectedPiece.type === 'pawn'
      const isCapture =
        move.special !== 'castle' && (targetPiece !== null || move.special === 'enPassant')

      // ---- 兵升变：先把兵临时移动到升变格，再弹出选择器 ----
      // 这样选择器出现时兵已在底线上；斜走吃子时被吃的子也会随之消失。
      // 若取消升变，则按 prevBoard 原路还原。
      if (isPawnMove && (row === 0 || row === 7)) {
        const prevBoard = board.value
        const tentativeBoard = cloneBoard(board.value)
        tentativeBoard[row]![col] = { ...selectedPiece, hasMoved: true }
        tentativeBoard[selected.row]![selected.col] = null

        board.value = tentativeBoard
        selectedSquare.value = null
        promotionPending.value = {
          from: { row: selected.row, col: selected.col },
          to: { row, col },
          color: selectedPiece.color,
          prevBoard,
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
    const pending = promotionPending.value
    if (pending) {
      // 撤销临时移动：兵原路返回，斜走吃子时被吃的子也随快照一起恢复
      board.value = pending.prevBoard
      selectedSquare.value = pending.from
    }
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

  watch(isFlipped, () => {
    if (promotionPending.value) {
      computePromotionStyle(promotionPending.value.to.row, promotionPending.value.to.col)
    }
  })

  // 对局结束时（认输 / 超时 / 和棋等），强制取消可能残留的升变选择，
  // 避免棋盘停留在未确认的临时走子局面上。（超时路径已同步处理，此处为兜底。）
  watch(isGameOver, (over) => {
    if (over && promotionPending.value) {
      cancelPromotion()
      selectedSquare.value = null
    }
  })

  const applyPromotion = (newType: string, origin: 'local' | 'remote' = 'local') => {
    if (!promotionPending.value) return
    // 以升变选择器弹出前的棋盘为基准计算（此时 board.value 可能已被临时改动）
    const { from, to, prevBoard } = promotionPending.value
    const selectedPiece = prevBoard[from.row]?.[from.col] ?? null
    if (!selectedPiece) {
      cancelPromotion()
      return
    }

    const targetPiece = prevBoard[to.row]?.[to.col] ?? null
    const isCapture = targetPiece !== null

    const nextBoard = cloneBoard(prevBoard)
    nextBoard[to.row]![to.col] = {
      type: newType as Piece['type'],
      color: selectedPiece.color,
      hasMoved: true,
    }
    nextBoard[from.row]![from.col] = null

    const nextTurn = currentTurn.value === 'white' ? 'black' : 'white'

    let checkStatus: 'check' | 'checkmate' | undefined = undefined
    if (isCheckmate(nextBoard, nextTurn)) {
      checkStatus = 'checkmate'
    } else if (isKingInCheck(nextBoard, nextTurn)) {
      checkStatus = 'check'
    }

    const notation = generateMoveNotation(
      prevBoard,
      from.row,
      from.col,
      to.row,
      to.col,
      undefined,
      newType as Piece['type'],
      checkStatus,
    )
    moveHistory.value.push(notation)
    pushBoardHistory(
      selectedPiece.color,
      prevBoard,
      buildUciMoveString({
        fromRow: from.row,
        fromCol: from.col,
        toRow: to.row,
        toCol: to.col,
        promotion: newType,
      }),
    )

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

    if (origin === 'local') {
      clearPendingRequestsOnMove()
      broadcastLocalMove(
        { row: from.row, col: from.col },
        { row: to.row, col: to.col },
        newType as PieceType,
      )
    }

    void nextTick(() => {
      checkAndTriggerAI()
    })
  }

  const handleMouseDown = (row: number, col: number, event: MouseEvent) => {
    if (event.button !== 0) return

    if (!canInteract.value && !canPremove.value) return

    const piece = board.value[row]?.[col]
    const selectedMove = findMoveForTarget(row, col)
    if (piece?.type === 'rook' && selectedMove?.special === 'castle') {
      handleSquareClick(row, col)
      return
    }

    const isPlayerPiece =
      piece && piece.color === (canPremove.value ? playerColor.value : currentTurn.value)

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

  const handleDropResult = (
    from: { row: number; col: number },
    toSquare: { row: number; col: number } | null,
  ) => {
    if (toSquare) {
      if (from.row === toSquare.row && from.col === toSquare.col) {
        if (wasAlreadySelected) selectedSquare.value = null
        return
      }

      if (canMoveTo(toSquare.row, toSquare.col)) {
        handleSquareClick(toSquare.row, toSquare.col)
      } else {
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

    if (!hadDragged) {
      if (wasAlreadySelected) {
        selectedSquare.value = null
        premove.value = null
      }
      return
    }

    if (to) {
      if (from.row === to.row && from.col === to.col) {
        if (wasAlreadySelected) selectedSquare.value = null
        return
      }

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

      handleDropResult(from, to)
    } else {
      selectedSquare.value = null
      premove.value = null
    }
  }

  const findSquareFromPoint = (
    clientX: number,
    clientY: number,
  ): { row: number; col: number } | null => {
    const el = document.elementFromPoint(clientX, clientY)
    if (!el) return null

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
    if (!canInteract.value && !canPremove.value) return

    const piece = board.value[row]?.[col]
    const selectedMove = findMoveForTarget(row, col)
    if (piece?.type === 'rook' && selectedMove?.special === 'castle') {
      handleSquareClick(row, col)
      return
    }
    const isPlayerPiece =
      piece && piece.color === (canPremove.value ? playerColor.value : currentTurn.value)

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

    if (!hadDragged) {
      if (wasAlreadySelected) {
        selectedSquare.value = null
        premove.value = null
      } else {
        selectedSquare.value = { row: from.row, col: from.col }
      }
      return
    }

    if (to) {
      if (from.row === to.row && from.col === to.col) {
        if (wasAlreadySelected) selectedSquare.value = null
        return
      }

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

      handleDropResult(from, to)
    } else {
      selectedSquare.value = null
      premove.value = null
    }
  }

  const handleUndo = (): void => {
    if (boardHistory.value.length === 0) return

    if (isRemote.value) {
      if (outgoingRequest.value !== null || pendingUndoRequest.value) return
      if (beginRemoteRequest('undo')) {
        sendRemote({ type: 'undo-request' })
      }
      return
    }

    premove.value = null

    // AI 对局中，悔棋撤回两步（撤消 AI 的走棋 + 玩家的上一步）
    if (gameMode.value === 'ai') {
      cancelAIMove()

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

      if (boardHistory.value.length > 0) {
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

    if (!isGameOver.value && boardHistory.value.length >= 0) {
      if (!hasGameStarted.value) {
        hasGameStarted.value = true
      }
      if (!clockStarted.value && isClockEnabled.value) {
        startClock(currentTurn.value)
      }
    }
  }

  const restoreHistoryState = (state: NonNullable<(typeof boardHistory.value)[number]>) => {
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

    lastSetupConfig.value = config

    gameMode.value = config.gameMode
    if (config.gameMode === 'ai') {
      aiDifficulty.value = config.difficulty as AIDifficulty
      aiStyle.value = config.aiStyle
    }

    isClockEnabled.value = config.timeMinutes > 0

    board.value = initialBoard

    const fenTurn = fenPosition?.turn ?? null
    const starterColor =
      config.gameMode === 'remote'
        ? (fenTurn ?? 'white')
        : (fenTurn ?? getStarterColor(config.starter))
    currentTurn.value = starterColor
    startingFullmoveNumber.value = fenPosition?.fullmoveNumber ?? 1

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

    void nextTick(() => {
      checkAndTriggerAI()
    })
  }
  const applyRemoteColors = (hostColor: Color) => {
    remoteHostColor.value = hostColor
    playerColor.value =
      remoteRole.value === 'host' ? hostColor : hostColor === 'white' ? 'black' : 'white'
    isFlipped.value = playerColor.value === 'black'
  }

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

  const handleRemoteOpponentLeft = () => {
    remoteConnected.value = false
    stopClock()
  }

  const clearRemoteRequestState = () => {
    finishOutgoingRequest()
    pendingUndoRequest.value = false
    pendingDrawOffer.value = false
    pendingRematchRequest.value = false
  }

  const resetRemoteSession = () => {
    stopClock()
    remoteConnected.value = false
    remoteRole.value = null
    remoteLinkKind.value = null
    roomCode.value = ''
    clearRemoteRequestState()
    requestCooldownUntil.value = { undo: 0, draw: 0, rematch: 0 }
  }

  const applyRemoteClock = (snapshot: ClockSnapshot) => {
    whiteTimeSeconds.value = snapshot.whiteTimeSeconds
    blackTimeSeconds.value = snapshot.blackTimeSeconds
    hasGameStarted.value = snapshot.hasGameStarted

    // 房主已判定超时：同步强制取消本地可能存在的升变选择，恢复走子前局面
    if (snapshot.timeoutWinner && promotionPending.value) {
      cancelPromotion()
      selectedSquare.value = null
    }

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
      promotionPending.value = { from, to, color: piece.color, prevBoard: board.value }
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

    if (expectedPositionKey) {
      const localKey = getPositionKey(board.value, currentTurn.value, lastMove.value)
      if (localKey !== expectedPositionKey) {
        console.error('[remote] 局面不同步，请重新开始对局')
      }
    }
  }

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

  const executeAIMoveOnBoard = (aiMove: AIDetailedMove) => {
    const from = { row: aiMove.fromRow, col: aiMove.fromCol }
    const piece = board.value[aiMove.fromRow]?.[aiMove.fromCol]
    if (!piece) return

    const isPawnMove = piece.type === 'pawn'
    const targetPiece = board.value[aiMove.toRow]?.[aiMove.toCol]
    const isCapture = targetPiece !== null || aiMove.special === 'enPassant'

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
      pushBoardHistory(
        piece.color,
        undefined,
        buildUciMoveString({
          fromRow: aiMove.fromRow,
          fromCol: aiMove.fromCol,
          toRow: aiMove.toRow,
          toCol: aiMove.toCol,
          promotion: newType,
        }),
      )

      board.value = nextBoard
      lastMove.value = {
        from: { row: aiMove.fromRow, col: aiMove.fromCol },
        to: { row: aiMove.toRow, col: aiMove.toCol },
      }
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

  const parseBestmoveLine = (line: string): string | null => {
    const match = /^bestmove\s+(\S+)/i.exec(line.trim())
    return match ? match[1]! : null
  }

  const buildAiUciCommands = (aiTimeRemainingMs: number | null): string[] => {
    const config = lastSetupConfig.value
    const moves = boardHistory.value.map((entry) => entry.uciMove).filter((uci) => uci.length > 0)

    let positionCommand: string
    if (config && config.boardMode !== 'standard' && config.fen) {
      positionCommand = `position fen ${config.fen}`
    } else {
      positionCommand = 'position startpos'
    }
    if (moves.length > 0) {
      positionCommand += ` moves ${moves.join(' ')}`
    }

    const baseTime = getDifficultyProfile(aiDifficulty.value).moveTimeMs
    let timeLimit: number
    if (aiTimeRemainingMs === null) {
      timeLimit = baseTime
    } else if (aiTimeRemainingMs < 10_000) {
      timeLimit = Math.min(baseTime, 50)
    } else if (aiTimeRemainingMs < 30_000) {
      timeLimit = Math.max(30, baseTime * 0.25)
    } else if (aiTimeRemainingMs < 60_000) {
      timeLimit = Math.max(40, baseTime * 0.5)
    } else {
      timeLimit = baseTime
    }

    return [
      `setoption name Level value ${aiDifficulty.value}`,
      `setoption name Style value ${aiStyle.value}`,
      positionCommand,
      `go movetime ${Math.max(1, Math.round(timeLimit))}`,
    ]
  }

  const scheduleAIMove = () => {
    if (isGameOver.value) return
    if (gameMode.value !== 'ai') return

    const aiColor = playerColor.value === 'white' ? 'black' : 'white'
    if (currentTurn.value !== aiColor) return

    cancelAIMove()
    isAIThinking.value = true

    const aiTimeRemainingSec = aiColor === 'white' ? whiteTimeSeconds.value : blackTimeSeconds.value
    const aiTimeRemainingMs = aiTimeRemainingSec !== null ? aiTimeRemainingSec * 1000 : null

    // 模拟 AI 思考延迟（让棋钟有时间走动）
    // 基础延迟 1000ms + 根据难度随机追加，并根据剩余时间动态缩减
    let baseDelay = 1000
    if (aiTimeRemainingMs !== null) {
      if (aiTimeRemainingMs < 10_000) {
        baseDelay = 100 // 不足 10 秒：几乎立即响应
      } else if (aiTimeRemainingMs < 30_000) {
        baseDelay = 200 // 不足 30 秒：快速响应
      } else if (aiTimeRemainingMs < 60_000) {
        baseDelay = 500 // 不足 60 秒：较快响应
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

      const currentKey = getPositionKey(board.value, currentTurn.value, lastMove.value)
      const positionRepeatCount = positionHistory.value.filter((key) => key === currentKey).length

      if (positionRepeatCount >= 3 || halfmoveClock.value >= 100) {
        isAIThinking.value = false
        stopClock()
        isAgreedDraw.value = true
        playSound('draw')
        return
      }

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

      aiWorker.onmessage = (e: MessageEvent<string>) => {
        const line = typeof e.data === 'string' ? e.data : ''
        const uci = parseBestmoveLine(line)
        if (uci === null) return

        aiWorker?.terminate()
        aiWorker = null
        isAIThinking.value = false

        if (uci === '0000') return

        const resolved = resolveMoveFromUci(board.value, aiColor, lastMove.value, uci)
        if (!resolved) return

        const savedSelectedSquare = selectedSquare.value
        const savedPremove = premove.value
        const savedIsDragging = isDragging.value
        const savedDragStartSquare = dragStartSquare.value
        const savedIsMouseDown = isMouseDown.value

        executeAIMoveOnBoard(resolved)

        const resultingPositionKey = getPositionKey(board.value, currentTurn.value, lastMove.value)
        if (
          !isGameOver.value &&
          positionHistory.value.filter((key) => key === resultingPositionKey).length >= 3
        ) {
          stopClock()
          isAgreedDraw.value = true
          playSound('draw')
        }

        selectedSquare.value = savedSelectedSquare
        premove.value = savedPremove
        isDragging.value = savedIsDragging
        dragStartSquare.value = savedDragStartSquare
        isMouseDown.value = savedIsMouseDown

        if (!isGameOver.value && gameMode.value === 'ai') {
          void nextTick(() => {
            tryExecutePremove()
          })
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

      try {
        for (const command of buildAiUciCommands(aiTimeRemainingMs)) {
          aiWorker.postMessage(command)
        }
      } catch (err) {
        console.error('Failed to post UCI command to AI Worker:', err)
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

  onUnmounted(() => {
    stopClock()
    cancelAIMove()
  })

  return {
    showSetup,
    playerColor,
    isClockEnabled,
    isChess960,
    gameMode,
    isAIThinking,
    premove,

    board,
    currentTurn,
    startingTurn,
    startingFullmoveNumber,
    selectedSquare,
    hoverSquare,
    lastMove,
    positionHistory,
    halfmoveClock,

    hasGameStarted,
    clockStarted,
    activeClockColor,
    timeoutWinner,
    whiteTimeSeconds,
    blackTimeSeconds,
    clockIncrementSeconds,

    moveHistory,
    boardHistory,
    hasMovedByColor,

    isAgreedDraw,
    hasResigned,

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

    possibleMoves,
    highlightedPositions,
    canMoveTo,
    isSelectedSquare,
    handleSquareClick,
    pushBoardHistory,
    executeMove,

    promotionPending,
    promotionStyle,
    materialBoard,
    cancelPromotion,
    computePromotionStyle,
    applyPromotion,

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

    handleUndo,
    handleResign,
    handleDrawOffer,
    handleRestart,
    handleBackToHome,
    handleGameSetupStart,

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

    getPositionCount,
    playSound,
    stopClock,
  }
}
