// Zobrist Hashing（Zobrist 哈希）
// 用于快速生成局面哈希值，配合置换表实现局面复用
// 通过增量更新哈希值（而非每次从头计算），大幅提升搜索效率
import { PIECE_TYPE_INDEX, COLOR_INDEX } from './types'
import type { Piece, Color } from '../chess'
import type { Board } from '../chess'
import type { AIDetailedMove } from './types'

function xorshift32(state: number): () => number {
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state >>> 0
  }
}

const rng = xorshift32(0xdeadbeef)

export const zobristPiece: number[][][] = Array.from({ length: 6 }, () =>
  Array.from({ length: 2 }, () => new Array(64).fill(0)),
)
export const zobristEnPassant: number[] = new Array(8).fill(0)
export const zobristCastling: number[] = new Array(4).fill(0)
export let zobristBlackToMove = 0

;(function initZobrist() {
  for (let pt = 0; pt < 6; pt++) {
    for (let c = 0; c < 2; c++) {
      for (let sq = 0; sq < 64; sq++) {
        zobristPiece[pt]![c]![sq] = rng()
      }
    }
  }
  for (let f = 0; f < 8; f++) {
    zobristEnPassant[f] = rng()
  }
  for (let i = 0; i < 4; i++) {
    zobristCastling[i] = rng()
  }
  zobristBlackToMove = rng()
})()

export function oppositeColor(color: Color): Color {
  return color === 'white' ? 'black' : 'white'
}

export type CastlingRights = number

export function castlingHash(rights: CastlingRights): number {
  let h = 0
  if (rights & 1) h ^= zobristCastling[0]!
  if (rights & 2) h ^= zobristCastling[1]!
  if (rights & 4) h ^= zobristCastling[2]!
  if (rights & 8) h ^= zobristCastling[3]!
  return h
}

export function computeHash(
  b: Board,
  currentTurn: Color,
  enPassantFile: number | null,
  castling: CastlingRights,
): number {
  let h = 0
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r]![c]
      if (p) {
        const ptIdx = PIECE_TYPE_INDEX[p.type]!
        const cIdx = COLOR_INDEX[p.color]!
        h ^= zobristPiece[ptIdx]![cIdx]![r * 8 + c]!
      }
    }
  }
  if (currentTurn === 'black') {
    h ^= zobristBlackToMove
  }
  if (enPassantFile !== null && enPassantFile >= 0 && enPassantFile < 8) {
    h ^= zobristEnPassant[enPassantFile]!
  }
  h ^= castlingHash(castling)
  return h >>> 0
}

export function updateHashPiece(
  hash: number,
  piece: Piece,
  fromSq: number,
  toSq: number,
): number {
  const ptIdx = PIECE_TYPE_INDEX[piece.type]!
  const cIdx = COLOR_INDEX[piece.color]!
  let h = hash
  h ^= zobristPiece[ptIdx]![cIdx]![fromSq]!
  h ^= zobristPiece[ptIdx]![cIdx]![toSq]!
  return h
}

export function removeCastlingRights(rights: number, color: Color, which: 'both' | 'kingside' | 'queenside'): number {
  let r = rights
  if (color === 'white') {
    if (which === 'both' || which === 'kingside') r &= ~1
    if (which === 'both' || which === 'queenside') r &= ~2
  } else {
    if (which === 'both' || which === 'kingside') r &= ~4
    if (which === 'both' || which === 'queenside') r &= ~8
  }
  return r
}

