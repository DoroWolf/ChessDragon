// ============================================================
// Search API（搜索公共接口）
// 提供 AI 引擎的外部调用接口：
//   - getBestAIMove：获取最佳走法
//   - getPromotionChoice：选择升变棋子类型
//   - getTotalLegalMoveCount：计算合法走法总数
//   - getMaterialAdvantage：计算子力优势
// ============================================================
import type { Board, Color, Square } from '../chess'
import { getEnPassantTarget } from '../chess'
import type { AIDifficulty, AIStyle, AIDetailedMove } from './types'
import { PIECE_VALUES, MAX_DEPTH } from './types'
import { makeMove, unmakeMove } from './boardChange'
import { generateLegalMoves, } from './moveGeneration'
import { killerMoves, historyTable } from './killerHistory'
import { iterativeDeepening } from './iterativeDeepening'
import { findKing, initSearchState } from './searchState'
import {
  board,
  getKingRow,
  getKingCol,
} from './searchState'

// ============================================================
// getBestAIMove
// ============================================================
export async function getBestAIMove(
  b: Board,
  color: Color,
  difficulty: AIDifficulty,
  style: AIStyle,
  lastMove: { from: Square; to: Square } | null,
  aiTimeRemainingMs?: number,
): Promise<AIDetailedMove | null> {
  // 初始化搜索状态（传递 AI 方棋钟剩余时间，低时间时自动缩减搜索深度）
  initSearchState(b, color, style, difficulty, lastMove, aiTimeRemainingMs)

  // 清空杀手走法
  for (let d = 0; d < MAX_DEPTH; d++) {
    killerMoves[d]![0] = null
    killerMoves[d]![1] = null
  }

  // 清空历史表
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

  const maxDepth = 12

  const epTarget = getEnPassantTarget(lastMove)

  // 只有一个合法走法？直接返回
  const kRow = getKingRow(color)
  const kCol = getKingCol(color)
  const moves = generateLegalMoves(board, color, epTarget, false, lastMove, kRow, kCol)
  if (moves.length === 0) return null
  if (moves.length === 1) return moves[0]!

  // 迭代加深搜索
  const result = iterativeDeepening(epTarget, lastMove, maxDepth)

  if (!result) return moves[0]!

  // 不可预测风格或低难度时加入可控随机性
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
// getPromotionChoice
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
// getTotalLegalMoveCount
// ============================================================
export function getTotalLegalMoveCount(
  b: Board,
  color: Color,
  lastMove: { from: Square; to: Square } | null,
): number {
  const epTarget = getEnPassantTarget(lastMove)
  const kInfo = findKing(b, color)
  return generateLegalMoves(b, color, epTarget, false, lastMove, kInfo.row, kInfo.col).length
}

// ============================================================
// getMaterialAdvantage
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