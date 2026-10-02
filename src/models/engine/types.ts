import type { Board, Color, Piece, Square } from '../chess'

export type AIDifficulty = 1 | 2 | 3 | 4 | 5
export type AIStyle = 'balanced' | 'aggressive' | 'defensive' | 'unpredictable'

export interface AIDetailedMove {
  fromRow: number
  fromCol: number
  toRow: number
  toCol: number
  special?: 'castle' | 'enPassant'
  rookFrom?: Square
  rookTo?: Square
  promotion?: 'queen' | 'knight' | 'rook' | 'bishop'
}

export const PIECE_VALUES: Record<string, number> = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 20000,
}

export const PIECE_VALUE_ARRAY: number[] = [100, 320, 330, 500, 900, 20000]

export const PIECE_TYPE_INDEX: Record<string, number> = {
  pawn: 0,
  knight: 1,
  bishop: 2,
  rook: 3,
  queen: 4,
  king: 5,
}

export const COLOR_INDEX: Record<string, number> = {
  white: 0,
  black: 1,
}

export const TT_EXACT = 0
export const TT_ALPHA = 1 // upper bound (score <= alpha, fail-low)
export const TT_BETA = 2 // lower bound (score >= beta, fail-high)

export const MAX_DEPTH = 64
export const TT_SIZE = 1 << 17 // 131072 entries
export const TT_MASK = TT_SIZE - 1

export const INF = 999999
export const MATE_SCORE = 99999

export interface TTEntry {
  hash: number
  depth: number
  score: number
  flag: number
  bestMove: AIDetailedMove | null
}

export interface BoardChange {
  row: number
  col: number
  oldPiece: Piece | null
}

export interface SearchState {
  board: Board
  searchColor: Color
  searchStyle: AIStyle
  searchHash: number
  searchCastlingRights: number
  searchStartTime: number
  searchTimeLimit: number
  searchStopped: boolean
  searchNodes: number
  trackedWhiteKingRow: number
  trackedWhiteKingCol: number
  trackedBlackKingRow: number
  trackedBlackKingCol: number
  trackedMaterial: number
}