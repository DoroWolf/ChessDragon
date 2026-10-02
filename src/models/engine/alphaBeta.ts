// Alpha-Beta（Alpha-Beta 剪枝搜索）
// Minimax 搜索的剪枝优化——维护 alpha（下界）和 beta（上界），
// 当搜索窗口坍缩时跳过不可能被选择的走法分支
import { getPositionKey, type Color, type Square } from '../chess'
import { INF, MATE_SCORE, MAX_DEPTH, TT_ALPHA, TT_EXACT, TT_BETA } from './types'
import type { AIDetailedMove } from './types'
import { oppositeColor } from './zobrist'
import { hashAfterMove } from './zobrist'
import { makeMove, unmakeMove } from './boardChange'
import { generateLegalMoves, isSquareAttackedFast } from './moveGeneration'
import { scoreMoveForOrdering } from './moveOrdering'
import { recordKillerMove, recordHistory } from './killerHistory'
import { probeTT, storeTT } from './transpositionTable'
import { quiescenceSearch } from './quiescenceSearch'
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
  getRepetitionCount,
  addRepetition,
  removeRepetition,
} from './searchState'

export function alphaBeta(
  depth: number,
  alpha: number,
  beta: number,
  enPassantTarget: { row: number; col: number } | null,
  lastMove: { from: Square; to: Square } | null,
  currentColor: Color,
  positionKey?: string,
): number {
  if (checkTimeLimit()) return 0

  incSearchNodes()

  const currentPositionKey = positionKey ?? getPositionKey(board, currentColor, lastMove)
  if (getRepetitionCount(currentPositionKey) >= 3) return 0

  // 保存追踪状态
  const savedWKR = trackedWhiteKingRow
  const savedWKC = trackedWhiteKingCol
  const savedBKR = trackedBlackKingRow
  const savedBKC = trackedBlackKingCol
  const savedMat = trackedMaterial
  const savedCastling = searchCastlingRights

  // 置换表探测
  const ttEntry = probeTT(searchHash, depth, alpha, beta)
  if (ttEntry.hit) {
    return ttEntry.score
  }

  const kRow = getKingRow(currentColor)
  const kCol = getKingCol(currentColor)
  const moves = generateLegalMoves(board, currentColor, enPassantTarget, false, lastMove, kRow, kCol)

  if (moves.length === 0) {
    if (isSquareAttackedFast(board, kRow, kCol, oppositeColor(currentColor))) {
      // 被杀：距根节点越近分值越负
      return -MATE_SCORE + (MAX_DEPTH - depth)
    }
    return 0
  }

  // 深度为 0 时进入静态搜索
  if (depth <= 0) {
    return quiescenceSearch(alpha, beta, enPassantTarget, lastMove, currentColor)
  }

  const ttBestMove = ttEntry.bestMove
  const numMoves = moves.length

  const scores: number[] = new Array(numMoves)
  for (let i = 0; i < numMoves; i++) {
    scores[i] = scoreMoveForOrdering(moves[i]!, ttBestMove, board, depth)
  }

  const indices = Array.from({ length: numMoves }, (_, i) => i)
  indices.sort((a, b) => scores[b]! - scores[a]!)

  let bestScore = -INF
  let bestMove: AIDetailedMove | null = null
  let flag = TT_ALPHA

  const oldEpFile = enPassantTarget ? enPassantTarget.col : null

  for (let idx = 0; idx < indices.length; idx++) {
    const move = moves[indices[idx]!]!

    const piece = board[move.fromRow]![move.fromCol]!
    const nextEpFile: number | null =
      piece.type === 'pawn' && Math.abs(move.toRow - move.fromRow) === 2
        ? move.fromCol
        : null

    const oldHash = searchHash
    const hashResult = hashAfterMove(board, oldHash, move, oldEpFile, nextEpFile, savedCastling)
    setSearchHash(hashResult.hash)
    setSearchCastlingRights(hashResult.castlingRights)

    const matDelta = computeMaterialDelta(move)
    const { changes, newEnPassantTarget } = makeMove(board, move)
    updateTrackingAfterMove(move, matDelta)

    const newLastMove: { from: Square; to: Square } = {
      from: { row: move.fromRow, col: move.fromCol },
      to: { row: move.toRow, col: move.toCol },
    }
    const childPositionKey = getPositionKey(board, oppositeColor(currentColor), newLastMove)
    addRepetition(childPositionKey)

    const score = -alphaBeta(
      depth - 1,
      -beta,
      -alpha,
      newEnPassantTarget,
      newLastMove,
      oppositeColor(currentColor),
      childPositionKey,
    )
    removeRepetition(childPositionKey)

    unmakeMove(board, changes)
    setSearchHash(oldHash)
    setSearchCastlingRights(savedCastling)
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
      recordKillerMove(board, move, depth)
      recordHistory(board, move, currentColor, depth * depth)
      break
    }
  }

  // 仅在搜索未被超时中断时写入置换表
  if (!checkTimeLimit()) {
    storeTT(searchHash, depth, bestScore, flag, bestMove)
  }

  return bestScore
}