import type {
  Board,
  Color,
  Square,
  Move,
  Piece,
  PieceType,
  MoveOptions,
} from './chess'
import {
  getPieceMoves,
  isKingInCheck as isKingInCheckChess,
  getEnPassantTarget,
  isWhiteSquare,
} from './chess'
import { queryOpeningBook, preloadOpeningBooks } from './openingBook'

// ============================================================
// Types
// ============================================================
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

// ============================================================
// Constants
// ============================================================
const PIECE_VALUES: Record<string, number> = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 20000,
}

const PIECE_VALUE_ARRAY: number[] = [100, 320, 330, 500, 900, 20000]

const PIECE_TYPE_INDEX: Record<string, number> = {
  pawn: 0,
  knight: 1,
  bishop: 2,
  rook: 3,
  queen: 4,
  king: 5,
}

const COLOR_INDEX: Record<string, number> = {
  white: 0,
  black: 1,
}

const TT_EXACT = 0
const TT_ALPHA = 1 // upper bound (score <= alpha, fail-low)
const TT_BETA = 2 // lower bound (score >= beta, fail-high)

const MAX_DEPTH = 64
const TT_SIZE = 1 << 17 // 131072 entries
const TT_MASK = TT_SIZE - 1

const INF = 999999
const MATE_SCORE = 99999

// ============================================================
// Piece-Square Tables (same as original)
// ============================================================
const PAWN_TABLE: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
]

const KNIGHT_TABLE: number[][] = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
]

const BISHOP_TABLE: number[][] = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
]

const ROOK_TABLE: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0],
]

const QUEEN_TABLE: number[][] = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
]

const KING_MIDDLE_TABLE: number[][] = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
]

const KING_ENDGAME_TABLE: number[][] = [
  [-50, -40, -30, -20, -20, -30, -40, -50],
  [-30, -20, -10, 0, 0, -10, -20, -30],
  [-30, -10, 20, 30, 30, 20, -10, -30],
  [-30, -10, 30, 40, 40, 30, -10, -30],
  [-30, -10, 30, 40, 40, 30, -10, -30],
  [-30, -10, 20, 30, 30, 20, -10, -30],
  [-30, -30, 0, 0, 0, 0, -30, -30],
  [-50, -30, -30, -30, -30, -30, -30, -50],
]

// ============================================================
// Pre-computed Piece-Square Tables by color
// PST_BY_COLOR[pieceType][color][row][col] - eliminates branch
// ============================================================
const PST_BY_COLOR: number[][][][] = (() => {
  const tables: number[][][] = [
    PAWN_TABLE,
    KNIGHT_TABLE,
    BISHOP_TABLE,
    ROOK_TABLE,
    QUEEN_TABLE,
    KING_MIDDLE_TABLE, // index 5 = king middle
  ]
  const result: number[][][][] = []
  for (let pt = 0; pt < 6; pt++) {
    result[pt] = []
    for (let c = 0; c < 2; c++) {
      result[pt]![c] = Array.from({ length: 8 }, () => new Array(8).fill(0))
      for (let r = 0; r < 8; r++) {
        for (let co = 0; co < 8; co++) {
          // Black only needs row flip (white's row 0 = black's row 7).
          // Column is NOT flipped — the board is symmetric left-right.
          const adjR = c === 0 ? r : 7 - r
          result[pt]![c]![r]![co] = tables[pt]![adjR]![co]!
        }
      }
    }
  }
  // Also generate king endgame table as index 6
  result[6] = []
  for (let c = 0; c < 2; c++) {
    result[6]![c] = Array.from({ length: 8 }, () => new Array(8).fill(0))
    for (let r = 0; r < 8; r++) {
      for (let co = 0; co < 8; co++) {
        const adjR = c === 0 ? r : 7 - r
        result[6]![c]![r]![co] = KING_ENDGAME_TABLE[adjR]![co]!
      }
    }
  }
  return result
})()

// PST table index for king endgame
const PST_KING_ENDGAME = 6

// ============================================================
// Seeded PRNG for Zobrist keys
// ============================================================
function xorshift32(state: number): () => number {
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state >>> 0
  }
}

const rng = xorshift32(0xDEADBEEF)

// ============================================================
// Zobrist Hashing Tables
// ============================================================
const zobristPiece: number[][][] = Array.from({ length: 6 }, () =>
  Array.from({ length: 2 }, () => new Array(64).fill(0)),
)
const zobristEnPassant: number[] = new Array(8).fill(0)
const zobristCastling: number[] = new Array(4).fill(0)
let zobristBlackToMove = 0

;(function initZobrist() {
  for (let pt = 0; pt < 6; pt++) {
    for (let c = 0; c < 2; c++) {
      for (let sq = 0; sq < 64; sq++) {
        zobristPiece[pt]![c]![sq] = rng()
      }
    }
  }
  for (let f = 0; f < 8; f++) {
    zobristEnPassant[f] = rng()
  }
  for (let i = 0; i < 4; i++) {
    zobristCastling[i] = rng()
  }
  zobristBlackToMove = rng()
})()

// ============================================================
// Transposition Table
// ============================================================
interface TTEntry {
  hash: number
  depth: number
  score: number
  flag: number
  bestMove: AIDetailedMove | null
}

const tt: (TTEntry | null)[] = new Array(TT_SIZE).fill(null)
let ttHits = 0

function probeTT(hash: number, depth: number, alpha: number, beta: number): {
  hit: boolean
  score: number
  bestMove: AIDetailedMove | null
} {
  const idx = hash & TT_MASK
  const entry = tt[idx]
  if (entry && entry.hash === hash && entry.depth >= depth) {
    ttHits++
    if (entry.flag === TT_EXACT) {
      return { hit: true, score: entry.score, bestMove: entry.bestMove }
    }
    if (entry.flag === TT_ALPHA && entry.score <= alpha) {
      return { hit: true, score: alpha, bestMove: entry.bestMove }
    }
    if (entry.flag === TT_BETA && entry.score >= beta) {
      return { hit: true, score: beta, bestMove: entry.bestMove }
    }
  }
  return { hit: false, score: 0, bestMove: entry?.bestMove ?? null }
}

function storeTT(
  hash: number,
  depth: number,
  score: number,
  flag: number,
  bestMove: AIDetailedMove | null,
): void {
  const idx = hash & TT_MASK
  const existing = tt[idx]
  if (existing && existing.hash === hash && existing.depth > depth && existing.flag === TT_EXACT) {
    return
  }
  tt[idx] = { hash, depth, score, flag, bestMove }
}

