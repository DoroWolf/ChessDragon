// Board Evaluation（棋盘评估）
// 评估棋盘当前局面的优劣，从指定视角打分
// 包含：
//   - Piece-Square Table 评估：棋子基础价值 + 位置价值
//   - 风格调整：aggressive（积极进攻）、defensive（稳固防守）
import type { Board, Color } from '../chess'
import { PIECE_VALUE_ARRAY, PIECE_TYPE_INDEX, COLOR_INDEX } from './types'
import { PST_BY_COLOR, PST_KING_ENDGAME } from './pieceSquareTables'
import { isEndgameFast } from './searchState'
import { searchStyle, searchDifficulty, searchCastlingRights, trackedMaterial } from './searchState'
import { evaluateKBNK, KBNK_MATERIAL, KBNK_MIN_LEVEL } from './endgameKnowledge'
import { getSyzygyStore, wdlToScore } from './syzygy/store'

export function evaluateBoardInternal(
  b: Board,
  perspective: Color,
  hasEnPassant = false,
): number {
  // Syzygy 残局库：WDL 只作为"胜负等级"的基准分（胜 / 幸胜 / 和 / 幸负 / 负），
  // 仍在其上叠加启发式评估，保留位置与进程梯度。
  // 若命中时直接返回库值，同一 WDL 类别内所有走法就完全同分，
  // AI 会退化成"随便挑一个保住胜负等级的走法"——例如 KBNK 里马象不动、
  // 孤王乱跑、把棋走到角落。
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

      // 子力 + 位置价值
      const baseValue = PIECE_VALUE_ARRAY[ptIdx]!
      const pstIdx = piece.type === 'king' ? pstKingIdx : ptIdx
      const posValue = PST_BY_COLOR[pstIdx]![cIdx]![row]![col]!

      score += sign * (baseValue + posValue)
    }
  }

  // KBNK 残局知识（3 级及以上 AI 开放）：
  // 王+象+马 vs 王 的子力恒定，靠 PST 无法完成驱赶与杀王，
  // 这里叠加残局知识分，引导 AI 把孤王逼到与象同色的角落成杀。
  // 注意：这里保留的启发式梯度也是残局库不可用时（例如 DTZ 表加载失败）
  // 的兜底手段，因此即使命中 WDL 也必须叠加它。
  if (searchDifficulty >= KBNK_MIN_LEVEL && trackedMaterial === KBNK_MATERIAL) {
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

  // 残局库命中：基准分 + 启发式分。
  // 启发式分（子力 + PST + KBNK 等残局知识）的绝对值远小于
  // TB_WIN_SCORE / TB_CURSED_WIN_SCORE 之间的 5000 间隔，
  // 因此不会破坏 胜 > 幸胜 > 和 > 幸负 > 负 的严格排序，
  // 同时让同一类别内的位置/进程梯度继续生效。
  return tbBase === null ? score : tbBase + score
}