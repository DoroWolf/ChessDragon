<template>
  <!-- 对方已离开：覆盖式弹窗，需要玩家确认后返回首页 -->
  <div v-if="opponentLeft" class="modal-backdrop">
    <div class="card dialog-box">
      <p class="dialog-message">{{ t('remote.opponentLeft') }}</p>
      <p class="dialog-hint">{{ t('remote.opponentLeftHint') }}</p>
      <div class="dialog-buttons">
        <button type="button" class="btn btn-primary" @click="$emit('back-to-home')">
          {{ t('common.done') }}
        </button>
      </div>
    </div>
  </div>

  <!-- 请求相关提示：非阻塞提示条，容器不接管指针事件，棋盘始终可用 -->
  <div v-else-if="mode" class="notice-stack">
    <div class="card notice-card">
      <span class="notice-message">{{ messageText }}</span>

      <div class="notice-actions">
        <template v-if="mode === 'incoming'">
          <button type="button" class="btn" @click="$emit('respond', false)">
            {{ t('remote.decline') }}
          </button>
          <button type="button" class="btn btn-primary" @click="$emit('respond', true)">
            {{ t('remote.accept') }}
          </button>
        </template>

        <button v-else type="button" class="btn" @click="$emit('cancel-request')">
          {{ t('common.cancel') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../composables/useI18n'

interface Props {
  pendingUndoRequest?: boolean
  pendingDrawOffer?: boolean
  pendingRematchRequest?: boolean
  outgoingRequest?: 'undo' | 'draw' | 'rematch' | null
  opponentLeft?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  pendingUndoRequest: false,
  pendingDrawOffer: false,
  pendingRematchRequest: false,
  outgoingRequest: null,
  opponentLeft: false,
})

defineEmits<{
  respond: [accepted: boolean]
  'cancel-request': []
  'back-to-home': []
}>()

const { t } = useI18n()

/** 同一时刻只展示一个提示：收到请求 > 已发出的请求 */
const mode = computed<'incoming' | 'outgoing' | null>(() => {
  if (props.pendingUndoRequest || props.pendingDrawOffer || props.pendingRematchRequest) {
    return 'incoming'
  }
  if (props.outgoingRequest) return 'outgoing'
  return null
})

const requestType = computed<'undo' | 'draw' | 'rematch' | null>(() => {
  if (props.pendingUndoRequest) return 'undo'
  if (props.pendingDrawOffer) return 'draw'
  if (props.pendingRematchRequest) return 'rematch'
  return props.outgoingRequest
})

const incomingKeys = {
  undo: 'remote.undoRequest',
  draw: 'remote.drawOffer',
  rematch: 'remote.rematchRequest',
} as const

const outgoingKeys = {
  undo: 'remote.waitingUndo',
  draw: 'remote.waitingDraw',
  rematch: 'remote.waitingRematch',
} as const

const messageText = computed(() => {
  const type = requestType.value
  if (!type) return ''
  return t(mode.value === 'incoming' ? incomingKeys[type] : outgoingKeys[type])
})
</script>

<style scoped>
/* ---- 覆盖式弹窗：对方已离开 ---- */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: var(--color-overlay-heavy);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1200;
}

.dialog-box {
  background: var(--color-surface);
  padding: 1.5rem;
  max-width: 280px;
  width: 90%;
  text-align: center;
}

.dialog-message {
  font-size: 0.85rem;
  margin: 0 0 0.75rem;
}

.dialog-hint {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  margin: 0 0 1rem;
  line-height: 1.4;
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

/* ---- 非阻塞提示条：固定在底部中央，避开棋盘上方内容以减少遮挡观感 ---- */
.notice-stack {
  position: fixed;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1500;
  max-width: min(94vw, 460px);
  width: max-content;
  /* 关键：容器不拦截指针事件，保证棋盘照常可拖动 / 点击 */
  pointer-events: none;
}

.notice-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  /* 只有卡片自身可交互 */
  pointer-events: auto;
}

.notice-message {
  font-size: 0.8rem;
  line-height: 1.3;
  min-width: 0;
}

.notice-actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}

.notice-actions .btn {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
}

@media (max-width: 480px) {
  .notice-card {
    flex-direction: column;
    align-items: stretch;
    gap: 0.4rem;
  }

  .notice-actions {
    justify-content: flex-end;
  }
}
</style>
