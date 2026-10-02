// Iterative Deepening（迭代加深搜索）
// 从深度 1 开始逐步增加搜索深度，直到达到最大深度或超时
// 核心优势：
//   1. 时间控制：任何时候超时都能返回当前最佳走法
//   2. 走法排序优化：浅层搜索结果为深层搜索提供更好的走法排序
//   3. 配合置换表，深层搜索可复用浅层搜索结果
import { getPositionKey, type Color, type Square } from '../chess'
import { INF, MATE_SCORE } from './types'
import type { AIDetailedMove } from './types'
import { oppositeColor } from './zobrist'
import { hashAfterMove } from './zobrist'
import { makeMove, unmakeMove } from './boardChange'
import { generateLegalMoves } from './moveGeneration'
import { scoreMoveForOrdering } from './moveOrdering'
import { alphaBeta } from './alphaBeta'
import {
  board,
  searchColor,
  searchHash,
  searchStopped,
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
  addRepetition,
  removeRepetition,
} from './searchState'

export function iterativeDeepening(
  initialEpTarget: { row: number; col: number } | null,
  lastMove: { from: Square; to: Square } | null,
  maxDepth: number,
  moveHint: AIDetailedMove | null = null,
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
  if (moveHint) {
    const hintIndex = moves.findIndex(
      (move) =>
        move.fromRow === moveHint.fromRow &&
        move.fromCol === moveHint.fromCol &&
        move.toRow === moveHint.toRow &&
        move.toCol === moveHint.toCol &&
        move.special === moveHint.special &&
        move.promotion === moveHint.promotion,
    )
    if (hintIndex >= 0) {
      rootIndices.splice(rootIndices.indexOf(hintIndex), 1)
      rootIndices.unshift(hintIndex)
    }
  }

  const opponentColorVal = oppositeColor(searchColor)

  for (let depth = 1; depth <= maxDepth; depth++) {
    let localBestMove: AIDetailedMove = moves[rootIndices[0]!]!
    let localBestScore = -INF
    let alpha = -INF

    const oldEpFile = initialEpTarget ? initialEpTarget.col : null

    // 保存追踪状态用于恢复
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
      const hashResult = hashAfterMove(board, oldHash, move, oldEpFile, idNextEpFile, savedCastling)
      setSearchHash(hashResult.hash)
      setSearchCastlingRights(hashResult.castlingRights)

      const matDelta = computeMaterialDelta(move)
      const { changes, newEnPassantTarget } = makeMove(board, move)
      updateTrackingAfterMove(move, matDelta)

      const newLastMove: { from: Square; to: Square } = {
        from: { row: move.fromRow, col: move.fromCol },
        to: { row: move.toRow, col: move.toCol },
      }
      const childPositionKey = getPositionKey(board, opponentColorVal, newLastMove)
      addRepetition(childPositionKey)

      const score = -alphaBeta(
        depth - 1,
        -INF,
        -alpha,
        newEnPassantTarget,
        newLastMove,
        opponentColorVal,
        childPositionKey,
      )
      removeRepetition(childPositionKey)

      unmakeMove(board, changes)
      setSearchHash(oldHash)
      setSearchCastlingRights(savedCastling)
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

      // 为下一次迭代重新排序根节点走法
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