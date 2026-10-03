import { computed, onUnmounted, ref, watch, type CSSProperties, type Ref } from 'vue'
import {
  isKingInCheck,
  type Board,
  type Color,
  type Move,
  type Piece,
  type PieceType,
  type Square,
} from '../../models/chess'
import { playTutorialSound } from '../sound'
import type { TutorialChallenge, TutorialPiece, TutorialTarget } from '../data/types'
import type { MessageKey } from '../../data/i18n'

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

/** 对方反吃的延迟毫秒数：先显示失败，稍后黑方棋子再走进来吃子 */
const REPLY_DELAY_MS = 800

const inBoard = (row: number, col: number): boolean => row >= 0 && row < 8 && col >= 0 && col < 8
const sameSquare = (a: Square, b: Square): boolean => a.row === b.row && a.col === b.col

const isOccupied = (obstacles: readonly Square[], row: number, col: number): boolean =>
  obstacles.some((square) => square.row === row && square.col === col)

/** 兵的前进方向：白方向上（row 减小），黑方向下（row 增大）；初始横线白方 row 6 / 黑方 row 1 */
const pawnForward = (color: Color): number => (color === 'white' ? -1 : 1)
const pawnStartRow = (color: Color): number => (color === 'white' ? 6 : 1)

/**
 * 教程棋盘上除主角外的棋子（金币、对方棋子、陪衬棋子）都视作障碍：
 * 滑行棋子可以落上去吃掉，但不能越过；兵不能直着走进被占据的格子。
 * enPassantSquares 是「吃过路兵」的落点（对方兵身后那格，本身是空格）。
 * 这里生成主角当前可落子的格子。
 */
