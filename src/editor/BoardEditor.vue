<template>
  <section class="editor-container" :class="{ 'cursor-mode': isCursorTool, 'is-dragging': isDragging }"
    :style="{ '--piece-scale': pieceScale }">
    <!-- 左上角按钮组：与主页一致的 FAB 样式 -->
    <div class="top-left-fabs">
      <button type="button" class="fab-btn" :title="t('app.help')" @click="openHelpWindow">
        <span class="fab-icon" v-html="tutorialSvg"></span>
      </button>
    </div>

    <!-- 右上角按钮组：与主页一致的 GitHub / 设置 -->
    <div class="top-right-fabs">
      <a href="https://github.com/DoroWolf/ChessDragon" target="_blank" rel="noopener" class="fab-btn"
        title="GitHub">
        <span class="fab-icon" v-html="githubSvg"></span>
      </a>
      <button type="button" class="fab-btn" :title="t('app.settings')" @click="showSettingsModal = true">
        <span class="fab-icon" v-html="settingSvg"></span>
      </button>
    </div>

    <div class="editor-body">
      <!-- 左：正式对局棋盘（沿用 BoardPanel，含缩放把手与坐标样式） -->
      <section class="board-column" @contextmenu.prevent="handleContextMenu">
        <BoardPanel :board="board" :current-turn="turn" :selected-square="null" :possible-moves="[]"
          :is-dragging="isDragging" :drag-start-square="dragStartSquare" :hover-square="hoverSquare"
          :mouse-pos="mousePos" :is-mouse-down="isDragging" :promotion-pending="null"
          :promotion-style="null" :is-draw="false" :has-resigned="null" :timeout-winner="null"
          :coordinate-label-mode="coordinateLabelMode" :is-flipped="isFlipped" :theme="theme"
          :premove="null" :last-move="null" :can-premove="false" :is-chess960="false"
          :get-overlay-texture="getEditorOverlayTexture" :get-piece-image="getEditorPieceImage"
          :get-square-label="getSquareLabel" :is-white-square="isWhiteSquare"
          @update:piece-scale="(val: number) => pieceScale = val"
          @square-mousedown="handleSquareMouseDown"
          @square-touchstart="handleSquareTouchStart"
          @square-mouseenter="handleSquareMouseEnter"
          @square-mouseleave="hoverSquare = null"
          @board-touchmove="handleBoardTouchMove"
          @board-touchend="handleBoardTouchEnd" />
      </section>

      <!-- 右：控制面板 -->
      <section class="panel-column">
        <div class="card panel-section">
          <EditorPalette :selected="selectedTool" @select="selectedTool = $event" />
        </div>

        <!-- 走棋方 / 易位权 / 吃过路兵：统一使用同一种小标题 -->
        <div class="card panel-section">
          <div class="select-wrapper select-wrapper-block">
            <select class="select-input" :value="turn" @change="handleTurnChange">
              <option value="white">{{ t('editor.whiteTurn') }}</option>
              <option value="black">{{ t('editor.blackTurn') }}</option>
            </select>
          </div>

          <h4 class="sub-heading">{{ t('editor.castling') }}</h4>
          <!-- 白方一列、黑方一列 -->
          <div class="castle-grid">
            <label v-for="right in CASTLING_RIGHTS" :key="right" class="option-chip"
              :class="{ active: castling[right], disabled: !castlingAvailable[right] }">
              <input type="checkbox" :checked="castling[right]" :disabled="!castlingAvailable[right]"
                @change="toggleCastling(right, ($event.target as HTMLInputElement).checked)" />
              <span>{{ t(CASTLING_LABEL_KEYS[right]) }}</span>
            </label>
          </div>

          <!-- 吃过路兵：标题内联，与下拉菜单同一行 -->
          <div class="field-row">
            <h4 class="sub-heading">{{ t('editor.enPassant') }}</h4>
            <div class="select-wrapper">
              <select v-model="enPassant" class="select-input">
                <option value="-">-</option>
                <option v-for="target in enPassantOptions" :key="target" :value="target">{{ target }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- FEN：输入即自动导入，右侧带复制按钮 -->
        <div class="card panel-section">
          <h3 class="section-heading">{{ t('editor.fen') }}</h3>
          <!-- 输入即自动导入；失焦/回车时不合法则回退文本；右侧放复制按钮 -->
          <div class="fen-input-row">
            <input v-model="fenText" type="text" class="fen-input can-select" spellcheck="false"
              autocomplete="off" @blur="commitFen" @keyup.enter="commitFen" />
            <button type="button" class="btn icon-btn" :class="{ 'btn-success': isCopied }"
              :title="isCopied ? t('editor.copied') : t('editor.copyFen')" @click="copyFen">
              <span class="btn-icon" v-html="isCopied ? checkSvg : copySvg"></span>
            </button>
          </div>
          <!-- 预留固定高度的警告区，避免 FEN 框随提示出现/消失而跳动 -->
          <div class="fen-warning">
            <p v-if="fenErrorKey" class="error-text">{{ t(fenErrorKey) }}</p>
            <p v-else-if="copyFailed" class="error-text">{{ t('editor.copyFailed') }}</p>
          </div>
        </div>

        <div class="plain-section">
          <div class="button-stack">
            <button type="button" class="btn" @click="loadInitialPosition">{{ t('editor.initial') }}</button>
            <button type="button" class="btn" @click="clearBoard">{{ t('editor.clearBoard') }}</button>
            <button type="button" class="btn" @click="isFlipped = !isFlipped">{{t('sidebar.flipBoard') }}</button>
          </div>
        </div>

        <div class="plain-section">
          <button type="button" class="btn btn-primary" :disabled="!fenValid"
            @click="showQuickPlayModes = true">
            {{ t('editor.quickPlay') }}
          </button>
        </div>
      </section>
    </div>

    <!-- 快速对局遮罩：三个模式按钮，点击遮罩返回 -->
    <div v-if="showQuickPlayModes" class="modal-backdrop" @click="showQuickPlayModes = false">
      <div class="card dialog-box" @click.stop>
        <div class="dialog-buttons">
          <button type="button" class="btn" @click="startQuickPlay('ai')">{{ t('editor.quickPlayAi') }}</button>
          <button type="button" class="btn" @click="startQuickPlay('human')">{{ t('editor.quickPlayHuman') }}</button>
          <button type="button" class="btn" @click="startQuickPlay('remote')">{{ t('editor.quickPlayRemote') }}</button>
        </div>
      </div>
    </div>

    <!-- 与主页一致的游戏设置弹窗 -->
    <SettingsModal :visible="showSettingsModal" :is-sound-enabled="isSoundEnabled"
      :coordinate-label-mode="coordinateLabelMode" :theme="theme" @close="showSettingsModal = false"
      @update:is-sound-enabled="(val: boolean) => isSoundEnabled = val"
      @update:coordinate-label-mode="(val: 'off' | 'inside' | 'outside') => coordinateLabelMode = val"
      @update:theme="(val: 'light' | 'dark') => theme = val" />
  </section>
</template>


<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import BoardPanel from '../components/BoardPanel.vue'
import SettingsModal from '../components/SettingsModal.vue'
import EditorPalette from './EditorPalette.vue'
import type { EditorTool } from './types'
import { useI18n } from '../composables/useI18n'
import { useSettings } from '../composables/useSettings'
import { useBoardDisplay } from '../composables/useBoardDisplay'
import { createInitialBoard, type Board, type Color, type Square } from '../models/chess'
import {
  boardToFen,
  canHaveCastlingRight,
  deriveEnPassantTargets,
  parseFen,
  parseFenBoardLayout,
  validateFen,
  type CastlingRight,
} from '../models/fen'
import { FEN_ERROR_KEYS } from '../data/fenErrorKeys'
import type { MessageKey } from '../data/i18n'
import { writeQuickPlay, type QuickPlayGameMode } from '../data/quickPlay'
import { TUTORIAL_PAGE, MAIN_PAGE, decodeFenQuery, encodeFenQuery, openToolWindow, toolPageUrl } from '../data/toolPages'
import { boardMoveHighlighted, pieceImg } from '../assets/resourcePaths'
import { copyText } from '../remote/roomCode'
import tutorialSvg from '../assets/icon/openedBook.svg?raw'
import settingSvg from '../assets/icon/setting.svg?raw'
import githubSvg from '../assets/icon/github.svg?raw'
import copySvg from '../assets/icon/copy.svg?raw'
import checkSvg from '../assets/icon/check.svg?raw'

const { t } = useI18n()

// 界面上不再显示大标题，改用浏览器标签页标题体现（随语言切换更新）
watchEffect(() => {
  document.title = `Chess Dragon · ${t('editor.title')}`
})

// 主题 / 坐标标签 / 音效与主程序共用 localStorage，两个页面的观感与设置保持一致
const { isSoundEnabled, coordinateLabelMode, theme } = useSettings()

// 棋盘渲染所需的共用能力（棋子图片、叠加纹理、坐标标签、翻转）
const { isFlipped, getOverlayTexture, getPieceImage, getSquareLabel, isWhiteSquare } =
  useBoardDisplay()

const CASTLING_RIGHTS: CastlingRight[] = ['K', 'Q', 'k', 'q']

/** 四个易位权对应的界面文案（白方/黑方 × 短/长 易位） */
const CASTLING_LABEL_KEYS: Record<CastlingRight, MessageKey> = {
  K: 'editor.castleWhiteShort',
  Q: 'editor.castleWhiteLong',
  k: 'editor.castleBlackShort',
  q: 'editor.castleBlackLong',
}

const createEmptyBoard = (): Board =>
  Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null))

