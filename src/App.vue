<template>
  <section class="game-container" :class="{ 'global-dragging': isMouseDown && dragStartSquare }"
    :style="{ '--piece-scale': pieceScale }">

    <GameSetup v-if="showSetup" :theme="theme" :remote-state="remoteState" :remote-room-code="remoteRoomCode"
      :remote-link-kind="remoteLinkKind" :remote-error-code="remoteErrorCode" @start="handleGameSetupStart"
      @remote-create="handleRemoteCreate" @remote-join="handleRemoteJoin" @remote-cancel="handleRemoteCancel"
      @remote-reset-error="resetRemoteError" />

    <BoardPanel v-if="!showSetup" :board="board" :current-turn="currentTurn" :selected-square="selectedSquare"
      :possible-moves="possibleMoves" :is-dragging="isDragging" :drag-start-square="dragStartSquare"
      :hover-square="hoverSquare" :mouse-pos="mousePos" :is-mouse-down="isMouseDown"
      :promotion-pending="promotionPending" :promotion-style="promotionStyle" :is-draw="isDraw"
      :has-resigned="hasResigned" :timeout-winner="timeoutWinner" :coordinate-label-mode="coordinateLabelMode"
      :is-flipped="isFlipped"
      :theme="theme"
      :premove="premove"
      :last-move="lastMove"
      :can-premove="canPremove"
      :is-chess960="isChess960"
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
    <Sidebar v-if="!showSetup" :is-clock-enabled="isClockEnabled" :move-history="moveHistory" :current-turn="currentTurn"
      :starting-turn="startingTurn" :starting-fullmove-number="startingFullmoveNumber"
      :game-status="gameStatusMessage" :halfmove-clock="halfmoveClock" :position-count="getPositionCount()"
      :is-game-over="isGameOver" :is-flipped="isFlipped" :board="board" :player-color="playerColor"
      :white-time-seconds="whiteTimeSeconds"
      :black-time-seconds="blackTimeSeconds" :active-color="currentTurn" :clock-test-id="'sidebar-chess-clock'"
      :game-mode="gameMode"
      :theme="theme" :game-result="gameResult" :is-remote="isRemote"
      :room-code="remoteRoomCode" :remote-state="remoteState" :remote-link-kind="remoteLinkKind"
      v-model:is-sound-enabled="isSoundEnabled" v-model:coordinate-label-mode="coordinateLabelMode"
      :moved-colors="hasMovedByColor"
      @toggle-flip="isFlipped = !isFlipped" :has-game-started="hasGameStarted" @undo="handleUndo"
      @draw="handleDrawOffer" @resign="handleResign" @restart="handleRestart" @back-to-home="handleLeaveToHome" />

    <!-- 右上角固定按钮组 -->
    <div class="top-right-fabs">
      <a href="https://github.com/DoroWolf/ChessDragon" target="_blank" rel="noopener" class="fab-btn" title="GitHub">
        <span class="fab-icon" v-html="githubSvg"></span>
      </a>
      <button type="button" class="fab-btn" @click="showSettingsModal = true" :title="t('app.settings')">
        <span class="fab-icon" v-html="settingSvg"></span>
      </button>
    </div>

    <!-- 设置弹窗 Modal -->
    <SettingsModal :visible="showSettingsModal" :is-sound-enabled="isSoundEnabled"
      :coordinate-label-mode="coordinateLabelMode" :theme="theme" @close="showSettingsModal = false"
      @update:is-sound-enabled="(val: boolean) => isSoundEnabled = val"
      @update:coordinate-label-mode="(val: 'off' | 'inside' | 'outside') => coordinateLabelMode = val"
      @update:theme="(val: 'light' | 'dark') => theme = val" />

    <!-- 远程对局：请求 / 断线提示 -->
    <RemoteOverlay v-if="!showSetup" :pending-undo-request="pendingUndoRequest"
      :pending-draw-offer="pendingDrawOffer" :pending-rematch-request="pendingRematchRequest"
      :outgoing-request="outgoingRequest" :opponent-left="isOpponentLeft"
      @respond="handleRemoteRespond" @cancel-request="() => cancelOutgoingRequest()" @back-to-home="handleLeaveToHome" />
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import Sidebar from './components/Sidebar.vue'
import SettingsModal from './components/SettingsModal.vue'
import GameSetup from './components/GameSetup.vue'
import BoardPanel from './components/BoardPanel.vue'
import RemoteOverlay from './components/RemoteOverlay.vue'
import type { GameSetupConfig } from './components/GameSetup.vue'
import { useSettings } from './composables/useSettings'
import { useBoardDisplay } from './composables/useBoardDisplay'
import { useGameState } from './composables/useGameState'
import { useRemoteGame } from './composables/useRemoteGame'
import { useI18n } from './composables/useI18n'
import settingSvg from './assets/icon/setting.svg?raw'
import githubSvg from './assets/icon/github.svg?raw'

// ---- 设置持久化 ----
const { isSoundEnabled, coordinateLabelMode, theme } = useSettings()

// ---- 国际化 ----
const { t } = useI18n()

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
  isChess960,
  playerColor,
  isClockEnabled,
  gameMode,
  board,
  currentTurn,
  startingTurn,
  startingFullmoveNumber,
  selectedSquare,
  hoverSquare,
  lastMove,
  halfmoveClock,
  hasGameStarted,
  hasMovedByColor,
  timeoutWinner,
  whiteTimeSeconds,
  blackTimeSeconds,
  moveHistory,
  isDraw,
  hasResigned,
  gameStatusMessage,
  gameEndReason,
  gameResult,
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
  isDrawByStalemate,
  isDrawByInsufficientMaterial,
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
  // ---- 远程对局 ----
  isRemote,
  pendingUndoRequest,
  pendingDrawOffer,
  pendingRematchRequest,
  outgoingRequest,
  respondToUndoRequest,
  respondToDrawOffer,
  respondToRematchRequest,
  cancelOutgoingRequest,
} = game

// ---- 远程对局 ----
const remote = useRemoteGame()
remote.registerGame(game)

const { state: remoteState, roomCode: remoteRoomCode, linkKind: remoteLinkKind, errorCode: remoteErrorCode } = remote

const isOpponentLeft = computed(() => remoteState.value === 'opponent-left')

const handleRemoteCreate = (config: GameSetupConfig, hostColor: 'white' | 'black' | 'random') => {
  void remote.createRoom(config, hostColor)
}

const handleRemoteJoin = (code: string) => {
  void remote.joinRoomByCode(code)
}

const handleRemoteCancel = () => {
  remote.cancelWaiting()
  remote.resetError()
}

const resetRemoteError = () => {
  remote.resetError()
}

/** 回应对手的悔棋 / 和棋 / 重赛请求 */
const handleRemoteRespond = (accepted: boolean) => {
  if (pendingUndoRequest.value) {
    respondToUndoRequest(accepted)
  } else if (pendingDrawOffer.value) {
    respondToDrawOffer(accepted)
  } else if (pendingRematchRequest.value) {
    respondToRematchRequest(accepted)
  }
}

/** 返回首页：远程对局需要先关闭房间链路 */
const handleLeaveToHome = () => {
  if (isRemote.value) {
    remote.leaveRoom()
  }
  handleBackToHome()
}

// ---- 生命周期 ----
onUnmounted(() => {
  stopClock()
  if (isRemote.value) {
    remote.leaveRoom()
  }
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