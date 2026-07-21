<template>
  <section class="game-container" :class="{ 'global-dragging': isMouseDown && dragStartSquare }"
    :style="{ '--piece-scale': pieceScale }">

    <!-- 棋盘主面板 -->
    <div class="game-panel">
      <!-- 控制面板 / 翻转按钮 -->
      <div class="controls">
        <button class="flip-btn" type="button" @click="isFlipped = !isFlipped">
          🔄 翻转棋盘
        </button>
      </div>

      <div class="board-frame">
        <div class="board-grid" ref="boardGridRef">
          <template v-for="displayRow in 8" :key="`rank-${displayRow}`">
            <button v-for="displayCol in 8" :key="`${displayRow}-${displayCol}`" type="button" class="board-square"
              :class="{ 'draggable-piece': board[getActualRow(displayRow - 1)]?.[getActualCol(displayCol - 1)]?.color === currentTurn }"
              @mousedown="handleMouseDown(getActualRow(displayRow - 1), getActualCol(displayCol - 1), $event)"
              @mouseenter="hoverSquare = { row: getActualRow(displayRow - 1), col: getActualCol(displayCol - 1) }"
              @mouseleave="hoverSquare = null"
              :aria-label="getSquareLabel(getActualRow(displayRow - 1), getActualCol(displayCol - 1))">

              <img class="square-background base" draggable="false"
                :src="isWhiteSquare(getActualRow(displayRow - 1), getActualCol(displayCol - 1)) ? '/texture/board/board_white.png' : '/texture/board/board_black.png'"
                alt="" />

              <img v-if="getOverlayTexture(getActualRow(displayRow - 1), getActualCol(displayCol - 1))"
                class="square-background overlay" draggable="false"
                :src="getOverlayTexture(getActualRow(displayRow - 1), getActualCol(displayCol - 1))!" alt="" />

              <img v-if="board[getActualRow(displayRow - 1)]?.[getActualCol(displayCol - 1)]" class="piece"
                draggable="false" :class="{
                  'dragging-hidden': isDragging && dragStartSquare?.row === getActualRow(displayRow - 1) && dragStartSquare?.col === getActualCol(displayCol - 1)
                }" :src="getPieceImage(board[getActualRow(displayRow - 1)]?.[getActualCol(displayCol - 1)]!)"
                :alt="board[getActualRow(displayRow - 1)]?.[getActualCol(displayCol - 1)]!.type" />

              <div v-if="displayCol === 1" class="coordinate-label rank"
                :class="isWhiteSquare(getActualRow(displayRow - 1), getActualCol(displayCol - 1)) ? 'text-black' : 'text-white'">
                {{ 8 - getActualRow(displayRow - 1) }}
              </div>

              <div v-if="displayRow === 8" class="coordinate-label file"
                :class="isWhiteSquare(getActualRow(displayRow - 1), getActualCol(displayCol - 1)) ? 'text-black' : 'text-white'">
                {{ String.fromCharCode(97 + getActualCol(displayCol - 1)) }}
              </div>
            </button>
          </template>
          <div v-if="promotionPending" class="promotion-overlay" @click="cancelPromotion"></div>
          <Promotion v-if="promotionPending" :color="promotionPending.color" :style="promotionStyle"
            @select="applyPromotion" />
        </div>
      </div>

      <img v-if="isDragging && dragStartSquare" class="floating-piece" draggable="false"
        :src="getPieceImage(board[dragStartSquare.row]?.[dragStartSquare.col]!)"
        :style="{ left: mousePos.x + 'px', top: mousePos.y + 'px' }" alt="" />
    </div>

    <!-- 侧边栏 -->
    <Sidebar :move-history="moveHistory" :current-turn="currentTurn" :game-status="gameStatusMessage"
      :halfmove-clock="halfmoveClock" :position-count="getPositionCount()" :is-game-over="isGameOver" @undo="handleUndo"
      @draw="handleDrawOffer" @resign="handleResign" @restart="handleRestart" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { Board, Color, Piece, Move } from './models/chess'
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
} from './models/chess'
import Promotion from './components/Promotion.vue'
import Sidebar from './components/Sidebar.vue'