// ============================================================
// Killer Moves & History Table
// ============================================================
const killerMoves: (AIDetailedMove | null)[][] = Array.from({ length: MAX_DEPTH }, () => [
  null,
  null,
])

const historyTable: number[][][][][] = Array.from({ length: 2 }, () =>
  Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => new Array(8).fill(0)),
    ),
  ),
)

function recordKillerMove(move: AIDetailedMove, depth: number): void {
  if (move.special) return
  const to = board[move.toRow]?.[move.toCol]
  if (to) return

  const slot = killerMoves[depth]!
  const killer0 = slot[0]
  if (killer0 && killer0.fromRow === move.fromRow && killer0.fromCol === move.fromCol &&
    killer0.toRow === move.toRow && killer0.toCol === move.toCol) {
    return
  }
  slot[1] = killer0 ?? null
  slot[0] = move
}

function recordHistory(move: AIDetailedMove, color: Color, depthBonus: number): void {
  if (move.special) return
  const piece = board[move.fromRow]?.[move.fromCol]
  if (!piece) return
  const ci = COLOR_INDEX[piece.color]!
  const histRow = historyTable[ci]![move.fromRow]![move.fromCol]![move.toRow]!
  histRow[move.toCol]! += depthBonus
}

// ============================================================
// Board Change Tracking (Make/Unmake)
// ============================================================
interface BoardChange {
  row: number
  col: number
  oldPiece: Piece | null
}

function makeChange(
  b: Board,
  row: number,
  col: number,
  newPiece: Piece | null,
  changes: BoardChange[],
): void {
  changes.push({ row, col, oldPiece: b[row]![col]! })
  b[row]![col] = newPiece
}

/**
 * Make a move on the board, returning changes to undo.
 * Also returns the new en passant target and whether a pawn was promoted.
 */
function makeMove(
  b: Board,
  move: AIDetailedMove,
): {
  changes: BoardChange[]
  newEnPassantTarget: { row: number; col: number } | null
  wasPromotion: boolean
} {
  const changes: BoardChange[] = []
  const piece = b[move.fromRow]![move.fromCol]!

  let newEnPassantTarget: { row: number; col: number } | null = null
  let wasPromotion = false

  if (move.special === 'castle' && move.rookFrom && move.rookTo) {
    makeChange(b, move.toRow, move.toCol, { ...piece, hasMoved: true }, changes)
    makeChange(b, move.fromRow, move.fromCol, null, changes)
    const rook = b[move.rookFrom.row]![move.rookFrom.col]!
    makeChange(b, move.rookTo.row, move.rookTo.col, { ...rook, hasMoved: true }, changes)
    makeChange(b, move.rookFrom.row, move.rookFrom.col, null, changes)
  } else if (move.special === 'enPassant') {
    const promotedType = (move.toRow === 0 || move.toRow === 7)
      ? move.promotion ?? 'queen'
      : piece.type
    makeChange(
      b,
      move.toRow,
      move.toCol,
      { type: promotedType, color: piece.color, hasMoved: true },
      changes,
    )
    makeChange(b, move.fromRow, move.fromCol, null, changes)
    makeChange(b, move.fromRow, move.toCol, null, changes)
    wasPromotion = promotedType !== 'pawn'
  } else {
    const isPawn = piece.type === 'pawn'
    const isDoublePush = isPawn && Math.abs(move.toRow - move.fromRow) === 2
    const promotedType = isPawn && (move.toRow === 0 || move.toRow === 7)
      ? move.promotion ?? 'queen'
      : piece.type

    makeChange(
      b,
      move.toRow,
      move.toCol,
      { type: promotedType, color: piece.color, hasMoved: true },
      changes,
    )
    makeChange(b, move.fromRow, move.fromCol, null, changes)

    if (isDoublePush) {
      newEnPassantTarget = {
        row: (move.fromRow + move.toRow) >> 1,
        col: move.fromCol,
      }
    }
    wasPromotion = promotedType !== piece.type
  }

  return { changes, newEnPassantTarget, wasPromotion }
}

/**
 * Undo a move by restoring all changed squares.
 */
function unmakeMove(b: Board, changes: BoardChange[]): void {
  for (let i = changes.length - 1; i >= 0; i--) {
    const ch = changes[i]!
    b[ch.row]![ch.col] = ch.oldPiece
  }
}

// ============================================================
// Search state tracking
// ============================================================
function packMove(move: AIDetailedMove): number {
  return (move.fromRow << 9) | (move.fromCol << 6) | (move.toRow << 3) | move.toCol
}

function movesMatch(a: AIDetailedMove | null, b: AIDetailedMove): boolean {
  if (!a) return false
  return a.fromRow === b.fromRow && a.fromCol === b.fromCol &&
    a.toRow === b.toRow && a.toCol === b.toCol &&
    a.special === b.special
}

function oppositeColor(color: Color): Color {
  return color === 'white' ? 'black' : 'white'
}

// ============================================================
// Incremental Board State (saved/restored alongside hash)
// ============================================================
/**
 * Compute the change in TOTAL material on the board for a move.
 * Negative when a piece is captured (removed from board).
 * Positive when a pawn promotes to a higher-value piece.
 * Call BEFORE makeMove with pre-move board state.
 */
function computeMaterialDelta(move: AIDetailedMove): number {
  const piece = board[move.fromRow]![move.fromCol]!
  let delta = 0

  // Captured piece: total board material decreases
  if (move.special === 'enPassant') {
    // En passant captures a pawn at (fromRow, toCol)
    delta -= PIECE_VALUES['pawn']!
  } else {
    const victim = board[move.toRow]![move.toCol]
    if (victim) {
      delta -= PIECE_VALUES[victim.type]!
    }
  }

  // Promotion: pawn removed, higher-value piece added → net increase
  if (move.promotion && piece.type === 'pawn' && (move.toRow === 0 || move.toRow === 7)) {
    const oldVal = PIECE_VALUES['pawn']!
    const newVal = PIECE_VALUES[move.promotion] ?? PIECE_VALUES['queen']!
    delta += (newVal - oldVal)
  }

  return delta
}

// ============================================================
// Fast material count from board (only used for initialization)
// ============================================================
function computeMaterialFromBoard(b: Board): number {
  let total = 0
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r]![c]
      if (p && p.type !== 'king') {
        total += PIECE_VALUES[p.type] ?? 0
      }
    }
  }
  return total
}