export const getReachableSquares = (
  type: PieceType,
  from: Square,
  color: Color = 'white',
  obstacles: readonly Square[] = [],
  enPassantSquares: readonly Square[] = [],
): Square[] => {
  const squares: Square[] = []

  const addSlide = (directions: readonly Step[]) => {
    for (const [rowStep, colStep] of directions) {
      let row = from.row + rowStep
      let col = from.col + colStep
      while (inBoard(row, col)) {
        squares.push({ row, col })
        // 障碍视作棋子：落上去即吃掉，但不能越过
        if (isOccupied(obstacles, row, col)) break
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
      const oneRow = from.row + forward
      // 直走不能吃子：正前方被占据时不能再往前
      if (inBoard(oneRow, from.col) && !isOccupied(obstacles, oneRow, from.col)) {
        squares.push({ row: oneRow, col: from.col })
        const twoRow = from.row + forward * 2
        if (
          from.row === pawnStartRow(color) &&
          inBoard(twoRow, from.col) &&
          !isOccupied(obstacles, twoRow, from.col)
        ) {
          squares.push({ row: twoRow, col: from.col })
        }
      }
      // 兵只能斜着吃：只有斜前方有金币 / 对方棋子时才能走
      for (const colStep of [-1, 1]) {
        const row = from.row + forward
        const col = from.col + colStep
        if (inBoard(row, col) && isOccupied(obstacles, row, col)) {
          squares.push({ row, col })
        }
      }
      // 吃过路兵：落点空着，但正好在斜前方（对方兵刚走过的身后一格）
      for (const square of enPassantSquares) {
        if (square.row === from.row + forward && Math.abs(square.col - from.col) === 1) {
          squares.push({ row: square.row, col: square.col })
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
 *   - move-as-required：走到目标格即成功，走错格数即失败；
 * 两种模式都支持在棋盘上摆放对方棋子（opponents），并可配置走错格时对方的回应着法（replies）。
 */
export function useCollectCoins(challenge: TutorialChallenge, isSoundEnabled: Ref<boolean>) {
  const challengeCoins = challenge.kind === 'collect-coins' ? challenge.coins : []
  const challengeTargets: TutorialTarget[] =
    challenge.kind === 'move-as-required'
      ? Array.isArray(challenge.target)
        ? challenge.target
        : [challenge.target]
      : []
  const rawOpponents = challenge.opponents ?? []
  const challengeOpponents: TutorialPiece[] = Array.isArray(rawOpponents)
    ? rawOpponents
    : [rawOpponents]
  const challengeReplies = challenge.replies ?? []
  // 玩家棋子：单个或一组，统一成数组，允许一次可选多枚（例如将军里有两枚兵可选）
  const initialPieces: TutorialPiece[] = Array.isArray(challenge.piece)
    ? challenge.piece
    : [challenge.piece]
  const pieceColor: Color = initialPieces[0]?.color ?? 'white'
  const opponentColor: Color = pieceColor === 'white' ? 'black' : 'white'

  // 玩家可移动的棋子，各带当前位置；被吃掉 / 走子后实时更新
  const pieces = ref<TutorialPiece[]>(initialPieces.map((piece) => ({ ...piece })))
  const coins = ref<Square[]>(challengeCoins.map((coin) => ({ ...coin })))
  // 棋盘上可被吃掉的对方棋子；被吃掉 / 移动后实时更新
  const opponents = ref<TutorialPiece[]>(challengeOpponents.map((piece) => ({ ...piece })))
  const status = ref<ChallengeStatus>('playing')
  const lastMove = ref<{ from: Square; to: Square } | null>(null)
  // 失败提示：默认用挑战自带的 failMessage，对方的回应着法可以覆盖
  const failMessage = ref<MessageKey | null>(challenge.failMessage ?? null)

  // 交互 / 拖拽状态
  const isMouseDown = ref(false)
  const isDragging = ref(false)
  const dragStartSquare = ref<Square | null>(null)
  const selectedSquare = ref<Square | null>(null)
  const hoverSquare = ref<Square | null>(null)
  const mousePos = ref({ x: 0, y: 0 })

  // 当前选中的玩家棋子（决定可达格；多枚可选时用选中的那枚）
  const selectedPiece = computed<TutorialPiece | null>(() => {
    const square = selectedSquare.value
    if (!square) return null
    return pieces.value.find((piece) => sameSquare(piece, square)) ?? null
  })

  // 吃过路兵：对方兵刚走到本兵旁边（同一行、相邻列），落点在其身后一格（斜前方、空格）
  const enPassantSquares = computed<Square[]>(() => {
    const piece = selectedPiece.value
    if (!piece || piece.type !== 'pawn') return []
    const forward = pawnForward(piece.color)
    return opponents.value
      .filter(
        (opponent) =>
          opponent.enPassant &&
          opponent.row === piece.row &&
          Math.abs(opponent.col - piece.col) === 1,
      )
      .map((opponent) => ({ row: opponent.row + forward, col: opponent.col }))
  })

  const createEmptyBoard = (): Board =>
    Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null as Piece | null))

  /** 用当前 pieces + opponents 拼出棋盘（金币只是标记，不参与阻挡） */
  const buildBoard = (): Board => {
    const board = createEmptyBoard()
    for (const piece of [...pieces.value, ...opponents.value]) {
      board[piece.row]![piece.col] = { type: piece.type, color: piece.color, hasMoved: true }
    }
    return board
  }

  /**
   * 把某枚棋子从当前位置走到 to（含吃子 / 吃过路兵）后，己方的王是否会被将军。
   * 用来过滤「主动送将」的非法走法：王不能走进被攻击的格子，被牵制的子也不能乱动。
   */
  const leavesKingInCheck = (piece: TutorialPiece, to: Square, enPassant: boolean): boolean => {
    const board = buildBoard()
    board[piece.row]![piece.col] = null
    // 吃掉落点上的子；吃过路兵时被吃的兵在本兵旁边（与落点同一列）
    if (enPassant) board[piece.row]![to.col] = null
    else board[to.row]![to.col] = null
    board[to.row]![to.col] = { type: piece.type, color: piece.color, hasMoved: true }
    return isKingInCheck(board, piece.color)
  }

  /**
   * 王车易位的候选落点（可能为空）。教程里默认王与车都还没动过：
   * 王在初始格、对应车在位、中间格子为空、王不处于 / 不经过 / 不落在被攻击的格。
   */
  const castlingTargets = (king: TutorialPiece): Move[] => {
    if (king.type !== 'king') return []
    const homeRow = king.color === 'white' ? 7 : 0
    if (king.row !== homeRow || king.col !== 4) return []
    // 被将军时不能易位
    if (isKingInCheck(buildBoard(), king.color)) return []

    const results: Move[] = []
    const sides = [
      { rookCol: 7, kingTo: 6, rookTo: 5, between: [5, 6] }, // 王翼
      { rookCol: 0, kingTo: 2, rookTo: 3, between: [1, 2, 3] }, // 后翼
    ]
    for (const side of sides) {
      const rook = pieces.value.find(
        (piece) =>
          piece.type === 'rook' &&
          piece.color === king.color &&
          piece.row === homeRow &&
          piece.col === side.rookCol,
      )
      if (!rook) continue
      // 王与车之间（含王的落点）必须为空
      const board = buildBoard()
      if (!side.between.every((col) => board[homeRow]![col] === null)) continue
      // 王经过 / 落到的格子都不能被攻击
      const safe = side.between.every((col) => {
        const probe = buildBoard()
        probe[homeRow]![4] = null
        probe[homeRow]![col] = { type: 'king', color: king.color, hasMoved: true }
        return !isKingInCheck(probe, king.color)
      })
      if (!safe) continue
      results.push({
        row: homeRow,
        col: side.kingTo,
        special: 'castle',
        rookFrom: { row: homeRow, col: side.rookCol },
        rookTo: { row: homeRow, col: side.rookTo },
      })
    }
    return results
  }

  // 金币与对方棋子都算障碍：滑行棋子可以落上去吃掉，但不能越过
  const reachable = computed(() => {
    const piece = selectedPiece.value
    if (!piece) return []
    // 其他己方棋子只起阻挡作用（滑行子不能穿过去，也不能落到它们身上）
    const ownSquares = pieces.value.filter((other) => !sameSquare(other, piece))
    const squares: Move[] = getReachableSquares(
      piece.type,
      piece,
      piece.color,
      [...coins.value, ...opponents.value, ...ownSquares],
      enPassantSquares.value,
    ).filter((square) => !ownSquares.some((own) => sameSquare(own, square)))
    // 王的易位落点也算可达（走两格）
    const candidates = [...squares, ...castlingTargets(piece)]
    // 过滤掉会让己方王被将军的落点
    return candidates.filter(
      (square) =>
        !leavesKingInCheck(
          piece,
          square,
          enPassantSquares.value.some((target) => sameSquare(target, square)),
        ),
    )
  })

  /** 让棋盘上的一枚对方棋子「从 from 走到 to」（例如吃回玩家刚走过来的棋子）。 */
  const moveOpponent = (from: Square, to: Square): boolean => {
    const index = opponents.value.findIndex((opponent) => sameSquare(opponent, from))
    const moving = index >= 0 ? opponents.value[index] : undefined
    if (!moving) return false

    // 落点上的玩家棋子被对方吃掉
    pieces.value = pieces.value.filter((piece) => !sameSquare(piece, to))

    opponents.value = opponents.value
      .filter((_, i) => i !== index)
      .concat({ ...moving, row: to.row, col: to.col })
    return true
  }

  /** 用真实走法引擎判断某一方是否被将军 */
  const isColorInCheck = (color: Color): boolean => isKingInCheck(buildBoard(), color)

  // 对方反吃的延迟：先显示失败，稍后黑方棋子再走进来吃子
  let replyTimer: number | null = null

  const clearReplyTimer = () => {
    if (replyTimer !== null) {
      window.clearTimeout(replyTimer)
      replyTimer = null
    }
  }

  // 兵冲到底线后弹出升变选择器，选好棋子才算过关
  const isPromotionSquare = (piece: TutorialPiece, square: Square): boolean =>
    piece.type === 'pawn' && square.row === (piece.color === 'white' ? 0 : 7)

  const promotionPending = ref<{ color: Color; from: Square; to: Square } | null>(null)
  const promotionStyle = ref<CSSProperties>({})

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
      // 把棋子退回升变前的位置
      pieces.value = pieces.value.map((piece) =>
        sameSquare(piece, pending.to)
          ? { ...piece, row: pending.from.row, col: pending.from.col }
          : piece,
      )
      lastMove.value = null
      selectedSquare.value = { ...pending.from }
    }
    promotionPending.value = null
    promotionStyle.value = {}
  }

  const applyPromotion = (newType: string) => {
    const pending = promotionPending.value
    if (!pending) return
    // 升变：直接改这枚兵的棋子类型
    pieces.value = pieces.value.map((piece) =>
      sameSquare(piece, pending.to) ? { ...piece, type: newType as PieceType } : piece,
    )
    promotionPending.value = null
    promotionStyle.value = {}
    status.value = 'won'
  }

  let wasAlreadySelected = false
  let dragStartPos = { x: 0, y: 0 }

  const isPieceSquare = (row: number, col: number): boolean =>
    pieces.value.some((piece) => piece.row === row && piece.col === col)

  const canMoveTo = (row: number, col: number): boolean =>
    reachable.value.some((square) => square.row === row && square.col === col)

  const reset = () => {
    clearReplyTimer()
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)

    pieces.value = initialPieces.map((piece) => ({ ...piece }))
    coins.value = challengeCoins.map((coin) => ({ ...coin }))
    opponents.value = challengeOpponents.map((piece) => ({ ...piece }))
    status.value = 'playing'
    failMessage.value = challenge.failMessage ?? null
    lastMove.value = null
    promotionPending.value = null
    promotionStyle.value = {}
    isMouseDown.value = false
    isDragging.value = false
    dragStartSquare.value = null
    selectedSquare.value = null
    hoverSquare.value = null
  }

  /** 尝试走子：落点非法时直接忽略（不做提示）；棋子取当前选中的那枚 */
  const tryMove = (row: number, col: number): boolean => {
    if (status.value !== 'playing') return false
    const source = selectedSquare.value
    if (!source) return false
    if (isPieceSquare(row, col)) return false
    if (!canMoveTo(row, col)) return false

    const index = pieces.value.findIndex((piece) => sameSquare(piece, source))
    const moving = index >= 0 ? pieces.value[index] : undefined
    if (!moving) return false

    const to: Square = { row, col }
    const from: Square = { row: moving.row, col: moving.col }
    const isPawn = moving.type === 'pawn'
    const coinAtTarget = coins.value.some((coin) => sameSquare(coin, to))
    const opponentAtTarget = opponents.value.some((opponent) => sameSquare(opponent, to))
    const enPassantCapture = enPassantSquares.value.some((square) => sameSquare(square, to))
    // 兵只能斜着吃：直走落在有子的格子上不算吃子；吃过路兵落点虽是空格，但也算吃子
    const targetOccupied = coinAtTarget || opponentAtTarget
    const isCapture =
      enPassantCapture || (isPawn ? from.col !== to.col && targetOccupied : targetOccupied)
    // 兵经过或停在金币所在的那一行却没吃到金币：已经越过金币，判为走错
    const missedCoinRow =
      isPawn &&
      !isCapture &&
      coins.value.some(
        (coin) =>
          coin.row >= Math.min(from.row, to.row) && coin.row <= Math.max(from.row, to.row),
      )

    // 移动选中的那枚棋子
    pieces.value = pieces.value.map((piece, i) =>
      i === index ? { ...piece, row: to.row, col: to.col } : piece,
    )
    // 王车易位：王一次走两格，对应的车同时跳到王的另一边
    if (moving.type === 'king' && from.row === to.row && Math.abs(to.col - from.col) === 2) {
      const rookCol = to.col > from.col ? 7 : 0
      const rookToCol = to.col > from.col ? 5 : 3
      pieces.value = pieces.value.map((piece) =>
        piece.type === 'rook' && piece.row === from.row && piece.col === rookCol
          ? { ...piece, col: rookToCol }
          : piece,
      )
    }
    lastMove.value = { from, to }

    if (enPassantCapture) {
      // 被吃的兵在本兵旁边：与起点同一行、与落点同一列
      opponents.value = opponents.value.filter(
        (opponent) => !(opponent.row === from.row && opponent.col === to.col),
      )
    } else if (isCapture) {
      coins.value = coins.value.filter((coin) => !sameSquare(coin, to))
      opponents.value = opponents.value.filter((opponent) => !sameSquare(opponent, to))
    }
    const remaining = coins.value
    selectedSquare.value = null

    // 走子后若将军了对方，播放将军音效（与对局页一致：将军优先于普通走子 / 吃子音）
    const givesCheck = isColorInCheck(opponentColor)
    playTutorialSound(givesCheck ? 'check' : isCapture ? 'capture' : 'move', isSoundEnabled.value)

    if (missedCoinRow) {
      failMessage.value = challenge.failMessage ?? null
      status.value = 'failed'
      return true
    }

    // 走到对方的陷阱格：先判定失败（显示失败反馈），稍后黑方棋子再走进来
    const reply = challengeReplies.find(
      (move) =>
        sameSquare(move.trigger, to) &&
        (!move.trigger.from || sameSquare(from, move.trigger.from)),
    )
    if (reply && opponents.value.some((opponent) => sameSquare(opponent, reply.from))) {
      failMessage.value = reply.failMessage ?? challenge.failMessage ?? null
      status.value = 'failed'
      clearReplyTimer()
      replyTimer = window.setTimeout(() => {
        replyTimer = null
        // 对方这手是否吃掉了玩家的棋子（吃回 / 王吃掉将军的棋子）
        const replyCaptures = pieces.value.some((piece) => sameSquare(piece, reply.to))
        if (!moveOpponent(reply.from, reply.to)) return
        lastMove.value = { from: { ...reply.from }, to: { ...reply.to } }
        // 音效优先级：将军 > 吃子 > 普通走动（王逃出将军属于普通走动）
        const replyGivesCheck = isColorInCheck(pieceColor)
        playTutorialSound(
          replyGivesCheck ? 'check' : replyCaptures ? 'capture' : 'move',
          isSoundEnabled.value,
        )
      }, REPLY_DELAY_MS)
      return true
    }

    if (isPromotionSquare(moving, to)) {
      promotionPending.value = { color: moving.color, from, to }
      computePromotionStyle(to.row, to.col)
      return true
    }

    if (challenge.kind === 'move-as-required') {
      // 走到任一可接受的目标格即可；若该目标指定了 from，还必须是那一格的棋子来走
      const matched = challengeTargets.some(
        (target) => sameSquare(to, target) && (!target.from || sameSquare(from, target.from)),
      )
      if (matched) {
        status.value = 'won'
      } else {
        failMessage.value = challenge.failMessage ?? null
        status.value = 'failed'
      }
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
    clearReplyTimer()
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  })

  watch(
    () => challenge.id,
    () => reset(),
  )

  return {
    pieces,
    pieceColor,
    coins,
    opponents,
    status,
    failMessage,
    reachable,
    lastMove,
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
    moveOpponent,
    reset,
  }
}
