import { TT_SIZE, TT_MASK, TT_EXACT, TT_ALPHA, TT_BETA } from './types'
import type { TTEntry, AIDetailedMove } from './types'

export const tt: (TTEntry | null)[] = new Array(TT_SIZE).fill(null)
export let ttHits = 0

let ttEnabled = true

export function setTTEnabled(enabled: boolean): void {
  ttEnabled = enabled
}

export function probeTT(hash: number, depth: number, alpha: number, beta: number): {
  hit: boolean
  score: number
  bestMove: AIDetailedMove | null
} {
  const idx = hash & TT_MASK
  const entry = tt[idx]
  if (!ttEnabled) {
    return { hit: false, score: 0, bestMove: null }
  }
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
  if (!ttEnabled) return
  const idx = hash & TT_MASK
  const existing = tt[idx]
  if (existing && existing.hash === hash && existing.depth > depth && existing.flag === TT_EXACT) {
    return
  }
  tt[idx] = { hash, depth, score, flag, bestMove }
}