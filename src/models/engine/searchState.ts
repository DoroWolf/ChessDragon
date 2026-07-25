// ============================================================
// Search State Management（搜索状态管理）
// 管理搜索过程中的全局状态：棋盘引用、搜索参数、
// 王的增量追踪位置、总子力等
// ============================================================
import type { Board, Color } from '../chess'
import type { AIStyle, AIDetailedMove } from './types'
import { PIECE_VALUES } from './types'
import { computeHash } from './zobrist'
import type { CastlingRights } from './zobrist'
import { getEnPassantTarget } from '../chess'

// ============================================================
// 模块级搜索状态
// ============================================================
export let board: Board = []
export let searchColor: Color = 'white'
export let searchStyle: AIStyle = 'balanced'
export let searchHash: number = 0
export let searchCastlingRights: number = 0
export let searchStartTime: number = 0
export let searchTimeLimit: number = 0
export let searchStopped: boolean = false
export let searchNodes: number = 0
export let searchAITimeRemainingMs: number | null = null

// Setter 函数——因为 let 导出的变量在其他模块中不可直接赋值
export function setSearchHash(v: number): void { searchHash = v }
export function setSearchCastlingRights(v: number): void { searchCastlingRights = v }
export function setSearchNodes(v: number): void { searchNodes = v }
export function incSearchNodes(): void { searchNodes++ }
export function setSearchStopped(v: boolean): void { searchStopped = v }

// 增量追踪：王的位置和总子力
export let trackedWhiteKingRow = 7
export let trackedWhiteKingCol = 4
export let trackedBlackKingRow = 0
export let trackedBlackKingCol = 4
export let trackedMaterial = 0 // 总子力（不包括王）

// ============================================================
// 王位置访问器
// ============================================================
export function getKingRow(color: Color): number {
  return color === 'white' ? trackedWhiteKingRow : trackedBlackKingRow
}

export function getKingCol(color: Color): number {
  return color === 'white' ? trackedWhiteKingCol : trackedBlackKingCol
}

export function setKingPos(color: Color, row: number, col: number): void {
  if (color === 'white') {
    trackedWhiteKingRow = row
    trackedWhiteKingCol = col
  } else {
    trackedBlackKingRow = row
    trackedBlackKingCol = col
  }
}

// ============================================================
// 走法后增量追踪更新
// 必须在 makeMove 之后调用
// ============================================================
export function updateTrackingAfterMove(move: AIDetailedMove, materialDelta: number): void {
  const movedPiece = board[move.toRow]![move.toCol]!
  if (movedPiece && movedPiece.type === 'king') {
    setKingPos(movedPiece.color, move.toRow, move.toCol)
  }
  trackedMaterial += materialDelta
}

// ============================================================
// 恢复追踪到已保存状态（在 unmakeMove 之后调用）
// ============================================================
export function restoreTracking(
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
// 时间限制检查
// ============================================================
export function checkTimeLimit(): boolean {
  if (searchStopped) return true
  if (performance.now() - searchStartTime >= searchTimeLimit) {
    searchStopped = true
    return true
  }
  return false
}

// ============================================================
// 从棋盘计算走法前后子力差
// 在 makeMove 之前调用（使用走前棋盘状态）
// ============================================================
export function computeMaterialDelta(move: AIDetailedMove): number {
  const piece = board[move.fromRow]![move.fromCol]!
  let delta = 0

  // 被吃棋子：总子力减少
  if (move.special === 'enPassant') {
    // 吃过路兵吃掉位于 (fromRow, toCol) 的兵
    delta -= PIECE_VALUES['pawn']!
  } else {
    const victim = board[move.toRow]![move.toCol]
    if (victim) {
      delta -= PIECE_VALUES[victim.type]!
    }
  }

  // 升变：兵被移除，高价值棋子加入 → 净增加
  if (move.promotion && piece.type === 'pawn' && (move.toRow === 0 || move.toRow === 7)) {
    const oldVal = PIECE_VALUES['pawn']!
    const newVal = PIECE_VALUES[move.promotion] ?? PIECE_VALUES['queen']!
    delta += (newVal - oldVal)
  }

  return delta
}

// ============================================================
// 从棋盘快速计算总子力（仅供初始化使用）
// ============================================================
export function computeMaterialFromBoard(b: Board): number {
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
// 快速残局判定（O(1)，使用追踪的子力值）
// ============================================================
export function isEndgameFast(material: number): boolean {
  // 残局阈值：除王以外的总子力 <= 1400
  return material <= 1400
}

// ============================================================
// 查找王的位置（工具函数——仅初始化时使用一次）
// ============================================================
export function findKing(b: Board, color: Color): { row: number; col: number } {
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
// 王车易位权利检测
// ============================================================
export function getCastlingRights(b: Board): CastlingRights {
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

// ============================================================
// 初始化搜索状态
// ============================================================
export function initSearchState(b: Board, color: Color, style: AIStyle, difficulty: number, lastMove: { from: { row: number; col: number }; to: { row: number; col: number } } | null, aiTimeRemainingMs?: number): void {
  board = b
  searchColor = color
  searchStyle = style
  searchStartTime = performance.now()
  searchStopped = false
  searchNodes = 0

  const timeLimitMap: Record<number, number> = {
    1: 100,
    2: 200,
    3: 500,
    4: 1000,
    5: 2500,
  }
  const baseTimeLimit = timeLimitMap[difficulty] ?? 500

  searchAITimeRemainingMs = aiTimeRemainingMs ?? null
  if (searchAITimeRemainingMs !== null) {
    if (searchAITimeRemainingMs < 10_000) {
      searchTimeLimit = Math.min(baseTimeLimit, 50)
    } else if (searchAITimeRemainingMs < 30_000) {
      searchTimeLimit = Math.max(30, baseTimeLimit * 0.25)
    } else if (searchAITimeRemainingMs < 60_000) {
      searchTimeLimit = Math.max(40, baseTimeLimit * 0.5)
    } else {
      searchTimeLimit = baseTimeLimit
    }
  } else {
    searchTimeLimit = baseTimeLimit
  }

  // 初始化增量追踪（王位置和子力）
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
}
