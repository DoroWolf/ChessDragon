<template>
  <div class="game-panel" :style="boardSizeStyle">
    <div ref="boardFrameRef" class="board-frame" :class="{ 'coordinates-outside': coordinateLabelMode === 'outside' }" :style="boardSizeStyle">
      <div class="board-grid" ref="boardGridRef" :class="{ 'promotion-active': !!promotionPending }"
        @touchmove.prevent="handleBoardGridTouchMove($event)"
        @touchend="handleBoardGridTouchEnd($event)">
        <template v-for="displayRow in 8" :key="`rank-${displayRow}`">
          <button v-for="displayCol in 8" :key="`${displayRow}-${displayCol}`" type="button" class="board-square"
            :class="{
              'draggable-piece': !promotionPending && board[actualRow(displayRow - 1)]?.[actualCol(displayCol - 1)]?.color === currentTurn,
              'has-piece': !!board[actualRow(displayRow - 1)]?.[actualCol(displayCol - 1)],
            }"
            @mousedown="$emit('square-mousedown', actualRow(displayRow - 1), actualCol(displayCol - 1), $event)"
            @touchstart.prevent="handleSquareTouchStart(actualRow(displayRow - 1), actualCol(displayCol - 1), $event)"
            @mouseenter="$emit('square-mouseenter', actualRow(displayRow - 1), actualCol(displayCol - 1))"
            @mouseleave="$emit('square-mouseleave')"
            :data-row="actualRow(displayRow - 1)"
            :data-col="actualCol(displayCol - 1)"
            :aria-label="getSquareLabel(actualRow(displayRow - 1), actualCol(displayCol - 1))">

            <img class="square-background base" draggable="false"
              :src="isWhiteSquare(actualRow(displayRow - 1), actualCol(displayCol - 1)) ? lightSquareTexture : darkSquareTexture"
              alt="" />

            <img v-if="getOverlayTexture(board, selectedSquare, possibleMoves, isDragging, hoverSquare, actualRow(displayRow - 1), actualCol(displayCol - 1), premove, lastMove, canPremove, isChess960)"
              class="square-background overlay"
              :class="{ 'placeable': isMovePlaceableOverlay(actualRow(displayRow - 1), actualCol(displayCol - 1)), 'placeable-mirror': shouldMirrorMoveableOverlay(actualRow(displayRow - 1), actualCol(displayCol - 1)) }"
              draggable="false"
              :src="getOverlayTexture(board, selectedSquare, possibleMoves, isDragging, hoverSquare, actualRow(displayRow - 1), actualCol(displayCol - 1), premove, lastMove, canPremove, isChess960)!"
              alt="" />

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
          :is-flipped="isFlipped"
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

      <button
        type="button"
        class="board-resize-handle"
        @pointerdown="handleResizePointerDown"
        @pointermove="handleResizePointerMove"
        @pointerup="handleResizePointerEnd"
        @pointercancel="handleResizePointerEnd"
        @keydown="handleResizeKeydown"
      >
        <span class="board-resize-icon" v-html="dragSvg"></span>
      </button>
    </div>

    <img v-if="isDragging && dragStartSquare" class="floating-piece " draggable="false"
      :src="getPieceImage(board[dragStartSquare.row]?.[dragStartSquare.col]!, board, isDraw, hasResigned, timeoutWinner)"
      :style="{ left: mousePos.x + 'px', top: mousePos.y + 'px' }" alt="" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import type { Board, Color, Piece } from '../models/chess'
import Promotion from './Promotion.vue'
import type { CSSProperties } from 'vue'
import { boardMovePlaceable, boardWhite, boardGray, boardBlack } from '../assets/resourcePaths'
import dragSvg from '../assets/icon/drag.svg?raw'

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
  theme?: 'light' | 'dark'
  premove?: { from: { row: number; col: number }; to: { row: number; col: number } } | null
  lastMove?: { from: { row: number; col: number }; to: { row: number; col: number } } | null
  canPremove?: boolean
  isChess960?: boolean
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
    isChess960?: boolean,
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

const lightSquareTexture = computed(() => (props.theme === 'dark' ? boardGray : boardWhite))
const darkSquareTexture = computed(() => (props.theme === 'dark' ? boardBlack : boardGray))

const handleSquareTouchStart = (row: number, col: number, event: TouchEvent) => {
  emit('square-touchstart', row, col, event)
}

const handleBoardGridTouchMove = (event: TouchEvent) => {
  emit('board-touchmove', event)
}

const handleBoardGridTouchEnd = (event: TouchEvent) => {
  emit('board-touchend', event)
}

const actualRow = (displayRow: number): number =>
  props.isFlipped ? 7 - displayRow : displayRow

const actualCol = (displayCol: number): number =>
  props.isFlipped ? 7 - displayCol : displayCol