// --- 棋盘翻转控制 ---
const isFlipped = ref(false)

/** 视觉坐标转为逻辑坐标（行） */
const getActualRow = (displayRow: number): number => {
  return isFlipped.value ? 7 - displayRow : displayRow
}

/** 视觉坐标转为逻辑坐标（列） */
const getActualCol = (displayCol: number): number => {
  return isFlipped.value ? 7 - displayCol : displayCol
}

// --- 音效載入與播放邏輯 ---
const sounds = {
  move: new Audio('./sound/Move.ogg'),
  capture: new Audio('./sound/Capture.ogg'),
  check: new Audio('./sound/Check.ogg'),
  victory: new Audio('./sound/Victory.ogg'),
  defeat: new Audio('./sound/Defeat.ogg'),
  draw: new Audio('./sound/Draw.ogg'),
}

/** 播放指定音效，若前一次播放尚未結束會自動重設時間 */
const playSound = (soundName: keyof typeof sounds) => {
  const audio = sounds[soundName]
  if (audio) {
    audio.currentTime = 0
    audio.play().catch(() => {
      // 防止瀏覽器未互動時阻擋自動播放
    })
  }
}

// 玩家掌控的角色顏色（預設為白棋，可依據你的遊戲設計調整）
const playerColor = ref<Color>('white')

const board = ref<Board>(createInitialBoard())
const currentTurn = ref<Color>('white')
const selectedSquare = ref<{ row: number; col: number } | null>(null)
const hoverSquare = ref<{ row: number; col: number } | null>(null)
const boardGridRef = ref<HTMLElement | null>(null)
const lastMove = ref<{ from: { row: number; col: number }; to: { row: number; col: number } } | null>(null)
const positionHistory = ref<string[]>([getPositionKey(board.value, currentTurn.value, lastMove.value)])
const halfmoveClock = ref<number>(0)

// 走棋记录和棋盘历史（用于悔棋）
const moveHistory = ref<string[]>([])
const boardHistory = ref<Array<{ board: Board; currentTurn: Color; lastMove: { from: { row: number; col: number }; to: { row: number; col: number } } | null; halfmoveClock: number }>>([])

// 游戏状态
const isAgreedDraw = ref(false)
const hasResigned = ref<Color | null>(null)
const gameStatusMessage = computed(() => {
  if (hasResigned.value) {
    const winner = hasResigned.value === 'white' ? '黑棋' : '白棋'
    return `${winner}胜利（对手投降）`
  }

  if (isCheckmate(board.value, currentTurn.value)) {
    const winner = currentTurn.value === 'white' ? '黑棋' : '白棋'
    return `${winner}胜利（将死）`
  }

  if (isDraw.value) {
    return '游戏和棋'
  }

  return undefined
})

const promotionPending = ref<null | { from: { row: number; col: number }; to: { row: number; col: number }; color: Color }>(null)
const promotionStyle = ref<Record<string, any>>({})

const isMouseDown = ref(false)
const isDragging = ref(false)
const dragStartSquare = ref<{ row: number; col: number } | null>(null)
const dragStartPos = ref({ x: 0, y: 0 })
const mousePos = ref({ x: 0, y: 0 })
let wasAlreadySelected = false

const possibleMoves = computed<Move[]>(() => {
  if (!canInteract.value || !selectedSquare.value) {
    return []
  }
  const { row, col } = selectedSquare.value
  const enPassantTarget = getEnPassantTarget(lastMove.value)
  return getLegalMoves(board.value, row, col, { lastMove: lastMove.value, enPassantTarget })
})

const highlightedPositions = computed(() => new Set(possibleMoves.value.map((move) => `${move.row}-${move.col}`)))

const isSelectedSquare = (row: number, col: number): boolean => {
  return selectedSquare.value?.row === row && selectedSquare.value?.col === col
}

const getPieceImage = (piece: Piece): string => {
  if (piece.type === 'king') {
    if (isDraw.value) {
      return `/texture/pieces/king_draw_${piece.color}.png`
    }
    if (hasResigned.value) {
      if (piece.color === hasResigned.value) {
        return `/texture/pieces/king_checkmate_${piece.color}.png`
      }
    }
    if (isCheckmate(board.value, piece.color)) {
      return `/texture/pieces/king_checkmate_${piece.color}.png`
    }
    if (isKingInCheck(board.value, piece.color)) {
      return `/texture/pieces/king_check_${piece.color}.png`
    }
  }
  return `/texture/pieces/${piece.type}_${piece.color}.png`
}

