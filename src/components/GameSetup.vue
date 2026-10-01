<template>
    <!-- 首页：上方 Logo，下方三个按钮 -->
    <section v-if="screen === 'home'" class="home-panel">
        <div class="title-section">
            <img :src="titleImg" alt="Chess Dragon" class="title-img" />
        </div>
        <div class="home-buttons">
            <button class="btn btn-home" @click="startSetup('ai')">{{ t('home.vsAI') }}</button>
            <button class="btn btn-home" @click="startSetup('human')">{{ t('home.vsHuman') }}</button>
            <button class="btn btn-home" @click="screen = 'remote'">{{ t('home.remote') }}</button>
        </div>
    </section>

    <!-- 远程对局：创建 / 加入 入口 -->
    <section v-else-if="screen === 'remote'" class="setup-panel with-title">
        <h2 class="screen-title">{{ t('remote.title') }}</h2>
        <div class="remote-actions">
            <button type="button" class="btn remote-action-btn btn-primary" @click="openRemoteCreate">
                <span>{{ t('remote.createRoom') }}</span>
            </button>
            <button type="button" class="btn remote-action-btn" @click="screen = 'remote-join'">
                <span>{{ t('remote.joinRoom') }}</span>
            </button>
        </div>
        <div class="setup-actions">
            <button type="button" class="btn bottom-btn" @click="screen = 'home'">{{ t('setup.back') }}</button>
        </div>
    </section>

    <!-- 远程对局：加入房间 -->
    <section v-else-if="screen === 'remote-join'" class="setup-panel with-title">
        <h2 class="screen-title">{{ t('remote.joinRoom') }}</h2>
        <p class="remote-hint">{{ t('remote.joinHint') }}</p>
        <input v-model="roomCodeInput" type="text" class="room-code-input can-select" maxlength="6"
            autocomplete="off" spellcheck="false" placeholder="SAMPLE"
            @input="handleRoomCodeInput" @keyup.enter="handleJoinRoom" />
        <p v-if="remoteErrorText" class="error-message">{{ remoteErrorText }}</p>
        <div class="setup-actions">
            <button type="button" class="btn bottom-btn" :disabled="isJoining" @click="screen = 'remote'">
                {{ t('setup.back') }}
            </button>
            <button type="button" class="btn bottom-btn btn-primary" :disabled="!isRoomCodeReady || isJoining"
                @click="handleJoinRoom">
                {{ isJoining ? t('remote.connecting') : t('remote.join') }}
            </button>
        </div>
    </section>

    <!-- 远程对局：等待对手加入 -->
    <section v-else-if="screen === 'remote-waiting'" class="setup-panel with-title">
        <h2 class="screen-title">{{ t('remote.waitingOpponent') }}</h2>
        <RemoteRoomCard :room-code="remoteRoomCode" :state="remoteState" :link-kind="remoteLinkKind" />
        <p v-if="remoteErrorText" class="error-message">{{ remoteErrorText }}</p>
        <div class="setup-actions">
            <button type="button" class="btn bottom-btn" @click="handleCancelRoom">{{ t('remote.cancel') }}</button>
        </div>
    </section>

    <!-- 对局设置面板 -->
    <section v-else class="setup-panel with-title">
        <div class="setup-section">
            <h3>{{ t('setup.board') }}</h3>
            <div class="option-group">
                <label class="option-card-btn" :class="{ active: boardMode === 'standard' }">
                    <input v-model="boardMode" type="radio" value="standard" />
                    <span class="card-icon" v-html="iconClassicSvg"></span>
                    <span>{{ t('setup.boardStandard') }}</span>
                </label>
                <label class="option-card-btn" :class="{ active: boardMode === 'chess960' }">
                    <input v-model="boardMode" type="radio" value="chess960" />
                    <span class="card-icon" v-html="iconChess960Svg"></span>
                    <span>{{ t('setup.boardChess960') }}</span>
                </label>
                <label class="option-card-btn" :class="{ active: boardMode === 'custom' }">
                    <input v-model="boardMode" type="radio" value="custom" />
                    <span class="card-icon" v-html="iconCustomSvg"></span>
                    <span>{{ t('setup.boardCustom') }}</span>
                </label>
            </div>

            <input v-if="boardMode === 'custom'" v-model="fenInput" type="text" class="fen-input"
                :placeholder="t('setup.fenPlaceholder')" />

            <template v-if="boardMode === 'custom' && fenInput.trim()">
                <!-- 用棋盘与棋子 icon 拼出当前 FEN 的预览 -->
                <FenPreview v-if="fenPreviewBoard" :board="fenPreviewBoard" :theme="theme"
                    :valid="isFenValid" />
                <p v-if="fenErrorKey" class="fen-hint">{{ t(fenErrorKey) }}</p>
            </template>
        </div>

        <div class="setup-section">
            <h3>{{ t('setup.clock') }}</h3>
            <label class="slider-row">
                <span>{{ t('setup.timeLimit') }}</span>
                <input v-model.number="timeMinutes" type="range" min="0" max="180" step="1" />
                <strong>{{ timeMinutes === 0 ? t('setup.unlimited') : t('setup.minutes', { n: timeMinutes }) }}</strong>
            </label>

            <label v-if="timeMinutes > 0" class="slider-row">
                <span>{{ t('setup.increment') }}</span>
                <input v-model.number="incrementSeconds" type="range" min="0" max="60" step="1" />
                <strong>{{ t('setup.seconds', { n: incrementSeconds }) }}</strong>
            </label>

            <!-- 快捷棋钟组合按钮 -->
            <div class="preset-clock-group">
                <button
                    v-for="preset in presetClocks"
                    :key="preset.label"
                    type="button"
                    class="option-card-btn preset-btn"
                    :class="{ active: isPresetActive(preset.minutes, preset.increment) }"
                    @click="applyPreset(preset.minutes, preset.increment)"
                >
                    {{ preset.label }}
                </button>
            </div>
        </div>

        <!-- 强度设置（仅人机对局） -->
        <div v-if="gameMode === 'ai'" class="setup-section">
            <h3>{{ t('setup.strength') }}</h3>
            <div class="option-group">
                <label v-for="level in 5" :key="level" class="option-card-btn difficulty-card-btn"
                    :class="{ active: difficulty === level }">
                    <input v-model="difficulty" type="radio" :value="level" />
                    <span>{{ level }}</span>
                </label>
            </div>
        </div>

        <!-- AI 风格设置（仅人机对局） -->
        <div v-if="gameMode === 'ai'" class="setup-section">
            <h3>{{ t('setup.aiStyle') }}</h3>
            <div class="option-group">
                <label class="option-card-btn" :class="{ active: aiStyle === 'balanced' }">
                    <input v-model="aiStyle" type="radio" value="balanced" />
                    <span>{{ t('setup.styleBalanced') }}</span>
                </label>
                <label class="option-card-btn" :class="{ active: aiStyle === 'aggressive' }">
                    <input v-model="aiStyle" type="radio" value="aggressive" />
                    <span>{{ t('setup.styleAggressive') }}</span>
                </label>
                <label class="option-card-btn" :class="{ active: aiStyle === 'defensive' }">
                    <input v-model="aiStyle" type="radio" value="defensive" />
                    <span>{{ t('setup.styleDefensive') }}</span>
                </label>
                <label class="option-card-btn" :class="{ active: aiStyle === 'unpredictable' }">
                    <input v-model="aiStyle" type="radio" value="unpredictable" />
                    <span>{{ t('setup.styleUnpredictable') }}</span>
                </label>
            </div>
        </div>

        <div v-if="showPlayAs" class="setup-section">
            <h3>{{ t('setup.playAs') }}</h3>
            <div class="option-group">
                <label class="option-card-btn starter-card-btn" :class="{ active: starter === 'black' }">
                    <input v-model="starter" type="radio" value="black" />
                    <img :src="kingBlackIcon" alt="" class="starter-icon" />
                    <span>{{ t('setup.sideBlack') }}</span>
                </label>
                <label class="option-card-btn starter-card-btn" :class="{ active: starter === 'random' }">
                    <input v-model="starter" type="radio" value="random" />
                    <img :src="kingRandomIcon" alt="" class="starter-icon" />
                    <span>{{ t('setup.sideRandom') }}</span>
                </label>
                <label class="option-card-btn starter-card-btn" :class="{ active: starter === 'white' }">
                    <input v-model="starter" type="radio" value="white" />
                    <img :src="kingWhiteIcon" alt="" class="starter-icon" />
                    <span>{{ t('setup.sideWhite') }}</span>
                </label>
            </div>
        </div>

        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

        <div class="setup-actions">
            <button type="button" class="btn bottom-btn" @click="handleSetupBack">
                {{ t('setup.back') }}
            </button>
            <button v-if="isRemoteSetup" type="button" class="btn bottom-btn btn-primary start-btn"
                :disabled="!canStartRemote" @click="handleCreateRoom">
                {{ t('remote.generateCode') }}
            </button>
            <button v-else type="button" class="btn bottom-btn btn-primary start-btn" :disabled="!canStart" @click="handleStart">
                {{ t('setup.start') }}
            </button>
        </div>
    </section>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { titleImg, kingBlackIcon, kingRandomIcon, kingWhiteIcon } from '../assets/resourcePaths'
