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
                        <input v-model="boardMode" type="radio" value="custom" />
                        <span>自定义棋盘</span>
                    </label>
                </div>

                <input v-if="boardMode === 'custom'" v-model="fenInput" type="text" class="fen-input"
                    placeholder="在此处粘贴 FEN 文本" />
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

            <div class="setup-section">
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
                <button type="button" class="btn btn-secondary" @click="screen = 'home'">
                    返回
                </button>
                <button type="button" class="btn btn-primary start-btn" @click="handleStart">
                    开始对局
                </button>
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

export type AIStyle = 'balanced' | 'aggressive' | 'defensive' | 'unpredictable'

export interface GameSetupConfig {
    boardMode: 'standard' | 'custom'
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

const boardMode = ref<'standard' | 'custom'>('standard')
const fenInput = ref('')
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

const handleStart = () => {
    errorMessage.value = ''

    if (boardMode.value === 'custom') {
        const trimmedFen = fenInput.value.trim()
        if (!trimmedFen) {
            errorMessage.value = '请输入自定义棋盘的 FEN。'
            return
        }

        const fenParts = trimmedFen.split(/\s+/)
        if (fenParts.length < 2) {
            errorMessage.value = 'FEN 至少需要包含棋盘布局和先手方信息。'
            return
        }
    }

    emit('start', {
        boardMode: boardMode.value,
        fen: fenInput.value.trim(),
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
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
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

.btn-secondary {
    flex: 0 0 auto;
    padding: 10px 20px;
    border: 1px solid #888;
    background: #fff;
    color: #555;
    font-size: 0.95rem;
    cursor: pointer;
    transition: background-color 0.15s;
}

.btn-secondary:hover {
    background: #f0f0f0;
}

.start-btn {
    flex: 1;
}
</style>