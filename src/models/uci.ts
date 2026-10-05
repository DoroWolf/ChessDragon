import type { Board, Color, PieceType, Square } from './chess'
import { getEnPassantTarget, getLegalMoves } from './chess'
import type { AIDetailedMove } from './ai'

export interface ParsedUciMove {
  fromRow: number
  fromCol: number
  toRow: number
  toCol: number
  promotion?: 'queen' | 'knight' | 'rook' | 'bishop'
}

const PROMOTION_CHARS: Record<string, 'queen' | 'knight' | 'rook' | 'bishop'> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
}

const PROMOTION_LETTERS: Record<string, string> = {
  queen: 'q',
  rook: 'r',
  bishop: 'b',
  knight: 'n',
}

export function parseUciMove(text: string): ParsedUciMove | null {
  const s = text.trim().toLowerCase()
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(s)) return null

  const promoChar = s[4]
  return {
    fromRow: 8 - Number(s[1]),
    fromCol: s.charCodeAt(0) - 97,
    toRow: 8 - Number(s[3]),
    toCol: s.charCodeAt(2) - 97,
    promotion: promoChar ? PROMOTION_CHARS[promoChar] : undefined,
  }
}

export function buildUciMoveString(move: {
  fromRow: number
  fromCol: number
  toRow: number
  toCol: number
  promotion?: PieceType | string
}): string {
  const file = (c: number): string => String.fromCharCode(97 + c)
  const rank = (r: number): string => String(8 - r)
  const promo = move.promotion ? (PROMOTION_LETTERS[move.promotion] ?? '') : ''
  return `${file(move.fromCol)}${rank(move.fromRow)}${file(move.toCol)}${rank(move.toRow)}${promo}`
}

export function resolveMoveFromUci(
  board: Board,
  color: Color,
  lastMove: { from: Square; to: Square } | null,
  uci: string,
): AIDetailedMove | null {
  const parsed = parseUciMove(uci)
  if (!parsed) return null

  const piece = board[parsed.fromRow]?.[parsed.fromCol]
  if (!piece || piece.color !== color) return null

  const options = { enPassantTarget: getEnPassantTarget(lastMove), lastMove }
  const legal = getLegalMoves(board, parsed.fromRow, parsed.fromCol, options)
  const matched = legal.find((m) => m.row === parsed.toRow && m.col === parsed.toCol)
  if (!matched) return null

  const promotion =
    piece.type === 'pawn' && (parsed.toRow === 0 || parsed.toRow === 7)
      ? (parsed.promotion ?? 'queen')
      : undefined

  return {
    fromRow: parsed.fromRow,
    fromCol: parsed.fromCol,
    toRow: parsed.toRow,
    toCol: parsed.toCol,
    special: matched.special,
    rookFrom: matched.rookFrom,
    rookTo: matched.rookTo,
    promotion,
  }
}
