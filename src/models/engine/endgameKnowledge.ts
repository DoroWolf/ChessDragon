// ============================================================
// Endgame Knowledge - KBNK（残局知识：王 + 象 + 马 vs 王）
// KBNK 是唯一"有子力优势却不能自动取胜"的常规残局：
//   必须把孤王赶到 *与象同色* 的角落才能成杀。
// 纯子力/PST 评估无法表达这一过程（所有走法子力相同），
// 因此这里提供一组残局知识评分，仅在 3 级及以上 AI 开放：
//   1. 把孤王驱赶到棋盘边缘
//   2. 把孤王驱赶到与象同色的正确角落（错误角落是防守方的和棋资源）
//   3. 进攻王逼近孤王，完成合围
//   4. 马保持"封锁且不被白吃"的距离
//   5. 象守住"成杀斜线"（最后杀着必须由它在这条斜线上完成）
//   6. 封锁孤王的逃逸格，优先封住方向错误的一侧
//
// 已知限制：本函数只提供"过程分"引导，并没有实现完整的杀王程序。
// 引擎搜索较浅时（例如 AI 棋钟剩余很少、每步仅 50ms），
// 进攻方可能在正确角落附近反复盘旋而无法完成最后的杀网 ——
// 要做到 100% 收网需要残局库或专门的杀王算法。
// ============================================================
import type { Board, Color, Square } from '../chess'

// ============================================================
// 常量
// ============================================================
/** 开放 KBNK 残局知识所需的最低 AI 强度等级 */
export const KBNK_MIN_LEVEL = 3

/** KBNK 局面（王+象+马 vs 王）的总子力：象 330 + 马 320 = 650 */
export const KBNK_MATERIAL = 650

// 评估权重（单位：厘兵）。KBNK 中子力恒定不变，
// 因此这些"过程分"可以充分主导棋子的走法选择
const EDGE_WEIGHT = 60 // 孤王每远离边缘一格
const CORNER_WEIGHT = 20 // 孤王每远离正确角落一格
const WRONG_CORNER_WEIGHT = 8 // 孤王每靠近错误角落一格
const KING_WEIGHT = 30 // 进攻王每远离孤王一格
const KNIGHT_WEIGHT = 15 // 马的封锁价值
const HANG_KNIGHT_PENALTY = 200 // 马被孤王攻击且无保护的惩罚（避免送马）
const BISHOP_DIAGONAL_WEIGHT = 40 // 象占据"成杀斜线"的价值
const BISHOP_APPROACH_WEIGHT = 20 // 象沿成杀斜线逼近孤王的价值
const FREE_ESCAPE_PENALTY = 25 // 孤王每个"方向错误"的逃逸格（会带它远离正确角落）
const COFFIN_BONUS = 80 // 孤王所有逃逸格被封死（将杀在即）

// 四个角落
const CORNER_SQUARES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0, 7],
  [7, 0],
  [7, 7],
]

// ============================================================
// 类型
// ============================================================
/** KBNK 局面信息 */
export interface KBNKInfo {
  /** 进攻方（持有象 + 马的一方） */
  attacker: Color
  /** 防守方（只剩孤王的一方） */
  defender: Color
  attackerKing: Square
  defenderKing: Square
  bishop: Square
  knight: Square
}

// ============================================================
// 基础工具
// ============================================================
/** 切比雪夫距离（国际象棋中王的步数距离） */
export function chebyshev(a: Square, b: Square): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col))
}

/** 方格颜色奇偶：0 = 浅色，1 = 深色 */
export function squareParity(square: Square): number {
  return (square.row + square.col) % 2
}

/**
 * 与象同色（可成杀的"正确"角落）列表。
 * KBNK 只能把孤王将杀在与象同色的角落：
 * 浅色象对应 a8 / h1（本工程坐标中 row === col 的长斜线），
 * 深色象对应 a1 / h8（row + col === 7 的长斜线）。
 */
export function getMatingCorners(bishop: Square): Square[] {
  const parity = squareParity(bishop)
  return CORNER_SQUARES.filter(([row, col]) => (row + col) % 2 === parity).map(([row, col]) => ({
    row,
    col,
  }))
}

/** square 到"指定颜色"角落的最小切比雪夫距离（0 = 已经站在该色角落） */
export function cornerDistance(square: Square, parity: number): number {
  let best = 7
  for (const [row, col] of CORNER_SQUARES) {
    if ((row + col) % 2 !== parity) continue
    const d = chebyshev(square, { row, col })
    if (d < best) best = d
  }
  return best
}

