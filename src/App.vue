<template>
  <section class="game-container" :class="{ 'global-dragging': isMouseDown && dragStartSquare }"
    :style="{ '--piece-scale': pieceScale }">

    <GameSetup v-if="showSetup" @start="handleGameSetupStart" @remote="handleRemoteGame" />

    <!-- 棋盘主面板 -->
    <BoardPanel :board="board" :current-turn="currentTurn" :selected-square="selectedSquare"
      :possible-moves="possibleMoves" :is-dragging="isDragging" :drag-start-square="dragStartSquare"
      :hover-square="hoverSquare" :mouse-pos="mousePos" :is-mouse-down="isMouseDown"
      :promotion-pending="promotionPending" :promotion-style="promotionStyle" :is-draw="isDraw"
      :has-resigned="hasResigned" :timeout-winner="timeoutWinner" :coordinate-label-mode="coordinateLabelMode"
      :is-flipped="isFlipped"
      :premove="premove"
      :last-move="lastMove"
      :can-premove="canPremove"
      :get-overlay-texture="getOverlayTexture"
      :get-piece-image="getPieceImage"
      :get-square-label="getSquareLabel"
      :is-white-square="isWhiteSquare"
      @update:piece-scale="(val: number) => pieceScale = val"
      @square-mousedown="(row: number, col: number, event: MouseEvent) => handleMouseDown(row, col, event)"
      @square-touchstart="(row: number, col: number, event: TouchEvent) => handleTouchStart(row, col, event)"
      @square-mouseenter="(row: number, col: number) => hoverSquare = { row, col }"
      @square-mouseleave="hoverSquare = null"
      @board-touchmove="(event: TouchEvent) => handleTouchMove(event)"
      @board-touchend="(event: TouchEvent) => handleTouchEnd(event)"
      @cancel-promotion="cancelPromotion"
      @apply-promotion="(piece: string) => applyPromotion(piece)" />

    <!-- 侧边栏 -->
    <Sidebar :is-clock-enabled="isClockEnabled" :move-history="moveHistory" :current-turn="currentTurn"
      :game-status="gameStatusMessage" :halfmove-clock="halfmoveClock" :position-count="getPositionCount()"
      :is-game-over="isGameOver" :is-flipped="isFlipped" :board="board" :player-color="playerColor"
      :white-time-seconds="whiteTimeSeconds"
      :black-time-seconds="blackTimeSeconds" :active-color="currentTurn" :clock-test-id="'sidebar-chess-clock'"
      :game-mode="gameMode"
      v-model:is-sound-enabled="isSoundEnabled" v-model:coordinate-label-mode="coordinateLabelMode"
      @toggle-flip="isFlipped = !isFlipped" :has-game-started="hasGameStarted" @undo="handleUndo"
      @draw="handleDrawOffer" @resign="handleResign" @restart="handleRestart" @back-to-home="handleBackToHome" />

    <!-- 右上角固定按钮组 -->
    <div class="top-right-fabs">
      <a href="https://github.com/DoroWolf/ChessDragon" target="_blank" rel="noopener" class="fab-btn" title="GitHub">
        <span class="fab-icon" v-html="githubSvg"></span>
      </a>
      <button type="button" class="fab-btn" @click="showSettingsModal = true" title="设置">
        <span class="fab-icon" v-html="settingSvg"></span>
      </button>
    </div>

    <!-- 设置弹窗 Modal -->
    <SettingsModal :visible="showSettingsModal" :is-sound-enabled="isSoundEnabled"
      :coordinate-label-mode="coordinateLabelMode" @close="showSettingsModal = false"
      @update:is-sound-enabled="(val: boolean) => isSoundEnabled = val"
      @update:coordinate-label-mode="(val: 'off' | 'inside' | 'outside') => coordinateLabelMode = val" />
  </section>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import Sidebar from './components/Sidebar.vue'
import SettingsModal from './components/SettingsModal.vue'
import GameSetup from './components/GameSetup.vue'
import BoardPanel from './components/BoardPanel.vue'
import { useSettings } from './composables/useSettings'
import { useBoardDisplay } from './composables/useBoardDisplay'
import { useGameState } from './composables/useGameState'
import settingSvg from './assets/icon/setting.svg?raw'
import githubSvg from './assets/icon/github.svg?raw'

// ---- 设置持久化 ----
const { isSoundEnabled, coordinateLabelMode } = useSettings()

// ---- 设置弹窗状态 ----
const showSettingsModal = ref(false)

// ---- 棋盘显示 ----
const {
  isFlipped,
  getOverlayTexture,
  getPieceImage,
  getSquareLabel,
  isWhiteSquare,
} = useBoardDisplay()

// ---- pieceScale（由 BoardPanel 通过事件更新） ----
const pieceScale = ref(2)

// ---- 游戏核心状态（含棋钟、拖拽、音效、走棋） ----
const game = useGameState(isSoundEnabled, isFlipped)

// 从 game 中解构所有模板所需的变量/函数
const {
  showSetup,
  playerColor,
  isClockEnabled,
  gameMode,
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
  premove,
  canPremove,
  handleMouseDown,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  handleUndo,
  handleResign,
  handleDrawOffer,
  handleRestart,
  handleBackToHome,
  handleGameSetupStart,
  cancelPromotion,
  applyPromotion,
  getPositionCount,
  stopClock,
} = game

// ---- 远程对局 ----
const handleRemoteGame = () => {
  // TODO: 后续实现远程对局功能
  showSetup.value = true
}

// ---- 生命周期 ----
onUnmounted(() => {
  stopClock()
})
</script>

<style scoped>
.game-container {
  position: relative;
  width: 100%;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
  padding: 20px;
  padding-top: 60px;
  font-family: 'Unifont', system-ui, -apple-system, sans-serif;
  color: var(--color-text-primary);
  gap: 1rem;
  flex-wrap: wrap;
  cursor: auto;
}

.game-container.global-dragging,
.game-container.global-dragging * {
  cursor: grabbing !important;
}

.top-right-fabs {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10000;
  display: flex;
  gap: 10px;
}

/* 无边框 FAB 按钮 */
.fab-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 1.4rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background-color 0.15s, color 0.15s;
  text-decoration: none;
}

.fab-btn:hover .fab-icon :deep(svg) {
  opacity: 0.8;
}

/* FAB 图标容器 */
.fab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}

.fab-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>