import type { Board, Color, Square } from '../chess'
import { getEnPassantTarget } from '../chess'
import type { AIDifficulty, AIStyle, AIDetailedMove } from './types'
import { PIECE_VALUES, MAX_DEPTH } from './types'
import { makeMove, unmakeMove } from './boardChange'
import { generateLegalMoves, } from './moveGeneration'
import { killerMoves, historyTable } from './killerHistory'
import { iterativeDeepening } from './iterativeDeepening'
import { findKing, initSearchState, searchHash, searchCastlingRights } from './searchState'
import {
  board,
  getKingRow,
  getKingCol,
} from './searchState'
import { probeBookForLevel, pickBookMove } from './openingBook'
import { getSyzygyStore } from './syzygy/store'

export interface SearchPositionOptions {
  board: Board
  color: Color
  difficulty: AIDifficulty
  style: AIStyle
  lastMove: { from: Square; to: Square } | null
  aiTimeRemainingMs?: number
  positionHistory?: readonly string[]
  maxDepth?: number
  timeLimitMs?: number
  useOpeningBook?: boolean
  useRandomness?: boolean
}

const DEFAULT_MAX_DEPTH = 12

export async function searchPosition(
  options: SearchPositionOptions,
): Promise<AIDetailedMove | null> {
  const {
    board: b,
    color,
    difficulty,
    style,
    lastMove,
    aiTimeRemainingMs,
    positionHistory = [],
    maxDepth = DEFAULT_MAX_DEPTH,
    timeLimitMs,
    useOpeningBook = true,
    useRandomness = true,
  } = options

  initSearchState(b, color, style, difficulty, lastMove, aiTimeRemainingMs, positionHistory, timeLimitMs)

  for (let d = 0; d < MAX_DEPTH; d++) {
    killerMoves[d]![0] = null
    killerMoves[d]![1] = null
  }

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

  const epTarget = getEnPassantTarget(lastMove)

  const kRow = getKingRow(color)
  const kCol = getKingCol(color)
  const moves = generateLegalMoves(board, color, epTarget, false, lastMove, kRow, kCol)
  if (moves.length === 0) return null
  if (moves.length === 1) return moves[0]!

  const syzygy = getSyzygyStore()
  syzygy.setLevel(difficulty)
  let tablebaseMoveHint: AIDetailedMove | null = null
  if (syzygy.active && searchCastlingRights === 0) {
    try {
      await syzygy.prepare(board, color, epTarget !== null)
      tablebaseMoveHint = syzygy.findMoveHint(board, color, moves, epTarget !== null)
    } catch (err) {
      console.warn('syzygy probe failed:', err)
    }
  }

  if (useOpeningBook) {
    const bookMoves = probeBookForLevel(searchHash, difficulty)
    if (bookMoves && bookMoves.length > 0) {
      const bookMove = pickBookMove(bookMoves)
      if (bookMove) {
        const isValidBookMove = moves.some(
          (m) =>
            m.fromRow === bookMove.fromRow &&
            m.fromCol === bookMove.fromCol &&
            m.toRow === bookMove.toRow &&
            m.toCol === bookMove.toCol &&
            m.special === bookMove.special,
        )
        if (isValidBookMove) {
          return bookMove
        }
      }
    }
  }

  const result = iterativeDeepening(epTarget, lastMove, maxDepth, tablebaseMoveHint)

  if (!result) return moves[0]!

  if (useRandomness && (style === 'unpredictable' || difficulty <= 2)) {
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

export async function getBestAIMove(
  b: Board,
  color: Color,
  difficulty: AIDifficulty,
  style: AIStyle,
  lastMove: { from: Square; to: Square } | null,
  aiTimeRemainingMs?: number,
  positionHistory: readonly string[] = [],
): Promise<AIDetailedMove | null> {
  return searchPosition({
    board: b,
    color,
    difficulty,
    style,
    lastMove,
    aiTimeRemainingMs,
    positionHistory,
  })
}

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

export function getTotalLegalMoveCount(
  b: Board,
  color: Color,
  lastMove: { from: Square; to: Square } | null,
): number {
  const epTarget = getEnPassantTarget(lastMove)
  const kInfo = findKing(b, color)
  return generateLegalMoves(b, color, epTarget, false, lastMove, kInfo.row, kInfo.col).length
}

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