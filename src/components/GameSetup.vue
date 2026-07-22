<template>
    <div class="setup-overlay">
        <!-- 首页：上方 Logo，下方三个按钮 -->
        <section v-if="screen === 'home'" class="home-panel">
            <div class="title-section">
                <!-- 修改处：将文字标题替换为图片 Logo -->
                <img src="/texture/title.png" alt="Chess Dragon" class="title-img" />
            </div>
            <div class="home-buttons">
                <button class="btn btn-home" @click="startSetup('ai')">人机对战</button>
                <button class="btn btn-home" @click="startSetup('human')">双人对战</button>
                <button class="btn btn-home btn-home--secondary" @click="handleRemote">远程对战</button>
            </div>
        </section>

        <!-- 对局设置面板 -->
        <section v-else class="setup-panel with-title">
            <div class="setup-section">
                <h3>棋盘</h3>
                <div class="option-group">
                    <label class="option-card">
                        <input v-model="boardMode" type="radio" value="standard" />
                        <span>标准棋盘</span>
                    </label>
                    <label class="option-card">
                        <input v-model="boardMode" type="radio" value="chess960" />
                        <span>Chess960</span>
                    </label>
                    <label class="option-card">
                        <input v-model="boardMode" type="radio" value="custom" />
                        <span>自定义棋盘</span>
                    </label>
                </div>

                <div v-if="boardMode === 'chess960'" class="chess960-row">
                    <span class="chess960-label">#{{ chess960Id }}</span>
                    <button type="button" class="btn" @click="generateChess960">重新生成</button>
                </div>

                <input v-if="boardMode === 'custom'" v-model="fenInput" type="text" class="fen-input"
                    placeholder="在此处粘贴 FEN 文本" />
                <p v-if="boardMode === 'custom' && fenInput.trim() && !isFenValid" class="fen-hint">无效的 FEN</p>
            </div>

            <div class="setup-section">
                <h3>棋钟</h3>
                <label class="slider-row">
                    <span>限时（分钟）</span>
                    <input v-model.number="timeMinutes" type="range" min="0" max="180" step="1" />
                    <strong>{{ timeMinutes === 0 ? '无限制' : `${timeMinutes} 分钟` }}</strong>
                </label>

                <label v-if="timeMinutes > 0" class="slider-row">
                    <span>每步加时（秒）</span>
                    <input v-model.number="incrementSeconds" type="range" min="0" max="30" step="1" />
                    <strong>{{ incrementSeconds }} 秒</strong>
                </label>
            </div>

            <!-- 强度设置（仅人机对战） -->
            <div v-if="gameMode === 'ai'" class="setup-section">
                <h3>强度</h3>
                <div class="option-group">
                    <label v-for="level in 5" :key="level" class="option-card difficulty-card"
                        :class="{ active: difficulty === level }">
                        <input v-model="difficulty" type="radio" :value="level" />
                        <span>{{ level }}</span>
                    </label>
                </div>
            </div>

            <!-- AI 风格设置（仅人机对战） -->
            <div v-if="gameMode === 'ai'" class="setup-section">
                <h3>AI 风格</h3>
                <div class="option-group">
                    <label class="option-card" :class="{ active: aiStyle === 'balanced' }">
                        <input v-model="aiStyle" type="radio" value="balanced" />
                        <span>均衡</span>
                    </label>
                    <label class="option-card" :class="{ active: aiStyle === 'aggressive' }">
                        <input v-model="aiStyle" type="radio" value="aggressive" />
                        <span>进攻</span>
                    </label>
                    <label class="option-card" :class="{ active: aiStyle === 'defensive' }">
                        <input v-model="aiStyle" type="radio" value="defensive" />
                        <span>防守</span>
                    </label>
                    <label class="option-card" :class="{ active: aiStyle === 'unpredictable' }">
                        <input v-model="aiStyle" type="radio" value="unpredictable" />
                        <span>出其不意</span>
                    </label>
                </div>
            </div>

            <div v-if="gameMode === 'ai'" class="setup-section">
                <h3>执棋方</h3>
                <div class="option-group">
                    <label class="option-card">
                        <input v-model="starter" type="radio" value="black" />
                        <span>黑方</span>
                    </label>
                    <label class="option-card">
                        <input v-model="starter" type="radio" value="random" />
                        <span>随机</span>
                    </label>
                    <label class="option-card">
                        <input v-model="starter" type="radio" value="white" />
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
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue' // 1. 引入 watch

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

// 2. 监听 boardMode 切换，只要选了 chess960 就会刷新 id
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
.setup-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
    background-color: #f0f0f0;
}

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
    max-width: 60vh;
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
    border: 2px solid #212529;
    background: #fff;
    color: #212529;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
}

.btn-home:hover {
    background: #212529;
    color: #fff;
}

.btn-home--secondary {
    border-color: #888;
    color: #666;
}

.btn-home--secondary:hover {
    background: #888;
    color: #fff;
}

.setup-panel {
    width: min(560px, 100%);
    max-height: 90vh;
    overflow: auto;
    padding: 20px;
    background: #fff;
    box-shadow: 2px 2px 0 #909294;
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
    flex-wrap: wrap;
    gap: 10px;
}

.option-card {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border: 1px solid #d0d0d0;
    cursor: pointer;
}

.difficulty-card {
    width: 40px;
    height: 40px;
    justify-content: center;
    padding: 0;
    font-size: 1.1rem;
    font-weight: 600;
}

.difficulty-card.active {
    border-color: #212529;
    background: #212529;
    color: #fff;
}

.fen-input {
    width: 100%;
    box-sizing: border-box;
    margin-top: 8px;
    padding: 8px;
    border: 1px solid #d0d0d0;
}

.fen-hint {
    margin: 4px 0 0;
    color: #c33;
    font-size: 0.85rem;
}

.chess960-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
}

.chess960-label {
    font-weight: 600;
    font-size: 0.95rem;
}

.slider-row {
    display: grid;
    grid-template-columns: 120px 1fr auto;
    gap: 10px;
    align-items: center;
    margin-bottom: 8px;
}

.error-message {
    margin: 0 0 12px;
    color: #c33;
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