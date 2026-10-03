<template>
  <div class="step-row">
    <div class="board-col" :style="{ '--piece-scale': pieceScale }">
      <BoardPanel :board-size="boardSize" :board="board" :current-turn="pieceColor"
        :selected-square="selectedSquare"
        :possible-moves="visibleReachable" :is-dragging="isDragging" :drag-start-square="dragStartSquare"
        :hover-square="hoverSquare" :mouse-pos="mousePos" :is-mouse-down="isMouseDown"
        :promotion-pending="promotionPending" :promotion-style="promotionStyle" :is-draw="false" :has-resigned="null"
        :timeout-winner="null" :coordinate-label-mode="coordinateLabelMode" :is-flipped="false" :theme="theme"
        :premove="null" :last-move="lastMove" :can-premove="false" :is-chess960="false" :markers="coinMarkers"
        :get-overlay-texture="getChallengeOverlayTexture" :get-piece-image="getPieceImage"
        :get-square-label="getSquareLabel" :is-white-square="isWhiteSquare"
        @update:piece-scale="(val: number) => pieceScale = val"
        @update:board-size="(val: number) => emit('update:boardSize', val)"
        @square-mousedown="handleMouseDown" @square-touchstart="handleTouchStart"
        @square-mouseenter="handleSquareEnter" @square-mouseleave="handleSquareLeave"
        @board-touchmove="handleTouchMove" @board-touchend="handleTouchEnd"
        @cancel-promotion="cancelPromotion" @apply-promotion="(piece: string) => applyPromotion(piece)" />
    </div>

    <div class="info-col">
      <p class="step-indicator">{{ t('tutorial.step', { current: step, total }) }}</p>
      <p class="challenge-instruction">{{ t(challenge.instruction) }}</p>
      <p v-if="status === 'won'" class="challenge-feedback win">{{ t(praiseKey) }}</p>
      <p v-if="status === 'failed'" class="challenge-feedback lose">
        {{ t(failMessage ?? 'tutorial.challenge.failed') }}
      </p>
      <div v-if="status === 'failed'" class="challenge-actions">
        <button type="button" class="btn" @click="handleReset">
          {{ t('tutorial.challenge.reset') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import BoardPanel from '../../components/BoardPanel.vue'
import { useBoardDisplay } from '../../composables/useBoardDisplay.ts'
import { useCollectCoins } from '../composables/tutorialChallange.ts'
import { playTutorialSound } from '../sound.ts'
import { boardMoveCapture, boardMoveHover, pieceCoin } from '../../assets/resourcePaths.ts'
import { useI18n } from '../../composables/useI18n.ts'
import type { Board, Piece } from '../../models/chess.ts'
import type { MessageKey } from '../../data/i18n/index.ts'
import type { TutorialChallenge } from '../data/types.ts'

interface Props {
  challenge: TutorialChallenge
  step: number
  total: number
  isSoundEnabled?: boolean
  coordinateLabelMode?: 'off' | 'inside' | 'outside'
  theme?: 'light' | 'dark'
  /** 受控的棋盘尺寸（v-model:board-size），由专题页持有以便跨挑战保留 */
  boardSize?: number | null
}

const props = withDefaults(defineProps<Props>(), {
  isSoundEnabled: true,
  coordinateLabelMode: 'inside',
  theme: 'light',
})

const emit = defineEmits<{
  (e: 'solved'): void
  (e: 'update:boardSize', value: number): void
}>()

const { t } = useI18n()

// 直接使用项目自带的 BoardPanel（与对局页 / 编辑器同一用法）
const { getOverlayTexture, getPieceImage, getSquareLabel, isWhiteSquare } = useBoardDisplay()
const pieceScale = ref(2)

const {
  pieces,
  pieceColor,
  coins,
  opponents,
  status,
  failMessage,
  reachable,
  lastMove,
  promotionPending,
  promotionStyle,
  applyPromotion,
  cancelPromotion,
  isMouseDown,
  isDragging,
  dragStartSquare,
  selectedSquare,
  hoverSquare,
  mousePos,
  handleMouseDown,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  reset,
} = useCollectCoins(props.challenge, computed(() => props.isSoundEnabled))

const createEmptyBoard = (): Board =>
  Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null as Piece | null))