const isDrawByStalemate = computed(
  () =>
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

const isGameOver = computed(() => {
  return (
    !!hasResigned.value || // 包含投降
    isDraw.value ||        // 包含和棋（包含了 isAgreedDraw 及各種規則和棋）
    isCheckmate(board.value, currentTurn.value) // 包含將死
  )
})
const canInteract = computed(() => !isGameOver.value)

/**
 * 走棋後判斷局勢並播放相對應的音效
 */
const triggerGameStateAudio = (isCapture: boolean, nextTurn: Color, nextBoard: Board) => {
  // 1. 判斷是否將死
  if (isCheckmate(nextBoard, nextTurn)) {
    // 被將死者為 nextTurn，若 nextTurn 是我方代表我方輸了
    if (nextTurn === playerColor.value) {
      playSound('defeat')
    } else {
      playSound('victory')
    }
    return
  }

  // 2. 判斷是否和棋
  const checkDraw =
    isStalemate(nextBoard, nextTurn, { lastMove: lastMove.value, enPassantTarget: getEnPassantTarget(lastMove.value) }) ||
    hasInsufficientMaterial(nextBoard) ||
    halfmoveClock.value >= 150
  if (checkDraw) {
    playSound('draw')
    return
  }

  // 3. 判斷是否將軍
  if (isKingInCheck(nextBoard, nextTurn)) {
    playSound('check')
    return
  }

  // 4. 判斷吃子或一般走棋
  if (isCapture) {
    playSound('capture')
  } else {
    playSound('move')
  }
}

const getOverlayTexture = (row: number, col: number): string | null => {
  if (isSelectedSquare(row, col)) {
    return '/texture/board/board_hover.png'
  }

  const move = possibleMoves.value.find((candidate) => candidate.row === row && candidate.col === col)

  if (move) {
    if (isDragging.value && hoverSquare.value?.row === row && hoverSquare.value?.col === col) {
      return '/texture/board/board_hover.png'
    }

    const targetPiece = board.value[row]?.[col] ?? null
    if (targetPiece !== null) {
      return '/texture/board/board_capture.png'
    }
    return '/texture/board/board_placeable.png'
  }

  return null
}

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
  nextBoard[to.row]![to.col] = { type: newType as any, color: selectedPiece.color, hasMoved: true }
  nextBoard[from.row]![from.col] = null

  const nextTurn = currentTurn.value === 'white' ? 'black' : 'white'

  // 记录走棋
  const notation = generateMoveNotation(
    board.value,
    from.row,
    from.col,
    to.row,
    to.col,
    undefined,
    newType as any,
  )
  moveHistory.value.push(notation)
  boardHistory.value.push({
    board: cloneBoard(board.value),
    currentTurn: currentTurn.value,
    lastMove: lastMove.value,
    halfmoveClock: halfmoveClock.value,
  })

  board.value = nextBoard
  lastMove.value = { from: { row: from.row, col: from.col }, to: { row: to.row, col: to.col } }
  halfmoveClock.value = 0
  positionHistory.value.push(getPositionKey(nextBoard, nextTurn, lastMove.value))
  promotionPending.value = null
  promotionStyle.value = {}
  selectedSquare.value = null
  currentTurn.value = nextTurn

  // 升變完成後觸發音效
  triggerGameStateAudio(isCapture, nextTurn, nextBoard)
}

const canMoveTo = (row: number, col: number): boolean => highlightedPositions.value.has(`${row}-${col}`)

const getSquareLabel = (row: number, col: number): string => {
  const file = String.fromCharCode(97 + col)
  const rank = 8 - row
  return `${file}${rank}`
}

