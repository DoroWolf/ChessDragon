// Transposition Table（置换表）
// 存储已搜索局面的评估结果，避免重复搜索同一局面
// 使用 Zobrist 哈希作为键，支持精确值 / Alpha 上界 / Beta 下界三种存储类型
import { TT_SIZE, TT_MASK, TT_EXACT, TT_ALPHA, TT_BETA } from './types'
import type { TTEntry, AIDetailedMove } from './types'

export const tt: (TTEntry | null)[] = new Array(TT_SIZE).fill(null)
export let ttHits = 0

export function probeTT(hash: number, depth: number, alpha: number, beta: number): {
  hit: boolean
  score: number
  bestMove: AIDetailedMove | null
} {
  const idx = hash & TT_MASK
  const entry = tt[idx]
  if (entry && entry.hash === hash && entry.depth >= depth) {
    ttHits++
    if (entry.flag === TT_EXACT) {
      return { hit: true, score: entry.score, bestMove: entry.bestMove }
    }
    if (entry.flag === TT_ALPHA && entry.score <= alpha) {
      return { hit: true, score: alpha, bestMove: entry.bestMove }
    }
    if (entry.flag === TT_BETA && entry.score >= beta) {
      return { hit: true, score: beta, bestMove: entry.bestMove }
    }
  }
  return { hit: false, score: 0, bestMove: entry?.bestMove ?? null }
}

export function storeTT(
  hash: number,
  depth: number,
  score: number,
  flag: number,
  bestMove: AIDetailedMove | null,
): void {
  const idx = hash & TT_MASK
  const existing = tt[idx]
  if (existing && existing.hash === hash && existing.depth > depth && existing.flag === TT_EXACT) {
    return
  }
  tt[idx] = { hash, depth, score, flag, bestMove }
}