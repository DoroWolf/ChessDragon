// ============================================================
// Opening Book（开局库）
// Polyglot 风格：Zobrist Hash → 加权走法列表的映射
// 数据由 scripts/generateOpeningBook.ts 从 openingLines.json
// 预计算生成，运行时直接加载 JSON 无需重算 Zobrist
// ============================================================
import type { AIDetailedMove } from './types'
import bookData from '@/data/openingBook.json'

// ============================================================
// Types
// ============================================================

/** 预计算的带权重走法（与 JSON 格式一致） */
interface PrecomputedBookMove {
  fromRow: number
  fromCol: number
  toRow: number
  toCol: number
  special?: 'castle' | 'enPassant'
  rookFrom?: { row: number; col: number }
  rookTo?: { row: number; col: number }
  weight: number
}

/** 带权重的走法 */
export interface BookMove {
  move: AIDetailedMove
  weight: number
}

// ============================================================
// Book state（从 JSON 加载）
// ============================================================

/** 开局库映射：Zobrist Hash → 候选走法列表 */
let bookMap: Map<number, BookMove[]> | null = null

function ensureLoaded(): void {
  if (bookMap !== null) return
  bookMap = new Map()
  const entries = bookData as [number, PrecomputedBookMove[]][]
  for (const [hash, rawMoves] of entries) {
    bookMap.set(
      hash,
      rawMoves.map((raw): BookMove => ({
        weight: raw.weight,
        move: {
          fromRow: raw.fromRow,
          fromCol: raw.fromCol,
          toRow: raw.toRow,
          toCol: raw.toCol,
          special: raw.special,
          rookFrom: raw.rookFrom,
          rookTo: raw.rookTo,
        },
      })),
    )
  }
}

// ============================================================
// 查询开局库
// ============================================================

/**
 * 根据 Zobrist Hash 查询开局库
 * @returns 候选走法列表，如果哈希不在库中则返回 null
 */
export function probeBook(hash: number): BookMove[] | null {
  ensureLoaded()
  return bookMap!.get(hash) ?? null
}

/**
 * 从候选走法中按权重随机选择一个走法
 * @returns 选中的走法，如果列表为空则返回 null
 */
export function pickBookMove(candidates: BookMove[]): AIDetailedMove | null {
  if (candidates.length === 0) return null

  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0)
  let r = Math.random() * totalWeight

  for (const candidate of candidates) {
    r -= candidate.weight
    if (r <= 0) return candidate.move
  }

  return candidates[candidates.length - 1]!.move
}