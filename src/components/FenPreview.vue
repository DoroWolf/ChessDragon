<template>
  <div class="fen-preview" :class="[`theme-${theme}`, { invalid: !valid }]">
    <div class="preview-grid">
      <template v-for="displayRow in 8" :key="`rank-${displayRow}`">
        <div v-for="displayCol in 8" :key="`${displayRow}-${displayCol}`" class="preview-square">
          <img class="square-texture" draggable="false" alt=""
            :src="isWhiteSquare(displayRow - 1, displayCol - 1) ? lightSquareTexture : darkSquareTexture" />

          <img v-if="pieceAt(displayRow - 1, displayCol - 1)" class="preview-piece" draggable="false"
            :src="pieceIcon(pieceAt(displayRow - 1, displayCol - 1)!)"
            :alt="pieceAt(displayRow - 1, displayCol - 1)!.type" />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { isWhiteSquare, type Board, type Piece } from '../models/chess'
import { boardBlack, boardGray, boardWhite, pieceIconImg } from '../assets/resourcePaths'

const props = withDefaults(
  defineProps<{
    board: Board
    theme?: 'light' | 'dark'
    valid?: boolean
  }>(),
  {
    theme: 'light',
    valid: true,
  },
)

const lightSquareTexture = computed(() => (props.theme === 'dark' ? boardGray : boardWhite))
const darkSquareTexture = computed(() => (props.theme === 'dark' ? boardBlack : boardGray))

const pieceAt = (row: number, col: number): Piece | null => props.board[row]?.[col] ?? null

const pieceIcon = (piece: Piece): string => pieceIconImg(piece.type, piece.color)
</script>

<style scoped>
.fen-preview {
  width: 100%;
  max-width: 280px;
  margin: 10px auto 0;
  padding: 4px;
  box-sizing: border-box;
  border: 2px solid var(--color-border-light);
  background: var(--color-surface);
  box-shadow: 2px 2px 0 var(--color-surface-shadow);
}

.fen-preview.invalid {
  border-color: var(--color-error);
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  grid-template-rows: repeat(8, minmax(0, 1fr));
  width: 100%;
  aspect-ratio: 1 / 1;
}

.preview-square {
  position: relative;
}

.square-texture,
.preview-piece {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.square-texture {
  object-fit: cover;
}

.preview-piece {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}
</style>