// ============================================================
// Fast endgame detection (O(1) with tracked material)
// ============================================================
function isEndgameFast(material: number): boolean {
  // Endgame threshold: total material excluding kings <= 1400
  return material <= 1400
}

// ============================================================
// Move Generation (legal moves for a color)
// Now uses tracked king positions for fast legality check
// ============================================================
function generateLegalMoves(
  b: Board,
  color: Color,
  enPassantTarget: { row: number; col: number } | null,
  capturesOnly: boolean,
  lastMove: { from: Square; to: Square } | null,
  kingRow: number,
  kingCol: number,
): AIDetailedMove[] {
  const moves: AIDetailedMove[] = []

  const epTarget = enPassantTarget ?? getEnPassantTarget(lastMove)
  const moveOpts: MoveOptions = { enPassantTarget: epTarget, lastMove }

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = b[row]![col]
      if (!piece || piece.color !== color) continue

      const candidateMoves = getPieceMoves(b, row, col, moveOpts)

      for (const m of candidateMoves) {
        const isCapture = b[m.row]![m.col] !== null || m.special === 'enPassant'

        if (capturesOnly && !isCapture) continue

        const detailedMove: AIDetailedMove = {
          fromRow: row,
          fromCol: col,
          toRow: m.row,
          toCol: m.col,
          special: m.special,
          rookFrom: m.rookFrom,
          rookTo: m.rookTo,
        }

        if (piece.type === 'pawn' && (m.row === 0 || m.row === 7)) {
          detailedMove.promotion = 'queen'
        }

        // Fast legality check using tracked king position
        const { changes, newEnPassantTarget: _epT } = makeMove(b, detailedMove)
        const legal = !isKingInCheckFast(b, color, kingRow, kingCol, piece, detailedMove)
        unmakeMove(b, changes)

        if (legal) {
          moves.push(detailedMove)
        }
      }
    }
  }

  return moves
}

// ============================================================
// Fast isKingInCheck using tracked king position + move info
// ============================================================
function isKingInCheckFast(
  b: Board,
  color: Color,
  kingRow: number,
  kingCol: number,
  movedPiece: Piece,
  move: AIDetailedMove,
): boolean {
  const enemyColor: Color = color === 'white' ? 'black' : 'white'

  // Determine the king's position after the move
  let kRow = kingRow
  let kCol = kingCol
  if (movedPiece.type === 'king') {
    kRow = move.toRow
    kCol = move.toCol
  }

  return isSquareAttackedFast(b, kRow, kCol, enemyColor)
}

// ============================================================
// Fast square attack check (extracted from chess.ts for performance)
// ============================================================
function isSquareAttackedFast(
  b: Board,
  row: number,
  col: number,
  attackerColor: Color,
): boolean {
  // Pawn attacks
  const pawnRow = attackerColor === 'white' ? row + 1 : row - 1
  if (pawnRow >= 0 && pawnRow < 8) {
    if (col - 1 >= 0) {
      const p = b[pawnRow]![col - 1]
      if (p && p.type === 'pawn' && p.color === attackerColor) return true
    }
    if (col + 1 < 8) {
      const p = b[pawnRow]![col + 1]
      if (p && p.type === 'pawn' && p.color === attackerColor) return true
    }
  }

  // Knight attacks
  const knightOffsets: [number, number][] = [
    [2, 1], [2, -1], [-2, 1], [-2, -1],
    [1, 2], [1, -2], [-1, 2], [-1, -2],
  ]
  for (let i = 0; i < 8; i++) {
    const kr = row + knightOffsets[i]![0]
    const kc = col + knightOffsets[i]![1]
    if (kr >= 0 && kr < 8 && kc >= 0 && kc < 8) {
      const p = b[kr]![kc]
      if (p && p.type === 'knight' && p.color === attackerColor) return true
    }
  }

  // Sliding pieces (bishop, rook, queen)
  const directions: [number, number][] = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ]
  for (let d = 0; d < 8; d++) {
    const dRow = directions[d]![0]
    const dCol = directions[d]![1]
    let cr = row + dRow
    let cc = col + dCol
    const isDiagonal = dRow !== 0 && dCol !== 0
    while (cr >= 0 && cr < 8 && cc >= 0 && cc < 8) {
      const p = b[cr]![cc]
      if (p) {
        if (p.color === attackerColor) {
          if (isDiagonal && (p.type === 'bishop' || p.type === 'queen')) return true
          if (!isDiagonal && (p.type === 'rook' || p.type === 'queen')) return true
        }
        break
      }
      cr += dRow
      cc += dCol
    }
  }

  // King attacks
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const kr = row + dr
      const kc = col + dc
      if (kr >= 0 && kr < 8 && kc >= 0 && kc < 8) {
        const p = b[kr]![kc]
        if (p && p.type === 'king' && p.color === attackerColor) return true
      }
    }
  }

  return false
}

// ============================================================
// Move Scoring / Ordering
// ============================================================
const MOVE_SCORE_TT = 10000000
const MOVE_SCORE_CAPTURE_BASE = 1000000
const MOVE_SCORE_KILLER_BASE = 900000
const MOVE_SCORE_KILLER2 = 800000

function scoreMoveForOrdering(
  move: AIDetailedMove,
  ttMove: AIDetailedMove | null,
  b: Board,
  depth: number,
): number {
  // 1. TT best move first
  if (movesMatch(ttMove, move)) {
    return MOVE_SCORE_TT
  }

  // 2. Captures by MVV-LVA
  const victim = move.special === 'enPassant'
    ? b[move.fromRow]![move.toCol]
    : b[move.toRow]![move.toCol]
  if (victim) {
    const attacker = b[move.fromRow]![move.fromCol]
    const victimVal = PIECE_VALUES[victim.type] ?? 0
    const attackerVal = PIECE_VALUES[attacker?.type ?? 'pawn'] ?? 0
    return MOVE_SCORE_CAPTURE_BASE + victimVal * 10 - attackerVal
  }

  // 3. Promotion
  if (move.promotion) {
    return MOVE_SCORE_CAPTURE_BASE + 900
  }

  // 4. Killer moves
  {
    const slot = killerMoves[depth]
    if (slot) {
      if (movesMatch(slot[0] ?? null, move)) {
        return MOVE_SCORE_KILLER_BASE
      }
      if (movesMatch(slot[1] ?? null, move)) {
        return MOVE_SCORE_KILLER2
      }
    }
  }

  // 5. History heuristic
  const piece = b[move.fromRow]![move.fromCol]
  if (piece && !move.special) {
    const ci = COLOR_INDEX[piece.color]!
    return historyTable[ci]![move.fromRow]![move.fromCol]![move.toRow]![move.toCol] ?? 0
  }

  return 0
}

