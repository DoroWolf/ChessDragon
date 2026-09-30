// ============================================================
// FEN 解析与合法性校验
//   - parseFenBoardLayout：只解析棋子摆放（用于输入过程中的实时预览）
//   - parseFen：解析棋子摆放 + 走棋方
//   - validateFen：在格式校验之外，进一步校验局面是否符合国际象棋规则
// ============================================================
import {
  hasInsufficientMaterial,
  isCheckmate,
  isKingInCheck,
  isStalemate,
  type Board,
  type Color,
  type Piece,
} from './chess'

const PIECE_TYPES: Record<string, Piece['type']> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

/** FEN 校验失败的原因，供上层映射到多语言文案 */
export type FenErrorCode =
  | 'format'
  | 'king'
  | 'pawnRank'
  | 'pieceCount'
  | 'illegalCheck'
  | 'checkmate'
  | 'stalemate'
  | 'insufficientMaterial'

export interface FenValidationResult {
  /** 是否可以通过校验并开始对局 */
  valid: boolean
  /** 失败原因；校验通过时为 null */
  error: FenErrorCode | null
  /** 棋子摆放解析成功时给出棋盘，否则为 null */
  board: Board | null
  /** 走棋方解析成功时给出，否则为 null */
  turn: Color | null
}

const createEmptyBoard = (): Board =>
  Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null as Piece | null))

const fail = (
  error: FenErrorCode,
  board: Board | null = null,
  turn: Color | null = null,
): FenValidationResult => ({ valid: false, error, board, turn })

/**
 * 解析 FEN 的棋子摆放部分（第一段）。
 * 不要求走棋方等其余字段，便于用户输入未完成时也能拼出预览。
 */
export const parseFenBoardLayout = (boardPart: string): Board | null => {
  const rows = boardPart.split('/')
  if (rows.length !== 8) return null

  const board = createEmptyBoard()

  for (let rowIndex = 0; rowIndex < 8; rowIndex += 1) {
    const row = rows[rowIndex]
    if (!row) return null

    let colIndex = 0
    let previousWasDigit = false

    for (const char of row) {
      if (char >= '1' && char <= '8') {
        // FEN 规范不允许连续数字（如 "44"）
        if (previousWasDigit) return null
        colIndex += Number(char)
        previousWasDigit = true
        continue
      }

      previousWasDigit = false
      const type = PIECE_TYPES[char.toLowerCase()]
      if (!type) return null
      if (colIndex >= 8) return null

      board[rowIndex]![colIndex] = {
        type,
        color: char === char.toLowerCase() ? 'black' : 'white',
        hasMoved: false,
      }
      colIndex += 1
    }

    if (colIndex !== 8) return null
  }

  return board
}

/** 解析棋子摆放与走棋方（其余字段忽略，与对局逻辑保持一致） */
export const parseFen = (fen: string): { board: Board; turn: Color } | null => {
  const parts = fen.trim().split(/\s+/)
  const boardPart = parts[0]
  if (!boardPart) return null

  const turnPart = parts[1]
  if (turnPart !== 'w' && turnPart !== 'b') return null

  const board = parseFenBoardLayout(boardPart)
  if (!board) return null

  return { board, turn: turnPart === 'b' ? 'black' : 'white' }
}

/**
 * 完整的 FEN 校验：先校验格式，再校验局面是否“讲得通”。
 * 不合逻辑的局面（无双王、非走棋方被将军、已被将死/逼和等）一律判为无效。
 */
export const validateFen = (fen: string): FenValidationResult => {
  const trimmed = fen.trim()
  if (!trimmed) return fail('format')

  const parts = trimmed.split(/\s+/)
  if (parts.length < 2 || parts.length > 6) return fail('format')

  const boardPart = parts[0]
  const turnPart = parts[1]
  const castlingPart = parts[2]
  const enPassantPart = parts[3]
  const halfmovePart = parts[4]
  const fullmovePart = parts[5]

  if (!boardPart) return fail('format')
  if (turnPart !== 'w' && turnPart !== 'b') return fail('format')
  if (castlingPart !== undefined && !/^(-|K?Q?k?q?)$/.test(castlingPart)) return fail('format')
  if (enPassantPart !== undefined && !/^(-|[a-h][36])$/.test(enPassantPart)) return fail('format')
  if (halfmovePart !== undefined && !/^\d+$/.test(halfmovePart)) return fail('format')
  if (fullmovePart !== undefined && !/^[1-9]\d*$/.test(fullmovePart)) return fail('format')

  const board = parseFenBoardLayout(boardPart)
  const turn: Color = turnPart === 'b' ? 'black' : 'white'
  if (!board) return fail('format', null, turn)

  // ---- 子力统计 ----
  const counts: Record<Color, { total: number; pawns: number; kings: number }> = {
    white: { total: 0, pawns: 0, kings: 0 },
    black: { total: 0, pawns: 0, kings: 0 },
  }
  let hasPawnOnBackRank = false

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row]![col]
      if (!piece) continue

      const pieceCountOfColor = counts[piece.color]
      pieceCountOfColor.total += 1

      if (piece.type === 'king') {
        pieceCountOfColor.kings += 1
      } else if (piece.type === 'pawn') {
        pieceCountOfColor.pawns += 1
        // 兵不能停留在自己的底线（白兵第 1 横线 / 黑兵第 8 横线）
        if ((piece.color === 'white' && row === 0) || (piece.color === 'black' && row === 7)) {
          hasPawnOnBackRank = true
        }
      }
    }
  }

  // ---- 双王必须各有一枚 ----
  if (counts.white.kings !== 1 || counts.black.kings !== 1) {
    return fail('king', board, turn)
  }

  if (hasPawnOnBackRank) return fail('pawnRank', board, turn)

  const overLimit = (['white', 'black'] as const).some(
    (color) => counts[color].total > 16 || counts[color].pawns > 8,
  )
  if (overLimit) return fail('pieceCount', board, turn)

  // ---- 非走棋方被将军：上一手非法，该方的王下一步就会被吃 ----
  const opponent: Color = turn === 'white' ? 'black' : 'white'
  if (isKingInCheck(board, opponent)) return fail('illegalCheck', board, turn)

  // ---- 走棋方已无合法着法：对局在开始前就已经结束 ----
  if (isCheckmate(board, turn)) return fail('checkmate', board, turn)
  if (isStalemate(board, turn)) return fail('stalemate', board, turn)
  if (hasInsufficientMaterial(board)) return fail('insufficientMaterial', board, turn)

  return { valid: true, error: null, board, turn }
}