// 增量更新走法后的 Zobrist 哈希值
// 返回新的哈希值和更新后的王车易位权利
export function hashAfterMove(
  board: Board,
  oldHash: number,
  move: AIDetailedMove,
  oldEpFile: number | null,
  newEpFile: number | null,
  oldCastlingRights: number,
): { hash: number; castlingRights: number } {
  let h = oldHash

  const piece = board[move.fromRow]![move.fromCol]!
  const pieceColor = piece.color
  const fromSq = move.fromRow * 8 + move.fromCol
  const toSq = move.toRow * 8 + move.toCol

  if (move.special === 'castle' && move.rookFrom && move.rookTo) {
    h = updateHashPiece(h, piece, fromSq, toSq)
    const rook = board[move.rookFrom.row]![move.rookFrom.col]!
    const rookFromSq = move.rookFrom.row * 8 + move.rookFrom.col
    const rookToSq = move.rookTo.row * 8 + move.rookTo.col
    h = updateHashPiece(h, rook, rookFromSq, rookToSq)
  } else if (move.special === 'enPassant') {
    const ptIdx = PIECE_TYPE_INDEX['pawn']!
    const cIdx = COLOR_INDEX[pieceColor]!
    h ^= zobristPiece[ptIdx]![cIdx]![fromSq]!

    const promotedType = move.promotion && move.promotion !== 'queen'
      ? move.promotion
      : (move.toRow === 0 || move.toRow === 7) ? 'queen' : piece.type
    const destPtIdx = PIECE_TYPE_INDEX[promotedType]!
    h ^= zobristPiece[destPtIdx]![cIdx]![toSq]!

    const capturedSq = move.fromRow * 8 + move.toCol
    const capCIdx = COLOR_INDEX[oppositeColor(pieceColor)]!
    h ^= zobristPiece[PIECE_TYPE_INDEX['pawn']!]![capCIdx]![capturedSq]!
  } else {
    const isPromotion = move.promotion && (move.toRow === 0 || move.toRow === 7)
    const destType = isPromotion ? move.promotion! : piece.type

    const srcPtIdx = PIECE_TYPE_INDEX[piece.type]!
    const cIdx = COLOR_INDEX[pieceColor]!
    h ^= zobristPiece[srcPtIdx]![cIdx]![fromSq]!

    const destPtIdx = PIECE_TYPE_INDEX[destType]!
    h ^= zobristPiece[destPtIdx]![cIdx]![toSq]!

    const captured = board[move.toRow]![move.toCol]
    if (captured) {
      const capPtIdx = PIECE_TYPE_INDEX[captured.type]!
      const capCIdx = COLOR_INDEX[captured.color]!
      h ^= zobristPiece[capPtIdx]![capCIdx]![toSq]!
    }
  }

  if (oldEpFile !== null) h ^= zobristEnPassant[oldEpFile]!
  if (newEpFile !== null) h ^= zobristEnPassant[newEpFile]!

  // 更新王车易位权利
  let newRights = oldCastlingRights

  // 王移动 → 失去该方的所有王车易位权利
  if (piece.type === 'king') {
    newRights = removeCastlingRights(newRights, pieceColor, 'both')
  }
  // 从未移动过的原位车移动 → 失去该侧易位权利
  if (piece.type === 'rook' && !piece.hasMoved) {
    if (pieceColor === 'white' && fromSq === 63) newRights = removeCastlingRights(newRights, 'white', 'kingside')
    if (pieceColor === 'white' && fromSq === 56) newRights = removeCastlingRights(newRights, 'white', 'queenside')
    if (pieceColor === 'black' && fromSq === 7) newRights = removeCastlingRights(newRights, 'black', 'kingside')
    if (pieceColor === 'black' && fromSq === 0) newRights = removeCastlingRights(newRights, 'black', 'queenside')
  }
  // 吃掉了原位未移动的车 → 失去该侧易位权利
  const capturedPiece = move.special === 'enPassant' ? null : board[move.toRow]![move.toCol]
  if (capturedPiece && capturedPiece.type === 'rook' && !capturedPiece.hasMoved) {
    const capSq = move.toRow * 8 + move.toCol
    if (capturedPiece.color === 'white' && capSq === 63) newRights = removeCastlingRights(newRights, 'white', 'kingside')
    if (capturedPiece.color === 'white' && capSq === 56) newRights = removeCastlingRights(newRights, 'white', 'queenside')
    if (capturedPiece.color === 'black' && capSq === 7) newRights = removeCastlingRights(newRights, 'black', 'kingside')
    if (capturedPiece.color === 'black' && capSq === 0) newRights = removeCastlingRights(newRights, 'black', 'queenside')
  }

  // XOR 更新王车易位权利哈希
  h ^= castlingHash(oldCastlingRights)
  h ^= castlingHash(newRights)

  h ^= zobristBlackToMove

  return { hash: h >>> 0, castlingRights: newRights }
}