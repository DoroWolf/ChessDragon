// ============================================================
// Quiescence Search（静态搜索 / 静止搜索）
// 在到达搜索深度后继续搜索吃子走法，避免"地平线效应"
// 即：在没有吃子的平静局面才停止搜索，防止漏算重要吃子
// 核心概念：
//   - Stand Pat：如果不被将军，可以选择停止搜索（不接受吃子）
//   - Delta Pruning：跳过即使吃掉对方棋子也无法改善评分的走法
// ============================================================
import type { Color, Square } from '../chess'
import { PIECE_VALUES } from './types'
import { INF, MATE_SCORE } from './types'
import { oppositeColor } from './zobrist'
import { hashAfterMove } from './zobrist'
import { makeMove, unmakeMove } from './boardChange'
import { generateLegalMoves, isSquareAttackedFast } from './moveGeneration'
import { evaluateBoardInternal } from './evaluation'
import {
  board,
  searchHash,
  searchCastlingRights,
  checkTimeLimit,
  getKingRow,
  getKingCol,
  updateTrackingAfterMove,
  restoreTracking,
  trackedWhiteKingRow,
  trackedWhiteKingCol,
  trackedBlackKingRow,
  trackedBlackKingCol,
  trackedMaterial,
  computeMaterialDelta,
  setSearchHash,
  setSearchCastlingRights,
  incSearchNodes,
} from './searchState'

// ============================================================
// Quiescence Search
// ============================================================
export function quiescenceSearch(
  alpha: number,
  beta: number,
  enPassantTarget: { row: number; col: number } | null,
  lastMove: { from: Square; to: Square } | null,
  currentColor: Color,
): number {
  if (checkTimeLimit()) return 0

  incSearchNodes()

  // 保存追踪状态
  const savedWKR = trackedWhiteKingRow
  const savedWKC = trackedWhiteKingCol
  const savedBKR = trackedBlackKingRow
  const savedBKC = trackedBlackKingCol
  const savedMat = trackedMaterial

  // --- Stand Pat 检查 ---
  const kRow = getKingRow(currentColor)
  const kCol = getKingCol(currentColor)
  const inCheck = isSquareAttackedFast(board, kRow, kCol, oppositeColor(currentColor))

  let standPat = -INF
  if (!inCheck) {
    standPat = evaluateBoardInternal(board, currentColor, enPassantTarget !== null)
    if (standPat >= beta) return beta
    if (standPat > alpha) alpha = standPat
  }

  // 将军时必须生成全部合法走法，不走将军时仅生成吃子走法
  const captures = generateLegalMoves(board, currentColor, enPassantTarget, !inCheck, lastMove, kRow, kCol)
  if (captures.length === 0) {
    // 无合法走法：将军 -> 将杀，否则 -> 逼和
    if (inCheck) return -MATE_SCORE
    return alpha
  }

  // 对吃子走法进行评分并排序
  const scores: number[] = new Array(captures.length)
  for (let i = 0; i < captures.length; i++) {
    const m = captures[i]!
    const victim = board[m.toRow]![m.toCol]
    const attacker = board[m.fromRow]![m.fromCol]
    const victimVal = victim ? PIECE_VALUES[victim.type] ?? 0 : 100
    const attackerVal = PIECE_VALUES[attacker?.type ?? 'pawn'] ?? 0
    scores[i] = victimVal * 10 - attackerVal + (m.promotion ? 900 : 0)
  }

  // 按分值降序排列
  const indices = Array.from({ length: captures.length }, (_, i) => i)
  indices.sort((a, b) => scores[b]! - scores[a]!)

  const oldEpFile = enPassantTarget ? enPassantTarget.col : null

  for (let idx = 0; idx < indices.length; idx++) {
    const move = captures[indices[idx]!]!

    // Delta Pruning（将军时必须尝试所有逃避走法）
    if (!inCheck) {
      const victim = move.special === 'enPassant'
        ? board[move.fromRow]![move.toCol]
        : board[move.toRow]![move.toCol]
      const victimVal = victim ? PIECE_VALUES[victim.type] ?? 0 : 100
      const promotionBonus = move.promotion ? 800 : 0
      if (standPat + victimVal + promotionBonus + 200 < alpha) continue
    }

    const qPiece = board[move.fromRow]![move.fromCol]!
    const nextEpFile: number | null =
      qPiece.type === 'pawn' && Math.abs(move.toRow - move.fromRow) === 2
        ? move.fromCol
        : null

    const oldHash = searchHash
    const oldCastling = searchCastlingRights
    const hashResult = hashAfterMove(board, oldHash, move, oldEpFile, nextEpFile, oldCastling)
    setSearchHash(hashResult.hash)
    setSearchCastlingRights(hashResult.castlingRights)

    const matDelta = computeMaterialDelta(move)
    const { changes, newEnPassantTarget } = makeMove(board, move)
    updateTrackingAfterMove(move, matDelta)

    const score = -quiescenceSearch(-beta, -alpha, newEnPassantTarget, {
      from: { row: move.fromRow, col: move.fromCol },
      to: { row: move.toRow, col: move.toCol },
    }, oppositeColor(currentColor))

    unmakeMove(board, changes)
    setSearchHash(oldHash)
    setSearchCastlingRights(oldCastling)
    restoreTracking(savedWKR, savedWKC, savedBKR, savedBKC, savedMat)

    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }

  return alpha
}