<template>
    <!-- 首页：上方 Logo，下方三个按钮 -->
    <section v-if="screen === 'home'" class="home-panel">
        <div class="title-section">
            <img :src="titleImg" alt="Chess Dragon" class="title-img" />
        </div>
        <div class="home-buttons">
            <button class="btn btn-home" @click="startSetup('ai')">人机对局</button>
            <button class="btn btn-home" @click="startSetup('human')">双人对局</button>
            <button class="btn btn-home" :disabled="true" @click="handleRemote">远程对局</button>
        </div>
    </section>

    <!-- 对局设置面板 -->
    <section v-else class="setup-panel with-title">
        <div class="setup-section">
            <h3>棋盘</h3>
            <div class="option-group">
                <label class="option-card-btn" :class="{ active: boardMode === 'standard' }">
                    <input v-model="boardMode" type="radio" value="standard" />
                    <img :src="iconClassic" alt="" class="card-icon" />
                    <span>标准棋盘</span>
                </label>
                <label class="option-card-btn" :class="{ active: boardMode === 'chess960' }">
                    <input v-model="boardMode" type="radio" value="chess960" />
                    <img :src="iconChess960" alt="" class="card-icon" />
                    <span>Chess960</span>
                </label>
                <label class="option-card-btn" :class="{ active: boardMode === 'custom' }">
                    <input v-model="boardMode" type="radio" value="custom" />
                    <img :src="iconCustom" alt="" class="card-icon" />
                    <span>自定义棋盘</span>
                </label>
            </div>

            <input v-if="boardMode === 'custom'" v-model="fenInput" type="text" class="fen-input"
                placeholder="在此处粘贴 FEN 文本" />
            <p v-if="boardMode === 'custom' && fenInput.trim() && !isFenValid" class="fen-hint">无效的 FEN</p>
        </div>

        <div class="setup-section">
            <h3>棋钟</h3>
            <label class="slider-row">
                <span>限时</span>
                <input v-model.number="timeMinutes" type="range" min="0" max="180" step="1" />
                <strong>{{ timeMinutes === 0 ? '无限制' : `${timeMinutes} 分钟` }}</strong>
            </label>

            <label v-if="timeMinutes > 0" class="slider-row">
                <span>每步加时</span>
                <input v-model.number="incrementSeconds" type="range" min="0" max="60" step="1" />
                <strong>{{ incrementSeconds }} 秒</strong>
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
            <h3>强度</h3>
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
            <h3>AI 风格</h3>
            <div class="option-group">
                <label class="option-card-btn" :class="{ active: aiStyle === 'balanced' }">
                    <input v-model="aiStyle" type="radio" value="balanced" />
                    <span>均衡</span>
                </label>
                <label class="option-card-btn" :class="{ active: aiStyle === 'aggressive' }">
                    <input v-model="aiStyle" type="radio" value="aggressive" />
                    <span>进攻</span>
                </label>
                <label class="option-card-btn" :class="{ active: aiStyle === 'defensive' }">
                    <input v-model="aiStyle" type="radio" value="defensive" />
                    <span>防守</span>
                </label>
                <label class="option-card-btn" :class="{ active: aiStyle === 'unpredictable' }">
                    <input v-model="aiStyle" type="radio" value="unpredictable" />
                    <span>出其不意</span>
                </label>
            </div>
        </div>

        <div v-if="gameMode === 'ai'" class="setup-section">
            <h3>执棋方</h3>
            <div class="option-group">
                <label class="option-card-btn starter-card-btn" :class="{ active: starter === 'black' }">
                    <input v-model="starter" type="radio" value="black" />
                    <img :src="kingBlackIcon" alt="" class="starter-icon" />
                    <span>黑方</span>
                </label>
                <label class="option-card-btn starter-card-btn" :class="{ active: starter === 'random' }">
                    <input v-model="starter" type="radio" value="random" />
                    <img :src="kingRandomIcon" alt="" class="starter-icon" />
                    <span>随机</span>
                </label>
                <label class="option-card-btn starter-card-btn" :class="{ active: starter === 'white' }">
                    <input v-model="starter" type="radio" value="white" />
                    <img :src="kingWhiteIcon" alt="" class="starter-icon" />
                    <span>白方</span>
                </label>
            </div>
        </div>

        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

        <div class="setup-actions">
            <button type="button" class="btn bottom-btn" @click="screen = 'home'">
                返回
            </button>
            <button type="button" class="btn bottom-btn btn-primary start-btn" :disabled="!canStart" @click="handleStart">
                开始对局
            </button>
        </div>
    </section>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { titleImg, iconClassic, iconChess960, iconCustom, kingBlackIcon, kingRandomIcon, kingWhiteIcon } from '../assets/resourcePaths'

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
    remote: []
}>()

const screen = ref<'home' | 'setup'>('home')
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

const handleRemote = () => {
    emit('remote')
}

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
// FEN 验证
// ============================================================
const validateFen = (fen: string): boolean => {
    const trimmed = fen.trim()
    if (!trimmed) return false

    const parts = trimmed.split(/\s+/)
    if (parts.length < 2) return false

    const boardPart = parts[0]
    if (!boardPart) return false

    const rows = boardPart.split('/')
    if (rows.length !== 8) return false

    for (const row of rows) {
        let colCount = 0
        for (const char of row) {
            if (/\d/.test(char)) {
                colCount += Number.parseInt(char, 10)
            } else if (/[prnbqkPRNBQK]/.test(char)) {
                colCount += 1
            } else {
                return false
            }
        }
        if (colCount !== 8) return false
    }

    const turnPart = parts[1]
    if (turnPart !== 'w' && turnPart !== 'b') return false

    return true
}

const isFenValid = computed(() => {
    if (boardMode.value !== 'custom') return true
    const trimmed = fenInput.value.trim()
    if (!trimmed) return true
    return validateFen(trimmed)
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
        return `${backRankLower}/pppppppp/${emptyRow}/${emptyRow}/${emptyRow}/${emptyRow}/PPPPPPPP/${backRankUpper} w KQkq - 0 1`
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

const handleStart = () => {
    errorMessage.value = ''

    let finalFen = ''
    if (boardMode.value === 'custom') {
        finalFen = fenInput.value.trim()
    } else if (boardMode.value === 'chess960') {
        finalFen = buildChess960Fen()
    }

    emit('start', {
        boardMode: boardMode.value,
        fen: finalFen,
        timeMinutes: timeMinutes.value,
        incrementSeconds: timeMinutes.value === 0 ? 0 : incrementSeconds.value,
        starter: starter.value,
        gameMode: gameMode.value,
        difficulty: difficulty.value,
        aiStyle: aiStyle.value,
    })
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
    min-width: min(560px, 100%);
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
    width: 1.8em;
    height: 1.8rem;
    flex-shrink: 0;
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
    margin-top: 10px;
    width: 100%;
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
</style>