const createCastling = (value: boolean): Record<CastlingRight, boolean> => ({
  K: value,
  Q: value,
  k: value,
  q: value,
})

// ---- 编辑器状态 ----
const board = ref<Board>(createInitialBoard())
const turn = ref<Color>('white')
const castling = ref<Record<CastlingRight, boolean>>(createCastling(true))
const enPassant = ref('-')
const selectedTool = ref<EditorTool>({ kind: 'cursor' })

const showSettingsModal = ref(false)
const isCopied = ref(false)
const copyFailed = ref(false)
const showQuickPlayModes = ref(false)

/** FEN 单行栏：既是输出，也可以直接编辑 / 粘贴后载入 */
const fenText = ref('')

// ---- 拖拽状态（供 BoardPanel 渲染跟随光标的棋子）----
const dragStartSquare = ref<Square | null>(null)
const isDragging = computed(() => dragStartSquare.value !== null)
const hoverSquare = ref<Square | null>(null)
/** 是否正在按住左键「刷」棋盘（批量添加 / 删除） */
const isPainting = ref(false)
/** 本次刷棋盘是否已移动到其他格子；移动过则不再触发单击的快捷删除 */
const paintMoved = ref(false)
/** 刷棋盘的起始格 */
const paintStartSquare = ref<Square | null>(null)
/** 起始格在按下前是否已是同款棋子（仅单击时移除） */
const paintStartSame = ref(false)
const mousePos = ref({ x: 0, y: 0 })
const pieceScale = ref(2)

