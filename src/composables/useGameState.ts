import { ref, computed, onUnmounted, type CSSProperties, nextTick } from 'vue'
import type { Board, Color, Piece, Move } from '../models/chess'
import {
  createInitialBoard,
  getEnPassantTarget,
  getLegalMoves,
  isWhiteSquare,
  cloneBoard,
  isKingInCheck,
  isCheckmate,
  isStalemate,
  hasInsufficientMaterial,
  getPositionKey,
  generateMoveNotation,
} from '../models/chess'
import type { GameSetupConfig, AIStyle } from '../components/GameSetup.vue'
import { getPromotionChoice, type AIDifficulty } from '../models/ai'
import type { AIDetailedMove } from '../models/ai'
import AIWorker from '../workers/ai-worker?worker'
import {
  soundMove,
  soundCapture,
  soundCheck,
  soundVictory,
  soundDefeat,
  soundDraw,
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
}

const INITIAL_CLOCK_SECONDS: number | null = null

// ============================================================
// 游戏状态 Composable
// ============================================================
export function useGameState(
  isSoundEnabled: import('vue').Ref<boolean>,
  isFlipped: import('vue').Ref<boolean>,
) {
  // ---- 初始设置 ----
  const showSetup = ref(true)
  const playerColor = ref<Color>('white')
  const isClockEnabled = ref(true)
  const lastSetupConfig = ref<GameSetupConfig | null>(null)

  // ---- 核心游戏状态 ----
  const board = ref<Board>(createInitialBoard())
  const currentTurn = ref<Color>('white')
  const selectedSquare = ref<{ row: number; col: number } | null>(null)
  const hoverSquare = ref<{ row: number; col: number } | null>(null)
  const lastMove = ref<{ from: { row: number; col: number }; to: { row: number; col: number } } | null>(null)
  const positionHistory = ref<string[]>([getPositionKey(board.value, currentTurn.value, lastMove.value)])
  const halfmoveClock = ref<number>(0)

  // ---- 对局历史（用于悔棋） ----
  const moveHistory = ref<string[]>([])
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

  // ---- AI 对战状态 ----
  const gameMode = ref<'ai' | 'human' | 'remote'>('human')
  const aiDifficulty = ref<AIDifficulty>(3)
  const aiStyle = ref<AIStyle>('balanced')
  const isAIThinking = ref(false)
  let aiMoveTimer: number | null = null
  let aiWorker: Worker | null = null

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

  const parseFenToBoard = (fen: string): { board: Board; turn: Color } | null => {
    const parts = fen.trim().split(/\s+/)
    const boardPart = parts[0]
    if (!boardPart) return null

    // 解析走棋方（FEN 第二部分）
    const turnPart = parts[1]
    const fenTurn: Color = turnPart === 'b' ? 'black' : 'white'

    const rows = boardPart.split('/')
    if (rows.length !== 8) return null

    const nextBoard: Board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null))

    for (let rowIndex = 0; rowIndex < 8; rowIndex += 1) {
      let colIndex = 0
      const row = rows[rowIndex]
      if (!row) return null

      for (const char of row) {
        if (/\d/.test(char)) {
          colIndex += Number.parseInt(char, 10)
          continue
        }

        const pieceColor: Color = char === char.toLowerCase() ? 'black' : 'white'
        const pieceTypeMap: Record<string, Piece['type']> = {
          p: 'pawn',
          n: 'knight',
          b: 'bishop',
          r: 'rook',
          q: 'queen',
          k: 'king',
        }
        const pieceType = pieceTypeMap[char.toLowerCase()]
        if (!pieceType) return null

        nextBoard[rowIndex]![colIndex] = { type: pieceType, color: pieceColor, hasMoved: false }
        colIndex += 1
      }

      if (colIndex !== 8) return null
    }

    return { board: nextBoard, turn: fenTurn }
  }

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
    clockStarted.value = false
    activeClockColor.value = null
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
  }

  const startClock = (color: Color) => {
    if (whiteTimeSeconds.value === null || whiteTimeSeconds.value === 0 || isGameOver.value) {
      stopClock()
      return
    }

    stopClock()
    clockStarted.value = true
    activeClockColor.value = color

    clockTimer = window.setInterval(() => {
      if (!clockStarted.value || !activeClockColor.value || isGameOver.value) {
        stopClock()
        return
      }

      if (activeClockColor.value === 'white') {
        if (whiteTimeSeconds.value !== null) {
          whiteTimeSeconds.value = Math.max(0, whiteTimeSeconds.value - 1)
          if (whiteTimeSeconds.value === 0) {
            handleClockTimeout('white')
          }
        }
      } else {
        if (blackTimeSeconds.value !== null) {
          blackTimeSeconds.value = Math.max(0, blackTimeSeconds.value - 1)
          if (blackTimeSeconds.value === 0) {
            handleClockTimeout('black')
          }
        }
      }
    }, 1000)
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

    if (terminalPosition || whiteTimeSeconds.value === 0) {
      stopClock()
      return
    }

    if (hasGameStarted.value) {
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
    } else if (moveHistory.value.length >= 2) {
      hasGameStarted.value = true
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

  const gameStatusMessage = computed(() => {
    if (hasResigned.value) {
      const winner = hasResigned.value === 'white' ? '黑方' : '白方'
      return `${winner}胜利（对手认输）`
    }
    if (timeoutWinner.value) {
      const winner = timeoutWinner.value === 'white' ? '白方' : '黑方'
      return `${winner}胜利（超时）`
    }
    if (isCheckmate(board.value, currentTurn.value)) {
      const winner = currentTurn.value === 'white' ? '黑方' : '白方'
      return `${winner}胜利（将死）`
    }
    if (isDraw.value) {
      return '和棋'
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
  const isAITurn = computed(() => {
    if (gameMode.value !== 'ai') return false
    const aiColor = playerColor.value === 'white' ? 'black' : 'white'
    return currentTurn.value === aiColor
  })

  const canInteract = computed(
    () =>
      !showSetup.value &&
      !isGameOver.value &&
      !isAIThinking.value &&
      !isAITurn.value,
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

  const canMoveTo = (row: number, col: number): boolean =>
    highlightedPositions.value.has(`${row}-${col}`)

  const canPremoveTo = (row: number, col: number): boolean =>
    highlightedPositions.value.has(`${row}-${col}`)

  const isSelectedSquare = (row: number, col: number): boolean =>
    selectedSquare.value?.row === row && selectedSquare.value?.col === col

  const pushBoardHistory = () => {
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

  const executeMove = (nextBoard: Board, move: Move, from: { row: number; col: number }, isPawnMove: boolean, isCapture: boolean) => {
    const sourceRow = nextBoard[from.row]!
    const targetRow = nextBoard[move.row]!
    const selectedPiece = board.value[from.row]?.[from.col]!

    // ---- 执行移动 ----
    if (move.special === 'castle' && move.rookFrom && move.rookTo) {
      const rook = nextBoard[move.rookFrom.row]?.[move.rookFrom.col] ?? null
      targetRow[move.col] = { ...selectedPiece, hasMoved: true }
      sourceRow[from.col] = null
      if (rook) {
        nextBoard[move.rookFrom.row]![move.rookFrom.col] = null
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
    pushBoardHistory()

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

    const matchingMove = legalMoves.find((m) => m.row === to.row && m.col === to.col)

    if (!matchingMove) {
      // premove 不再合法，清除
      premove.value = null
      selectedSquare.value = null
      return
    }

    // 执行 premove
    const targetPiece = board.value[to.row]?.[to.col] ?? null
    const isPawnMove = piece.type === 'pawn'
    const isCapture = targetPiece !== null || matchingMove.special === 'enPassant'

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
      const move = possibleMoves.value.find(
        (candidate) => candidate.row === row && candidate.col === col,
      )
      if (!move) return

      const isPawnMove = selectedPiece.type === 'pawn'
      const isCapture = targetPiece !== null || move.special === 'enPassant'

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

  const applyPromotion = (newType: string) => {
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
    pushBoardHistory()

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

    // 清除 premove
    premove.value = null

    // AI 对战中，悔棋撤回两步（撤消 AI 的走棋 + 玩家的上一步）
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
    stopClock()
    cancelAIMove()
    hasResigned.value = currentTurn.value
    playSound(currentTurn.value === playerColor.value ? 'defeat' : 'victory')
  }

  const handleDrawOffer = (): void => {
    stopClock()
    cancelAIMove()
    isAgreedDraw.value = true
    playSound('draw')
  }

  const handleRestart = (): void => {
    cancelAIMove()
    if (!lastSetupConfig.value) {
      showSetup.value = true
      return
    }

    const config = lastSetupConfig.value

    // 本地双人对战：不交换先手方，白方始终先行，不翻转棋盘
    if (config.gameMode === 'human') {
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
    showSetup.value = true
  }

  // ============================================================
  // 对局初始化
  // ============================================================
  const applyGameSetup = (config: GameSetupConfig) => {
    let initialBoard: Board
    let fenTurn: Color | null = null

    if (config.boardMode === 'standard') {
      initialBoard = createInitialBoard()
    } else {
      const parsed = parseFenToBoard(config.fen)
      if (!parsed) return
      initialBoard = parsed.board
      fenTurn = parsed.turn
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
    const starterColor = fenTurn ?? getStarterColor(config.starter)
    currentTurn.value = starterColor

    // 非 AI 模式下，playerColor 直接等于先手方；AI 模式在下方的代码块中单独处理
    if (config.gameMode !== 'ai') {
      isFlipped.value = starterColor === 'black'
      playerColor.value = starterColor
    }
    selectedSquare.value = null
    hoverSquare.value = null
    lastMove.value = null
    halfmoveClock.value = 0
    premove.value = null

    whiteTimeSeconds.value = config.timeMinutes * 60
    blackTimeSeconds.value = config.timeMinutes * 60
    clockIncrementSeconds.value = config.incrementSeconds

    hasGameStarted.value = false
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

    // ---- AI 先走的触发 ----
    void nextTick(() => {
      checkAndTriggerAI()
    })
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
      pushBoardHistory()

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

    // 模拟 AI 思考延迟（让棋钟有时间走动）
    // 基础延迟 500ms + 根据难度随机追加 0~difficulty*500ms
    const baseDelay = 1000
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
    gameMode,
    isAIThinking,
    premove,

    // 核心状态
    board,
    currentTurn,
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

    // 终止
    isAgreedDraw,
    hasResigned,

    // Computed
    isDraw,
    isDrawByStalemate,
    isDrawByInsufficientMaterial,
    isDrawByFivefoldRepetition,
    isDrawBy75MoveRule,
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

    // 工具
    getPositionCount,
    playSound,
    stopClock,
  }
}