// Move Generation（走法生成）
// 为指定颜色生成所有合法走法
// 包含快速攻击检测（用于合法性检查）
import type { Board, Color, Square, Move, Piece, PieceType, MoveOptions } from '../chess'
import { getPieceMoves, getEnPassantTarget } from '../chess'
import type { AIDetailedMove } from './types'
import { makeMove, unmakeMove } from './boardChange'
import { oppositeColor } from './zobrist'
import { board, getKingRow, getKingCol } from './searchState'

export function packMove(move: AIDetailedMove): number {
  return (move.fromRow << 9) | (move.fromCol << 6) | (move.toRow << 3) | move.toCol
}

export function movesMatch(a: AIDetailedMove | null, b: AIDetailedMove): boolean {
  if (!a) return false
  return a.fromRow === b.fromRow && a.fromCol === b.fromCol &&
    a.toRow === b.toRow && a.toCol === b.toCol &&
    a.special === b.special
}

export function isSquareAttackedFast(
  b: Board,
  row: number,
  col: number,
  attackerColor: Color,
): boolean {
  // 兵的攻击
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

  // 马的攻击
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

  // 滑动棋子（象、车、后）
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

  // 王的攻击
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

export function isKingInCheckFast(
  b: Board,
  color: Color,
  movedPiece: Piece,
  move: AIDetailedMove,
): boolean {
  const enemyColor: Color = color === 'white' ? 'black' : 'white'
  const kingRow = getKingRow(color)
  const kingCol = getKingCol(color)

  // 确定走法后王的位置
  let kRow = kingRow
  let kCol = kingCol
  if (movedPiece.type === 'king') {
    kRow = move.toRow
    kCol = move.toCol
  }

  return isSquareAttackedFast(b, kRow, kCol, enemyColor)
}

export function generateLegalMoves(
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

        // 快速合法性检查（使用追踪的王位置）
        const { changes, newEnPassantTarget: _epT } = makeMove(b, detailedMove)
        const legal = !isKingInCheckFast(b, color, piece, detailedMove)
        unmakeMove(b, changes)

        if (legal) {
          moves.push(detailedMove)
        }
      }
    }
  }

  return moves
}