const isCursorTool = computed(() => selectedTool.value.kind === 'cursor')

/** 走棋方下拉：用显式事件把 string 收敛回 Color */
const handleTurnChange = (event: Event) => {
  turn.value = (event.target as HTMLSelectElement).value === 'black' ? 'black' : 'white'
}

/**
 * 叠加纹理：拖拽时在光标所在格显示 move_highlight（位于棋子之下），
 * 其余情况沿用对局页的通用逻辑（编辑器未传入走法/上一步，故通常为 null）。
 */
const getEditorOverlayTexture: typeof getOverlayTexture = (
  currentBoard,
  selectedSquare,
  possibleMoves,
  dragging,
  hovered,
  row,
  col,
  premove,
  lastMove,
  canPremove,
  isChess960,
) => {
  if (dragging && hovered?.row === row && hovered.col === col) return boardMoveHighlighted
  return getOverlayTexture(
    currentBoard,
    selectedSquare,
    possibleMoves,
    dragging,
    hovered,
    row,
    col,
    premove,
    lastMove,
    canPremove,
    isChess960,
  )
}

/**
 * 编辑器只用于摆放棋子，不进行对局判定：
 * 王不应因为被将 / 将杀而更换为特殊贴图，其余棋子沿用通用逻辑。
 */
const getEditorPieceImage: typeof getPieceImage = (
  piece,
  board,
  isDraw,
  hasResigned,
  timeoutWinner,
) =>
  piece.type === 'king'
    ? pieceImg(piece.type, piece.color)
    : getPieceImage(piece, board, isDraw, hasResigned, timeoutWinner)

