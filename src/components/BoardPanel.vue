<template>
  <div class="game-panel">
    <div class="board-frame" :class="{ 'coordinates-outside': coordinateLabelMode === 'outside' }">
      <div class="board-grid" ref="boardGridRef"
        @touchmove.prevent="handleBoardGridTouchMove($event)"
        @touchend="handleBoardGridTouchEnd($event)">
        <template v-for="displayRow in 8" :key="`rank-${displayRow}`">
          <button v-for="displayCol in 8" :key="`${displayRow}-${displayCol}`" type="button" class="board-square"
            :class="{ 'draggable-piece': board[actualRow(displayRow - 1)]?.[actualCol(displayCol - 1)]?.color === currentTurn }"
            @mousedown="$emit('square-mousedown', actualRow(displayRow - 1), actualCol(displayCol - 1), $event)"
            @touchstart.prevent="handleSquareTouchStart(actualRow(displayRow - 1), actualCol(displayCol - 1), $event)"
            @mouseenter="$emit('square-mouseenter', actualRow(displayRow - 1), actualCol(displayCol - 1))"
            @mouseleave="$emit('square-mouseleave')"
            :data-row="actualRow(displayRow - 1)"
            :data-col="actualCol(displayCol - 1)"
            :aria-label="getSquareLabel(actualRow(displayRow - 1), actualCol(displayCol - 1))">

            <img class="square-background base" draggable="false"
              :src="isWhiteSquare(actualRow(displayRow - 1), actualCol(displayCol - 1)) ? './texture/board/board_white.png' : './texture/board/board_black.png'"
              alt="" />

            <img v-if="getOverlayTexture(board, selectedSquare, possibleMoves, isDragging, hoverSquare, actualRow(displayRow - 1), actualCol(displayCol - 1), premove, lastMove, canPremove)"
              class="square-background overlay" draggable="false"
              :src="getOverlayTexture(board, selectedSquare, possibleMoves, isDragging, hoverSquare, actualRow(displayRow - 1), actualCol(displayCol - 1), premove, lastMove, canPremove)!" alt="" />

            <img v-if="board[actualRow(displayRow - 1)]?.[actualCol(displayCol - 1)]" class="piece"
              draggable="false" :class="{
                'dragging-hidden': isDragging && dragStartSquare?.row === actualRow(displayRow - 1) && dragStartSquare?.col === actualCol(displayCol - 1)
              }" :src="getPieceImage(board[actualRow(displayRow - 1)]?.[actualCol(displayCol - 1)]!, board, isDraw, hasResigned, timeoutWinner)"
              :alt="board[actualRow(displayRow - 1)]?.[actualCol(displayCol - 1)]!.type" />

            <div v-if="coordinateLabelMode === 'inside' && displayCol === 1" class="coordinate-label rank"
              :class="isWhiteSquare(actualRow(displayRow - 1), actualCol(displayCol - 1)) ? 'text-black' : 'text-white'">
              {{ 8 - actualRow(displayRow - 1) }}
            </div>

            <div v-if="coordinateLabelMode === 'inside' && displayRow === 8" class="coordinate-label file"
              :class="isWhiteSquare(actualRow(displayRow - 1), actualCol(displayCol - 1)) ? 'text-black' : 'text-white'">
              {{ String.fromCharCode(97 + actualCol(displayCol - 1)) }}
            </div>
          </button>
        </template>
        <div v-if="promotionPending" class="promotion-overlay" @click="$emit('cancel-promotion')"></div>
        <Promotion v-if="promotionPending" :color="promotionPending.color" :style="promotionStyle ?? undefined"
          @select="(piece: string) => $emit('apply-promotion', piece)" />
      </div>

      <div v-if="coordinateLabelMode === 'outside'" class="coordinates-outside-layer">
        <div class="coordinate-bottom-row">
          <span v-for="displayCol in 8" :key="`file-${displayCol}`" class="coordinate-label outer-file"
            :style="{ left: `${(displayCol - 0.5) * 12.5}%` }">
            {{ displayedFile(displayCol) }}
          </span>
        </div>

        <div class="coordinate-side-col">
          <span v-for="displayRow in 8" :key="`rank-${displayRow}`" class="coordinate-label outer-rank"
            :style="{ top: `${(displayRow - 0.5) * 12.5}%` }">
            {{ displayedRank(displayRow) }}
          </span>
        </div>
      </div>
    </div>

    <img v-if="isDragging && dragStartSquare" class="floating-piece " draggable="false"
      :src="getPieceImage(board[dragStartSquare.row]?.[dragStartSquare.col]!, board, isDraw, hasResigned, timeoutWinner)"
      :style="{ left: mousePos.x + 'px', top: mousePos.y + 'px' }" alt="" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import type { Board, Color, Piece } from '../models/chess'
