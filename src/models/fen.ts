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
  type Square,
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
  | 'castling'
  | 'enPassant'
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

export interface ParsedFen {
  board: Board
  turn: Color
  lastMove: { from: Square; to: Square } | null
  halfmoveClock: number
  fullmoveNumber: number
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

const getCastlingRookCol = (board: Board, color: Color, right: string): number | null => {
  const row = color === 'white' ? 7 : 0
  const rank = board[row] ?? []
  const kingCol = rank.findIndex((piece) => piece?.type === 'king' && piece.color === color)
  if (kingCol < 0) return null

  const rookCols = rank.reduce<number[]>((cols, piece, col) => {
    if (piece?.type === 'rook' && piece.color === color) cols.push(col)
    return cols
  }, [])

  if (right === 'K' || right === 'k') {
    return rookCols.filter((col) => col > kingCol).at(-1) ?? null
  }
  if (right === 'Q' || right === 'q') {
    return rookCols.find((col) => col < kingCol) ?? null
  }

  const col = right.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0)
  return rookCols.includes(col) ? col : null
}

const isColorCastlingRight = (right: string, color: Color): boolean =>
  color === 'white' ? right === right.toUpperCase() : right === right.toLowerCase()

/** 解析棋盤與對局狀態欄位；缺少的選填欄位採 FEN 預設值。 */
export const parseFen = (fen: string): ParsedFen | null => {
  const parts = fen.trim().split(/\s+/)
  if (parts.length < 2 || parts.length > 6) return null
  const boardPart = parts[0]
  if (!boardPart) return null

  const turnPart = parts[1]
  if (turnPart !== 'w' && turnPart !== 'b') return null
  const castlingPart = parts[2] ?? '-'
  const enPassantPart = parts[3] ?? '-'
  const halfmovePart = parts[4] ?? '0'
  const fullmovePart = parts[5] ?? '1'
  if (
    !/^(?:-|[KQABCDEFGHkqabcdefgh]+)$/.test(castlingPart) ||
    (castlingPart !== '-' && new Set(castlingPart).size !== castlingPart.length)
  ) return null
  if (!/^(?:-|[a-h][36])$/.test(enPassantPart)) return null
  if (!/^\d+$/.test(halfmovePart) || !/^[1-9]\d*$/.test(fullmovePart)) return null
  if (!Number.isSafeInteger(Number(halfmovePart)) || !Number.isSafeInteger(Number(fullmovePart))) return null

  const board = parseFenBoardLayout(boardPart)
  if (!board) return null

  const turn: Color = turnPart === 'b' ? 'black' : 'white'
  const castlingRights = castlingPart === '-' ? '' : castlingPart
  for (const color of ['white', 'black'] as const) {
    const row = color === 'white' ? 7 : 0
    const rights = [...castlingRights].filter((right) => isColorCastlingRight(right, color))
    const king = board[row]!.find((piece) => piece?.type === 'king' && piece.color === color)
    if (king) king.hasMoved = rights.length === 0

    for (const piece of board[row]!) {
      if (piece?.type === 'rook' && piece.color === color) piece.hasMoved = true
    }
    for (const right of rights) {
      const rookCol = getCastlingRookCol(board, color, right)
      const rook = rookCol === null ? null : board[row]![rookCol]
      if (rook) rook.hasMoved = false
    }
  }

  let lastMove: ParsedFen['lastMove'] = null
  if (enPassantPart !== '-') {
    const target: Square = {
      row: 8 - Number(enPassantPart[1]),
      col: enPassantPart.charCodeAt(0) - 'a'.charCodeAt(0),
    }
    const toRow = target.row + (turn === 'white' ? 1 : -1)
    const fromRow = target.row + (turn === 'white' ? -1 : 1)
    lastMove = { from: { row: fromRow, col: target.col }, to: { row: toRow, col: target.col } }
  }

  return {
    board,
    turn,
    lastMove,
    halfmoveClock: Number(halfmovePart),
    fullmoveNumber: Number(fullmovePart),
  }
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
  if (
    castlingPart !== undefined &&
    (!/^(?:-|[KQABCDEFGHkqabcdefgh]+)$/.test(castlingPart) ||
      (castlingPart !== '-' && new Set(castlingPart).size !== castlingPart.length))
  ) return fail('format')
  if (enPassantPart !== undefined && !/^(-|[a-h][36])$/.test(enPassantPart)) return fail('format')
  if (halfmovePart !== undefined && !/^\d+$/.test(halfmovePart)) return fail('format')
  if (fullmovePart !== undefined && !/^[1-9]\d*$/.test(fullmovePart)) return fail('format')
  if (halfmovePart !== undefined && !Number.isSafeInteger(Number(halfmovePart))) return fail('format')
  if (fullmovePart !== undefined && !Number.isSafeInteger(Number(fullmovePart))) return fail('format')

  const board = parseFenBoardLayout(boardPart)
  const turn: Color = turnPart === 'b' ? 'black' : 'white'
  if (!board) return fail('format', null, turn)

  if (castlingPart && castlingPart !== '-') {
    for (const right of castlingPart) {
      const color: Color = right === right.toUpperCase() ? 'white' : 'black'
      const row = color === 'white' ? 7 : 0
      const king = board[row]!.find((piece) => piece?.type === 'king' && piece.color === color)
      if (!king || getCastlingRookCol(board, color, right) === null) {
        return fail('castling', board, turn)
      }
    }
  }

  if (enPassantPart && enPassantPart !== '-') {
    const targetRow = 8 - Number(enPassantPart[1])
    const targetCol = enPassantPart.charCodeAt(0) - 'a'.charCodeAt(0)
    const expectedRow = turn === 'white' ? 2 : 5
    const pawnRow = turn === 'white' ? 3 : 4
    const startRow = turn === 'white' ? 1 : 6
    const pawnColor: Color = turn === 'white' ? 'black' : 'white'
    const target = board[targetRow]?.[targetCol]
    const pawn = board[pawnRow]?.[targetCol]
    const origin = board[startRow]?.[targetCol]
    if (
      targetRow !== expectedRow || target !== null || pawn?.type !== 'pawn' ||
      pawn.color !== pawnColor || origin !== null || Number(halfmovePart ?? '0') !== 0
    ) {
      return fail('enPassant', board, turn)
    }
  }

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