// ---- 易位权：结构上不可能的权利自动取消并禁用复选框 ----
const castlingAvailable = computed<Record<CastlingRight, boolean>>(() => ({
  K: canHaveCastlingRight(board.value, 'K'),
  Q: canHaveCastlingRight(board.value, 'Q'),
  k: canHaveCastlingRight(board.value, 'k'),
  q: canHaveCastlingRight(board.value, 'q'),
}))

const syncCastlingWithBoard = () => {
  const available = castlingAvailable.value
  castling.value = {
    K: castling.value.K && available.K,
    Q: castling.value.Q && available.Q,
    k: castling.value.k && available.k,
    q: castling.value.q && available.q,
  }
}

const toggleCastling = (right: CastlingRight, checked: boolean) => {
  if (!castlingAvailable.value[right]) return
  castling.value = {
    K: right === 'K' ? checked : castling.value.K,
    Q: right === 'Q' ? checked : castling.value.Q,
    k: right === 'k' ? checked : castling.value.k,
    q: right === 'q' ? checked : castling.value.q,
  }
}

// ---- 吃过路兵目标格：只列出与当前棋盘一致、可通过校验的候选 ----
const enPassantOptions = computed(() => deriveEnPassantTargets(board.value, turn.value))

const resetEnPassantIfStale = () => {
  if (enPassant.value === '-') return
  if (!deriveEnPassantTargets(board.value, turn.value).includes(enPassant.value)) {
    enPassant.value = '-'
  }
}

// ---- 棋盘写入 ----
const isInside = (row: number, col: number): boolean =>
  row >= 0 && row < 8 && col >= 0 && col < 8

/** 统一走「复制 → 修改 → 整体替换」，保证 watch(board) 能拿到新引用 */
const writeBoard = (mutate: (next: Board) => void) => {
  const next = board.value.map((rank) => rank.slice())
  mutate(next)
  board.value = next
}

/** 无条件放置 / 擦除（拖拽批量时使用，不触发快捷删除） */
const placeTool = (row: number, col: number) => {
  if (!isInside(row, col)) return
  const tool = selectedTool.value
  writeBoard((next) => {
    next[row]![col] =
      tool.kind === 'piece' ? { type: tool.type, color: tool.color, hasMoved: false } : null
  })
}

/**
 * 单击规则：
 * - 棋子：该格已是同款棋子则移除（快捷删除），否则替换为该棋子
 * - 橡皮擦：清空该格
 */
const applyTool = (row: number, col: number) => {
  if (!isInside(row, col)) return
  const tool = selectedTool.value
  if (tool.kind !== 'piece') {
    placeTool(row, col)
    return
  }
  writeBoard((next) => {
    const current = next[row]![col] ?? null
    const isSamePiece = current?.type === tool.type && current.color === tool.color
    next[row]![col] = isSamePiece ? null : { type: tool.type, color: tool.color, hasMoved: false }
  })
}

const clearSquare = (row: number, col: number) => {
  if (!isInside(row, col)) return
  writeBoard((next) => {
    next[row]![col] = null
  })
}

// ---- 拖拽：光标工具下拖动棋子，拖到棋盘外即删除 ----
const beginDrag = (row: number, col: number, clientX: number, clientY: number): boolean => {
  if (!isInside(row, col) || !board.value[row]?.[col]) return false
  dragStartSquare.value = { row, col }
  mousePos.value = { x: clientX, y: clientY }
  return true
}

