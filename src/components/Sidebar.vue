<template>
  <aside class="sidebar">
    <ChessClock :is-clock-enabled="isClockEnabled" :white-time-seconds="whiteTimeSeconds"
      :black-time-seconds="blackTimeSeconds" :active-color="activeColor" :test-id="clockTestId" />

    <div class="material-row">
      <div class=" material-diff">
        <span v-if="materialDiffText" class="material-diff-text">{{ materialDiffText }}</span>
        <span v-else class="material-diff-text"></span>
      </div>
      <button type="button" class="btn flip-sidebar-btn" title="翻转棋盘" @click="$emit('toggle-flip')">
        🔄
      </button>
    </div>

    <div 
      class="card  game-status"
      :class="{ 'turn-black': currentTurn === 'black', 'turn-white': currentTurn === 'white' }"
    >
      <div v-if="gameStatus" class="status-message">{{ gameStatus }}</div>
      <div v-else class="current-turn">{{ currentTurn === 'white' ? '白方' : '黑方' }}执子</div>
    </div>

    <div v-if="isGameOver" class="button-group">
      <button type="button" class="btn settings-btn" @click="$emit('back-to-home')">
        返回
      </button>
      <button type="button" class="btn btn-primary" @click="$emit('restart')">
        重赛
      </button>
      <button type="button" class="btn btn-info" :disabled="!pgnText" @click="copyPGN">
        {{ copyStatusText === '复制' ? '复制 PGN' : copyStatusText }}
      </button>
    </div>
    <div v-else class="button-group">
      <button type="button" class="btn btn-warning" :disabled="isUndoDisabled" @click="$emit('undo')">
        悔棋
      </button>
      <button
        type="button"
        class="btn"
        :class="isClaimableDraw ? 'btn-success' : 'btn-primary'"
        :disabled="isDrawOfferDisabled"
        @click="handleDrawClick"
      >
        {{ isClaimableDraw ? '宣告和棋' : '提议和棋' }}
      </button>
      <button type="button" class="btn btn-danger" :disabled="isGameActionDisabled" @click="handleResignClick">
        认输
      </button>
    </div>

    <!-- 二次确认弹窗 Modal -->
    <div v-if="showConfirmModal" class="modal-backdrop">
      <div class="card dialog-box">
        <p class="dialog-message">{{ confirmMessage }}</p>
        <div class="dialog-buttons">
          <button type="button" class="btn" @click="cancelConfirm">取消</button>
          <button type="button" class="btn" @click="executeConfirm">确认</button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Board, Color, PieceType } from '../models/chess'
import ChessClock from './ChessClock.vue'

interface Props {
  isClockEnabled?: boolean
  moveHistory: string[]
  currentTurn: Color
  gameStatus?: string
  halfmoveClock?: number
  positionCount?: number
  isGameOver?: boolean
  isFlipped: boolean
  isSoundEnabled: boolean
  coordinateLabelMode: 'off' | 'inside' | 'outside'
  board?: Board | null
  playerColor?: Color
  whiteTimeSeconds?: number | null
  blackTimeSeconds?: number | null
  activeColor?: Color | null
  clockTestId?: string
  hasGameStarted?: boolean
  gameMode?: 'ai' | 'human' | 'remote'
}

interface MovePair {
  number: number
  white: string
  black?: string
}

const props = withDefaults(defineProps<Props>(), {
  isClockEnabled: true,
  gameStatus: undefined,
  halfmoveClock: 0,
  positionCount: 1,
  isGameOver: false,
  isFlipped: false,
  isSoundEnabled: true,
  coordinateLabelMode: 'inside',
  board: null,
  playerColor: 'white',
  whiteTimeSeconds: null,
  blackTimeSeconds: null,
  activeColor: null,
  clockTestId: 'sidebar-chess-clock',
  hasGameStarted: false,
  gameMode: 'human',
})

const emit = defineEmits<{
  undo: []
  draw: []
  resign: []
  restart: []
  'back-to-home': []
  'toggle-flip': []
  'update:isSoundEnabled': [value: boolean]
  'update:coordinateLabelMode': [value: 'off' | 'inside' | 'outside']
}>()

const copyStatusText = ref('复制')

const showConfirmModal = ref(false)
const confirmMessage = ref('')
const pendingAction = ref<'draw' | 'resign' | null>(null)

const isUndoDisabled = computed(() => {
  if (props.moveHistory.length === 0 || props.isGameOver || !!props.gameStatus) return true
  // 黑方执棋 + AI 模式：只剩 AI 第一步时禁止撤销，避免死锁
  if (props.gameMode === 'ai' && props.playerColor === 'black' && props.moveHistory.length <= 1) return true
  return false
})

const isGameActionDisabled = computed(() => {
  return !props.hasGameStarted || props.isGameOver || !!props.gameStatus
})

const isDrawOfferDisabled = computed(() => {
  if (isGameActionDisabled.value) return true
  if (isClaimableDraw.value) return false
  if (props.gameMode === 'ai') return true
  return false
})

