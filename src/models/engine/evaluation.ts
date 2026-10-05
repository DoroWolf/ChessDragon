import type { Board, Color } from '../chess'
import { PIECE_VALUE_ARRAY, PIECE_TYPE_INDEX, COLOR_INDEX } from './types'
import { PST_BY_COLOR, PST_KING_ENDGAME } from './pieceSquareTables'
import { isEndgameFast } from './searchState'
import {
  searchStyle,
  searchUseKbnkKnowledge,
  searchCastlingRights,
  trackedMaterial,
} from './searchState'
import { evaluateKBNK, KBNK_MATERIAL } from './endgameKnowledge'
import { getSyzygyStore, wdlToScore } from './syzygy/store'

export function evaluateBoardInternal(
  b: Board,
  perspective: Color,
  hasEnPassant = false,
): number {
  let tbBase: number | null = null
  const syzygy = getSyzygyStore()
  if (syzygy.active && !hasEnPassant && searchCastlingRights === 0) {
    const wdl = syzygy.probeWdl(b, perspective, false)
    if (wdl !== undefined) tbBase = wdlToScore(wdl)
  }

  let score = 0
  const endgame = isEndgameFast(trackedMaterial)
  const pstKingIdx = endgame ? PST_KING_ENDGAME : PIECE_TYPE_INDEX['king']!

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = b[row]![col]
      if (!piece) continue

      const sign = piece.color === perspective ? 1 : -1
      const ptIdx = PIECE_TYPE_INDEX[piece.type]!
      const cIdx = COLOR_INDEX[piece.color]!

      const baseValue = PIECE_VALUE_ARRAY[ptIdx]!
      const pstIdx = piece.type === 'king' ? pstKingIdx : ptIdx
      const posValue = PST_BY_COLOR[pstIdx]![cIdx]![row]![col]!

      score += sign * (baseValue + posValue)
    }
  }

  if (searchUseKbnkKnowledge && trackedMaterial === KBNK_MATERIAL) {
    score += evaluateKBNK(b, perspective)
  }

  // 风格调整
  if (searchStyle === 'aggressive') {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = b[row]![col]
        if (!piece || piece.color !== perspective) continue
        if (piece.type === 'knight' || piece.type === 'bishop') {
          const centerDist = Math.abs(3.5 - row) + Math.abs(3.5 - col)
          if (centerDist <= 2) {
            score += 15
          }
        }
        if (piece.type === 'pawn') {
          const advance = piece.color === 'white' ? (6 - row) : (row - 1)
          score += advance * 3
        }
      }
    }
  } else if (searchStyle === 'defensive') {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = b[row]![col]
        if (!piece || piece.color !== perspective) continue
        if (piece.type === 'pawn') {
          const leftSame = b[row]![col - 1]
          const rightSame = b[row]![col + 1]
          if (
            (leftSame && leftSame.type === 'pawn' && leftSame.color === piece.color) ||
            (rightSame && rightSame.type === 'pawn' && rightSame.color === piece.color)
          ) {
            score += 10
          }
        }
      }
    }
  }

  return tbBase === null ? score : tbBase + score
}