// ============================================================
// 局面识别
// ============================================================
/**
 * 识别棋盘是否为 KBNK 局面（一方 王+象+马，另一方 单王）。
 * 非 KBNK 局面返回 null，调用方只需在总子力为 650 时调用，常规局面零开销。
 */
export function detectKBNK(b: Board): KBNKInfo | null {
  let whiteKing: Square | null = null
  let blackKing: Square | null = null
  let whiteBishop: Square | null = null
  let blackBishop: Square | null = null
  let whiteKnight: Square | null = null
  let blackKnight: Square | null = null
  // 出现任何其它棋子（兵/车/后，或第二个象/马）即不是 KBNK
  let hasOtherPiece = false

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = b[row]![col]
      if (!piece) continue
      const square: Square = { row, col }

      if (piece.type === 'king') {
        if (piece.color === 'white') {
          if (whiteKing) return null
          whiteKing = square
        } else {
          if (blackKing) return null
          blackKing = square
        }
      } else if (piece.type === 'bishop') {
        if (piece.color === 'white') {
          if (whiteBishop) hasOtherPiece = true
          whiteBishop = square
        } else {
          if (blackBishop) hasOtherPiece = true
          blackBishop = square
        }
      } else if (piece.type === 'knight') {
        if (piece.color === 'white') {
          if (whiteKnight) hasOtherPiece = true
          whiteKnight = square
        } else {
          if (blackKnight) hasOtherPiece = true
          blackKnight = square
        }
      } else {
        hasOtherPiece = true
      }
    }
  }

  if (hasOtherPiece || !whiteKing || !blackKing) return null

  // 白方 王+象+马 vs 黑方 单王
  if (whiteBishop && whiteKnight && !blackBishop && !blackKnight) {
    return {
      attacker: 'white',
      defender: 'black',
      attackerKing: whiteKing,
      defenderKing: blackKing,
      bishop: whiteBishop,
      knight: whiteKnight,
    }
  }

  // 黑方 王+象+马 vs 白方 单王
  if (blackBishop && blackKnight && !whiteBishop && !whiteKnight) {
    return {
      attacker: 'black',
      defender: 'white',
      attackerKing: blackKing,
      defenderKing: whiteKing,
      bishop: blackBishop,
      knight: blackKnight,
    }
  }

  return null
}


// ============================================================
// 马的安全性
// ============================================================
/** 象是否沿对角线攻击到 (row, col)（忽略目标格上的棋子） */
function bishopAttacks(b: Board, row: number, col: number, bishop: Square): boolean {
  const dRow = row - bishop.row
  const dCol = col - bishop.col
  if (dRow === 0 || Math.abs(dRow) !== Math.abs(dCol)) return false

  const stepRow = Math.sign(dRow)
  const stepCol = Math.sign(dCol)
  let r = bishop.row + stepRow
  let c = bishop.col + stepCol
  while (r !== row || c !== col) {
    if (b[r]![c]) return false // 象路被挡住
    r += stepRow
    c += stepCol
  }
  return true
}

/**
 * 马是否被保护（进攻王贴身保护，或被象沿对角线保护）。
 * 孤王随时可以吃掉无保护的贴身马，因此该判定必须参与评分。
 */
function isKnightDefended(b: Board, info: KBNKInfo): boolean {
  const { attackerKing, bishop, knight } = info
  if (chebyshev(attackerKing, knight) <= 1) return true
  return bishopAttacks(b, knight.row, knight.col, bishop)
}

// ============================================================
// 逃逸格封锁（mop-up）
// ============================================================
/** (row, col) 是否被进攻方（王 / 象 / 马）攻击 */
function isAttackedByAttacker(b: Board, row: number, col: number, info: KBNKInfo): boolean {
  const { attackerKing, bishop, knight } = info

  if (Math.abs(attackerKing.row - row) <= 1 && Math.abs(attackerKing.col - col) <= 1) {
    return true
  }

  const kRow = Math.abs(knight.row - row)
  const kCol = Math.abs(knight.col - col)
  if ((kRow === 1 && kCol === 2) || (kRow === 2 && kCol === 1)) return true

  return bishopAttacks(b, row, col, bishop)
}

/**
 * 统计孤王邻格的封锁情况：
 *   free       —— 仍可逃逸的格子数
 *   badEscapes —— 其中"不会让孤王更靠近正确角落"的格子数
 * 只惩罚 badEscapes，进攻方就会主动封住方向错误的逃逸格，
 * 从而把孤王沿边线一路挤向正确角落（KBNK 的标准收网技术）。
 * 注意：逃逸格为 0 且不在将军状态即为逼和，交由搜索的终局判定处理。
 */