const isClaimableDraw = computed(() => {
  return props.halfmoveClock >= 100 || props.positionCount >= 3
})

const movePairs = computed<MovePair[]>(() => {
  const pairs: MovePair[] = []
  for (let i = 0; i < props.moveHistory.length; i += 2) {
    pairs.push({
      number: Math.floor(i / 2) + 1,
      white: props.moveHistory[i] || '...',
      black: props.moveHistory[i + 1],
    })
  }
  return pairs
})

const gameResult = computed(() => {
  if (!props.isGameOver && !props.gameStatus) return ''

  if (props.gameStatus?.includes('白棋胜利')) {
    return '1-0'
  }
  if (props.gameStatus?.includes('黑棋胜利')) {
    return '0-1'
  }
  if (props.gameStatus?.includes('和棋')) {
    return '1/2-1/2'
  }
  return ''
})

const pgnText = computed(() => {
  const moves = movePairs.value
    .map((pair) => {
      return pair.black
        ? `${pair.number}. ${pair.white} ${pair.black}`
        : `${pair.number}. ${pair.white}`
    })
    .join(' ')

  if (!moves) return ''

  return gameResult.value ? `${moves} ${gameResult.value}` : moves
})

const copyPGN = async () => {
  if (!pgnText.value) return
  try {
    await navigator.clipboard.writeText(pgnText.value)
    copyStatusText.value = '已复制！'
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = pgnText.value
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    copyStatusText.value = '已复制！'
  } finally {
    setTimeout(() => {
      copyStatusText.value = '复制'
    }, 2000)
  }
}

const handleDrawClick = () => {
  if (isClaimableDraw.value) {
    emit('draw')
  } else if (props.gameMode !== 'ai') {
    confirmMessage.value = '确定要提议和棋吗？'
    pendingAction.value = 'draw'
    showConfirmModal.value = true
  }
}

const handleResignClick = () => {
  if (props.gameMode === 'human') {
    const turnName = props.currentTurn === 'white' ? '白方' : '黑方'
    confirmMessage.value = `确定要让${turnName}认输吗？`
  } else {
    confirmMessage.value = '确定要认输吗？'
  }
  pendingAction.value = 'resign'
  showConfirmModal.value = true
}

const executeConfirm = () => {
  if (pendingAction.value === 'draw') {
    emit('draw')
  } else if (pendingAction.value === 'resign') {
    emit('resign')
  }
  cancelConfirm()
}

const cancelConfirm = () => {
  showConfirmModal.value = false
  confirmMessage.value = ''
  pendingAction.value = null
}

const PIECE_UNICODE: Record<PieceType, { white: string; black: string }> = {
  pawn: { white: '♙', black: '♟' },
  rook: { white: '♖', black: '♜' },
  knight: { white: '♘', black: '♞' },
  bishop: { white: '♗', black: '♝' },
  queen: { white: '♕', black: '♛' },
  king: { white: '♔', black: '♚' },
}

const PIECE_VALUE: Record<PieceType, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0,
}

const INITIAL_PIECES: Record<PieceType, number> = {
  pawn: 8,
  rook: 2,
  knight: 2,
  bishop: 2,
  queen: 1,
  king: 1,
}

// 辅助函数：当棋子数量超过 10 个时截断并加上省略号
const formatPieceIcons = (pieces: string[], limit = 10): string => {
  if (pieces.length <= limit) {
    return pieces.join('')
  }
  return pieces.slice(0, limit).join('') + '…'
}