// ============================================================
// Module-level search state (reset per search)
// ============================================================
let board: Board = []
let searchColor: Color = 'white'
let searchStyle: AIStyle = 'balanced'
let searchHash: number = 0
let searchCastlingRights: number = 0
let searchStartTime: number = 0
let searchTimeLimit: number = 0
let searchStopped: boolean = false
let searchNodes: number = 0

// Incremental tracking: king positions and material
let trackedWhiteKingRow = 7
let trackedWhiteKingCol = 4
let trackedBlackKingRow = 0
let trackedBlackKingCol = 4
let trackedMaterial = 0 // total material excluding kings

function getKingRow(color: Color): number {
  return color === 'white' ? trackedWhiteKingRow : trackedBlackKingRow
}

function getKingCol(color: Color): number {
  return color === 'white' ? trackedWhiteKingCol : trackedBlackKingCol
}

function setKingPos(color: Color, row: number, col: number): void {
  if (color === 'white') {
    trackedWhiteKingRow = row
    trackedWhiteKingCol = col
  } else {
    trackedBlackKingRow = row
    trackedBlackKingCol = col
  }
}

/**
 * Update incremental tracking after a move is made on the board.
 * Must be called AFTER makeMove.
 */
function updateTrackingAfterMove(move: AIDetailedMove, materialDelta: number): void {
  // After makeMove, the piece is at move.toRow. Get it from the board.
  const movedPiece = board[move.toRow]![move.toCol]!
  if (movedPiece && movedPiece.type === 'king') {
    setKingPos(movedPiece.color, move.toRow, move.toCol)
  }
  trackedMaterial += materialDelta
}

/**
 * Restore tracking to saved state (called after unmakeMove).
 */
function restoreTracking(
  wkr: number, wkc: number,
  bkr: number, bkc: number,
  material: number,
): void {
  trackedWhiteKingRow = wkr
  trackedWhiteKingCol = wkc
  trackedBlackKingRow = bkr
  trackedBlackKingCol = bkc
  trackedMaterial = material
}

// ============================================================
// Search time check
// ============================================================
function checkTimeLimit(): boolean {
  if (searchStopped) return true
  if (performance.now() - searchStartTime >= searchTimeLimit) {
    searchStopped = true
    return true
  }
  return false
}

// ============================================================
// Castling rights detection from board state
// ============================================================
type CastlingRights = number

function getCastlingRights(b: Board): CastlingRights {
  let rights = 0
  const wk = b[7]![4]
  const wkr = b[7]![7]
  if (wk && wk.type === 'king' && wk.color === 'white' && !wk.hasMoved &&
      wkr && wkr.type === 'rook' && wkr.color === 'white' && !wkr.hasMoved) {
    rights |= 1
  }
  const wqr = b[7]![0]
  if (wk && wk.type === 'king' && wk.color === 'white' && !wk.hasMoved &&
      wqr && wqr.type === 'rook' && wqr.color === 'white' && !wqr.hasMoved) {
    rights |= 2
  }
  const bk = b[0]![4]
  const bkr = b[0]![7]
  if (bk && bk.type === 'king' && bk.color === 'black' && !bk.hasMoved &&
      bkr && bkr.type === 'rook' && bkr.color === 'black' && !bkr.hasMoved) {
    rights |= 4
  }
  const bqr = b[0]![0]
  if (bk && bk.type === 'king' && bk.color === 'black' && !bk.hasMoved &&
      bqr && bqr.type === 'rook' && bqr.color === 'black' && !bqr.hasMoved) {
    rights |= 8
  }
  return rights
}

function castlingHash(rights: CastlingRights): number {
  let h = 0
  if (rights & 1) h ^= zobristCastling[0]!
  if (rights & 2) h ^= zobristCastling[1]!
  if (rights & 4) h ^= zobristCastling[2]!
  if (rights & 8) h ^= zobristCastling[3]!
  return h
}

// ============================================================
// Compute Zobrist hash from board state
// ============================================================
function computeHash(
  b: Board,
  currentTurn: Color,
  enPassantFile: number | null,
  castling: CastlingRights,
): number {
  let h = 0
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r]![c]
      if (p) {
        const ptIdx = PIECE_TYPE_INDEX[p.type]!
        const cIdx = COLOR_INDEX[p.color]!
        h ^= zobristPiece[ptIdx]![cIdx]![r * 8 + c]!
      }
    }
  }
  if (currentTurn === 'black') {
    h ^= zobristBlackToMove
  }
  if (enPassantFile !== null && enPassantFile >= 0 && enPassantFile < 8) {
    h ^= zobristEnPassant[enPassantFile]!
  }
  h ^= castlingHash(castling)
  return h >>> 0
}

// ============================================================
// Incremental hash update for a single piece move
// ============================================================
function updateHashPiece(
  hash: number,
  piece: Piece,
  fromSq: number,
  toSq: number,
): number {
  const ptIdx = PIECE_TYPE_INDEX[piece.type]!
  const cIdx = COLOR_INDEX[piece.color]!
  let h = hash
  h ^= zobristPiece[ptIdx]![cIdx]![fromSq]!
  h ^= zobristPiece[ptIdx]![cIdx]![toSq]!
  return h
}

// ============================================================
// Incremental hash update for a complete move
// ============================================================
/**
 * Compute castling rights after removing rights for the given color's side(s).
 * Returns a bitmask of rights that are STILL active after the update.
 */
function removeCastlingRights(rights: number, color: Color, which: 'both' | 'kingside' | 'queenside'): number {
  let r = rights
  if (color === 'white') {
    if (which === 'both' || which === 'kingside') r &= ~1
    if (which === 'both' || which === 'queenside') r &= ~2
  } else {
    if (which === 'both' || which === 'kingside') r &= ~4
    if (which === 'both' || which === 'queenside') r &= ~8
  }
  return r
}

/**
 * Incrementally update the Zobrist hash for a move.
 * Returns the new hash AND the updated castling rights.
 */
