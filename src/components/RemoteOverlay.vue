<template>
  <div v-if="mode" class="modal-backdrop">
    <div class="card dialog-box">
      <p class="dialog-message">{{ messageText }}</p>
      <p v-if="mode === 'opponent-left'" class="dialog-hint">{{ t('remote.opponentLeftHint') }}</p>

      <div class="dialog-buttons">
        <template v-if="mode === 'incoming'">
          <button type="button" class="btn" @click="$emit('respond', false)">
            {{ t('remote.decline') }}
          </button>
          <button type="button" class="btn btn-primary" @click="$emit('respond', true)">
            {{ t('remote.accept') }}
          </button>
        </template>

        <button v-else-if="mode === 'outgoing'" type="button" class="btn" @click="$emit('cancel-request')">
          {{ t('common.cancel') }}
        </button>

        <button v-else type="button" class="btn btn-primary" @click="$emit('back-to-home')">
          {{ t('common.done') }}
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

/** 同一时刻只展示一个弹窗：对手离开 > 收到请求 > 已发出的请求 */
const mode = computed<'opponent-left' | 'incoming' | 'outgoing' | null>(() => {
  if (props.opponentLeft) return 'opponent-left'
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
  if (mode.value === 'opponent-left') return t('remote.opponentLeft')
  const type = requestType.value
  if (!type) return ''
  return t(mode.value === 'incoming' ? incomingKeys[type] : outgoingKeys[type])
})
</script>

<style scoped>
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
</style>
