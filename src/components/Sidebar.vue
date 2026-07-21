<template>
  <aside class="sidebar">
    <ChessClock :white-time-seconds="whiteTimeSeconds" :black-time-seconds="blackTimeSeconds"
      :active-color="activeColor" :test-id="clockTestId" />

    <div class="nes-container game-status">
      <div v-if="gameStatus" class="status-message">{{ gameStatus }}</div>
      <div v-else class="current-turn">{{ currentTurn === 'white' ? '白棋' : '黑棋' }}执子</div>
    </div>

    <!-- 棋谱显示区 -->
    <div class="nes-container with-title">
      <div class="title-bar">
        <p class="title">棋谱</p>
        <button type="button" class="nes-btn is-primary copy-btn" :disabled="moveHistory.length === 0" @click="copyPGN">
          {{ copyStatusText }}
        </button>
      </div>

      <div class="moves-list">
        <div v-for="turn in movePairs" :key="turn.number"
          :class="['move-pair', { 'last-move-pair': turn.number === movePairs.length && !gameResult }]">
          <span class="move-number">{{ turn.number }}.</span>
          <span class="move-white">{{ turn.white }}</span>
          <span class="move-black">{{ turn.black || '' }}</span>
        </div>

        <!-- 将对局结果放在序号位置 -->
        <div v-if="gameResult" class="move-pair game-result-move-pair">
          <span class="move-number game-result-text">{{ gameResult }}</span>
        </div>
      </div>
    </div>

    <div v-if="isGameOver" class="button-group Single-btn">
      <button type="button" class="nes-btn is-primary restart-btn" @click="$emit('restart')">
        重赛
      </button>
    </div>
    <div v-else class="button-group">
      <button type="button" class="nes-btn is-warning" :disabled="isUndoDisabled" @click="$emit('undo')">
        悔棋
      </button>
      <button type="button" class="nes-btn is-success" :disabled="isGameActionDisabled" @click="handleDrawClick">
        {{ isClaimableDraw ? '宣告和棋' : '申请和棋' }}
      </button>
      <button type="button" class="nes-btn is-error" :disabled="isGameActionDisabled" @click="handleResignClick">
        投降
      </button>
    </div>

    <!-- 设置按钮 -->
    <div class="settings-action">
      <button type="button" class="nes-btn is-normal settings-toggle-btn" @click="showSettingsModal = true">
        设置
      </button>
    </div>

    <!-- 设置弹窗 Modal -->
    <div v-if="showSettingsModal" class="modal-backdrop">
      <div class="nes-container dialog-box settings-dialog">
        <p class="dialog-title">游戏设置</p>

        <div class="settings-list">
          <!-- 翻转棋盘（按钮形式） -->
          <div class="setting-item">
            <span class="setting-label">棋盘方向</span>
            <button type="button" class="nes-btn is-primary flip-btn" @click="$emit('toggle-flip')">
              翻转棋盘
            </button>
          </div>

          <!-- 音效开关 -->
          <div class="setting-item">
            <span class="setting-label">音效</span>
            <label class="nes-pointer">
              <input type="checkbox" class="nes-checkbox" :checked="isSoundEnabled" @change="handleSoundChange" />
              <span></span>
            </label>
          </div>

          <!-- 棋盘坐标标记 -->
          <div class="setting-item">
            <span class="setting-label">棋盘标志</span>
            <div class="nes-select is-small select-wrapper">
              <select :value="coordinateLabelMode" @change="handleCoordinateChange">
                <option value="off">关闭</option>
                <option value="inside">内侧</option>
                <option value="outside">外侧</option>
              </select>
            </div>
          </div>
        </div>

        <div class="dialog-buttons">
          <button type="button" class="nes-btn is-primary" @click="showSettingsModal = false">完成</button>
        </div>
      </div>
    </div>

    <!-- 二次确认弹窗 Modal -->
    <div v-if="showConfirmModal" class="modal-backdrop">
      <div class="nes-container dialog-box">
        <p class="dialog-title">确认提示</p>
        <p class="dialog-message">{{ confirmMessage }}</p>
        <div class="dialog-buttons">
          <button type="button" class="nes-btn" @click="cancelConfirm">取消</button>
          <button type="button" class="nes-btn is-primary" @click="executeConfirm">确认</button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import type { Color } from '../models/chess'