function countKingEscapes(
  b: Board,
  info: KBNKInfo,
  bishopParity: number,
  cornerDist: number,
): { free: number; badEscapes: number } {
  const king = info.defenderKing
  let free = 0
  let badEscapes = 0

  for (let dRow = -1; dRow <= 1; dRow++) {
    for (let dCol = -1; dCol <= 1; dCol++) {
      if (dRow === 0 && dCol === 0) continue
      const row = king.row + dRow
      const col = king.col + dCol
      if (row < 0 || row > 7 || col < 0 || col > 7) continue
      if (isAttackedByAttacker(b, row, col, info)) continue
      free++
      if (cornerDistance({ row, col }, bishopParity) >= cornerDist) badEscapes++
    }
  }

  return { free, badEscapes }
}

// ============================================================
// 进攻方评分（KBNK 知识核心）
// ============================================================
/**
 * 从进攻方视角评估 KBNK 局面的"取胜进度"。
 * 分数越高表示越接近将杀，用于引导 AI 完成标准杀王流程。
 */
export function scoreKBNKForAttacker(b: Board, info: KBNKInfo): number {
  const { attackerKing, defenderKing, bishop, knight } = info
  let score = 0

  // 1) 把孤王驱赶到棋盘边缘（0 = 已在边缘，3 = 棋盘正中）
  const edgeDist = Math.min(
    defenderKing.row,
    7 - defenderKing.row,
    defenderKing.col,
    7 - defenderKing.col,
  )
  score += EDGE_WEIGHT * (3 - edgeDist)

  // 2) 把孤王驱赶到与象同色的正确角落，同时避免它躲进错误角落
  const bishopParity = squareParity(bishop)
  const correctDist = cornerDistance(defenderKing, bishopParity)
  const wrongDist = cornerDistance(defenderKing, 1 - bishopParity)
  score += CORNER_WEIGHT * (7 - correctDist)
  score -= WRONG_CORNER_WEIGHT * (7 - wrongDist)

  // 3) 进攻王必须贴上来完成合围（这是能真正收网的前提）
  score += KING_WEIGHT * (7 - chebyshev(attackerKing, defenderKing))

  // 4) 马负责封锁：安全距离（>=2）越近越好；贴身时必须有保护，否则视为送马
  const knightDist = chebyshev(knight, defenderKing)
  if (knightDist >= 2) {
    score += KNIGHT_WEIGHT * Math.max(0, 5 - knightDist)
  } else if (isKnightDefended(b, info)) {
    score += KNIGHT_WEIGHT * 2
  } else {
    score -= HANG_KNIGHT_PENALTY
  }

  // 5) 象负责最后杀着：它必须"守住成杀斜线"——即两个正确角落所在的长斜线
  //    （浅色象 -> a8-h1，深色象 -> a1-h8），并在收网阶段沿斜线逼近孤王
  const onMatingDiagonal =
    bishopParity === 0 ? bishop.row === bishop.col : bishop.row + bishop.col === 7
  if (onMatingDiagonal) {
    const bishopDist = chebyshev(bishop, defenderKing)
    if (bishopDist >= 2) {
      score += BISHOP_DIAGONAL_WEIGHT + BISHOP_APPROACH_WEIGHT * Math.max(0, 5 - bishopDist)
    } else if (chebyshev(attackerKing, bishop) <= 1) {
      // 贴身但有进攻王保护，可以接受
      score += BISHOP_DIAGONAL_WEIGHT
    } else {
      // 无保护的贴身象会被孤王直接吃掉
      score -= HANG_KNIGHT_PENALTY
    }
  }

  // 6) 逃逸格封锁：优先封住"会把孤王带离正确角落"的格子，
  //    把孤王沿边线挤向正确角落；逃逸格全部封死即为"将杀在即"
  const escapes = countKingEscapes(b, info, bishopParity, correctDist)
  score -= FREE_ESCAPE_PENALTY * escapes.badEscapes
  if (escapes.free === 0) {
    score += COFFIN_BONUS
  }

  return score
}

// ============================================================
// 对外评估入口
// ============================================================
/**
 * KBNK 残局知识评估：返回从 perspective 视角看的分数。
 * 非 KBNK 局面返回 0，因此可安全地在常规局面调用。
 * 注意：调用方应先判断总子力是否为 KBNK_MATERIAL，避免无谓的棋盘扫描。
 */
export function evaluateKBNK(b: Board, perspective: Color): number {
  const info = detectKBNK(b)
  if (!info) return 0
  const score = scoreKBNKForAttacker(b, info)
  return info.attacker === perspective ? score : -score
}