const handleSquareClick = (row: number, col: number): void => {
  if (!canInteract.value) return

  const targetPiece = board.value[row]?.[col] ?? null
  const selected = selectedSquare.value
  const selectedPiece = selected ? board.value[selected.row]?.[selected.col] ?? null : null

  if (selected && selectedPiece && canMoveTo(row, col)) {
    const move = possibleMoves.value.find((candidate) => candidate.row === row && candidate.col === col)
    const nextBoard = cloneBoard(board.value)
    const targetRow = nextBoard[row]!
    const sourceRow = nextBoard[selected.row]!
    const isPawnMove = selectedPiece.type === 'pawn'
    const isCapture = targetPiece !== null || move?.special === 'enPassant'
    const nextTurn = currentTurn.value === 'white' ? 'black' : 'white'

    if (isPawnMove && (row === 0 || row === 7)) {
      promotionPending.value = { from: { row: selected.row, col: selected.col }, to: { row, col }, color: selectedPiece.color }
      void computePromotionStyle(row, col)
      return
    }

    if (move?.special === 'castle' && move.rookFrom && move.rookTo) {
      const rook = nextBoard[move.rookFrom.row]?.[move.rookFrom.col] ?? null
      targetRow[col] = { ...selectedPiece, hasMoved: true }
      sourceRow[selected.col] = null
      if (rook) {
        nextBoard[move.rookFrom.row]![move.rookFrom.col] = null
        nextBoard[move.rookTo.row]![move.rookTo.col] = { ...rook, hasMoved: true }
      }
    } else if (move?.special === 'enPassant') {
      targetRow[col] = { ...selectedPiece, hasMoved: true }
      sourceRow[selected.col] = null
      nextBoard[selected.row]![col] = null
    } else {
      targetRow[col] = { ...selectedPiece, hasMoved: true }
      sourceRow[selected.col] = null
    }

    // 记录走棋
    const notation = generateMoveNotation(
      board.value,
      selected.row,
      selected.col,
      row,
      col,
      move?.special,
    )
    moveHistory.value.push(notation)
    boardHistory.value.push({
      board: cloneBoard(board.value),
      currentTurn: currentTurn.value,
      lastMove: lastMove.value,
      halfmoveClock: halfmoveClock.value,
    })

    board.value = nextBoard
    lastMove.value = { from: { row: selected.row, col: selected.col }, to: { row, col } }
    if (isPawnMove || isCapture) {
      halfmoveClock.value = 0
    } else {
      halfmoveClock.value += 1
    }
    positionHistory.value.push(getPositionKey(nextBoard, nextTurn, lastMove.value))
    selectedSquare.value = null
    currentTurn.value = nextTurn

    // 觸發對應音效
    triggerGameStateAudio(isCapture, nextTurn, nextBoard)
  } else {
    if (targetPiece && targetPiece.color === currentTurn.value) {
      selectedSquare.value = { row, col }
    } else {
      selectedSquare.value = null
    }
  }
}

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

const pieceScale = ref(1.5)
let boardResizeObserver: ResizeObserver | null = null

const updatePieceScale = () => {
  if (boardGridRef.value) {
    const currentSquareWidth = boardGridRef.value.clientWidth / 8
    const baseSquareSize = 90
    const baseScale = 1.5
    pieceScale.value = (currentSquareWidth / baseSquareSize) * baseScale
  }
}

onMounted(() => {
  updatePieceScale()
  if (boardGridRef.value) {
    boardResizeObserver = new ResizeObserver(updatePieceScale)
    boardResizeObserver.observe(boardGridRef.value)
  }
})

onUnmounted(() => {
  if (boardResizeObserver) {
    boardResizeObserver.disconnect()
  }
})

const getPositionCount = (): number => {
  const currentKey = getPositionKey(board.value, currentTurn.value, lastMove.value)
  return positionHistory.value.filter((key) => key === currentKey).length
}

const handleUndo = (): void => {
  if (boardHistory.value.length === 0) return

  const previousState = boardHistory.value.pop()
  if (!previousState) return

  board.value = previousState.board
  currentTurn.value = previousState.currentTurn
  lastMove.value = previousState.lastMove
  halfmoveClock.value = previousState.halfmoveClock

  moveHistory.value.pop()

  // 从位置历史中移除最后一个位置
  if (positionHistory.value.length > 1) {
    positionHistory.value.pop()
  }

  selectedSquare.value = null
  promotionPending.value = null
  promotionStyle.value = {}
}

