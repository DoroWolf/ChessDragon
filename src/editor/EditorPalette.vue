<template>
  <!-- 调色板：白方 / 黑方各一行；光标跟在白兵之后，橡皮擦跟在黑兵之后 -->
  <div class="palette">
    <div class="palette-row">
      <button v-for="type in PIECE_TYPES" :key="`white-${type}`" type="button" class="palette-btn"
        :class="{ active: isSelected('white', type) }" :title="t(PIECE_LABEL_KEYS[type])"
        @click="emit('select', { kind: 'piece', type, color: 'white' })">
        <img :src="pieceIconImg(type, 'white')" alt="" draggable="false" />
      </button>
      <button type="button" class="palette-btn" :class="{ active: isCursorSelected }"
        :title="t('editor.move')" @click="emit('select', { kind: 'cursor' })">
        <span class="tool-icon" v-html="moveSvg"></span>
      </button>
    </div>

    <div class="palette-row">
      <button v-for="type in PIECE_TYPES" :key="`black-${type}`" type="button" class="palette-btn"
        :class="{ active: isSelected('black', type) }" :title="t(PIECE_LABEL_KEYS[type])"
        @click="emit('select', { kind: 'piece', type, color: 'black' })">
        <img :src="pieceIconImg(type, 'black')" alt="" draggable="false" />
      </button>
      <button type="button" class="palette-btn" :class="{ active: isEraserSelected }"
        :title="t('editor.remove')" @click="emit('select', { kind: 'empty' })">
        <span class="tool-icon" v-html="removeSvg"></span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Color, PieceType } from '../models/chess'
import type { MessageKey } from '../data/i18n'
import { pieceIconImg } from '../assets/resourcePaths'
import { useI18n } from '../composables/useI18n'
import type { EditorTool } from './types'
import removeSvg from '../assets/icon/cross.svg?raw'
import moveSvg from '../assets/icon/cursor.svg?raw'

const props = defineProps<{ selected: EditorTool }>()

const emit = defineEmits<{ select: [tool: EditorTool] }>()

const { t } = useI18n()

// 与设置页的棋子顺序保持一致（王、后、车、象、马、兵）
const PIECE_TYPES: PieceType[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']

const PIECE_LABEL_KEYS: Record<PieceType, MessageKey> = {
  pawn: 'editor.piecePawn',
  knight: 'editor.pieceKnight',
  bishop: 'editor.pieceBishop',
  rook: 'editor.pieceRook',
  queen: 'editor.pieceQueen',
  king: 'editor.pieceKing',
}

const isSelected = (color: Color, type: PieceType): boolean =>
  props.selected.kind === 'piece' && props.selected.color === color && props.selected.type === type

const isEraserSelected = computed(() => props.selected.kind === 'empty')
const isCursorSelected = computed(() => props.selected.kind === 'cursor')
</script>

<style scoped>
.palette {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.palette-row {
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  align-items: center;
  gap: 6px;
}

.palette-btn {
  flex: 1 1 0;
  min-width: 0;
  max-width: 48px;
  aspect-ratio: 1 / 1;
  padding: 2px;
  box-sizing: border-box;
  border: 2px solid var(--color-border-light);
  background-color: var(--color-surface);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.palette-btn.active {
  border-color: var(--color-highlight);
}

.palette-btn img,
.tool-icon {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.tool-icon {
  color: var(--color-text-primary);
}

.tool-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
