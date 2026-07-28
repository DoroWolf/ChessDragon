<template>
  <div v-if="isAiEnabled" class="card dialogue-card" :key="dialogueKey">
    <div class="ai-avatar">
      <img :src="avatarSrc" alt="Aussir" class="avatar-img" />
    </div>
    <div class="dialogue-bubble">
      <span class="dialogue-text">{{ displayText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import avatarSrc from '../assets/texture/avatar/aussir.png'

interface Props {
  text: string
  dialogueKey: number
  isAiEnabled: boolean
}

const props = defineProps<Props>()

const displayText = ref('')
const fullText = ref('')
let typeTimer: ReturnType<typeof setInterval> | null = null
let charIndex = 0

function startTypewriter() {
  stopTypewriter()
  fullText.value = props.text
  displayText.value = ''
  charIndex = 0

  if (!props.text) return

  // 打字速度：每字约 40ms
  typeTimer = setInterval(() => {
    charIndex++
    displayText.value = fullText.value.slice(0, charIndex)
    if (charIndex >= fullText.value.length) {
      stopTypewriter()
    }
  }, 40)
}

function stopTypewriter() {
  if (typeTimer !== null) {
    clearInterval(typeTimer)
    typeTimer = null
  }
}

// 当台词内容或 key 变化时，重新开始打字
watch(
  () => [props.text, props.dialogueKey] as const,
  () => {
    startTypewriter()
  },
  { immediate: true },
)

onUnmounted(() => {
  stopTypewriter()
})
</script>

<style scoped>
/* RPG 对话框主容器 */
.dialogue-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: var(--color-page-bg);
}

/* 头像框样式 */
.ai-avatar {
  flex-shrink: 0;
  overflow: hidden;
}

.avatar-img {
  width: 90px;
  height: 90px;
  object-fit: cover;
  display: block;
}

/* 对话内容框 */
.dialogue-bubble {
  position: relative;
  flex: 1;
  min-width: 0;
  padding: 5px 0;
  font-size: 0.9rem;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}
</style>