function hashAfterMove(
  oldHash: number,
  move: AIDetailedMove,
  oldEpFile: number | null,
  newEpFile: number | null,
  oldCastlingRights: number,
): { hash: number; castlingRights: number } {
  let h = oldHash

  const piece = board[move.fromRow]![move.fromCol]!
  const pieceColor = piece.color
  const fromSq = move.fromRow * 8 + move.fromCol
  const toSq = move.toRow * 8 + move.toCol

  if (move.special === 'castle' && move.rookFrom && move.rookTo) {
    h = updateHashPiece(h, piece, fromSq, toSq)
    const rook = board[move.rookFrom.row]![move.rookFrom.col]!
    const rookFromSq = move.rookFrom.row * 8 + move.rookFrom.col
    const rookToSq = move.rookTo.row * 8 + move.rookTo.col
    h = updateHashPiece(h, rook, rookFromSq, rookToSq)
  } else if (move.special === 'enPassant') {
    const ptIdx = PIECE_TYPE_INDEX['pawn']!
    const cIdx = COLOR_INDEX[pieceColor]!
    h ^= zobristPiece[ptIdx]![cIdx]![fromSq]!

    const promotedType = move.promotion && move.promotion !== 'queen'
      ? move.promotion
      : (move.toRow === 0 || move.toRow === 7) ? 'queen' : piece.type
    const destPtIdx = PIECE_TYPE_INDEX[promotedType]!
    h ^= zobristPiece[destPtIdx]![cIdx]![toSq]!

    const capturedSq = move.fromRow * 8 + move.toCol
    const capCIdx = COLOR_INDEX[oppositeColor(pieceColor)]!
    h ^= zobristPiece[PIECE_TYPE_INDEX['pawn']!]![capCIdx]![capturedSq]!
  } else {
    const isPromotion = move.promotion && (move.toRow === 0 || move.toRow === 7)
    const destType = isPromotion ? move.promotion! : piece.type

    const srcPtIdx = PIECE_TYPE_INDEX[piece.type]!
    const cIdx = COLOR_INDEX[pieceColor]!
    h ^= zobristPiece[srcPtIdx]![cIdx]![fromSq]!

    const destPtIdx = PIECE_TYPE_INDEX[destType]!
    h ^= zobristPiece[destPtIdx]![cIdx]![toSq]!

    const captured = board[move.toRow]![move.toCol]
    if (captured) {
      const capPtIdx = PIECE_TYPE_INDEX[captured.type]!
      const capCIdx = COLOR_INDEX[captured.color]!
      h ^= zobristPiece[capPtIdx]![capCIdx]![toSq]!
    }
  }

  if (oldEpFile !== null) h ^= zobristEnPassant[oldEpFile]!
  if (newEpFile !== null) h ^= zobristEnPassant[newEpFile]!

  // Update castling rights — only XOR out rights that were actually present,
  // then XOR in the new rights. This correctly handles the case where a right
  // was already absent (e.g., the rook already moved before the king).
  let newRights = oldCastlingRights

  // King move → lose all castling rights for that color
  if (piece.type === 'king') {
    newRights = removeCastlingRights(newRights, pieceColor, 'both')
  }
  // Rook move from original square → lose that side
  if (piece.type === 'rook' && !piece.hasMoved) {
    if (pieceColor === 'white' && fromSq === 63) newRights = removeCastlingRights(newRights, 'white', 'kingside')
    if (pieceColor === 'white' && fromSq === 56) newRights = removeCastlingRights(newRights, 'white', 'queenside')
    if (pieceColor === 'black' && fromSq === 7) newRights = removeCastlingRights(newRights, 'black', 'kingside')
    if (pieceColor === 'black' && fromSq === 0) newRights = removeCastlingRights(newRights, 'black', 'queenside')
  }
  // Captured rook on its original square → lose that side
  const capturedPiece = move.special === 'enPassant' ? null : board[move.toRow]![move.toCol]
  if (capturedPiece && capturedPiece.type === 'rook' && !capturedPiece.hasMoved) {
    const capSq = move.toRow * 8 + move.toCol
    if (capturedPiece.color === 'white' && capSq === 63) newRights = removeCastlingRights(newRights, 'white', 'kingside')
    if (capturedPiece.color === 'white' && capSq === 56) newRights = removeCastlingRights(newRights, 'white', 'queenside')
    if (capturedPiece.color === 'black' && capSq === 7) newRights = removeCastlingRights(newRights, 'black', 'kingside')
    if (capturedPiece.color === 'black' && capSq === 0) newRights = removeCastlingRights(newRights, 'black', 'queenside')
  }

  // XOR out old castling rights, XOR in new castling rights
  h ^= castlingHash(oldCastlingRights)
  h ^= castlingHash(newRights)

  h ^= zobristBlackToMove

  return { hash: h >>> 0, castlingRights: newRights }
}

// ============================================================
// Board Evaluation (optimized with pre-computed PSTs)
// ============================================================
function evaluateBoardInternal(b: Board, perspective: Color): number {
  let score = 0
  const endgame = isEndgameFast(trackedMaterial)
  const pstKingIdx = endgame ? PST_KING_ENDGAME : PIECE_TYPE_INDEX['king']!

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = b[row]![col]
      if (!piece) continue

      const sign = piece.color === perspective ? 1 : -1
      const ptIdx = PIECE_TYPE_INDEX[piece.type]!
      const cIdx = COLOR_INDEX[piece.color]!

      // Material + PST combined
      const baseValue = PIECE_VALUE_ARRAY[ptIdx]!
      const pstIdx = piece.type === 'king' ? pstKingIdx : ptIdx
      const posValue = PST_BY_COLOR[pstIdx]![cIdx]![row]![col]!

      score += sign * (baseValue + posValue)
    }
  }

  // Style adjustments
  if (searchStyle === 'aggressive') {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = b[row]![col]
        if (!piece || piece.color !== perspective) continue
        if (piece.type === 'knight' || piece.type === 'bishop') {
          const centerDist = Math.abs(3.5 - row) + Math.abs(3.5 - col)
          if (centerDist <= 2) {
            score += 15
          }
        }
        if (piece.type === 'pawn') {
          const advance = piece.color === 'white' ? (6 - row) : (row - 1)
          score += advance * 3
        }
      }
    }
  } else if (searchStyle === 'defensive') {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = b[row]![col]
        if (!piece || piece.color !== perspective) continue
        if (piece.type === 'pawn') {
          const leftSame = b[row]![col - 1]
          const rightSame = b[row]![col + 1]
          if (
            (leftSame && leftSame.type === 'pawn' && leftSame.color === piece.color) ||
            (rightSame && rightSame.type === 'pawn' && rightSame.color === piece.color)
          ) {
            score += 10
          }
        }
      }
    }
  }

  return score
}