const handleWindowMouseMove = (event: MouseEvent) => {
  mousePos.value = { x: event.clientX, y: event.clientY }
  // 拖拽时用坐标反查高亮格：即使快速移动漏掉 mouseenter，棋子所在格的高亮也不会丢
  hoverSquare.value = findSquareAt(event.clientX, event.clientY)
}

const handleWindowMouseUp = (event: MouseEvent) => {
  // 整段未拖动 → 视为单击：仅「同款棋子」执行快捷删除（拖拽批量不会删除）
  if (isPainting.value && !paintMoved.value && paintStartSame.value && paintStartSquare.value) {
    clearSquare(paintStartSquare.value.row, paintStartSquare.value.col)
  }
  isPainting.value = false
  paintMoved.value = false
  paintStartSquare.value = null
  paintStartSame.value = false
  finishDrag(event.clientX, event.clientY)
}

/** 用屏幕坐标反查落点格；落在棋盘之外时返回 null */
const findSquareAt = (clientX: number, clientY: number): Square | null => {
  const element = document.elementFromPoint(clientX, clientY)
  const square = element?.closest<HTMLElement>('[data-row][data-col]') ?? null
  if (!square) return null

  const row = Number(square.dataset.row)
  const col = Number(square.dataset.col)
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null
  return { row, col }
}

const finishDrag = (clientX: number, clientY: number) => {
  window.removeEventListener('mousemove', handleWindowMouseMove)
  window.removeEventListener('mouseup', handleWindowMouseUp)

  const from = dragStartSquare.value
  dragStartSquare.value = null

  // 单击后指针仍停在同一格上，不会再触发 mouseenter：
  // 用坐标反查同步高亮，避免下一次拖拽时棋子所在格的高亮丢失
  const target = findSquareAt(clientX, clientY)
  hoverSquare.value = target

  if (!from) return

  // 拖到棋盘外：删除这枚棋子
  if (!target) {
    clearSquare(from.row, from.col)
    return
  }

  if (target.row === from.row && target.col === from.col) return

  writeBoard((next) => {
    const piece = next[from.row]?.[from.col] ?? null
    next[from.row]![from.col] = null
    next[target.row]![target.col] = piece
  })
}

const handleSquareMouseDown = (row: number, col: number, event: MouseEvent) => {
  event.preventDefault()

  if (selectedTool.value.kind === 'cursor') {
    if (!beginDrag(row, col, event.clientX, event.clientY)) return
    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)
    return
  }

  // 按住左键开始「刷」棋盘：扫过的格子连续放置 / 擦除
  const tool = selectedTool.value
  const current = board.value[row]?.[col] ?? null
  isPainting.value = true
  paintMoved.value = false
  paintStartSquare.value = { row, col }
  // 起始格已是同款棋子时先不动，留待「单击」判定；其余情况立即放置 / 擦除
  paintStartSame.value =
    tool.kind === 'piece' && current?.type === tool.type && current.color === tool.color
  if (!paintStartSame.value) placeTool(row, col)
  window.addEventListener('mouseup', handleWindowMouseUp)
}

/** 悬停格子：更新高亮；若正按住左键刷棋盘，则连续放置 / 擦除扫过的每一格 */
const handleSquareMouseEnter = (row: number, col: number) => {
  hoverSquare.value = { row, col }
  if (!isPainting.value) return
  paintMoved.value = true
  placeTool(row, col)
}

const handleSquareTouchStart = (row: number, col: number, event: TouchEvent) => {
  const touch = event.touches[0]
  if (!touch) return

  if (selectedTool.value.kind === 'cursor') {
    beginDrag(row, col, touch.clientX, touch.clientY)
    return
  }

  applyTool(row, col)
}

const handleBoardTouchMove = (event: TouchEvent) => {
  const touch = event.touches[0]
  if (!touch) return

  mousePos.value = { x: touch.clientX, y: touch.clientY }
  // 触摸没有 mouseenter，拖拽时用坐标反查高亮格
  if (dragStartSquare.value) hoverSquare.value = findSquareAt(touch.clientX, touch.clientY)
}