import Promotion from './Promotion.vue'
import type { CSSProperties } from 'vue'

const props = defineProps<{
  board: Board
  currentTurn: Color
  selectedSquare: { row: number; col: number } | null
  possibleMoves: { row: number; col: number }[]
  isDragging: boolean
  dragStartSquare: { row: number; col: number } | null
  hoverSquare: { row: number; col: number } | null
  mousePos: { x: number; y: number }
  isMouseDown: boolean
  promotionPending: { color: 'white' | 'black'; from: { row: number; col: number }; to: { row: number; col: number } } | null
  promotionStyle: CSSProperties | null
  isDraw: boolean
  hasResigned: Color | null
  timeoutWinner: Color | null
  coordinateLabelMode: 'off' | 'inside' | 'outside'
  isFlipped: boolean
  premove?: { from: { row: number; col: number }; to: { row: number; col: number } } | null
  lastMove?: { from: { row: number; col: number }; to: { row: number; col: number } } | null
  canPremove?: boolean
  getOverlayTexture: (
    board: Board,
    selectedSquare: { row: number; col: number } | null,
    possibleMoves: { row: number; col: number }[],
    isDragging: boolean,
    hoverSquare: { row: number; col: number } | null,
    row: number,
    col: number,
    premove?: { from: { row: number; col: number }; to: { row: number; col: number } } | null,
    lastMove?: { from: { row: number; col: number }; to: { row: number; col: number } } | null,
    canPremove?: boolean,
  ) => string | null
  getPieceImage: (
    piece: Piece,
    board: Board,
    isDraw: boolean,
    hasResigned: Color | null,
    timeoutWinner: Color | null,
  ) => string
  getSquareLabel: (row: number, col: number) => string
  isWhiteSquare: (row: number, col: number) => boolean
}>()

const emit = defineEmits<{
  (e: 'update:pieceScale', value: number): void
  (e: 'square-mousedown', row: number, col: number, event: MouseEvent): void
  (e: 'square-touchstart', row: number, col: number, event: TouchEvent): void
  (e: 'square-mouseenter', row: number, col: number): void
  (e: 'square-mouseleave'): void
  (e: 'board-touchmove', event: TouchEvent): void
  (e: 'board-touchend', event: TouchEvent): void
  (e: 'cancel-promotion'): void
  (e: 'apply-promotion', piece: string): void
}>()

const handleSquareTouchStart = (row: number, col: number, event: TouchEvent) => {
  emit('square-touchstart', row, col, event)
}

const handleBoardGridTouchMove = (event: TouchEvent) => {
  emit('board-touchmove', event)
}

const handleBoardGridTouchEnd = (event: TouchEvent) => {
  emit('board-touchend', event)
}

// 视觉坐标 -> 逻辑坐标（内联，依赖 isFlipped prop）
const actualRow = (displayRow: number): number =>
  props.isFlipped ? 7 - displayRow : displayRow

const actualCol = (displayCol: number): number =>
  props.isFlipped ? 7 - displayCol : displayCol

const displayedFile = (displayCol: number): string =>
  String.fromCharCode(97 + actualCol(displayCol - 1))

const displayedRank = (displayRow: number): string =>
  `${8 - actualRow(displayRow - 1)}`

// 缩放适配
const pieceScale = ref(1.5)
const boardGridRef = ref<HTMLElement | null>(null)
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

watch(pieceScale, (val) => {
  emit('update:pieceScale', val)
})
</script>

<style scoped>
.game-panel {
  width: 100%;
  max-width: 80vmin;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
  box-shadow: 2px 2px 0 #909294;
}

.board-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  max-width: calc(100vh - 120px);
  width: 80vmin;
  margin: 0 auto;
  box-sizing: border-box;
  overflow: visible;
}

.board-frame.coordinates-outside {
  padding: 0;
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  grid-template-rows: repeat(8, minmax(0, 1fr));
  width: 100%;
  height: 100%;
  gap: 0;
  position: relative;
  touch-action: none;
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
  pointer-events: auto;
  cursor: grab;
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
}

.coordinate-label {
  position: absolute;
  font-family: 'Unifont', monospace;
  font-size: 0.75rem;
  line-height: 1;
  font-weight: bold;
  pointer-events: none;
  z-index: 5;
}

.coordinates-outside-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.coordinate-bottom-row {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1.25rem;
  height: 1rem;
}

.coordinate-side-col {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -1.25rem;
  width: 1rem;
}

.coordinate-label.outer-file {
  position: absolute;
  transform: translateX(-50%);
  font-size: 0.85rem;
  color: #333;
  text-align: center;
}

.coordinate-label.outer-rank {
  position: absolute;
  transform: translateY(-50%);
  font-size: 0.85rem;
  color: #333;
  text-align: center;
  width: 100%;
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