import iconClassicSvg from '../assets/icon/classic.svg?raw'
import iconChess960Svg from '../assets/icon/chess960.svg?raw'
import iconCustomSvg from '../assets/icon/custom.svg?raw'
import { useI18n } from '../composables/useI18n'
import { validateFen, type FenErrorCode } from '../models/fen'
import type { MessageKey } from '../data/i18n'
import type { RemoteConnectionState, RemoteErrorCode, RemoteLinkKind } from '../remote/types'
import { isValidRoomCode, normalizeRoomCode } from '../remote/roomCode'
import FenPreview from './FenPreview.vue'
import RemoteRoomCard from './RemoteRoomCard.vue'

const props = withDefaults(
    defineProps<{
        theme?: 'light' | 'dark'
        remoteState?: RemoteConnectionState
        remoteRoomCode?: string
        remoteLinkKind?: RemoteLinkKind | null
        remoteErrorCode?: RemoteErrorCode | null
    }>(),
    {
        theme: 'light',
        remoteState: 'idle',
        remoteRoomCode: '',
        remoteLinkKind: null,
        remoteErrorCode: null,
    },
)

const { t } = useI18n()

export type AIStyle = 'balanced' | 'aggressive' | 'defensive' | 'unpredictable'

export interface GameSetupConfig {
    boardMode: 'standard' | 'custom' | 'chess960'
    fen: string
    timeMinutes: number
    incrementSeconds: number
    starter: 'black' | 'random' | 'white'
    gameMode: 'ai' | 'human' | 'remote'
    difficulty: number
    aiStyle: AIStyle
}