const handleBoardTouchEnd = (event: TouchEvent) => {
  const touch = event.changedTouches[0]
  if (touch) finishDrag(touch.clientX, touch.clientY)
}

/** 右键清除棋子：BoardPanel 不派发 contextmenu，这里在容器上做事件委托 */
const handleContextMenu = (event: MouseEvent) => {
  const square = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-row][data-col]')
  if (!square) return

  const row = Number(square.dataset.row)
  const col = Number(square.dataset.col)
  if (!Number.isInteger(row) || !Number.isInteger(col)) return
  clearSquare(row, col)
}
// ---- 快捷操作 ----
const loadInitialPosition = () => {
  board.value = createInitialBoard()
  castling.value = createCastling(true)
  enPassant.value = '-'
  turn.value = 'white'
  isFlipped.value = false
}

const clearBoard = () => {
  board.value = createEmptyBoard()
  castling.value = createCastling(false)
  enPassant.value = '-'
}

// 棋盘变化后自动清理失效的易位权与吃过路兵目标格
watch(board, () => {
  syncCastlingWithBoard()
  resetEnPassantIfStale()
})

watch(turn, resetEnPassantIfStale)

// ---- FEN ----
const castlingString = computed(() =>
  CASTLING_RIGHTS.filter((right) => castling.value[right]).join(''),
)

const fen = computed(() =>
  boardToFen(board.value, {
    turn: turn.value,
    castling: castlingString.value,
    enPassant: enPassant.value,
  }),
)

// 棋盘/状态变化时同步单行栏。
// 由输入框自身触发的导入不回写，避免边输入边被规范化文本打断；
// 使用同步 flush，让 isImportingFromText 在 applyFen 期间保持有效。
let isImportingFromText = false
watch(
  fen,
  (value) => {
    if (isImportingFromText) return
    fenText.value = value
  },
  { immediate: true, flush: 'sync' },
)

const validation = computed(() => validateFen(fen.value))
const fenValid = computed(() => validation.value.valid)
const fenErrorKey = computed(() =>
  validation.value.error ? FEN_ERROR_KEYS[validation.value.error] : null,
)

const copyFen = async () => {
  const ok = await copyText(fenText.value)
  isCopied.value = ok
  copyFailed.value = !ok
  if (ok) window.setTimeout(() => (isCopied.value = false), 1500)
}

/** 把 FEN 应用到编辑器状态（棋盘 + 走棋方 + 易位权 + 吃过路兵）；解析失败返回 false */
const applyFen = (raw: string): boolean => {
  const value = raw.trim()
  const parsed = parseFen(value)
  const nextBoard = parsed?.board ?? parseFenBoardLayout(value)
  if (!nextBoard) return false

  const parts = value.split(/\s+/)
  const rights = parts[2] ?? ''

  board.value = nextBoard
  turn.value = parts[1] === 'b' ? 'black' : 'white'
  castling.value = {
    K: rights.includes('K'),
    Q: rights.includes('Q'),
    k: rights.includes('k'),
    q: rights.includes('q'),
  }
  enPassant.value = /^[a-h][36]$/.test(parts[3] ?? '') ? (parts[3] as string) : '-'
  return true
}

/**
 * 导入输入框中的 FEN：合法即自动应用，不合法则保持当前局面（回退，不提示）。
 * 输入变化时自动调用，也可点「载入」手动触发。
 */
const importFen = () => {
  const value = fenText.value.trim()
  // 与当前局面一致时无需处理（也避免与 fen -> fenText 的同步相互触发）
  if (!value || value === fen.value) return
  if (!validateFen(value).valid) return

  isImportingFromText = true
  try {
    applyFen(value)
  } finally {
    isImportingFromText = false
  }
}

// 输入即导入：合法自动应用，不合法暂不处理（待失焦/回车时回退）
watch(fenText, importFen)

/**
 * 失焦 / 回车时提交：
 * 先尝试导入（合法就应用），随后把文本对齐到当前局面的 FEN——
 * 因此不合法或格式不规范的文本都会被回退成「当前状态」。
 */
