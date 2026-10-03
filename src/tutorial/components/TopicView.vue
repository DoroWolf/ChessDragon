<template>
  <div class="topic-view">
    <div v-if="currentIntro" :key="step" class="step-row">
      <div v-if="currentDemoBoard" class="board-col" :style="{ '--piece-scale': pieceScale }">
        <BoardPanel v-model:board-size="boardSize" :board="currentDemoBoard.board"
          :current-turn="currentDemoBoard.turnColor"
          :selected-square="null" :possible-moves="currentDemoBoard.reachable" :is-dragging="false"
          :drag-start-square="null" :hover-square="null" :mouse-pos="idleMousePos" :is-mouse-down="false"
          :promotion-pending="null" :promotion-style="null" :is-draw="false" :has-resigned="null"
          :timeout-winner="null" :coordinate-label-mode="coordinateLabelMode" :is-flipped="false" :theme="theme"
          :premove="null" :last-move="null" :can-premove="false" :is-chess960="false"
          :get-overlay-texture="getOverlayTexture" :get-piece-image="getPieceImage"
          :get-square-label="getSquareLabel" :is-white-square="isWhiteSquare"
          @update:piece-scale="(val: number) => pieceScale = val" />
      </div>

      <div class="info-col">
        <h2 v-if="step === 0" class="topic-title">{{ t(topic.titleKey) }}</h2>
        <p v-for="(key, index) in currentIntro.instruction" :key="index" class="topic-paragraph">{{ t(key) }}</p>
        <div class="step-actions">
          <button type="button" class="btn btn-primary" @click="step += 1">
            {{ t('tutorial.continue') }}
          </button>
        </div>
      </div>
    </div>

    <div v-else-if="currentInfo" :key="currentInfo.id" class="step-row">
      <div class="board-col" :style="{ '--piece-scale': pieceScale }">
        <BoardPanel v-if="currentInfoBoard" v-model:board-size="boardSize" :board="currentInfoBoard.board"
          :current-turn="currentInfoBoard.turnColor"
          :selected-square="null" :possible-moves="[]" :is-dragging="false"
          :drag-start-square="null" :hover-square="null" :mouse-pos="idleMousePos" :is-mouse-down="false"
          :promotion-pending="null" :promotion-style="null" :is-draw="false" :has-resigned="null"
          :timeout-winner="null" :coordinate-label-mode="coordinateLabelMode" :is-flipped="false" :theme="theme"
          :premove="null" :last-move="null" :can-premove="false" :is-chess960="false"
          :get-overlay-texture="getInfoOverlayTexture" :get-piece-image="getPieceImage"
          :get-square-label="getSquareLabel" :is-white-square="isWhiteSquare"
          @update:piece-scale="(val: number) => pieceScale = val" />
      </div>

      <div class="info-col">
        <p class="topic-paragraph">{{ t(currentInfo.instruction) }}</p>
        <div class="step-actions">
          <button type="button" class="btn btn-primary" @click="step += 1">
            {{ t('tutorial.continue') }}
          </button>
        </div>
      </div>
    </div>

    <TutorialBoard v-else-if="currentChallenge" :key="currentChallenge.id" v-model:board-size="boardSize"
      :challenge="currentChallenge" :step="displayStep" :total="totalChallenges"
      :is-sound-enabled="isSoundEnabled" :coordinate-label-mode="coordinateLabelMode" :theme="theme"
      @solved="handleSolved" />

    <div v-if="isDone" class="modal-backdrop">
      <div class="card dialog-box">
        <h2 class="completion-title">{{ t('tutorial.sectionDone') }}</h2>
        <div class="dialog-buttons">
          <a v-if="nextTopicHref" class="btn btn-primary" :href="nextTopicHref">
            {{ t('tutorial.nextSection') }}
          </a>
          <a class="btn" :href="overviewHref">{{ t('tutorial.backToOverview') }}</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import BoardPanel from '../../components/BoardPanel.vue'
import TutorialBoard from './TutorialBoard.vue'
import { useBoardDisplay } from '../../composables/useBoardDisplay'
import { getReachableSquares } from '../composables/tutorialChallange.ts'
import { boardMoveCapture } from '../../assets/resourcePaths'
import { TUTORIAL_PAGE, tutorialTopicUrl, toolPageUrl } from '../../data/toolPages'
import { useI18n } from '../../composables/useI18n'
import type { Board, Color, Piece, Square } from '../../models/chess'
import type {
  InfoStep,
  TutorialCategory,
  TutorialChallenge,
  TutorialDemo,
  TutorialStep,
  TutorialTopic,
} from '../data/types'

interface Props {
  topic: TutorialTopic
  category: TutorialCategory
  isSoundEnabled?: boolean
  coordinateLabelMode?: 'off' | 'inside' | 'outside'
  theme?: 'light' | 'dark'
}

const props = withDefaults(defineProps<Props>(), {
  isSoundEnabled: true,
  coordinateLabelMode: 'inside',
  theme: 'light',
})

const { t } = useI18n()

