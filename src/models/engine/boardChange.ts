// Board Change Tracking（棋盘变更追踪）—— Make/Unmake 机制
// 执行走法时记录所有变更，撤销时按逆序还原
// 支持王车易位、吃过路兵、兵的升变等特殊走法
import type { Board, Piece, Square } from '../chess'
import type { BoardChange, AIDetailedMove } from './types'

export function makeChange(
  b: Board,
  row: number,
  col: number,
  newPiece: Piece | null,
  changes: BoardChange[],
): void {
  changes.push({ row, col, oldPiece: b[row]![col]! })
  b[row]![col] = newPiece
}

// 执行走法
// 返回：变更列表、新的过路兵目标、是否升变
export function makeMove(
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
    const rook = b[move.rookFrom.row]![move.rookFrom.col]!
    makeChange(b, move.fromRow, move.fromCol, null, changes)
    makeChange(b, move.rookFrom.row, move.rookFrom.col, null, changes)
    makeChange(b, move.toRow, move.toCol, { ...piece, hasMoved: true }, changes)
    makeChange(b, move.rookTo.row, move.rookTo.col, { ...rook, hasMoved: true }, changes)
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

export function unmakeMove(b: Board, changes: BoardChange[]): void {
  for (let i = changes.length - 1; i >= 0; i--) {
    const ch = changes[i]!
    b[ch.row]![ch.col] = ch.oldPiece
  }
}