import ChessClock from './ChessClock.vue'

interface Props {
  moveHistory: string[]
  currentTurn: Color
  gameStatus?: string
  halfmoveClock?: number
  positionCount?: number
  isGameOver?: boolean
  isFlipped: boolean
  isSoundEnabled: boolean
  coordinateLabelMode: 'off' | 'inside' | 'outside'
  whiteTimeSeconds?: number | null
  blackTimeSeconds?: number | null
  activeColor?: Color | null
  clockTestId?: string
  // 新增：接收对局是否已经正式开始/进行的标志
  hasGameStarted?: boolean
}

interface MovePair {
  number: number
  white: string
  black?: string
}

// 定义 localStorage 的 Key 常量
const STORAGE_KEYS = {
  SOUND_ENABLED: 'chess_sound_enabled',
  COORDINATE_MODE: 'chess_coordinate_mode',
} as const

const props = withDefaults(defineProps<Props>(), {
  gameStatus: undefined,
  halfmoveClock: 0,
  positionCount: 1,
  isGameOver: false,
  isFlipped: false,
  isSoundEnabled: true,
  coordinateLabelMode: 'inside',
  whiteTimeSeconds: null,
  blackTimeSeconds: null,
  activeColor: null,
  clockTestId: 'sidebar-chess-clock',
  hasGameStarted: false,
})

const emit = defineEmits<{
  undo: []
  draw: []
  resign: []
  restart: []
  'toggle-flip': []
  'update:isSoundEnabled': [value: boolean]
  'update:coordinateLabelMode': [value: 'off' | 'inside' | 'outside']
}>()

// 组件挂载时，从 localStorage 读取持久化的设置并通知父组件同步状态
onMounted(() => {
  const savedSound = localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED)
  if (savedSound !== null) {
    emit('update:isSoundEnabled', savedSound === 'true')
  }

  const savedMode = localStorage.getItem(STORAGE_KEYS.COORDINATE_MODE)
  if (savedMode === 'off' || savedMode === 'inside' || savedMode === 'outside') {
    emit('update:coordinateLabelMode', savedMode)
  }
})

// 处理音效变更，更新本地存储并 emit 事件
const handleSoundChange = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked
  localStorage.setItem(STORAGE_KEYS.SOUND_ENABLED, String(checked))
  emit('update:isSoundEnabled', checked)
}

// 处理棋盘标志变更，更新本地存储并 emit 事件
const handleCoordinateChange = (e: Event) => {
  const value = (e.target as HTMLSelectElement).value as 'off' | 'inside' | 'outside'
  localStorage.setItem(STORAGE_KEYS.COORDINATE_MODE, value)
  emit('update:coordinateLabelMode', value)
}

const copyStatusText = ref('复制')

const showConfirmModal = ref(false)
const showSettingsModal = ref(false)
const confirmMessage = ref('')
const pendingAction = ref<'draw' | 'resign' | null>(null)

const isUndoDisabled = computed(() => {
  return props.moveHistory.length === 0 || props.isGameOver || !!props.gameStatus
})

const isGameActionDisabled = computed(() => {
  const isStarted = props.hasGameStarted || props.moveHistory.length > 0
  return !isStarted || props.isGameOver || !!props.gameStatus
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
  } else {
    confirmMessage.value = '确定要向对手申请和棋吗？'
    pendingAction.value = 'draw'
    showConfirmModal.value = true
  }
}

const handleResignClick = () => {
  const turnName = props.currentTurn === 'white' ? '白棋' : '黑棋'
  confirmMessage.value = `确定要让 ${turnName} 投降吗？`
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

/* 标题与复制按钮栏 */
.title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #212529;
  padding: 0.25rem 0;
  background-color: #fff;
}