const emit = defineEmits<{
    start: [config: GameSetupConfig]
    'remote-create': [config: GameSetupConfig, hostColor: 'white' | 'black' | 'random']
    'remote-join': [code: string]
    'remote-cancel': []
    'remote-reset-error': []
}>()

type Screen = 'home' | 'setup' | 'remote' | 'remote-create' | 'remote-join' | 'remote-waiting'

const screen = ref<Screen>('home')
const gameMode = ref<'ai' | 'human' | 'remote'>('ai')
const difficulty = ref(3)
const aiStyle = ref<AIStyle>('balanced')

const boardMode = ref<'standard' | 'custom' | 'chess960'>('standard')
const fenInput = ref('')
const chess960Id = ref(518)
const timeMinutes = ref(10)
const incrementSeconds = ref(0)
const starter = ref<'black' | 'random' | 'white'>('white')
const errorMessage = ref('')

// ---- 远程对局 ----
const roomCodeInput = ref('')

const isRemoteSetup = computed(() => screen.value === 'remote-create')
const showPlayAs = computed(() => gameMode.value === 'ai' || isRemoteSetup.value)
const canStartRemote = computed(() => canStart.value)
const isRoomCodeReady = computed(() => isValidRoomCode(normalizeRoomCode(roomCodeInput.value)))
const isJoining = computed(() => props.remoteState === 'connecting')