const displayedFile = (displayCol: number): string =>
  String.fromCharCode(97 + actualCol(displayCol - 1))

const displayedRank = (displayRow: number): string =>
  `${8 - actualRow(displayRow - 1)}`

const isMovePlaceableOverlay = (row: number, col: number): boolean => {
  const overlayTexture = props.getOverlayTexture(
    props.board,
    props.selectedSquare,
    props.possibleMoves,
    props.isDragging,
    props.hoverSquare,
    row,
    col,
    props.premove,
    props.lastMove,
    props.canPremove,
    props.isChess960,
  )
  return overlayTexture === boardMovePlaceable
}

const shouldMirrorMoveableOverlay = (row: number, col: number): boolean => {
  if (!isMovePlaceableOverlay(row, col)) {
    return false
  }
  const selected = props.selectedSquare
  if (!selected) {
    return false
  }
  const piece =
    props.board[selected.row]?.[selected.col]

  if (!piece) {
    return false
  }
  const topColor: Color =
    props.isFlipped ? 'white' : 'black'

  return piece.color === topColor
}
const pieceScale = ref(1.5)
const boardGridRef = ref<HTMLElement | null>(null)
const boardFrameRef = ref<HTMLElement | null>(null)
const boardSize = ref<number | null>(null)
const boardSizeStyle = computed(() => boardSize.value === null ? undefined : { width: `${boardSize.value}px` })
let boardResizeObserver: ResizeObserver | null = null
let resizePointerId: number | null = null
let resizeStartX = 0
let resizeStartY = 0
let resizeStartSize = 0

const clampBoardSize = (size: number): number => {
  const maximum = Math.max(160, Math.min(window.innerWidth - 32, window.innerHeight - 120))
  return Math.min(maximum, Math.max(200, size))
}

const handleResizePointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  resizePointerId = event.pointerId
  resizeStartX = event.clientX
  resizeStartY = event.clientY
  resizeStartSize = boardFrameRef.value?.clientWidth ?? window.innerWidth * 0.8
  boardSize.value = resizeStartSize
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
}

const handleResizePointerMove = (event: PointerEvent) => {
  if (event.pointerId !== resizePointerId) return
  const delta = ((event.clientX - resizeStartX) + (event.clientY - resizeStartY)) / 2
  boardSize.value = clampBoardSize(resizeStartSize + delta)
}

const handleResizePointerEnd = (event: PointerEvent) => {
  if (event.pointerId === resizePointerId) resizePointerId = null
}

const handleResizeKeydown = (event: KeyboardEvent) => {
  const increase = event.key === 'ArrowRight' || event.key === 'ArrowDown'
  const decrease = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
  if (!increase && !decrease) return
  event.preventDefault()
  const currentSize = boardFrameRef.value?.clientWidth ?? window.innerWidth * 0.8
  boardSize.value = clampBoardSize(currentSize + (increase ? 16 : -16))
}

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
  width: max-content;
  max-width: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
}

.board-frame {
  position: relative;
  container-type: inline-size;
  width: 80vmin;
  aspect-ratio: 1 / 1;
  max-width: min(calc(100vw - 32px), calc(100vh - 120px));
  margin: 0 auto;
  box-sizing: border-box;
  overflow: visible;
}

.board-resize-handle {
  position: absolute;
  right: -20px;
  bottom: -20px;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: nwse-resize;
  touch-action: none;
  z-index: 20;
}

.board-resize-icon {
  position: absolute;
  inset: 10px;
  display: grid;
  place-items: center;
  color: var(--color-text-primary);
  opacity: 0.75;
  pointer-events: none;
}

.board-resize-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

@media (max-width: 767px) {
  .board-resize-handle {
    display: none;
  }
}

.board-resize-handle:focus-visible {
  outline: 2px solid var(--color-text-primary);
  outline-offset: 1px;
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

.board-grid.promotion-active .piece {
  pointer-events: none;
  cursor: default;
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

.square-background.overlay.placeable-mirror {
  transform: scaleY(-1);
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
  will-change: transform;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
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
  font-size: 0.75rem;
  font-family: 'Unifont', monospace;
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
  bottom: -2.8cqi;
  height: 2cqi;
}

.coordinate-side-col {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -2.8cqi;
  width: 2cqi;
}

.coordinate-label.outer-file {
  position: absolute;
  transform: translateX(-50%);
  font-size: 1.7cqi;
  color: var(--color-text-secondary);
  text-align: center;
}

.coordinate-label.outer-rank {
  position: absolute;
  transform: translateY(-50%);
  font-size: 1.7cqi;
  color: var(--color-text-secondary);
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
  color: var(--color-coord-on-light);
}

.coordinate-label.text-white {
  color: var(--color-coord-on-dark);
}

.promotion-overlay {
  position: absolute;
  inset: 0;
  background: var(--color-overlay-medium);
  z-index: 50;
}
</style>
