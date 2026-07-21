<template>
    <div class="setup-overlay">
        <section class="setup-panel nes-container with-title">
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
                    placeholder="请输入 FEN，例如：rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" />
            </div>

            <div class="setup-section">
                <h3>棋钟</h3>
                <label class="slider-row">
                    <span>限时（分钟）</span>
                    <input v-model.number="timeMinutes" type="range" min="0" max="180" step="1" />
                    <strong>{{ timeMinutes === 0 ? '不限时' : `${timeMinutes} 分钟` }}</strong>
                </label>

                <label v-if="timeMinutes > 0" class="slider-row">
                    <span>每步加时（秒）</span>
                    <input v-model.number="incrementSeconds" type="range" min="0" max="30" step="1" />
                    <strong>{{ incrementSeconds }} 秒</strong>
                </label>
            </div>

            <div class="setup-section">
                <h3>先手方</h3>
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

            <button type="button" class="nes-btn is-primary start-btn" @click="handleStart">
                开始对局
            </button>
        </section>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

export interface GameSetupConfig {
    boardMode: 'standard' | 'custom'
    fen: string
    timeMinutes: number
    incrementSeconds: number
    starter: 'black' | 'random' | 'white'
}

const emit = defineEmits<{
    start: [config: GameSetupConfig]
}>()

const boardMode = ref<'standard' | 'custom'>('standard')
const fenInput = ref('')
const timeMinutes = ref(10)
const incrementSeconds = ref(0)
const starter = ref<'black' | 'random' | 'white'>('white')
const errorMessage = ref('')

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
    background: rgba(16, 16, 16, 0.7);
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

.start-btn {
    width: 100%;
    margin-top: 8px;
}
</style>