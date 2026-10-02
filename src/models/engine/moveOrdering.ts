// Move Ordering（走法排序）
// 对走法进行评分排序，使好的走法优先搜索
// 排序优先级：
//   1. 置换表中的最佳走法 (TT Move)
//   2. 吃子走法 (MVV-LVA: Most Valuable Victim - Least Valuable Attacker)
//   3. 升变
//   4. 杀手走法 (Killer Moves)
//   5. 历史表启发 (History Heuristic)
import type { Board } from '../chess'
import type { AIDetailedMove } from './types'
import { PIECE_VALUES, COLOR_INDEX } from './types'
import { killerMoves, historyTable } from './killerHistory'
import { movesMatch } from './moveGeneration'

export const MOVE_SCORE_TT = 10000000
export const MOVE_SCORE_CAPTURE_BASE = 1000000
export const MOVE_SCORE_KILLER_BASE = 900000
export const MOVE_SCORE_KILLER2 = 800000

export function scoreMoveForOrdering(
  move: AIDetailedMove,
  ttMove: AIDetailedMove | null,
  b: Board,
  depth: number,
): number {
  // 1. 置换表最佳走法优先
  if (movesMatch(ttMove, move)) {
    return MOVE_SCORE_TT
  }

  // 2. 吃子走法 - MVV-LVA
  const victim = move.special === 'enPassant'
    ? b[move.fromRow]![move.toCol]
    : b[move.toRow]![move.toCol]
  if (victim) {
    const attacker = b[move.fromRow]![move.fromCol]
    const victimVal = PIECE_VALUES[victim.type] ?? 0
    const attackerVal = PIECE_VALUES[attacker?.type ?? 'pawn'] ?? 0
    return MOVE_SCORE_CAPTURE_BASE + victimVal * 10 - attackerVal
  }

  // 3. 升变
  if (move.promotion) {
    return MOVE_SCORE_CAPTURE_BASE + 900
  }

  // 4. 杀手走法
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

  // 5. 历史表启发
  const piece = b[move.fromRow]![move.fromCol]
  if (piece && !move.special) {
    const ci = COLOR_INDEX[piece.color]!
    return historyTable[ci]![move.fromRow]![move.fromCol]![move.toRow]![move.toCol] ?? 0
  }

  return 0
}