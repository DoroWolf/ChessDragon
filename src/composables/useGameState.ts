import { ref, computed, onUnmounted, type CSSProperties } from 'vue'
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
import type { GameSetupConfig } from '../components/GameSetup.vue'

// ============================================================
// 音频资源（模块级，避免重复创建 Audio 对象）
// ============================================================
const sounds = {
  move: new Audio('./sound/Move.ogg'),
  capture: new Audio('./sound/Capture.ogg'),
  check: new Audio('./sound/Check.ogg'),
  victory: new Audio('./sound/Victory.ogg'),
  defeat: new Audio('./sound/Defeat.ogg'),
  draw: new Audio('./sound/Draw.ogg'),
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

  // ============================================================
  // 辅助函数
  // ============================================================
  const getStarterColor = (starter: GameSetupConfig['starter']): Color => {
    if (starter === 'black') return 'black'
    if (starter === 'white') return 'white'
    return Math.random() > 0.5 ? 'white' : 'black'
  }

  const parseFenToBoard = (fen: string): Board | null => {
    const parts = fen.trim().split(/\s+/)
    const boardPart = parts[0]
    if (!boardPart) return null

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

    return nextBoard
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
      const winner = hasResigned.value === 'white' ? '黑棋' : '白棋'
      return `${winner}胜利（对手认输）`
    }
    if (timeoutWinner.value) {
      const winner = timeoutWinner.value === 'white' ? '白棋' : '黑棋'
      return `${winner}胜利（超时）`
    }
    if (isCheckmate(board.value, currentTurn.value)) {
      const winner = currentTurn.value === 'white' ? '黑棋' : '白棋'
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

  const canInteract = computed(() => !showSetup.value && !isGameOver.value)

  // ============================================================
  // 走棋逻辑
  // ============================================================
  const possibleMoves = computed<Move[]>(() => {
    if (!canInteract.value || !selectedSquare.value) return []
    const { row, col } = selectedSquare.value
    const enPassantTarget = getEnPassantTarget(lastMove.value)
    return getLegalMoves(board.value, row, col, { lastMove: lastMove.value, enPassantTarget })
  })

  const highlightedPositions = computed(() =>
    new Set(possibleMoves.value.map((move) => `${move.row}-${move.col}`)),
  )

  const canMoveTo = (row: number, col: number): boolean =>
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
  }

  const handleSquareClick = (row: number, col: number): void => {
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

      const nextBoard = cloneBoard(board.value)
      executeMove(nextBoard, move, { row: selected.row, col: selected.col }, isPawnMove, isCapture)
    } else {
      // ---- 选中/取消选中 ----
      if (targetPiece && targetPiece.color === currentTurn.value) {
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
  }

  // ============================================================
  // 拖拽处理
  // ============================================================
  const handleMouseDown = (row: number, col: number, event: MouseEvent) => {
    if (event.button !== 0) return
    if (!canInteract.value) return

    const piece = board.value[row]?.[col]

    if (piece && piece.color === currentTurn.value) {
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

  const handleMouseUpResult = (toSquare: { row: number; col: number } | null) => {
    // 被外部（hoverSquare 或 set null）调用，处理拖拽松手后的逻辑
    const from = dragStartSquare.value

    if (!from) return

    if (toSquare) {
      if (from.row === toSquare.row && from.col === toSquare.col) {
        if (wasAlreadySelected) selectedSquare.value = null
        return
      }

      if (canMoveTo(toSquare.row, toSquare.col)) {
        handleSquareClick(toSquare.row, toSquare.col)
      } else {
        const targetPiece = board.value[toSquare.row]?.[toSquare.col]
        if (targetPiece && targetPiece.color === currentTurn.value) {
          selectedSquare.value = { row: toSquare.row, col: toSquare.col }
        } else {
          selectedSquare.value = null
        }
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
      }
      return
    }

    if (to) {
      if (from.row === to.row && from.col === to.col) {
        if (wasAlreadySelected) selectedSquare.value = null
        return
      }

      if (canMoveTo(to.row, to.col)) {
        handleSquareClick(to.row, to.col)
      } else {
        const targetPiece = board.value[to.row]?.[to.col]
        if (targetPiece && targetPiece.color === currentTurn.value) {
          selectedSquare.value = { row: to.row, col: to.col }
        } else {
          selectedSquare.value = null
        }
      }
    } else {
      selectedSquare.value = null
    }
  }

  // ============================================================
  // 游戏操作：悔棋 / 认输 / 和棋 / 重新开始
  // ============================================================
  const handleUndo = (): void => {
    if (boardHistory.value.length === 0) return

    const previousState = boardHistory.value.pop()
    if (!previousState) return

    board.value = previousState.board
    currentTurn.value = previousState.currentTurn
    lastMove.value = previousState.lastMove
    halfmoveClock.value = previousState.halfmoveClock
    whiteTimeSeconds.value = previousState.whiteTimeSeconds
    blackTimeSeconds.value = previousState.blackTimeSeconds
    timeoutWinner.value = previousState.timeoutWinner

    if (hasGameStarted.value) {
      startClock(previousState.currentTurn)
    } else {
      stopClock()
    }

    moveHistory.value.pop()

    if (positionHistory.value.length > 1) {
      positionHistory.value.pop()
    }

    selectedSquare.value = null
    promotionPending.value = null
    promotionStyle.value = {}
  }

  const handleResign = (): void => {
    stopClock()
    hasResigned.value = currentTurn.value
    playSound(currentTurn.value === playerColor.value ? 'defeat' : 'victory')
  }

  const handleDrawOffer = (): void => {
    stopClock()
    isAgreedDraw.value = true
    playSound('draw')
  }

  const handleRestart = (): void => {
    // 重赛：沿用上次设置，黑白调换
    if (!lastSetupConfig.value) {
      // 没有上次配置，回退到显示设置
      showSetup.value = true
      return
    }

    const config = lastSetupConfig.value
    const swappedStarter: GameSetupConfig['starter'] =
      config.starter === 'black' ? 'white' : config.starter === 'white' ? 'black' : config.starter
    const swappedConfig: GameSetupConfig = { ...config, starter: swappedStarter }

    applyGameSetup(swappedConfig)
  }

  const handleBackToSetup = (): void => {
    // 回到对局设置：直接显示设置画面，不清除棋盘状态
    showSetup.value = true
  }

  // ============================================================
  // 对局初始化
  // ============================================================
  const applyGameSetup = (config: GameSetupConfig) => {
    const parsedBoard =
      config.boardMode === 'custom' ? parseFenToBoard(config.fen) : createInitialBoard()
    if (!parsedBoard) return

    // 保存本次配置，供重赛使用
    lastSetupConfig.value = config

    isClockEnabled.value = config.timeMinutes > 0

    const starterColor = getStarterColor(config.starter)
    // 先手为黑方时，自动翻转棋盘
    isFlipped.value = starterColor === 'black'
    playerColor.value = starterColor

    board.value = parsedBoard
    currentTurn.value = starterColor
    selectedSquare.value = null
    hoverSquare.value = null
    lastMove.value = null
    halfmoveClock.value = 0

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
  })

  // ============================================================
  // 导出
  // ============================================================
  return {
    // 设置
    showSetup,
    playerColor,
    isClockEnabled,

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

    // 操作
    handleUndo,
    handleResign,
    handleDrawOffer,
    handleRestart,
    handleBackToSetup,
    handleGameSetupStart,

    // 工具
    getPositionCount,
    playSound,
    stopClock,
  }
}