// ============================================================
// Quiescence Search (captures only)
// ============================================================
function quiescenceSearch(
  alpha: number,
  beta: number,
  enPassantTarget: { row: number; col: number } | null,
  lastMove: { from: Square; to: Square } | null,
  currentColor: Color,
): number {
  if (checkTimeLimit()) return 0

  searchNodes++

  // Save tracking state
  const savedWKR = trackedWhiteKingRow
  const savedWKC = trackedWhiteKingCol
  const savedBKR = trackedBlackKingRow
  const savedBKC = trackedBlackKingCol
  const savedMat = trackedMaterial

  // --- Stand pat check with check detection ---
  // We must check if the current side is in check.
  // If in check, we cannot stand pat — all evasions (including non-captures) must be searched.
  // But since quiescenceSearch is called with capturesOnly=true for recursive calls,
  // we need to handle this properly.
  const kRow = getKingRow(currentColor)
  const kCol = getKingCol(currentColor)
  const inCheck = isSquareAttackedFast(board, kRow, kCol, oppositeColor(currentColor))

  let standPat = -INF
  if (!inCheck) {
    standPat = evaluateBoardInternal(board, currentColor)
    if (standPat >= beta) return beta
    if (standPat > alpha) alpha = standPat
  }

  // When in check, generate ALL legal moves (evasions), not just captures
  const captures = generateLegalMoves(board, currentColor, enPassantTarget, !inCheck, lastMove, kRow, kCol)
  if (captures.length === 0) {
    // No legal moves: if in check, it's checkmate; if not, stalemate
    if (inCheck) return -MATE_SCORE
    return alpha
  }

  // Score captures using simple array - no object allocation for each move
  const scores: number[] = new Array(captures.length)
  for (let i = 0; i < captures.length; i++) {
    const m = captures[i]!
    const victim = board[m.toRow]![m.toCol]
    const attacker = board[m.fromRow]![m.fromCol]
    const victimVal = victim ? PIECE_VALUES[victim.type] ?? 0 : 100
    const attackerVal = PIECE_VALUES[attacker?.type ?? 'pawn'] ?? 0
    scores[i] = victimVal * 10 - attackerVal + (m.promotion ? 900 : 0)
  }

  // Sort by score descending
  const indices = Array.from({ length: captures.length }, (_, i) => i)
  indices.sort((a, b) => scores[b]! - scores[a]!)

  const oldEpFile = enPassantTarget ? enPassantTarget.col : null

  for (let idx = 0; idx < indices.length; idx++) {
    const move = captures[indices[idx]!]!

    // Delta pruning (skip when in check — all evasions must be tried)
    if (!inCheck) {
      const victim = move.special === 'enPassant'
        ? board[move.fromRow]![move.toCol]
        : board[move.toRow]![move.toCol]
      const victimVal = victim ? PIECE_VALUES[victim.type] ?? 0 : 100
      const promotionBonus = move.promotion ? 800 : 0
      // standPat was computed above; alpha may have been raised by standPat
      // delta pruning: if even best-case material gain can't reach alpha, skip
      if (standPat + victimVal + promotionBonus + 200 < alpha) continue
    }

    const qPiece = board[move.fromRow]![move.fromCol]!
    const nextEpFile: number | null =
      qPiece.type === 'pawn' && Math.abs(move.toRow - move.fromRow) === 2
        ? move.fromCol
        : null

    const oldHash = searchHash
    const oldCastling = searchCastlingRights
    const hashResult = hashAfterMove(oldHash, move, oldEpFile, nextEpFile, oldCastling)
    searchHash = hashResult.hash
    searchCastlingRights = hashResult.castlingRights

    const matDelta = computeMaterialDelta(move)
    const { changes, newEnPassantTarget } = makeMove(board, move)
    updateTrackingAfterMove(move, matDelta)

    const score = -quiescenceSearch(-beta, -alpha, newEnPassantTarget, {
      from: { row: move.fromRow, col: move.fromCol },
      to: { row: move.toRow, col: move.toCol },
    }, oppositeColor(currentColor))

    unmakeMove(board, changes)
    searchHash = oldHash
    searchCastlingRights = oldCastling
    restoreTracking(savedWKR, savedWKC, savedBKR, savedBKC, savedMat)

    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }

  return alpha
}