const { getOverlayTexture, getPieceImage, getSquareLabel, isWhiteSquare } = useBoardDisplay()
const pieceScale = ref(2)
// 棋盘尺寸由专题页持有：切换挑战时 TutorialBoard 会重挂载，用户手动调整过的尺寸仍保留
const boardSize = ref<number | null>(null)
const idleMousePos = { x: 0, y: 0 }

/** 关卡判定：讲解页与讲解步骤都不计入关卡数 */
const isChallenge = (step: TutorialStep): step is TutorialChallenge =>
  step.kind === 'collect-coins' || step.kind === 'move-as-required' || step.kind === 'promote'

const step = ref(0)
// 完成弹窗出现后仍停留在最后一步，所以索引最多到末尾
const stepIndex = computed(() => Math.min(step.value, props.topic.steps.length - 1))
const currentStep = computed<TutorialStep | null>(() => props.topic.steps[stepIndex.value] ?? null)

const currentIntro = computed(() => (currentStep.value?.kind === 'intro' ? currentStep.value : null))
const currentInfo = computed<InfoStep | null>(() => {
  const current = currentStep.value
  return current && current.kind === 'info' ? current : null
})
const currentChallenge = computed<TutorialChallenge | null>(() => {
  const current = currentStep.value
  return current && isChallenge(current) ? current : null
})

const totalChallenges = computed(() => props.topic.steps.filter(isChallenge).length)
const displayStep = computed(
  () => props.topic.steps.slice(0, stepIndex.value + 1).filter(isChallenge).length,
)
const isDone = computed(() => step.value >= props.topic.steps.length)

const nextTopic = computed(() => {
  const topics = props.category.topics
  const index = topics.findIndex((topic) => topic.id === props.topic.id)
  return index >= 0 ? (topics[index + 1] ?? null) : null
})

const nextTopicHref = computed(() =>
  nextTopic.value ? tutorialTopicUrl(props.category.id, nextTopic.value.id) : null,
)

const overviewHref = toolPageUrl(TUTORIAL_PAGE)

const createEmptyBoard = (): Board =>
  Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null as Piece | null))

const createDemoBoard = (demo: TutorialDemo): Board => {
  const board = createEmptyBoard()
  for (const blocker of demo.blockers ?? []) {
    board[blocker.row]![blocker.col] = { type: blocker.type, color: blocker.color, hasMoved: true }
  }
  // 没有主角棋子（例如吃子教学）时只展示 blockers 摆出的局面
  if (demo.piece) {
    board[demo.piece.row]![demo.piece.col] = {
      type: demo.piece.type,
      color: demo.piece.color,
      hasMoved: true,
    }
  }
  return board
}

const buildDemo = (
  demo: TutorialDemo | undefined,
): { board: Board; turnColor: Color; reachable: Square[] } | null => {
  if (!demo) return null
  const piece = demo.piece
  return {
    board: createDemoBoard(demo),
    // 演示棋盘不可交互：有主角时把「走棋方」设为对方，避免主角出现可抓取光标
    turnColor: piece ? (piece.color === 'white' ? 'black' : 'white') : 'black',
    // 只有指定了主角棋子才演示走法轨迹；没有主角的专题不强制显示轨迹
    reachable: piece
      ? getReachableSquares(piece.type, piece, piece.color, demo.blockers ?? [])
      : [],
  }
}

// 当前讲解页的演示棋盘
const currentDemoBoard = computed(() => buildDemo(currentIntro.value?.demo))

const currentInfoBoard = computed<{ board: Board; turnColor: Color } | null>(() => {
  const info = currentInfo.value
  if (!info) return null
  return {
    board: createDemoBoard({ piece: info.piece }),
    turnColor: info.piece.color === 'white' ? 'black' : 'white',
  }
})

const getInfoOverlayTexture: typeof getOverlayTexture = (
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
  const captureSquares = currentInfo.value?.captureSquares ?? []
  if (captureSquares.some((square) => square.row === row && square.col === col)) {
    return boardMoveCapture
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

let advanceTimer: number | null = null

const clearTimer = () => {
  if (advanceTimer !== null) {
    window.clearTimeout(advanceTimer)
    advanceTimer = null
  }
}

onUnmounted(clearTimer)

const handleSolved = () => {
  clearTimer()
  if (step.value < props.topic.steps.length - 1) {
    advanceTimer = window.setTimeout(() => {
      step.value += 1
      clearTimer()
    }, 1200)
    return
  }
  step.value += 1
}
</script>

<style scoped>
.topic-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

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
  gap: 0.75rem;
}

.topic-title {
  margin: 0;
  font-size: 1.3rem;
}

.topic-paragraph {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.step-actions {
  display: flex;
  justify-content: flex-end;
}

.completion-title {
  margin: 0;
  font-size: 1.2rem;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--color-overlay-heavy);
}

.dialog-box {
  width: 90%;
  max-width: 300px;
  padding: 1.5rem;
  text-align: center;
  background: var(--color-surface);
  box-shadow: none;
}

.dialog-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 1rem;
}
</style>
