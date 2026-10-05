import type { AIDifficulty } from './types'

export interface DifficultyProfile {
  moveTimeMs: number
  maxDepth: number
  blunderRate: number
  blunderDepth: number
  tablebaseLevel: number
  useKbnkKnowledge: boolean
  useOpeningBook: boolean
}

export const DIFFICULTY_PROFILES: Record<AIDifficulty, DifficultyProfile> = {
  1: {
    moveTimeMs: 100,
    maxDepth: 12,
    blunderRate: 0.4,
    blunderDepth: 2,
    tablebaseLevel: 0,
    useKbnkKnowledge: false,
    useOpeningBook: false,
  },
  2: {
    moveTimeMs: 150,
    maxDepth: 12,
    blunderRate: 0.28,
    blunderDepth: 3,
    tablebaseLevel: 0,
    useKbnkKnowledge: false,
    useOpeningBook: true,
  },
  3: {
    moveTimeMs: 180,
    maxDepth: 12,
    blunderRate: 0.2,
    blunderDepth: 3,
    tablebaseLevel: 3,
    useKbnkKnowledge: true,
    useOpeningBook: true,
  },
  4: {
    moveTimeMs: 500,
    maxDepth: 12,
    blunderRate: 0,
    blunderDepth: 3,
    tablebaseLevel: 4,
    useKbnkKnowledge: true,
    useOpeningBook: true,
  },
  5: {
    moveTimeMs: 2500,
    maxDepth: 12,
    blunderRate: 0,
    blunderDepth: 3,
    tablebaseLevel: 5,
    useKbnkKnowledge: true,
    useOpeningBook: true,
  },
}

export function getDifficultyProfile(level: number): DifficultyProfile {
  return DIFFICULTY_PROFILES[level as AIDifficulty] ?? DIFFICULTY_PROFILES[3]
}
