// Killer Moves & History Table（杀手走法 & 历史表）
// Killer Moves：记录在某深度引起 Beta 截断的走法，优先搜索
// History Table：记录走法在历史搜索中的表现好坏，用于走法排序
import { MAX_DEPTH, COLOR_INDEX } from './types'
import type { AIDetailedMove } from './types'
import type { Board, Color } from '../chess'

export const killerMoves: (AIDetailedMove | null)[][] = Array.from({ length: MAX_DEPTH }, () => [
  null,
  null,
])

export function recordKillerMove(
  board: Board,
  move: AIDetailedMove,
  depth: number,
): void {
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

export const historyTable: number[][][][][] = Array.from({ length: 2 }, () =>
  Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => new Array(8).fill(0)),
    ),
  ),
)

export function recordHistory(
  board: Board,
  move: AIDetailedMove,
  color: Color,
  depthBonus: number,
): void {
  if (move.special) return
  const piece = board[move.fromRow]?.[move.fromCol]
  if (!piece) return
  const ci = COLOR_INDEX[piece.color]!
  const histRow = historyTable[ci]![move.fromRow]![move.fromCol]![move.toRow]!
  histRow[move.toCol]! += depthBonus
}