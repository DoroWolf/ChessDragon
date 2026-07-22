<template>
  <div class="promotion" :style="computedStyle">
    <button 
      v-for="p in pieces" 
      :key="p" 
      type="button" 
      class="promote-btn" 
      @click="$emit('select', p)"
    >
      <img :src="`./texture/promotion/promotion_${p}_${color}.png`" :alt="p" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'

const props = defineProps<{ 
  color: 'white' | 'black'; 
  style?: CSSProperties 
}>()

defineEmits<{
  (e: 'select', piece: string): void
}>()

const pieces = computed(() => {
  return props.color === 'white' 
    ? ['queen', 'knight', 'rook', 'bishop'] 
    : ['bishop', 'rook', 'knight', 'queen']
})

// 如果父级传入的 style 包含位置，这里做一个简单的容错和整合
const computedStyle = computed(() => ({
  ...props.style,
}))
</script>

<style scoped>
.promotion {
  position: absolute;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  background: #ffffff;
  z-index: 60;
  overflow: hidden;
}

.promote-btn {
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  
  width: 100%;
  aspect-ratio: 1 / 1; 
  
  cursor: pointer;
}

.promote-btn:hover {
  background: rgba(0, 0, 0, 0.08);
}

.promote-btn img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  box-sizing: border-box;
}
</style>