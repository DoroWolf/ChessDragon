<template>
  <section class="game-container" :class="{ 'global-dragging': isMouseDown && dragStartSquare }"
    :style="{ '--piece-scale': pieceScale }">

    <GameSetup v-if="showSetup" @start="handleGameSetupStart" />

    <!-- 棋盘主面板 -->
    <div class="game-panel">
      <div class="board-frame" :class="{ 'coordinates-outside': coordinateLabelMode === 'outside' }">
        <div class="board-grid" ref="boardGridRef">
          <template v-for="displayRow in 8" :key="`rank-${displayRow}`">
            <button v-for="displayCol in 8" :key="`${displayRow}-${displayCol}`" type="button" class="board-square"
              :class="{ 'draggable-piece': board[getActualRow(displayRow - 1)]?.[getActualCol(displayCol - 1)]?.color === currentTurn }"
              @mousedown="handleMouseDown(getActualRow(displayRow - 1), getActualCol(displayCol - 1), $event)"
              @mouseenter="hoverSquare = { row: getActualRow(displayRow - 1), col: getActualCol(displayCol - 1) }"
              @mouseleave="hoverSquare = null"
              :aria-label="getSquareLabel(getActualRow(displayRow - 1), getActualCol(displayCol - 1))">

              <img class="square-background base" draggable="false"
                :src="isWhiteSquare(getActualRow(displayRow - 1), getActualCol(displayCol - 1)) ? './texture/board/board_white.png' : './texture/board/board_black.png'"
                alt="" />

              <img v-if="getOverlayTexture(board, selectedSquare, possibleMoves, isDragging, hoverSquare, getActualRow(displayRow - 1), getActualCol(displayCol - 1))"
                class="square-background overlay" draggable="false"
                :src="getOverlayTexture(board, selectedSquare, possibleMoves, isDragging, hoverSquare, getActualRow(displayRow - 1), getActualCol(displayCol - 1))!" alt="" />

              <img v-if="board[getActualRow(displayRow - 1)]?.[getActualCol(displayCol - 1)]" class="piece"
                draggable="false" :class="{
                  'dragging-hidden': isDragging && dragStartSquare?.row === getActualRow(displayRow - 1) && dragStartSquare?.col === getActualCol(displayCol - 1)
                }" :src="getPieceImage(board[getActualRow(displayRow - 1)]?.[getActualCol(displayCol - 1)]!, board, isDraw, hasResigned, timeoutWinner)"
                :alt="board[getActualRow(displayRow - 1)]?.[getActualCol(displayCol - 1)]!.type" />

              <div v-if="coordinateLabelMode === 'inside' && displayCol === 1" class="coordinate-label rank"
                :class="isWhiteSquare(getActualRow(displayRow - 1), getActualCol(displayCol - 1)) ? 'text-black' : 'text-white'">
                {{ 8 - getActualRow(displayRow - 1) }}
              </div>

              <div v-if="coordinateLabelMode === 'inside' && displayRow === 8" class="coordinate-label file"
                :class="isWhiteSquare(getActualRow(displayRow - 1), getActualCol(displayCol - 1)) ? 'text-black' : 'text-white'">
                {{ String.fromCharCode(97 + getActualCol(displayCol - 1)) }}
              </div>
            </button>
          </template>
          <div v-if="promotionPending" class="promotion-overlay" @click="cancelPromotion"></div>
          <Promotion v-if="promotionPending" :color="promotionPending.color" :style="promotionStyle"
            @select="applyPromotion" />
        </div>

        <div v-if="coordinateLabelMode === 'outside'" class="coordinates-outside-layer">
          <div class="coordinate-bottom-row">
            <span v-for="displayCol in 8" :key="`file-${displayCol}`" class="coordinate-label outer-file"
              :style="{ left: `${(displayCol - 0.5) * 12.5}%` }">
              {{ getDisplayedFile(displayCol) }}
            </span>
          </div>

          <div class="coordinate-side-col">
            <span v-for="displayRow in 8" :key="`rank-${displayRow}`" class="coordinate-label outer-rank"
              :style="{ top: `${(displayRow - 0.5) * 12.5}%` }">
              {{ getDisplayedRank(displayRow) }}
            </span>
          </div>
        </div>
      </div>

      <img v-if="isDragging && dragStartSquare" class="floating-piece" draggable="false"
        :src="getPieceImage(board[dragStartSquare.row]?.[dragStartSquare.col]!, board, isDraw, hasResigned, timeoutWinner)"
        :style="{ left: mousePos.x + 'px', top: mousePos.y + 'px' }" alt="" />
    </div>

    <!-- 侧边栏 -->
    <Sidebar :is-clock-enabled="isClockEnabled" :move-history="moveHistory" :current-turn="currentTurn"
      :game-status="gameStatusMessage" :halfmove-clock="halfmoveClock" :position-count="getPositionCount()"
      :is-game-over="isGameOver" :is-flipped="isFlipped" :white-time-seconds="whiteTimeSeconds"
      :black-time-seconds="blackTimeSeconds" :active-color="currentTurn" :clock-test-id="'sidebar-chess-clock'"
      v-model:is-sound-enabled="isSoundEnabled" v-model:coordinate-label-mode="coordinateLabelMode"
      @toggle-flip="isFlipped = !isFlipped" :has-game-started="hasGameStarted" @undo="handleUndo"
      @draw="handleDrawOffer" @resign="handleResign" @restart="handleRestart" />
  </section>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import Promotion from './components/Promotion.vue'
import Sidebar from './components/Sidebar.vue'
import GameSetup from './components/GameSetup.vue'
import { useSettings } from './composables/useSettings'
import { useBoardDisplay } from './composables/useBoardDisplay'
import { useGameState } from './composables/useGameState'

// ---- 设置持久化 ----
const { isSoundEnabled, coordinateLabelMode } = useSettings()

// ---- 棋盘显示 ----
const {
  isFlipped,
  getActualRow,
  getActualCol,
  getDisplayedFile,
  getDisplayedRank,
  getOverlayTexture,
  getPieceImage,
  pieceScale,
  boardGridRef,
  getSquareLabel,
  isWhiteSquare,
  updatePieceScale,
} = useBoardDisplay()

// ---- 游戏核心状态（含棋钟、拖拽、音效、走棋） ----
const game = useGameState(isSoundEnabled, isFlipped)

// 从 game 中解构所有模板所需的变量/函数
const {
  showSetup,
  isClockEnabled,
  board,
  currentTurn,
  selectedSquare,
  hoverSquare,
  lastMove,
  halfmoveClock,
  hasGameStarted,
  timeoutWinner,
  whiteTimeSeconds,
  blackTimeSeconds,
  moveHistory,
  isDraw,
  hasResigned,
  gameStatusMessage,
  isGameOver,
  possibleMoves,
  promotionPending,
  promotionStyle,
  isMouseDown,
  isDragging,
  dragStartSquare,
  mousePos,
  handleMouseDown,
  handleUndo,
  handleResign,
  handleDrawOffer,
  handleRestart,
  handleGameSetupStart,
  cancelPromotion,
  applyPromotion,
  getPositionCount,
  stopClock,
} = game

// ---- 生命周期 ----
onMounted(() => {
  updatePieceScale()
})

onUnmounted(() => {
  stopClock()
})
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

.game-container.global-dragging,
.game-container.global-dragging * {
  cursor: grabbing !important;
}

.board-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  max-width: calc(100vh - 120px);
  width: 80vmin;
  margin: 0 auto;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
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