:deep(.nes-container .title) {
  margin: 0;
  padding: 0 0.5rem;
  font-weight: bold;
  border-bottom: none;
}

.copy-btn {
  font-size: 0.7rem !important;
  padding: 2px 6px !important;
  margin-right: 0.25rem;
}

/* 棋谱显示区 */
.moves-list {
  height: 240px;
  overflow-y: auto;
  padding: 0.5rem;
  background-color: #fff;
  border: 2px solid #212529;
  margin-top: 0.5rem;
  font-family: 'Unifont', monospace;
}

.move-pair {
  display: flex;
  padding: 0.25rem;
  font-size: 0.9rem;
  line-height: 1.4;
  font-family: 'Unifont', monospace;
}

.move-number {
  font-weight: bold;
  width: 2.5em;
  color: #666;
  flex-shrink: 0;
}

.move-white,
.move-black {
  flex: 1;
  color: #212529;
}

.move-pair.last-move-pair {
  background-color: #fffacd;
}

.game-result-move-pair {
  background-color: #e9ecef;
  margin-top: 0.25rem;
}

.game-result-text {
  color: #212529;
  width: auto;
}

.game-status {
  padding: 0.75rem;
  text-align: center;
  font-weight: bold;
}

.status-message {
  color: #212529;
  font-size: 0.9rem;
}

.current-turn {
  color: #212529;
  font-size: 0.9rem;
}

.nes-btn {
  font-family: 'Unifont', system-ui;
  font-size: 0.7rem;
  white-space: nowrap;
  border: 2px solid #212529;
  cursor: pointer;
  text-align: center;
}

.restart-btn {
  font-size: 0.85rem !important;
  padding: 0.5rem !important;
}

.settings-action {
  width: 100%;
}

.settings-toggle-btn {
  width: 100%;
  font-size: 0.8rem !important;
  padding: 0.4rem !important;
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

.button-group .nes-btn {
  flex: 1;
  width: auto;
  padding: 0.35rem 0.15rem;
}

.button-group .nes-btn:disabled,
.copy-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button-group .nes-btn:not(:disabled):hover,
.settings-toggle-btn:hover {
  transform: translateY(-2px);
}

.moves-list::-webkit-scrollbar {
  width: 8px;
}

.moves-list::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.moves-list::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

.moves-list::-webkit-scrollbar-thumb:hover {
  background: #555;
}

:deep(.nes-container) {
  border: 2px solid #212529;
  background-color: #fff;
  padding: 1rem;
  box-shadow: 2px 2px 0 #212529;
}

:deep(.nes-container.with-title) {
  padding-top: 0;
}

/* 弹窗样式 */
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

.dialog-title {
  font-weight: bold;
  margin-bottom: 0.75rem;
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

.dialog-buttons .nes-btn {
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
  font-size: 0.7rem !important;
  padding: 2px 8px !important;
}

.setting-item .nes-pointer,
.setting-item .nes-checkbox,
.setting-item .nes-checkbox+span {
  cursor: default !important;
}

.select-wrapper {
  width: auto;
}

.select-wrapper.nes-select {
  cursor: default !important;
}

.select-wrapper select {
  cursor: default !important;
  font-size: 0.75rem !important;
  height: auto !important;
  padding: 2px 8px !important;

  /* 实心边框设置 */
  border: 2px solid #212529 !important;
  /* 使用实心线代替 NES 的图像边框 */
  border-image: none !important;
  /* 移除 NES CSS 默认的像素 image-border */
  border-radius: 0;
  /* 保留直角风格 */
  background-color: #fff;

  /* 取消 CSS pixelated 光标 */
  cursor: default !important;
}

/* 覆盖 NES 模拟的下拉箭头 Hover 时的像素光标 */
.select-wrapper.nes-select::after {
  display: none !important;
}
</style>