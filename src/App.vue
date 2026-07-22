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
      :get-overlay-texture="getOverlayTexture"
      :get-piece-image="getPieceImage"
      :get-square-label="getSquareLabel"
      :is-white-square="isWhiteSquare"
      @update:piece-scale="(val: number) => pieceScale = val"
      @square-mousedown="(row: number, col: number, event: MouseEvent) => handleMouseDown(row, col, event)"
      @square-mouseenter="(row: number, col: number) => hoverSquare = { row, col }"
      @square-mouseleave="hoverSquare = null"
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
      @draw="handleDrawOffer" @resign="handleResign" @restart="handleRestart" @back-to-setup="handleBackToSetup" />

    <!-- 右上角固定设置按钮 -->
    <button type="button" class="settings-fab" @click="showSettingsModal = true" title="设置">
      ⚙
    </button>

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
const pieceScale = ref(1.5)

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
  handleMouseDown,
  handleUndo,
  handleResign,
  handleDrawOffer,
  handleRestart,
  handleBackToSetup,
  handleGameSetupStart,
  cancelPromotion,
  applyPromotion,
  getPositionCount,
  stopClock,
} = game

// ---- 远程对战 ----
const handleRemoteGame = () => {
  // TODO: 后续实现远程对战功能
  showSetup.value = true
}

// ---- 生命周期 ----
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

.game-container.global-dragging,
.game-container.global-dragging * {
  cursor: grabbing !important;
}

/* 右上角固定设置按钮 */
.settings-fab {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10000;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid #212529;
  background: #fff;
  font-size: 1.4rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: background-color 0.15s;
  padding: 0;
  line-height: 1;
}

.settings-fab:hover {
  background: #f0f0f0;
}

.settings-fab:focus-visible {
  outline: 2px solid #ffd33d;
  outline-offset: 2px;
}
</style>