const materialDiffText = computed(() => {
  if (!props.board) return ''

  // 统计当前棋盘上双方存活棋子数量
  const whiteCounts: Record<PieceType, number> = {
    pawn: 0, rook: 0, knight: 0, bishop: 0, queen: 0, king: 0,
  }
  const blackCounts: Record<PieceType, number> = {
    pawn: 0, rook: 0, knight: 0, bishop: 0, queen: 0, king: 0,
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = props.board[r]?.[c] ?? null
      if (piece && piece.type !== 'king') {
        if (piece.color === 'white') {
          whiteCounts[piece.type]++
        } else {
          blackCounts[piece.type]++
        }
      }
    }
  }

  // 计算被吃掉的棋子：初始数量 - 存活数量
  const whiteLost: Record<PieceType, number> = {
    pawn: INITIAL_PIECES.pawn - whiteCounts.pawn,
    rook: INITIAL_PIECES.rook - whiteCounts.rook,
    knight: INITIAL_PIECES.knight - whiteCounts.knight,
    bishop: INITIAL_PIECES.bishop - whiteCounts.bishop,
    queen: INITIAL_PIECES.queen - whiteCounts.queen,
    king: 0,
  }
  const blackLost: Record<PieceType, number> = {
    pawn: INITIAL_PIECES.pawn - blackCounts.pawn,
    rook: INITIAL_PIECES.rook - blackCounts.rook,
    knight: INITIAL_PIECES.knight - blackCounts.knight,
    bishop: INITIAL_PIECES.bishop - blackCounts.bishop,
    queen: INITIAL_PIECES.queen - blackCounts.queen,
    king: 0,
  }

  // 计算纯子力差距（白方视角）：白方被吃 = 黑方获得，黑方被吃 = 白方获得
  // 正值 = 白方优势
  let netScore = 0
  for (const type of ['pawn', 'knight', 'bishop', 'rook', 'queen'] as PieceType[]) {
    netScore += (blackLost[type] - whiteLost[type]) * PIECE_VALUE[type]
  }

  // 抵消完全相同类型的棋子
  const whiteDisplay: string[] = []
  const blackDisplay: string[] = []

  const displayOrder: PieceType[] = ['queen', 'rook', 'bishop', 'knight', 'pawn']

  for (const type of displayOrder) {
    // 白方被吃 = 黑方持有的优势显示为黑色棋子
    const wLost = whiteLost[type]
    // 黑方被吃 = 白方持有的优势显示为白色棋子
    const bLost = blackLost[type]

    // 互相抵消
    const net = wLost - bLost
    if (net > 0) {
      // 白方多丢了此类型棋子，黑方优势，显示黑色棋子
      for (let i = 0; i < net; i++) {
        blackDisplay.push(PIECE_UNICODE[type].black)
      }
    } else if (net < 0) {
      // 黑方多丢了此类型棋子，白方优势，显示白色棋子
      for (let i = 0; i < -net; i++) {
        whiteDisplay.push(PIECE_UNICODE[type].white)
      }
    }
  }

  if (whiteDisplay.length === 0 && blackDisplay.length === 0) {
    return ''
  }

  const useWhitePerspective = props.gameMode === 'human' || props.playerColor === 'white'
  const isWhitePlayer = useWhitePerspective
  const myPieces = isWhitePlayer ? whiteDisplay : blackDisplay
  const opponentPieces = isWhitePlayer ? blackDisplay : whiteDisplay

  const scoreFromMyPerspective = isWhitePlayer ? netScore : -netScore
  const scoreSign = scoreFromMyPerspective > 0 ? '+' : scoreFromMyPerspective < 0 ? '' : ''
  const scoreStr = scoreFromMyPerspective !== 0 ? `${scoreSign}${scoreFromMyPerspective}` : ''

  const parts: string[] = []
  if (opponentPieces.length > 0) {
    parts.push(formatPieceIcons(opponentPieces, 10))
  }
  if (myPieces.length > 0) {
    parts.push(formatPieceIcons(myPieces, 10))
  }
  if (scoreStr) {
    parts.push(scoreStr)
  }

  return parts.join(' ')
})
</script>

<style scoped>
@import url('https://fonts.cdnfonts.com/css/unifont');

.sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  width: 100%;
  max-width: 300px;
  background-color: #f0f0f0;
  font-family: 'Unifont', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #222;
}

.game-status {
  padding: 0.75rem;
  text-align: center;
  font-weight: bold;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.game-status.turn-black {
  background-color: #484A4B;
  color: #F3F9FC;
}

.game-status.turn-black .status-message,
.game-status.turn-black .current-turn {
  color: #F3F9FC;
}

.game-status.turn-white {
  background-color: #F3F9FC;
  color: #484A4B;
}

.game-status.turn-white .status-message,
.game-status.turn-white .current-turn {
  color: #484A4B;
}

.status-message,
.current-turn {
  font-size: 0.9rem;
}

.material-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.material-diff {
  font-size: 1rem;
  min-height: 1.5rem;
  line-height: 1.5rem;
  display: flex;
  align-items: center;
  margin-left: 2px;
  flex: 1;
}

.flip-sidebar-btn {
  padding: 0.2rem 0.5rem;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.button-group {
  display: flex;
  flex-direction: row;
  gap: 0.25rem;
  width: 100%;
}

.button-group.Single-btn {
  display: block;
}

.button-group.Single-btn .restart-btn {
  width: 100%;
}

.button-group .btn {
  flex: 1;
  width: auto;
  padding: 0.35rem 0.15rem;
}

/* 弹窗布局专有样式 */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dialog-box {
  background: white;
  padding: 1.5rem;
  max-width: 280px;
  width: 90%;
  text-align: center;
}

.dialog-message {
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.dialog-buttons {
  display: flex;
  justify-content: space-around;
  gap: 0.5rem;
}

.dialog-buttons .btn {
  flex: 1;
  font-size: 0.8rem;
  padding: 0.25rem 0.5rem;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
  text-align: left;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
}

.setting-label {
  font-weight: bold;
}

.flip-btn {
  font-size: 0.7rem;
  padding: 2px 8px;
}

.custom-checkbox {
  width: 1rem;
  height: 1rem;
  cursor: pointer;
}

.select-wrapper {
  width: auto;
}
</style>