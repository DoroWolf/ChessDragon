<template>
    <div v-if="isClockEnabled" class="clock-grid" :data-testid="testId">
        <div class="clock-side side-white" :class="{
            'is-active': activeColor === 'white',
            'is-low-time': isLowTime(whiteTimeSeconds) && activeColor === 'white',
        }">
            <span class="clock-time" :class="{ 'text-low-time': isLowTime(whiteTimeSeconds) }">
                {{ formatWhiteTime }}
            </span>
        </div>
        <div class="clock-side side-black" :class="{
            'is-active': activeColor === 'black',
            'is-low-time': isLowTime(blackTimeSeconds) && activeColor === 'black',
        }">
            <span class="clock-time" :class="{ 'text-low-time': isLowTime(blackTimeSeconds) }">
                {{ formatBlackTime }}
            </span>
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
    hasGameStarted?: boolean
    testId?: string
}

const props = withDefaults(defineProps<Props>(), {
    isClockEnabled: true,
    whiteTimeSeconds: null,
    blackTimeSeconds: null,
    activeColor: null,
    hasGameStarted: false,
    testId: 'chess-clock',
})

// 判断是否 ≤10 秒（包括已超时为 0 的情况，保留红色样式）
const isLowTime = (value: number | null | undefined) => {
    if (value === null || value === undefined) return false
    return value <= 10
}

// 根据时间值的分数部分推导冒号可见性（与倒计时同步，0.5s 亮 / 0.5s 暗）
const colonVisible = (value: number) => {
    return (value % 1) >= 0.5
}

// 基础格式化（无冒号闪烁）
const formatTime = (value: number | null | undefined) => {
    if (value === null || value === undefined || value < 0) {
        return '--:--'
    }

    const hours = Math.floor(value / 3600)
    const minutes = Math.floor((value % 3600) / 60)
    const seconds = Math.floor(value % 60)

    if (hours > 0) {
        return [hours, minutes, seconds].map((unit) => String(unit).padStart(2, '0')).join(':')
    }

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// 带冒号闪烁的格式化
const formatTimeWithBlink = (value: number) => {
    if (value < 0) return '--:--'

    const hours = Math.floor(value / 3600)
    const minutes = Math.floor((value % 3600) / 60)
    const seconds = Math.floor(value % 60)
    const formatUnit = (num: number) => String(num).padStart(2, '0')
    const c = colonVisible(value) ? ':' : ' '

    if (hours > 0) {
        return `${formatUnit(hours)}${c}${formatUnit(minutes)}${c}${formatUnit(seconds)}`
    }

    return `${formatUnit(minutes)}${c}${formatUnit(seconds)}`
}

// 带 0.1 秒精度 + 冒号闪烁的格式化
const formatTimeWithTenthsAndBlink = (value: number) => {
    if (value < 0) return '--:--'

    const hours = Math.floor(value / 3600)
    const minutes = Math.floor((value % 3600) / 60)
    const sec = value % 60
    const wholeSeconds = Math.floor(sec)
    const tenths = Math.floor((sec - wholeSeconds) * 10)
    const formatUnit = (num: number) => String(num).padStart(2, '0')
    const c = colonVisible(value) ? ':' : ' '

    if (hours > 0) {
        return `${formatUnit(hours)}${c}${formatUnit(minutes)}${c}${formatUnit(wholeSeconds)}.${tenths}`
    }

    return `${formatUnit(minutes)}${c}${formatUnit(wholeSeconds)}.${tenths}`
}

// 仅 ≤10 秒时显示 0.1 秒精度（无闪烁版本，给非激活方用）
const formatTimeWithTenths = (value: number) => {
    if (value < 0) return '--:--'

    const hours = Math.floor(value / 3600)
    const minutes = Math.floor((value % 3600) / 60)
    const sec = value % 60
    const wholeSeconds = Math.floor(sec)
    const tenths = Math.floor((sec - wholeSeconds) * 10)
    const formatUnit = (num: number) => String(num).padStart(2, '0')

    if (hours > 0) {
        return `${formatUnit(hours)}:${formatUnit(minutes)}:${formatUnit(wholeSeconds)}.${tenths}`
    }

    return `${formatUnit(minutes)}:${formatUnit(wholeSeconds)}.${tenths}`
}

// 计算每个方向的时间显示
const formatWhiteTime = computed(() => {
    const val = props.whiteTimeSeconds
    if (val === null || val === undefined || !props.hasGameStarted) {
        return formatTime(val)
    }
    const isActive = props.activeColor === 'white'
    if (!isActive) {
        if (val <= 10) return formatTimeWithTenths(val)
        return formatTime(val)
    }
    if (val <= 10) return formatTimeWithTenthsAndBlink(val)
    return formatTimeWithBlink(val)
})

const formatBlackTime = computed(() => {
    const val = props.blackTimeSeconds
    if (val === null || val === undefined || !props.hasGameStarted) {
        return formatTime(val)
    }
    const isActive = props.activeColor === 'black'
    if (!isActive) {
        if (val <= 10) return formatTimeWithTenths(val)
        return formatTime(val)
    }
    if (val <= 10) return formatTimeWithTenthsAndBlink(val)
    return formatTimeWithBlink(val)
})
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

/* 低时间状态（< 10秒）的高亮边框 */
.clock-side.is-low-time {
    border-color: var(--color-danger, #dc3545);
}

.clock-time {
    font-size: 1rem;
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
}

/* 低于10秒时文本变红 */
.clock-time.text-low-time {
    color: var(--color-danger, #dc3545);
    font-weight: bold;
}
</style>