const board = computed<Board>(() => {
  const next = createEmptyBoard()
  // 对方棋子（吃子挑战用）：被吃掉后从数组移除，自然不再绘制
  for (const opponent of opponents.value) {
    next[opponent.row]![opponent.col] = {
      type: opponent.type,
      color: opponent.color,
      hasMoved: true,
    }
  }
  // 玩家可移动的棋子（可能有多枚）：被吃掉后从数组移除，不再绘制
  for (const piece of pieces.value) {
    next[piece.row]![piece.col] = {
      type: piece.type,
      color: piece.color,
      hasMoved: true,
    }
  }
  return next
})

const coinMarkers = computed(() =>
  coins.value.map((coin) => ({ row: coin.row, col: coin.col, image: pieceCoin })),
)

const visibleReachable = computed(() =>
  status.value === 'playing' && selectedSquare.value ? reachable.value : [],
)

/**
 * 金币不占棋盘格（只是叠加的 marker），但吃掉它等同于吃子。
 * 因此棋子路线上（可达格）若有金币，覆盖层改用吃子提示：
 * 悬停时用悬停材质，其余同对局页的吃子表现。
 */
const getChallengeOverlayTexture: typeof getOverlayTexture = (
  board,
  selectedSquare,
  possibleMoves,
  isDragging,
  hoverSquare,
  row,
  col,
  premove,
  lastMove,
  canPremove,
  isChess960,
) => {
  const isCoinSquare = coins.value.some((coin) => coin.row === row && coin.col === col)
  const isOnRoute = possibleMoves.some((move) => move.row === row && move.col === col)

  if (isCoinSquare && isOnRoute) {
    const isHovered = hoverSquare?.row === row && hoverSquare?.col === col
    return isHovered ? boardMoveHover : boardMoveCapture
  }

  return getOverlayTexture(
    board,
    selectedSquare,
    possibleMoves,
    isDragging,
    hoverSquare,
    row,
    col,
    premove,
    lastMove,
    canPremove,
    isChess960,
  )
}

const handleSquareEnter = (row: number, col: number) => {
  hoverSquare.value = { row, col }
}

const handleSquareLeave = () => {
  hoverSquare.value = null
}

const PRAISE_KEYS: MessageKey[] = [
  'tutorial.praise.great',
  'tutorial.praise.wellDone',
  'tutorial.praise.excellent',
  'tutorial.praise.nice',
]

const praiseKey = ref<MessageKey>('tutorial.praise.great')

const pickPraise = (): MessageKey =>
  PRAISE_KEYS[Math.floor(Math.random() * PRAISE_KEYS.length)] ?? 'tutorial.praise.great'

// 胜利音效稍作延迟，避免与吃下最后一枚金币的吃子音效同时响起
let victoryTimer: number | null = null

const clearVictoryTimer = () => {
  if (victoryTimer !== null) {
    window.clearTimeout(victoryTimer)
    victoryTimer = null
  }
}

onUnmounted(clearVictoryTimer)

const handleReset = () => {
  clearVictoryTimer()
  reset()
}

watch(status, (value) => {
  clearVictoryTimer()
  if (value === 'failed') {
    playTutorialSound('defeat', props.isSoundEnabled)
    return
  }
  if (value !== 'won') return
  praiseKey.value = pickPraise()
  victoryTimer = window.setTimeout(() => {
    playTutorialSound('victory', props.isSoundEnabled)
    victoryTimer = null
  }, 250)
  emit('solved')
})
</script>

<style scoped>
.step-row {
  display: flex;
  /* 右侧信息列相对棋盘垂直居中，棋盘本身保持顶部对齐 */
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.board-col {
  flex: 0 0 auto;
  align-self: flex-start;
}

.info-col {
  flex: 0 1 360px;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.step-indicator {
  margin: 0;
  font-size: 0.85rem;
  font-weight: bold;
  color: var(--color-text-muted);
}

.challenge-instruction {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-primary);
}

.challenge-feedback {
  margin: 0;
  font-size: 0.95rem;
  font-weight: bold;
}

.challenge-feedback.win {
  color: var(--color-btn-success);
}

.challenge-feedback.lose {
  color: var(--color-btn-danger);
}

.challenge-actions {
  display: flex;
  justify-content: flex-start;
}
</style>