const REMOTE_ERROR_KEYS: Record<RemoteErrorCode, MessageKey> = {
    'not-found': 'remote.notFound',
    'code-taken': 'remote.codeTaken',
    'connection-failed': 'remote.connectionFailed',
    'protocol-mismatch': 'remote.protocolMismatch',
}

const remoteErrorText = computed<MessageKey | null>(() =>
    props.remoteErrorCode ? REMOTE_ERROR_KEYS[props.remoteErrorCode] : null,
)


// ============================================================
// 常用棋钟预设组合
// ============================================================
const presetClocks = [
    { label: '1+0', minutes: 1, increment: 0 },
    { label: '1+1', minutes: 1, increment: 1 },
    { label: '2+1', minutes: 2, increment: 1 },
    { label: '3+0', minutes: 3, increment: 0 },
    { label: '3+2', minutes: 3, increment: 2 },
    { label: '5+0', minutes: 5, increment: 0 },
    { label: '5+3', minutes: 5, increment: 3 },
    { label: '10+0', minutes: 10, increment: 0 },
    { label: '10+5', minutes: 10, increment: 5 },
    { label: '15+10', minutes: 15, increment: 10 },
    { label: '20+0', minutes: 20, increment: 0 },
    { label: '30+0', minutes: 30, increment: 0 },
    { label: '60+0', minutes: 60, increment: 0 },
]

const applyPreset = (minutes: number, increment: number) => {
    timeMinutes.value = minutes
    incrementSeconds.value = increment
}

const isPresetActive = (minutes: number, increment: number) => {
    return timeMinutes.value === minutes && incrementSeconds.value === increment
}

const startSetup = (mode: 'ai' | 'human') => {
    gameMode.value = mode
    screen.value = 'setup'
}

const openRemoteCreate = () => {
    gameMode.value = 'remote'
    screen.value = 'remote-create'
}

const handleSetupBack = () => {
    screen.value = isRemoteSetup.value ? 'remote' : 'home'
}

const handleRoomCodeInput = (event: Event) => {
    const target = event.target as HTMLInputElement
    const normalized = normalizeRoomCode(target.value)
    roomCodeInput.value = normalized
    target.value = normalized
}

const handleJoinRoom = () => {
    if (isJoining.value) return
    const code = normalizeRoomCode(roomCodeInput.value)
    if (!isValidRoomCode(code)) return
    emit('remote-join', code)
}

const handleCreateRoom = () => {
    if (!canStart.value) return
    emit('remote-create', buildConfig('remote'), starter.value)
}

const handleCancelRoom = () => {
    emit('remote-cancel')
}

// 房主建房后进入等待界面；取消 / 关闭后回到远程对局入口
watch(
    () => props.remoteState,
    (state) => {
        if (state === 'creating' || state === 'waiting') {
            screen.value = 'remote-waiting'
            return
        }
        if ((state === 'idle' || state === 'closed') && screen.value === 'remote-waiting') {
            screen.value = 'remote'
        }
    },
)

// 进出加入房间界面时清空上一次的失败提示
watch(screen, (next, previous) => {
    if (next === 'remote-join' || previous === 'remote-join') {
        roomCodeInput.value = ''
        emit('remote-reset-error')
    }
})

// ============================================================
// Chess960 生成
// ============================================================
const generateChess960 = () => {
    chess960Id.value = Math.floor(Math.random() * 960) + 1
}

watch(boardMode, (newMode) => {
    if (newMode === 'chess960') {
        generateChess960()
    }
})

// ============================================================
// FEN 验证与预览
// ============================================================
const fenValidation = computed(() => validateFen(fenInput.value))

// 各类校验失败原因对应的提示文案
const FEN_ERROR_KEYS: Record<FenErrorCode, MessageKey> = {
    format: 'setup.invalidFen',
    king: 'setup.fenKingCount',
    pawnRank: 'setup.fenPawnRank',
    pieceCount: 'setup.fenPieceCount',
    castling: 'setup.fenCastling',
    enPassant: 'setup.fenEnPassant',
    illegalCheck: 'setup.fenIllegalCheck',
    checkmate: 'setup.fenCheckmate',
    stalemate: 'setup.fenStalemate',
    insufficientMaterial: 'setup.fenInsufficientMaterial',
}

