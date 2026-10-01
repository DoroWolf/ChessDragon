<template>
  <!-- 大厅：大号房间码卡片 -->
  <div v-if="variant === 'full'" class="card room-card">
    <p class="room-card-title">{{ t('remote.roomCode') }}</p>

    <div class="room-code-row">
      <span class="room-code can-select">{{ roomCode }}</span>
      <button type="button" class="btn room-copy-btn" :title="t('remote.copyCode')" @click="copyCode">
        <span class="room-copy-icon" v-html="copied ? checkSvg : copySvg"></span>
      </button>
    </div>

    <p class="room-status" :class="statusClass">
      <span class="status-dot" :class="statusClass"></span>
      <span>{{ statusText }}</span>
    </p>
  </div>

  <!-- 对局中 / 侧边栏：紧凑条 -->
  <div v-else class="room-strip" :title="statusText">
    <span class="room-strip-icon" v-html="linkSvg"></span>
    <span class="room-strip-code can-select">{{ roomCode }}</span>
    <span class="status-dot" :class="statusClass"></span>
    <span class="room-strip-status">{{ statusText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '../composables/useI18n'
import { copyText } from '../remote/roomCode'
import type { RemoteConnectionState, RemoteLinkKind } from '../remote/types'
import copySvg from '../assets/icon/copy.svg?raw'
import checkSvg from '../assets/icon/check.svg?raw'
import linkSvg from '../assets/icon/link.svg?raw'

interface Props {
  roomCode: string
  state: RemoteConnectionState
  linkKind?: RemoteLinkKind | null
  variant?: 'full' | 'compact'
}

const props = withDefaults(defineProps<Props>(), {
  linkKind: null,
  variant: 'full',
})

const { t } = useI18n()
const copied = ref(false)
let copiedTimer: number | null = null

const copyCode = async () => {
  const ok = await copyText(props.roomCode)
  if (!ok) return
  copied.value = true
  if (copiedTimer !== null) window.clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => {
    copied.value = false
    copiedTimer = null
  }, 1500)
}

const statusClass = computed(() => {
  if (props.state === 'connected') return 'is-connected'
  if (props.state === 'waiting' || props.state === 'creating' || props.state === 'connecting') {
    return 'is-waiting'
  }
  return 'is-offline'
})

const statusText = computed(() => {
  switch (props.state) {
    case 'connected':
      return t('remote.connected')
    case 'connecting':
    case 'creating':
      return t('remote.connecting')
    case 'waiting':
      return t('remote.waiting')
    default:
      return t('remote.disconnected')
  }
})
</script>

<style scoped>
.room-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  width: 100%;
  box-sizing: border-box;
}

.room-card-title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: bold;
}

.room-code-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.room-code {
  font-family: 'Unifont', monospace;
  font-size: 1.8rem;
  letter-spacing: 0.25em;
  padding: 0.25rem 0.5rem 0.25rem 0.75rem;
  border: 2px solid var(--color-surface-border);
  background-color: var(--color-page-bg);
  color: var(--color-text-primary);
  box-shadow: inset 2px 2px 0 var(--color-surface-shadow);
}

.room-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  line-height: 1;
}

.room-copy-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
}

.room-copy-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.room-status {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.8rem;
}

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border: 1px solid var(--color-surface-border);
  background-color: var(--color-text-muted);
  animation: status-blink 1.2s steps(2, end) infinite;
}

.status-dot.is-connected {
  background-color: var(--color-btn-success);
  animation: none;
}

.status-dot.is-waiting {
  background-color: var(--color-btn-warning);
}

.status-dot.is-offline {
  background-color: var(--color-error);
  animation: none;
}

@keyframes status-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.25;
  }
}

/* ---- 紧凑条 ---- */
.room-strip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  border: 2px solid var(--color-border-light);
  background-color: var(--color-surface);
  font-size: 0.75rem;
  color: var(--color-text-primary);
  min-width: 0;
}

.room-strip-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  height: 1.1rem;
  flex-shrink: 0;
  color: var(--color-text-primary);
}

.room-strip-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.room-strip-code {
  font-family: 'Unifont', monospace;
  letter-spacing: 0.15em;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room-strip-status {
  color: var(--color-text-muted);
  white-space: nowrap;
}
</style>