const commitFen = () => {
  importFen()
  if (fenText.value.trim() !== fen.value) fenText.value = fen.value
}

// ---- URL 持久化：非初始局面时把 FEN 写入地址栏，刷新后仍能恢复 ----
const FEN_QUERY_KEY = 'fen'

/** 默认局面的完整 FEN（四个易位权全开），与编辑器初始状态一致，用于判断是否需要写入 URL 参数 */
const INITIAL_FEN = boardToFen(createInitialBoard(), { castling: 'KQkq' })

const readFenFromUrl = (): string => {
  try {
    const raw = new URLSearchParams(window.location.search).get(FEN_QUERY_KEY) ?? ''
    return decodeFenQuery(raw)
  } catch {
    return ''
  }
}

/** 把当前 FEN 同步到地址栏：默认局面清除参数，其余局面写入参数（replaceState 不新增历史记录） */
const syncFenToUrl = (value: string) => {
  try {
    const url = new URL(window.location.href)
    if (value === INITIAL_FEN) url.searchParams.delete(FEN_QUERY_KEY)
    // 用下划线代替空格，避免地址栏出现 '+'
    else url.searchParams.set(FEN_QUERY_KEY, encodeFenQuery(value))
    window.history.replaceState(window.history.state, '', url.toString())
  } catch {
    // 地址栏不可用（如 about:blank）：静默忽略
  }
}

// 局面变化时同步到 URL，避免刷新后丢失摆好的局面
watch(fen, syncFenToUrl)

// 启动时优先从 URL 参数恢复局面
const fenFromUrl = readFenFromUrl()
if (fenFromUrl) applyFen(fenFromUrl)
// 首次加载即归一化地址栏（无参数时保持干净，有参数时统一编码）
syncFenToUrl(fen.value)

// ---- 快速对局：把当前 FEN 交给主程序的对局设置界面（原地跳转，不新开窗口）----
const startQuickPlay = (mode: QuickPlayGameMode) => {
  if (!validation.value.valid) return
  writeQuickPlay({ fen: fen.value, gameMode: mode })
  window.location.assign(toolPageUrl(MAIN_PAGE))
}

const openHelpWindow = () => {}
  // TODO: 教程
</script>

<style scoped>
/* 与主页 .game-container 保持一致的页面骨架 */
.editor-container {
  position: relative;
  width: 100%;
  min-height: 100vh;
  box-sizing: border-box;
  padding: 20px;
  padding-top: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  font-family: 'Unifont', system-ui, -apple-system, sans-serif;
  color: var(--color-text-primary);
  cursor: auto;
}

/* ---- 与主页完全一致的角落 FAB 按钮组 ---- */
.top-left-fabs {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 10000;
  display: flex;
  gap: 10px;
}

.top-right-fabs {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10000;
  display: flex;
  gap: 10px;
}

.fab-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 1.4rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background-color 0.15s, color 0.15s;
  text-decoration: none;
}

.fab-btn:hover .fab-icon :deep(svg) {
  opacity: 0.8;
}

.fab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}

.fab-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

/* ---- 主体两栏 ---- */
.editor-body {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: flex-start;
  justify-content: center;
}

.board-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

/* 默认不显示抓取光标：只有「移动」工具下、光标在棋子上时才是小手 */
.editor-container :deep(.piece),
.editor-container :deep(.board-square.draggable-piece) {
  cursor: default;
}

/* 移动工具：光标悬停在棋子（所在格）上 → 可抓取的小手 */
.editor-container.cursor-mode :deep(.board-square.has-piece),
.editor-container.cursor-mode :deep(.piece) {
  cursor: grab;
}

/* 拖拽棋子中：整块棋盘显示为抓住的小手 */
.editor-container.is-dragging :deep(.board-square),
.editor-container.is-dragging :deep(.piece) {
  cursor: grabbing !important;
}
/* ---- 右侧控制面板 ---- */
.panel-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 340px;
  min-width: 280px;
  max-width: 430px;
}

