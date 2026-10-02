import { computed, onUnmounted, ref, watch, type CSSProperties, type Ref } from 'vue'
import type { Color, PieceType, Square } from '../../models/chess'
import { playTutorialSound } from '../sound'
import type { TutorialChallenge } from '../data/types'

export type ChallengeStatus = 'playing' | 'won' | 'failed'

type Step = readonly [number, number]

const ORTHOGONAL_STEPS: readonly Step[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

const DIAGONAL_STEPS: readonly Step[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

const ALL_DIRECTIONS: readonly Step[] = [...ORTHOGONAL_STEPS, ...DIAGONAL_STEPS]

const KNIGHT_STEPS: readonly Step[] = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
]

const inBoard = (row: number, col: number): boolean => row >= 0 && row < 8 && col >= 0 && col < 8

const sameSquare = (a: Square, b: Square): boolean => a.row === b.row && a.col === b.col

const hasCoinAt = (coins: readonly Square[], row: number, col: number): boolean =>
  coins.some((coin) => coin.row === row && coin.col === col)

/** 兵的前进方向：白方向上（row 减小），黑方向下（row 增大）；初始横线白方 row 6 / 黑方 row 1 */
const pawnForward = (color: Color): number => (color === 'white' ? -1 : 1)
const pawnStartRow = (color: Color): number => (color === 'white' ? 6 : 1)

/** 教程棋盘为空格，金币视作棋子：可以落上去吃掉，但不能越过；这里生成棋子当前可落子的格子。 */
export const getReachableSquares = (
  type: PieceType,
  from: Square,
  color: Color = 'white',
  coins: readonly Square[] = [],
): Square[] => {
  const squares: Square[] = []

  const addSlide = (directions: readonly Step[]) => {
    for (const [rowStep, colStep] of directions) {
      let row = from.row + rowStep
      let col = from.col + colStep
      while (inBoard(row, col)) {
        squares.push({ row, col })
        // 金币视作棋子：落上去即吃掉，但不能越过
        if (hasCoinAt(coins, row, col)) break
        row += rowStep
        col += colStep
      }
    }
  }

  const addSteps = (steps: readonly Step[]) => {
    for (const [rowStep, colStep] of steps) {
      const row = from.row + rowStep
      const col = from.col + colStep
      if (inBoard(row, col)) squares.push({ row, col })
    }
  }

  switch (type) {
    case 'rook':
      addSlide(ORTHOGONAL_STEPS)
      break
    case 'bishop':
      addSlide(DIAGONAL_STEPS)
      break
    case 'queen':
      addSlide(ALL_DIRECTIONS)
      break
    case 'king':
      addSteps(ALL_DIRECTIONS)
      break
    case 'knight':
      addSteps(KNIGHT_STEPS)
      break
    case 'pawn': {
      const forward = pawnForward(color)
      if (inBoard(from.row + forward, from.col)) {
        squares.push({ row: from.row + forward, col: from.col })
      }
      if (from.row === pawnStartRow(color) && inBoard(from.row + forward * 2, from.col)) {
        squares.push({ row: from.row + forward * 2, col: from.col })
      }
      // 兵只能斜着吃：只有斜前方放金币的格子才可走
      for (const colStep of [-1, 1]) {
        const row = from.row + forward
        const col = from.col + colStep
        if (inBoard(row, col) && hasCoinAt(coins, row, col)) {
          squares.push({ row, col })
        }
      }
      break
    }
  }

  return squares
}

/**
 * 教程关卡状态机。各模式的胜负规则：
 *   - collect-coins：步数自由，吃光全部金币即成功，不做失败判定；
 *   - move-as-required：走到目标格即成功，走错格数即失败。
 */
export function useCollectCoins(challenge: TutorialChallenge, isSoundEnabled: Ref<boolean>) {
  const challengeCoins = challenge.kind === 'collect-coins' ? challenge.coins : []
  const challengeTarget = challenge.kind === 'move-as-required' ? challenge.target : null

  const position = ref<Square>({ row: challenge.piece.row, col: challenge.piece.col })
  const coins = ref<Square[]>(challengeCoins.map((coin) => ({ ...coin })))
  const status = ref<ChallengeStatus>('playing')
  const lastMove = ref<{ from: Square; to: Square } | null>(null)

  // 交互 / 拖拽状态
  const isMouseDown = ref(false)
  const isDragging = ref(false)
  const dragStartSquare = ref<Square | null>(null)
  const selectedSquare = ref<Square | null>(null)
  const hoverSquare = ref<Square | null>(null)
  const mousePos = ref({ x: 0, y: 0 })

  const reachable = computed(() =>
    getReachableSquares(challenge.piece.type, position.value, challenge.piece.color, coins.value),
  )

  // 兵冲到底线后弹出升变选择器，选好棋子才算过关
  const promotionRow = challenge.piece.color === 'white' ? 0 : 7
  const isPromotionSquare = (square: Square): boolean =>
    challenge.piece.type === 'pawn' && square.row === promotionRow

  const promotedType = ref<PieceType | null>(null)
  const promotionPending = ref<{ color: Color; from: Square; to: Square } | null>(null)
  const promotionStyle = ref<CSSProperties>({})

  const displayType = computed<PieceType>(() => promotedType.value ?? challenge.piece.type)

  // 选择器按棋盘百分比定位；末行上移 3 格，避免 50% 高的选择器溢出棋盘底部
  const computePromotionStyle = (toRow: number, toCol: number) => {
    const leftPercent = toCol * 12.5
    let topPercent = toRow * 12.5
    if (toRow === 7) topPercent = (toRow - 3) * 12.5

    promotionStyle.value = {
      left: `${leftPercent}%`,
      top: `${topPercent}%`,
      width: '12.5%',
      height: '50%',
    }
  }

  const cancelPromotion = () => {
    const pending = promotionPending.value
    if (pending) {
      position.value = { ...pending.from }
      lastMove.value = null
      selectedSquare.value = pending.from
    }
    promotionPending.value = null
    promotionStyle.value = {}
  }

  const applyPromotion = (newType: string) => {
    if (!promotionPending.value) return
    promotedType.value = newType as PieceType
    promotionPending.value = null
    promotionStyle.value = {}
    status.value = 'won'
  }

  let wasAlreadySelected = false
  let dragStartPos = { x: 0, y: 0 }

  const isPieceSquare = (row: number, col: number): boolean =>
    row === position.value.row && col === position.value.col

  const canMoveTo = (row: number, col: number): boolean =>
    reachable.value.some((square) => square.row === row && square.col === col)

  const reset = () => {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)

    position.value = { row: challenge.piece.row, col: challenge.piece.col }
    coins.value = challengeCoins.map((coin) => ({ ...coin }))
    status.value = 'playing'
    lastMove.value = null
    promotedType.value = null
    promotionPending.value = null
    promotionStyle.value = {}
    isMouseDown.value = false
    isDragging.value = false
    dragStartSquare.value = null
    selectedSquare.value = null
    hoverSquare.value = null
  }

  /** 尝试走子：落点非法时直接忽略（不做提示） */
  const tryMove = (row: number, col: number): boolean => {
    if (status.value !== 'playing') return false
    if (isPieceSquare(row, col)) return false
    if (!canMoveTo(row, col)) return false

    const to: Square = { row, col }
    const from: Square = { ...position.value }
    const isPawn = challenge.piece.type === 'pawn'
    const coinAtTarget = coins.value.some((coin) => sameSquare(coin, to))
    // 兵只能斜着吃：直走落在金币上不算吃子
    const isCapture = isPawn ? from.col !== to.col && coinAtTarget : coinAtTarget
    // 兵经过或停在金币所在的那一行却没吃到金币：已经越过金币，判为走错
    const missedCoinRow =
      isPawn &&
      !isCapture &&
      coins.value.some(
        (coin) =>
          coin.row >= Math.min(from.row, to.row) && coin.row <= Math.max(from.row, to.row),
      )

    position.value = to
    lastMove.value = { from, to }

    const remaining = isCapture ? coins.value.filter((coin) => !sameSquare(coin, to)) : coins.value
    coins.value = remaining
    selectedSquare.value = null

    playTutorialSound(isCapture ? 'capture' : 'move', isSoundEnabled.value)

    if (missedCoinRow) {
      status.value = 'failed'
      return true
    }

    if (isPromotionSquare(to)) {
      promotionPending.value = { color: challenge.piece.color, from, to }
      computePromotionStyle(to.row, to.col)
      return true
    }

    if (challengeTarget) {
      status.value = sameSquare(to, challengeTarget) ? 'won' : 'failed'
      return true
    }

    if (remaining.length === 0) status.value = 'won'

    return true
  }

  const findSquareFromPoint = (clientX: number, clientY: number): Square | null => {
    const element = document.elementFromPoint(clientX, clientY)
    if (!element) return null

    const squareButton = element.closest('.board-square') as HTMLElement | null
    if (!squareButton) return null

    const row = Number(squareButton.getAttribute('data-row'))
    const col = Number(squareButton.getAttribute('data-col'))
    if (Number.isNaN(row) || Number.isNaN(col)) return null

    return { row, col }
  }

  const handleMouseMove = (event: MouseEvent) => {
    if (!isMouseDown.value) return

    mousePos.value = { x: event.clientX, y: event.clientY }

    if (!isDragging.value) {
      const dx = event.clientX - dragStartPos.x
      const dy = event.clientY - dragStartPos.y
      if (Math.sqrt(dx * dx + dy * dy) > 1) {
        isDragging.value = true
        selectedSquare.value = dragStartSquare.value
      }
    }
  }

  const handleMouseUp = () => {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)

    const from = dragStartSquare.value
    const to = hoverSquare.value
    const hadDragged = isDragging.value

    isMouseDown.value = false
    isDragging.value = false
    dragStartSquare.value = null

    if (!from) return

    if (!hadDragged) {
      if (wasAlreadySelected) selectedSquare.value = null
      return
    }

    if (to && !sameSquare(from, to)) tryMove(to.row, to.col)

    selectedSquare.value = null
    hoverSquare.value = null
  }

  const handleMouseDown = (row: number, col: number, event: MouseEvent) => {
    if (event.button !== 0 || status.value !== 'playing' || promotionPending.value) return

    if (isPieceSquare(row, col)) {
      wasAlreadySelected = selectedSquare.value?.row === row && selectedSquare.value?.col === col
      if (!wasAlreadySelected) selectedSquare.value = { row, col }

      isMouseDown.value = true
      isDragging.value = false
      dragStartSquare.value = { row, col }
      dragStartPos = { x: event.clientX, y: event.clientY }
      mousePos.value = { x: event.clientX, y: event.clientY }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return
    }

    // 与对局页一致：先选中棋子，再点目标格才走
    if (selectedSquare.value && canMoveTo(row, col)) {
      tryMove(row, col)
    } else {
      selectedSquare.value = null
    }
  }

  const handleTouchMove = (event: TouchEvent) => {
    if (!isMouseDown.value) return

    const touch = event.touches[0]
    if (!touch) return

    mousePos.value = { x: touch.clientX, y: touch.clientY }

    if (!isDragging.value) {
      const dx = touch.clientX - dragStartPos.x
      const dy = touch.clientY - dragStartPos.y
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        isDragging.value = true
        selectedSquare.value = dragStartSquare.value
      }
    }

    hoverSquare.value = findSquareFromPoint(touch.clientX, touch.clientY)
  }

  const handleTouchEnd = () => {
    const from = dragStartSquare.value
    const to = hoverSquare.value
    const hadDragged = isDragging.value

    isMouseDown.value = false
    isDragging.value = false
    dragStartSquare.value = null

    if (!from) return

    if (!hadDragged) {
      selectedSquare.value = wasAlreadySelected ? null : { row: from.row, col: from.col }
      return
    }

    if (to && !sameSquare(from, to)) tryMove(to.row, to.col)

    selectedSquare.value = null
    hoverSquare.value = null
  }

  const handleTouchStart = (row: number, col: number, event: TouchEvent) => {
    if (status.value !== 'playing' || promotionPending.value) return

    if (isPieceSquare(row, col)) {
      wasAlreadySelected = selectedSquare.value?.row === row && selectedSquare.value?.col === col

      isMouseDown.value = true
      isDragging.value = false
      dragStartSquare.value = { row, col }

      const touch = event.touches[0]
      if (touch) {
        dragStartPos = { x: touch.clientX, y: touch.clientY }
        mousePos.value = { x: touch.clientX, y: touch.clientY }
      }
      return
    }

    // 与对局页一致：先选中棋子，再点目标格才走
    if (selectedSquare.value && canMoveTo(row, col)) {
      tryMove(row, col)
    } else {
      selectedSquare.value = null
    }
  }

  onUnmounted(() => {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  })

  watch(
    () => challenge.id,
    () => reset(),
  )

  return {
    position,
    coins,
    status,
    reachable,
    lastMove,
    displayType,
    promotionPending,
    promotionStyle,
    applyPromotion,
    cancelPromotion,
    isMouseDown,
    isDragging,
    dragStartSquare,
    selectedSquare,
    hoverSquare,
    mousePos,
    handleMouseDown,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    reset,
  }
}
