/**
 * 开局库预计算脚本
 *
 * 从 src/data/openingLines.json 读取所有开局线路，
 * 使用 xorshift32(0xdeadbeef) 初始化 Zobrist 表，
 * 逐步模拟每一步棋后计算 Zobrist Hash，
 * 将所有 Hash → BookMove[] 映射导出为 src/data/openingBook.json。
 *
 * 用法: npx tsx scripts/generateOpeningBook.ts
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

// ============================================================
// Types
// ============================================================

interface RawMove {
  f: [number, number]
  t: [number, number]
}

interface BookMove {
  fromRow: number
  fromCol: number
  toRow: number
  toCol: number
  special?: 'castle' | 'enPassant'
  rookFrom?: { row: number; col: number }
  rookTo?: { row: number; col: number }
  weight: number
}

type OpeningLine = RawMove[]

// ============================================================
// Seeded PRNG (xorshift32, same seed as zobrist.ts)
// ============================================================

function xorshift32(state: number): () => number {
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state >>> 0
  }
}

const rng = xorshift32(0xdeadbeef)

// ============================================================
// Zobrist tables (must match zobrist.ts exactly)
// ============================================================

const PIECE_TYPE_INDEX: Record<string, number> = {
  pawn: 0,
  knight: 1,
  bishop: 2,
  rook: 3,
  queen: 4,
  king: 5,
}

const COLOR_INDEX: Record<string, number> = {
  white: 0,
  black: 1,
}

const zobristPiece: number[][][] = Array.from({ length: 6 }, () =>
  Array.from({ length: 2 }, () => new Array(64).fill(0)),
)
const zobristEnPassant: number[] = new Array(8).fill(0)
const zobristCastling: number[] = new Array(4).fill(0)
let zobristBlackToMove = 0

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

// ============================================================
// Zobrist Hash helpers (matching zobrist.ts)
// ============================================================

function castlingHash(rights: number): number {
  let h = 0
  if (rights & 1) h ^= zobristCastling[0]!
  if (rights & 2) h ^= zobristCastling[1]!
  if (rights & 4) h ^= zobristCastling[2]!
  if (rights & 8) h ^= zobristCastling[3]!
  return h
}

function computeHash(
  board: (string | null)[][],
  turn: string,
  epFile: number | null,
  castling: number,
): number {
  let h = 0
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r]![c]
      if (p) {
        const [type, color] = p.split(':') as [string, string]
        const ptIdx = PIECE_TYPE_INDEX[type]!
        const cIdx = COLOR_INDEX[color]!
        h ^= zobristPiece[ptIdx]![cIdx]![r * 8 + c]!
      }
    }
  }
  if (turn === 'black') h ^= zobristBlackToMove
  if (epFile !== null && epFile >= 0 && epFile < 8) {
    h ^= zobristEnPassant[epFile]!
  }
  h ^= castlingHash(castling)
  return h >>> 0
}

// ============================================================
// Board representation: "type:color" or null
// ============================================================

function createInitialBoard(): (string | null)[][] {
  const b: (string | null)[][] = [
    ['rook:black', 'knight:black', 'bishop:black', 'queen:black', 'king:black', 'bishop:black', 'knight:black', 'rook:black'],
    ['pawn:black', 'pawn:black', 'pawn:black', 'pawn:black', 'pawn:black', 'pawn:black', 'pawn:black', 'pawn:black'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['pawn:white', 'pawn:white', 'pawn:white', 'pawn:white', 'pawn:white', 'pawn:white', 'pawn:white', 'pawn:white'],
    ['rook:white', 'knight:white', 'bishop:white', 'queen:white', 'king:white', 'bishop:white', 'knight:white', 'rook:white'],
  ]
  return b
}

function copyBoard(b: (string | null)[][]): (string | null)[][] {
  return b.map(row => [...row])
}

const ALL_CASTLING = 15 // 0b1111

function removeCastling(rights: number, color: string, side: string): number {
  let r = rights
  if (color === 'white') {
    if (side === 'both' || side === 'kingside') r &= ~1
    if (side === 'both' || side === 'queenside') r &= ~2
  } else {
    if (side === 'both' || side === 'kingside') r &= ~4
    if (side === 'both' || side === 'queenside') r &= ~8
  }
  return r
}

function applyRawMove(
  b: (string | null)[][],
  turn: string,
  castling: number,
  move: RawMove,
): {
  board: (string | null)[][]
  turn: string
  castling: number
  epFile: number | null
} {
  const [fr, fc] = move.f
  const [tr, tc] = move.t
  const board = copyBoard(b)
  const pieceStr = board[fr]![fc]
  if (!pieceStr) throw new Error(`No piece at ${fr},${fc}`)
  const [pt, pieceColor] = pieceStr.split(':') as [string, string]

  const enemy = turn === 'white' ? 'black' : 'white'
  let newCastling = castling
  let newEpFile: number | null = null

  const captured = board[tr]![tc]
  const isPawn = pt === 'pawn'
  const isEnPassant = isPawn && fc !== tc && captured === null

  if (isPawn && Math.abs(tr - fr) === 2) {
    newEpFile = fc
  }

  board[fr]![fc] = null
  board[tr]![tc] = `${pt}:${turn}`

  if (isEnPassant) {
    board[fr]![tc] = null
  }

  if (pt === 'king' && Math.abs(fc - tc) === 2) {
    if (tc > fc) {
      const rook = board[fr]![7]
      board[fr]![7] = null
      board[fr]![5] = rook ? `${rook.split(':')[0]}:${turn}` : null
    } else {
      const rook = board[fr]![0]
      board[fr]![0] = null
      board[fr]![3] = rook ? `${rook.split(':')[0]}:${turn}` : null
    }
  }

  if (pt === 'king') {
    newCastling = removeCastling(newCastling, turn, 'both')
  }
  if (pt === 'rook') {
    if (turn === 'white') {
      if (fr === 7 && fc === 7) newCastling = removeCastling(newCastling, 'white', 'kingside')
      if (fr === 7 && fc === 0) newCastling = removeCastling(newCastling, 'white', 'queenside')
    } else {
      if (fr === 0 && fc === 7) newCastling = removeCastling(newCastling, 'black', 'kingside')
      if (fr === 0 && fc === 0) newCastling = removeCastling(newCastling, 'black', 'queenside')
    }
  }
  if (captured) {
    const [capType] = captured.split(':') as [string, string]
    if (capType === 'rook') {
      // We don't track hasMoved in string repr; conservatively assume rook has not moved
      // (only matters for castling rights removal when capturing a rook on its home square)
      if (captured.endsWith(':white')) {
        if (tr === 7 && tc === 7) newCastling = removeCastling(newCastling, 'white', 'kingside')
        if (tr === 7 && tc === 0) newCastling = removeCastling(newCastling, 'white', 'queenside')
      } else {
        if (tr === 0 && tc === 7) newCastling = removeCastling(newCastling, 'black', 'kingside')
        if (tr === 0 && tc === 0) newCastling = removeCastling(newCastling, 'black', 'queenside')
      }
    }
  }

  return { board, turn: enemy, castling: newCastling, epFile: newEpFile }
}

// ============================================================
// Generate book entries from an opening line
// ============================================================

function applyOpeningLine(
  line: OpeningLine,
  bookMap: Map<number, BookMove[]>,
): void {
  let board = createInitialBoard()
  let turn = 'white'
  let castling = ALL_CASTLING
  let epFile: number | null = null

  for (const move of line) {
    const pieceStr = board[move.f[0]]?.[move.f[1]]
    if (!pieceStr) continue
    const [pt, pieceColor] = pieceStr.split(':') as [string, string]
    if (pieceColor !== turn) continue

    const hash = computeHash(board, turn, epFile, castling)
    const [tr, tc] = move.t
    const isEnPassant = pt === 'pawn' && move.f[1] !== move.t[1] && board[tr]?.[tc] === null

    const detailedMove: BookMove = {
      fromRow: move.f[0],
      fromCol: move.f[1],
      toRow: move.t[0],
      toCol: move.t[1],
      weight: 2,
    }

    if (pt === 'king' && Math.abs(move.t[1] - move.f[1]) === 2) {
      detailedMove.special = 'castle'
      if (move.t[1] > move.f[1]) {
        detailedMove.rookFrom = { row: move.f[0], col: 7 }
        detailedMove.rookTo = { row: move.f[0], col: 5 }
      } else {
        detailedMove.rookFrom = { row: move.f[0], col: 0 }
        detailedMove.rookTo = { row: move.f[0], col: 3 }
      }
    }
    if (isEnPassant) {
      detailedMove.special = 'enPassant'
    }

    const existing = bookMap.get(hash)
    if (existing) {
      const dup = existing.find(
        e =>
          e.fromRow === detailedMove.fromRow &&
          e.fromCol === detailedMove.fromCol &&
          e.toRow === detailedMove.toRow &&
          e.toCol === detailedMove.toCol &&
          e.special === detailedMove.special,
      )
      if (!dup) {
        existing.push(detailedMove)
      } else {
        dup.weight += 1
      }
    } else {
      bookMap.set(hash, [detailedMove])
    }

    const next = applyRawMove(board, turn, castling, move)
    board = next.board
    turn = next.turn
    castling = next.castling
    epFile = next.epFile
  }
}

// ============================================================
// Main
// ============================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const linesPath = path.join(projectRoot, 'src', 'data', 'openingLines.json')
const outputPath = path.join(projectRoot, 'src', 'data', 'openingBook.json')

const lines: OpeningLine[] = JSON.parse(fs.readFileSync(linesPath, 'utf-8'))

const bookMap = new Map<number, BookMove[]>()

for (const line of lines) {
  applyOpeningLine(line, bookMap)
}

// Convert Map to array of [hash, moves] for JSON serialization
const output: [number, BookMove[]][] = Array.from(bookMap.entries())

fs.writeFileSync(outputPath, JSON.stringify(output), 'utf-8')

console.log(`✅ Opening book generated: ${output.length} unique positions → ${outputPath}`)