.panel-section {
  padding: 12px;
  border: none;
}

.section-heading {
  margin: 0 0 8px;
  font-size: 0.9rem;
}

.option-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 2px solid var(--color-border-light);
  background-color: var(--color-btn-bg);
  font-size: 0.85rem;
  cursor: pointer;
}

.option-chip.active {
  border-color: var(--color-highlight);
}

.option-chip.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.option-chip input {
  margin: 0;
}

/* 易位权：白方一列、黑方一列 */
.castle-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, auto);
  grid-auto-flow: column;
  gap: 6px;
}

.select-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  /* 右侧留出空间，配合 .select-wrapper 的三角箭头 */
  padding: 6px 30px 6px 10px;
  margin: 0;
  font-family: 'Unifont', monospace;
  cursor: pointer;
}

/* 让带箭头的下拉框占满卡片宽度（沿用设置页的 .select-wrapper 三角箭头） */
.select-wrapper-block {
  display: block;
  width: 100%;
}

/* 内联表单行：小标题与下拉菜单同一行 */
.field-row {
display: flex;
  align-items: center;
  justify-content: space-between; /* 两端对齐：左侧标题，右侧菜单 */
  margin-top: 12px;
}

.field-row .sub-heading {
  margin: 0;
  flex-shrink: 0;
}

/* 吃过路兵下拉框按内容宽度收窄，不占满整行 */
.field-row .select-wrapper {
  flex: 0 0 auto;
  width: auto;
}

.field-row .select-input {
  width: 4rem;
}

/* FEN 单行栏：覆盖全局 input 的 margin，避免撑破卡片 */
.fen-input {
  display: block;
  width: 100%;
  margin: 0 0 8px;
  box-sizing: border-box;
  font-size: 0.78rem;
}

/* FEN 文本栏 + 右侧复制按钮 */
.fen-input-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.fen-input-row .fen-input {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  margin: 0;
}

.fen-input-row .icon-btn {
  flex: 0 0 auto;
  padding: 0 10px;
}

/* ---- 翻转棋盘按钮：与主页侧边栏完全一致 ---- */
.btn-flip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  line-height: 1;
  padding: 0.4rem 0.6rem;
}

.btn-flip .btn-icon,
.icon-btn .btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8em;
  height: 1.8rem;
  flex-shrink: 0;
}

.btn-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

/* 小标题：走棋方 / 易位权 / 吃过路兵 */
.sub-heading {
  margin: 12px 0 6px;
  font-size: 0.8rem;
  font-weight: bold;
  color: var(--color-text-muted);
}

.sub-heading:first-child {
  margin-top: 0;
}

/* 不套外框的按钮组：竖向一排 */
.plain-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.button-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 纯图标按钮（FEN 的载入 / 复制） */
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.2rem 0.35rem;
}

/* FEN 的图标按钮比翻转按钮更小巧 */
.icon-btn .btn-icon {
  width: 1.3em;
  height: 1.1rem;
}

.error-text {
  margin: 4px 0 0;
  font-size: 0.8rem;
  color: var(--color-error);
}

/* FEN 警告区：固定最小高度，提示出现/消失时输入框不会上下跳动 */
.fen-warning {
  min-height: 1.2rem;
  margin-top: 8px;
}

.fen-warning .error-text {
  margin: 0;
}

/* ---- 快速对局选择遮罩 ---- */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: var(--color-overlay-heavy);
  display: flex;
  justify-content: center;
  align-items: center;
  /* 高于角落 FAB（10000），遮罩打开时整页都不可操作 */
  z-index: 10001;
}

.dialog-box {
  background: var(--color-surface);
  padding: 1.5rem;
  text-align: center;
}

/* 快速对局的三个模式按钮：竖向排列 */
.dialog-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.dialog-buttons .btn {
  width: 100%;
  font-size: 1rem;
  padding: 0.6rem 0.75rem;
}

@media (max-width: 720px) {
  .editor-container {
    padding: 12px;
    padding-top: 60px;
  }

  .panel-column {
    max-width: 100%;
  }
}
</style>