// 空输入时只禁止开始，不提示错误
const isFenValid = computed(() => {
    if (boardMode.value !== 'custom') return true
    if (!fenInput.value.trim()) return true
    return fenValidation.value.valid
})

// 棋子摆放可解析时即给出预览（即使局面不合法也照常显示，便于用户定位问题）
const fenPreviewBoard = computed(() =>
    boardMode.value === 'custom' ? fenValidation.value.board : null,
)

const fenErrorKey = computed<MessageKey | null>(() => {
    if (boardMode.value !== 'custom' || !fenInput.value.trim()) return null
    const error = fenValidation.value.error
    return error ? FEN_ERROR_KEYS[error] : null
})

const buildChess960Fen = (): string => {
    const pieces = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'] as const

    const shuffleArray = <T,>(arr: T[]): T[] => {
        const a = [...arr]
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            const tmp = a[i]!
            a[i] = a[j]!
            a[j] = tmp
        }
        return a
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const shuffled = shuffleArray([...pieces])
        const bishopIndices = shuffled.reduce<number[]>((acc, p, i) => {
            if (p === 'b') acc.push(i)
            return acc
        }, [])
        const b1Color = bishopIndices[0]! % 2
        const b2Color = bishopIndices[1]! % 2
        if (b1Color === b2Color) continue

        const kingIdx = shuffled.indexOf('k')
        const rookIndices = shuffled.reduce<number[]>((acc, p, i) => {
            if (p === 'r') acc.push(i)
            return acc
        }, [])
        if (kingIdx < rookIndices[0]! || kingIdx > rookIndices[1]!) continue

        const backRankLower = shuffled.join('')
        const backRankUpper = backRankLower.toUpperCase()
        const emptyRow = '8'
        const rookFiles = rookIndices.sort((a, b) => b - a)
        const whiteRights = rookFiles.map((col) => String.fromCharCode(65 + col)).join('')
        const blackRights = whiteRights.toLowerCase()
        return `${backRankLower}/pppppppp/${emptyRow}/${emptyRow}/${emptyRow}/${emptyRow}/PPPPPPPP/${backRankUpper} w ${whiteRights}${blackRights} - 0 1`
    }
}

// ============================================================
// 是否可以开始对局
// ============================================================
const canStart = computed(() => {
    if (boardMode.value === 'custom') {
        const trimmed = fenInput.value.trim()
        if (!trimmed) return false
        return isFenValid.value
    }
    return true
})

const buildConfig = (mode: 'ai' | 'human' | 'remote'): GameSetupConfig => {
    let finalFen = ''
    if (boardMode.value === 'custom') {
        finalFen = fenInput.value.trim()
    } else if (boardMode.value === 'chess960') {
        finalFen = buildChess960Fen()
    }

    return {
        boardMode: boardMode.value,
        fen: finalFen,
        timeMinutes: timeMinutes.value,
        incrementSeconds: timeMinutes.value === 0 ? 0 : incrementSeconds.value,
        starter: starter.value,
        gameMode: mode,
        difficulty: difficulty.value,
        aiStyle: aiStyle.value,
    }
}

const handleStart = () => {
    errorMessage.value = ''
    emit('start', buildConfig(gameMode.value))
}
</script>

<style scoped>
.home-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 40px;
    text-align: center;
}

.title-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

.title-img {
    max-width: min(80vw, 500px); 
    max-height: 30vh;
    width: 100%;
    height: auto;
    object-fit: contain;
}

.home-buttons {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 260px;
}

.btn-home {
    width: 100%;
    padding: 14px 0;
    font-size: 1.15rem;
    font-weight: 600;
}

.setup-panel {
    /* box-sizing 必须显式声明：否则 min-width 还要再叠加左右各 20px 的内边距，撑破容器 */
    box-sizing: border-box;
    min-width: min(480px, 100%);
    max-width: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    
    padding: 20px;
    background: var(--color-surface);
    box-shadow: 2px 2px 0 var(--color-surface-shadow);
    
    display: flex;
    flex-direction: column;
}

