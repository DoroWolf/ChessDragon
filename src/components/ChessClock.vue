<template>
    <div v-if="isClockEnabled" class="clock-grid " :data-testid="testId">
        <div class="clock-side side-white" :class="{ 'is-active': activeColor === 'white' }">
            <span class="clock-time">{{ formattedWhiteTime }}</span>
        </div>
        <div class="clock-side side-black" :class="{ 'is-active': activeColor === 'black' }">
            <span class="clock-time">{{ formattedBlackTime }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Color } from '../models/chess'

interface Props {
    isClockEnabled?: boolean
    whiteTimeSeconds?: number | null
    blackTimeSeconds?: number | null
    activeColor?: Color | null
    testId?: string
}

const props = withDefaults(defineProps<Props>(), {
    isClockEnabled: true,
    whiteTimeSeconds: null,
    blackTimeSeconds: null,
    activeColor: null,
    testId: 'chess-clock',
})

const formatTime = (value: number | null | undefined) => {
    if (value === null || value === undefined || value < 0) {
        return '--:--'
    }

    const hours = Math.floor(value / 3600)
    const minutes = Math.floor((value % 3600) / 60)
    const seconds = value % 60

    if (hours > 0) {
        return [hours, minutes, seconds].map((unit) => String(unit).padStart(2, '0')).join(':')
    }

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const formattedWhiteTime = computed(() => formatTime(props.whiteTimeSeconds))
const formattedBlackTime = computed(() => formatTime(props.blackTimeSeconds))
</script>

<style scoped>
/* 2 列左右布局 */
.clock-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
}

/* 基础样式与内容居中 */
.clock-side {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 6px;
    border: 2px solid var(--color-border-medium);
    box-shadow: 2px 2px 0 var(--color-surface-shadow);
    transition: all 0.2s ease;
}

/* 白色方容器 */
.clock-side.side-white {
    background-color: var(--color-board-light);
    color: var(--color-board-dark);
}

/* 黑色方容器 */
.clock-side.side-black {
    background-color: var(--color-board-dark);
    color: var(--color-board-light);
}

/* 激活状态的高亮指示 */
.clock-side.is-active {
    border-color: var(--color-highlight);
}

.clock-time {
    font-size: 1rem;
    letter-spacing: 0.08em;
}
</style>