const handleResign = (): void => {
  hasResigned.value = currentTurn.value

  // 播放音效
  if (currentTurn.value === playerColor.value) {
    playSound('defeat')
  } else {
    playSound('victory')
  }
}

const handleDrawOffer = (): void => {
  isAgreedDraw.value = true
  playSound('draw')
}

const handleRestart = (): void => {
  // 1. 重置棋盘与回合
  board.value = createInitialBoard()
  currentTurn.value = 'white'

  // 2. 自动翻转棋盘
  isFlipped.value = !isFlipped.value

  // 3. 将己方颜色切换为黑方（或在白/黑之间自动切替）
  playerColor.value = playerColor.value === 'white' ? 'black' : 'white'

  // 4. 重置游戏记录与标志位
  selectedSquare.value = null
  hoverSquare.value = null
  lastMove.value = null
  halfmoveClock.value = 0
  moveHistory.value = []
  boardHistory.value = []
  isAgreedDraw.value = false
  hasResigned.value = null
  promotionPending.value = null
  promotionStyle.value = {}

  // 5. 重新初始化局面历史记录
  positionHistory.value = [getPositionKey(board.value, currentTurn.value, lastMove.value)]
}
</script>

<style scoped>
@import url('https://fonts.cdnfonts.com/css/unifont');

.game-container {
  width: 100%;
  min-height: 100vh;
  background-color: #f0f0f0;
  display: flex;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
  padding: 20px;
  font-family: 'Unifont', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #222;
  gap: 1rem;
  flex-wrap: wrap;
  cursor: auto;
}

.game-panel {
  width: 100%;
  max-width: 80vmin;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
}

.controls {
  margin-bottom: 12px;
}

.flip-btn {
  padding: 8px 16px;
  font-size: 0.9rem;
  font-weight: bold;
  background-color: #ffffff;
  border: 1px solid #ccc;
  border-radius: 6px;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.flip-btn:hover {
  background-color: #f5f5f5;
  border-color: #999;
}

.game-container.global-dragging,
.game-container.global-dragging * {
  cursor: grabbing !important;
}

.board-frame {
  width: 100%;
  aspect-ratio: 1 / 1;
  max-width: calc(100vh - 120px);
  width: 80vmin;
  margin: 0 auto;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  grid-template-rows: repeat(8, minmax(0, 1fr));
  width: 100%;
  height: 100%;
  gap: 0;
  position: relative;
}

.board-square {
  position: relative;
  overflow: visible;
  border: none;
  padding: 0;
  background: transparent;
  cursor: default;
}

.board-square:focus,
.board-square:focus-visible,
.board-square:active {
  outline: none !important;
  box-shadow: none !important;
}

.board-square.draggable-piece {
  cursor: grab;
}

.board-square:focus-visible {
  outline: 2px solid #ffd33d;
  outline-offset: -2px;
  z-index: 10;
}

.square-background,
.piece {
  display: block;
  image-rendering: crisp-edges;
  image-rendering: pixelated;
}

.square-background.base {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.square-background.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.piece {
  position: absolute;
  left: 50%;
  bottom: 15%;
  transform: translateX(-50%) scale(var(--piece-scale));
  transform-origin: bottom center;
  pointer-events: none;
  z-index: 10;
  transition: opacity 0.1s ease;
}

.piece.dragging-hidden {
  opacity: 0;
}

.floating-piece {
  position: fixed;
  pointer-events: none;
  z-index: 9999;
  transform: translate(-50%, -50%) scale(var(--piece-scale));
  image-rendering: crisp-edges;
  image-rendering: pixelated;
}

.coordinate-label {
  position: absolute;
  font-family: 'Unifont', monospace;
  font-size: 0.75rem;
  line-height: 1;
  font-weight: bold;
  pointer-events: none;
  z-index: 5;
  user-select: none;
}

.coordinate-label.rank {
  top: 2px;
  left: 4px;
}

.coordinate-label.file {
  bottom: 3px;
  right: 4px;
}

.coordinate-label.text-black {
  color: #484A4B;
}

.coordinate-label.text-white {
  color: #F3F9FC;
}

.promotion-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 50;
}
</style>