// ============================================================
// PVS (Principal Variation Search)
// ============================================================
function pvs(
  depth: number,
  alpha: number,
  beta: number,
  enPassantTarget: { row: number; col: number } | null,
  lastMove: { from: Square; to: Square } | null,
  currentColor: Color,
): number {
  if (checkTimeLimit()) return 0

  searchNodes++

  // Save tracking state
  const savedWKR = trackedWhiteKingRow
  const savedWKC = trackedWhiteKingCol
  const savedBKR = trackedBlackKingRow
  const savedBKC = trackedBlackKingCol
  const savedMat = trackedMaterial
  const savedCastling = searchCastlingRights

  // Transposition table probe
  const ttEntry = probeTT(searchHash, depth, alpha, beta)
  if (ttEntry.hit) {
    return ttEntry.score
  }

  // --- Terminal checks ---
  const kRow = getKingRow(currentColor)
  const kCol = getKingCol(currentColor)
  const moves = generateLegalMoves(board, currentColor, enPassantTarget, false, lastMove, kRow, kCol)

  if (moves.length === 0) {
    if (isSquareAttackedFast(board, kRow, kCol, oppositeColor(currentColor))) {
      // Mate score: adjust by ply distance to prefer faster mates
      return -MATE_SCORE + (MAX_DEPTH - depth)
    }
    return 0
  }

  // Enter quiescence search at depth 0
  if (depth <= 0) {
    return quiescenceSearch(alpha, beta, enPassantTarget, lastMove, currentColor)
  }

  // --- Null Move Pruning ---
  const canNullMove = depth >= 3 && !isSquareAttackedFast(board, kRow, kCol, oppositeColor(currentColor)) && !isEndgameFast(trackedMaterial)
  if (canNullMove) {
    const R = 3 + Math.floor(depth / 4)
    const oldHash = searchHash
    searchHash ^= zobristBlackToMove
    const score = -pvs(depth - 1 - R, -beta, -beta + 1, null, null, oppositeColor(currentColor))
    searchHash = oldHash
    if (score >= beta) {
      return beta
    }
  }

  // --- Score and order moves ---
  const ttBestMove = ttEntry.bestMove
  const numMoves = moves.length

  // Create scores array (no object allocation per move)
  const scores: number[] = new Array(numMoves)
  for (let i = 0; i < numMoves; i++) {
    scores[i] = scoreMoveForOrdering(moves[i]!, ttBestMove, board, depth)
  }

  // Sort indices by score descending
  const indices = Array.from({ length: numMoves }, (_, i) => i)
  indices.sort((a, b) => scores[b]! - scores[a]!)

  // --- Search moves ---
  let bestScore = -INF
  let bestMove: AIDetailedMove | null = null
  let flag = TT_ALPHA
  let movesSearched = 0

  const oldEpFile = enPassantTarget ? enPassantTarget.col : null

  for (let idx = 0; idx < indices.length; idx++) {
    movesSearched++
    const move = moves[indices[idx]!]!

    // Late Move Reduction
    let reduction = 0
    if (
      movesSearched >= 4 &&
      depth >= 3 &&
      !board[move.toRow]![move.toCol] &&
      move.special !== 'enPassant' &&
      !move.promotion
    ) {
      reduction = 1 + Math.floor(movesSearched / 8)
      if (reduction > depth - 1) reduction = depth - 1
    }

    const pvsPiece = board[move.fromRow]![move.fromCol]!
    const pvsNextEpFile: number | null =
      pvsPiece.type === 'pawn' && Math.abs(move.toRow - move.fromRow) === 2
        ? move.fromCol
        : null

    const oldHash = searchHash
    const oldCastling = searchCastlingRights
    const hashResult = hashAfterMove(oldHash, move, oldEpFile, pvsNextEpFile, savedCastling)
    searchHash = hashResult.hash
    searchCastlingRights = hashResult.castlingRights

    const matDelta = computeMaterialDelta(move)
    const { changes, newEnPassantTarget } = makeMove(board, move)
    updateTrackingAfterMove(move, matDelta)

    const newLastMove: { from: Square; to: Square } = {
      from: { row: move.fromRow, col: move.fromCol },
      to: { row: move.toRow, col: move.toCol },
    }

    const nextColor = oppositeColor(currentColor)
    let score: number

    if (movesSearched === 1) {
      score = -pvs(depth - 1 - reduction, -beta, -alpha, newEnPassantTarget, newLastMove, nextColor)
    } else {
      // Zero-window search at reduced depth
      score = -pvs(depth - 1 - reduction, -alpha - 1, -alpha, newEnPassantTarget, newLastMove, nextColor)
      // If zero-window spikes above alpha, and we reduced, re-search at full depth.
      // If reduction was 0, the zero-window result is already at full depth — no re-search needed.
      if (score > alpha && score < beta && reduction > 0) {
        score = -pvs(depth - 1, -beta, -alpha, newEnPassantTarget, newLastMove, nextColor)
      }
    }

    unmakeMove(board, changes)
    searchHash = oldHash
    searchCastlingRights = savedCastling
    restoreTracking(savedWKR, savedWKC, savedBKR, savedBKC, savedMat)

    if (checkTimeLimit()) return 0

    if (score > bestScore) {
      bestScore = score
      bestMove = move
    }

    if (score > alpha) {
      alpha = score
      flag = TT_EXACT
    }

    if (score >= beta) {
      flag = TT_BETA
      bestMove = move
      recordKillerMove(move, depth)
      recordHistory(move, currentColor, depth * depth)
      break
    }
  }

  // Only write to TT if search was not interrupted by timeout.
  // Aborted searches produce incomplete results that pollute the TT.
  if (!checkTimeLimit()) {
    storeTT(searchHash, depth, bestScore, flag, bestMove)
  }

  return bestScore
}

// ============================================================
// Iterative Deepening
// ============================================================
function iterativeDeepening(
  initialEpTarget: { row: number; col: number } | null,
  lastMove: { from: Square; to: Square } | null,
  maxDepth: number,
): { bestMove: AIDetailedMove; score: number } | null {
  const kRow = getKingRow(searchColor)
  const kCol = getKingCol(searchColor)
  const moves = generateLegalMoves(board, searchColor, initialEpTarget, false, lastMove, kRow, kCol)
  if (moves.length === 0) return null

  let bestMove: AIDetailedMove = moves[0]!
  let bestScore = -INF

  const numMoves = moves.length
  const rootScores: number[] = new Array(numMoves)
  for (let i = 0; i < numMoves; i++) {
    rootScores[i] = scoreMoveForOrdering(moves[i]!, null, board, 0)
  }
  const rootIndices = Array.from({ length: numMoves }, (_, i) => i)
  rootIndices.sort((a, b) => rootScores[b]! - rootScores[a]!)

  const opponentColorVal = oppositeColor(searchColor)

  for (let depth = 1; depth <= maxDepth; depth++) {
    let localBestMove: AIDetailedMove = moves[rootIndices[0]!]!
    let localBestScore = -INF
    let alpha = -INF
    const beta = INF

    let firstMove = true

    const oldEpFile = initialEpTarget ? initialEpTarget.col : null

    // Save tracking state for restoration
    const savedWKR = trackedWhiteKingRow
    const savedWKC = trackedWhiteKingCol
    const savedBKR = trackedBlackKingRow
    const savedBKC = trackedBlackKingCol
    const savedMat = trackedMaterial
    const savedCastling = searchCastlingRights

    for (let idx = 0; idx < rootIndices.length; idx++) {
      if (checkTimeLimit()) {
        return { bestMove, score: bestScore }
      }

      const move = moves[rootIndices[idx]!]!

      const idPiece = board[move.fromRow]![move.fromCol]!
      const idNextEpFile: number | null =
        idPiece.type === 'pawn' && Math.abs(move.toRow - move.fromRow) === 2
          ? move.fromCol
          : null

      const oldHash = searchHash
      const oldCastling = searchCastlingRights
      const hashResult = hashAfterMove(oldHash, move, oldEpFile, idNextEpFile, oldCastling)
      searchHash = hashResult.hash
      searchCastlingRights = hashResult.castlingRights

      const matDelta = computeMaterialDelta(move)
      const { changes, newEnPassantTarget } = makeMove(board, move)
      updateTrackingAfterMove(move, matDelta)

      const newLastMove: { from: Square; to: Square } = {
        from: { row: move.fromRow, col: move.fromCol },
        to: { row: move.toRow, col: move.toCol },
      }

      let score: number
      if (firstMove) {
        score = -pvs(depth - 1, -beta, -alpha, newEnPassantTarget, newLastMove, opponentColorVal)
        firstMove = false
      } else {
        score = -pvs(depth - 1, -alpha - 1, -alpha, newEnPassantTarget, newLastMove, opponentColorVal)
        if (score > alpha && score < beta) {
          score = -pvs(depth - 1, -beta, -alpha, newEnPassantTarget, newLastMove, opponentColorVal)
        }
      }

      unmakeMove(board, changes)
      searchHash = oldHash
      searchCastlingRights = savedCastling
      restoreTracking(savedWKR, savedWKC, savedBKR, savedBKC, savedMat)

      if (score > localBestScore) {
        localBestScore = score
        localBestMove = move
      }
      if (score > alpha) {
        alpha = score
      }
    }

    if (!searchStopped) {
      bestMove = localBestMove
      bestScore = localBestScore

      // Re-sort root moves for next iteration
      for (let i = 0; i < numMoves; i++) {
        rootScores[i] = scoreMoveForOrdering(moves[i]!, bestMove, board, depth + 1)
      }
      rootIndices.sort((a, b) => rootScores[b]! - rootScores[a]!)

      if (bestScore > MATE_SCORE - 100 || bestScore < -MATE_SCORE + 100) {
        return { bestMove, score: bestScore }
      }
    } else {
      return { bestMove, score: bestScore }
    }
  }

  return { bestMove, score: bestScore }
}

