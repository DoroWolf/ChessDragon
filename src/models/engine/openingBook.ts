// ============================================================
// Opening Book（开局库）
// Polyglot 风格：Zobrist Hash → 加权走法列表的映射
// 数据由 scripts/generateOpeningBook.ts 从 openingLines.yaml
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
  /** 采用该走法所需的最低 AI 强度等级（1 级不使用开局库） */
  minLevel: number
}

/** 带权重的走法 */
export interface BookMove {
  move: AIDetailedMove
  weight: number
  /** 采用该走法所需的最低 AI 强度等级（1 级不使用开局库） */
  minLevel: number
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
        minLevel: raw.minLevel,
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
 * 根据 Zobrist Hash 与 AI 强度等级查询开局库
 *
 * 1 级 AI 不使用开局库；其余等级仅返回 minLevel <= difficulty 的走法，
 * 从而让较弱的 AI 只走较短的线路，较强的 AI 才使用深层理论。
 *
 * @returns 过滤后的候选走法列表，若不可用则返回 null
 */
export function probeBookForLevel(hash: number, difficulty: number): BookMove[] | null {
  if (difficulty <= 1) return null

  const candidates = probeBook(hash)
  if (!candidates) return null

  const eligible = candidates.filter((c) => c.minLevel <= difficulty)
  return eligible.length > 0 ? eligible : null
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