.title {
    margin: 0 0 12px;
    font-size: 1.2rem;
    font-weight: 700;
    text-align: center;
}

.setup-section {
    margin-bottom: 16px;
}

.setup-section h3 {
    margin: 0 0 8px;
    font-size: 1rem;
}

.option-group {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    gap: 10px;
    padding-bottom: 6px;
    
    min-width: 0;             
}

.option-card-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border: 2px solid var(--color-border-light);
    cursor: pointer;
    transition: all 0.1s ease;
    user-select: none;
    flex-shrink: 0;
    white-space: nowrap;
}

/* 隐藏原生的单选框圆点 */
.option-card-btn input[type="radio"] {
    display: none;
}

.difficulty-card-btn {
    width: 40px;
    height: 40px;
    justify-content: center;
    padding: 0;
}

.option-card-btn.active {
    border: 2px solid var(--color-highlight);
}

.card-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.8em;
    height: 1.8rem;
    flex-shrink: 0;
    /* SVG 使用 currentColor，跟随主题文字色（暗色下为白色） */
    color: var(--color-text-primary);
}

.card-icon :deep(svg) {
    width: 100%;
    height: 100%;
    display: block;
}

.starter-card-btn {
    flex-direction: column;
    padding: 12px 16px;
    min-width: 80px;
}

.starter-icon {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.fen-input {
    /* 清掉左右外边距，避免 width: 100% 时外宽超出面板 */
    margin: 10px 0 0;
    width: 100%;
    box-sizing: border-box;
}

.fen-hint {
    margin: 4px 0 0;
    color: var(--color-error);
    font-size: 0.85rem;
}

/* 默认（大窗口）布局：采用 Grid 确保多行之间对齐齐平 */
.slider-row {
    display: grid;
    grid-template-columns: 100px 1fr 100px; 
    gap: 16px;
    align-items: center;
    margin-bottom: 12px;
}

.slider-row input[type="range"] {
    width: 100%;
}

.slider-row strong {
    text-align: right;
    white-space: nowrap;
}

/* 棋钟快捷选项样式 */
.preset-clock-group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
}

.preset-btn {
    background-color: transparent;
    padding: 2px 4px;
    font-size: 0.8rem;
    font-family: 'Unifont', system-ui, -apple-system, sans-serif;
}

@media (max-width: 480px) {
    .slider-row {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 8px 0;
    }

    /* 文字标签与数值保留在第一行左右两侧 */
    .slider-row span {
        font-weight: 500;
    }

    .slider-row strong {
        text-align: right;
    }

    /* 强行让 range 控件占满 100% 宽度，从而自动挤到下一行 */
    .slider-row input[type="range"] {
        order: 3;
        width: 100%;
        margin-top: 4px;
    }
}

.error-message {
    margin: 0 0 12px;
    color: var(--color-error);
    font-size: 0.95rem;
}

.setup-actions {
    display: flex;
    gap: 12px;
}

.start-btn {
    flex: 1;
}

/* ===== 远程对局 ===== */
.screen-title {
    margin: 0 0 16px;
    font-size: 1.1rem;
    font-weight: 700;
    text-align: center;
}

.remote-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 16px;
}

.remote-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
}

.remote-hint {
    margin: 0 0 10px;
    font-size: 0.8rem;
    color: var(--color-text-muted);
    text-align: center;
}

.room-code-input {
    /* 全局 input 规则带 margin: 3px，若配 width: 100% 会让外宽多出 6px 而撑破面板 */
    width: 100%;
    max-width: 260px;
    margin: 4px auto 8px;
    box-sizing: border-box;
    font-family: 'Unifont', monospace;
    font-size: 1.5rem;
    /* letter-spacing 会在末尾多出一个字距，配合 text-indent 让文字视觉居中 */
    letter-spacing: 0.25em;
    text-indent: 0.25em;
    text-align: center;
    text-transform: uppercase;
    padding: 10px 8px;
}

.setup-actions .bottom-btn {
    flex: 1;
}
</style>