// ============================================================
// Find king row/col (utility - used once for setup)
// ============================================================
function findKing(b: Board, color: Color): { row: number; col: number } {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = b[row]![col]
      if (piece && piece.type === 'king' && piece.color === color) {
        return { row, col }
      }
    }
  }
  return { row: 0, col: 0 }
}

// ============================================================
// Public API: getBestAIMove
// ============================================================
export async function getBestAIMove(
  b: Board,
  color: Color,
  difficulty: AIDifficulty,
  style: AIStyle,
  lastMove: { from: Square; to: Square } | null,
): Promise<AIDetailedMove | null> {
  // Reset global search state
  searchColor = color
  searchStyle = style
  searchStartTime = performance.now()
  searchStopped = false
  searchNodes = 0
  ttHits = 0

  // Clear killer moves for new search
  for (let d = 0; d < MAX_DEPTH; d++) {
    killerMoves[d]![0] = null
    killerMoves[d]![1] = null
  }

  // Clear history table for new search (prevents cross-position pollution)
  for (let ci = 0; ci < 2; ci++) {
    for (let fr = 0; fr < 8; fr++) {
      for (let fc = 0; fc < 8; fc++) {
        for (let tr = 0; tr < 8; tr++) {
          const row = historyTable[ci]![fr]![fc]![tr]!
          for (let tc = 0; tc < 8; tc++) {
            row[tc] = 0
          }
        }
      }
    }
  }

  // Time allocation per difficulty (ms)
  const timeLimitMap: Record<AIDifficulty, number> = {
    1: 100,
    2: 200,
    3: 500,
    4: 1000,
    5: 2500,
  }
  searchTimeLimit = timeLimitMap[difficulty]

  const maxDepth = 12

  // Set up board reference
  board = b

  // Initialize incremental tracking (king positions and material)
  const wk = findKing(b, 'white')
  const bk = findKing(b, 'black')
  trackedWhiteKingRow = wk.row
  trackedWhiteKingCol = wk.col
  trackedBlackKingRow = bk.row
  trackedBlackKingCol = bk.col
  trackedMaterial = computeMaterialFromBoard(b)

  const epTarget = getEnPassantTarget(lastMove)
  const epFile = epTarget ? epTarget.col : null
  searchCastlingRights = getCastlingRights(board)
  searchHash = computeHash(board, color, epFile, searchCastlingRights)

  // Only one legal move? Return it immediately
  const kRow = getKingRow(color)
  const kCol = getKingCol(color)
  const moves = generateLegalMoves(board, color, epTarget, false, lastMove, kRow, kCol)
  if (moves.length === 0) return null
  if (moves.length === 1) return moves[0]!

  // Query opening book before running engine search
  try {
    // Preload books (no-op if already loaded)
    preloadOpeningBooks()
    const bookMove = await queryOpeningBook(board, color, lastMove, moves)
    if (bookMove) {
      return bookMove
    }
  } catch (e) {
    // Book query failed silently — fall through to engine search
    console.warn('[AI] Opening book query failed, falling back to engine:', e)
  }

  // Run iterative deepening
  const result = iterativeDeepening(epTarget, lastMove, maxDepth)

  if (!result) return moves[0]!

  // For unpredictable style or low difficulty, add controlled randomness
  if (style === 'unpredictable' || difficulty <= 2) {
    const topMoves: AIDetailedMove[] = [result.bestMove]

    for (const move of moves) {
      if (move === result.bestMove) continue
      const { changes } = makeMove(board, move)
      unmakeMove(board, changes)
      const r = Math.random()
      if (r < 0.3 / moves.length) {
        topMoves.push(move)
      }
    }

    if (topMoves.length > 1 && difficulty <= 1) {
      if (Math.random() < 0.3) {
        return moves[Math.floor(Math.random() * moves.length)]!
      }
    }

    const randomIndex = Math.floor(Math.random() * topMoves.length)
    return topMoves[randomIndex]!
  }

  return result.bestMove
}

// ============================================================
// Public API: getPromotionChoice
// ============================================================
export function getPromotionChoice(
  b: Board,
  toRow: number,
  toCol: number,
  color: Color,
): 'queen' | 'knight' | 'rook' | 'bishop' {
  const enemyColor: Color = color === 'white' ? 'black' : 'white'
  const kInfo = findKing(b, enemyColor)

  const knightOffsets: [number, number][] = [
    [2, 1], [2, -1], [-2, 1], [-2, -1],
    [1, 2], [1, -2], [-1, 2], [-1, -2],
  ]
  for (const [dRow, dCol] of knightOffsets) {
    if (toRow + dRow === kInfo.row && toCol + dCol === kInfo.col) {
      return 'knight'
    }
  }
  return 'queen'
}

// ============================================================
// Public API: getTotalLegalMoveCount
// ============================================================
export function getTotalLegalMoveCount(
  b: Board,
  color: Color,
  lastMove: { from: Square; to: Square } | null,
): number {
  const epTarget = getEnPassantTarget(lastMove)
  // For non-search context, find king via scan
  const kInfo = findKing(b, color)
  return generateLegalMoves(b, color, epTarget, false, lastMove, kInfo.row, kInfo.col).length
}

// ============================================================
// Public API: getMaterialAdvantage
// ============================================================
export function getMaterialAdvantage(b: Board, color: Color): number {
  let score = 0
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = b[row]![col]
      if (!piece) continue
      const value = PIECE_VALUES[piece.type] ?? 0
      score += piece.color === color ? value : -value
    }
  }
  return score
}