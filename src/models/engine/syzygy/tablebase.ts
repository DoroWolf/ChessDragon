// ============================================================
// Syzygy Tablebase - 查询入口（Tablebase）
// 移植自 python-chess 的 chess/syzygy.py（MIT License）
//
// 说明：
//   * 只支持标准象棋；王车易位权利 / 吃过路兵局面不查询（由调用方跳过）
//   * 缺失的表（含被吃子后需要的表）会让本次查询返回 undefined，
//     调用方应回退到常规搜索，保证不会给出错误结论
// ============================================================
import type { Board, Color, PieceType, Square } from '../../chess'
import { getPieceMoves } from '../../chess'
import { makeMove, unmakeMove } from '../boardChange'
import { isSquareAttackedFast } from '../moveGeneration'
import type { AIDetailedMove } from '../types'
import { DtzTable, WdlTable, type PieceSquaresFn } from './table'
import {
  PCHR,
  sqOf,
  normalizeTablename,
  dtzBeforeZeroing,
} from './tables'

// ============================================================
// 工具
// ============================================================
const TYPE_TO_CHAR: Record<PieceType, string> = {
  king: 'K',
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
  pawn: 'P',
}

const TYPE_TO_CODE: Record<PieceType, number> = {
  pawn: 1,
  knight: 2,
  bishop: 3,
  rook: 4,
  queen: 5,
  king: 6,
}

export function oppositeColor(color: Color): Color {
  return color === 'white' ? 'black' : 'white'
}

/**
 * 由棋盘计算残局键（白方在前、**不做规范化**）。
 * 该值用于和表文件的标准键比较，从而判断局面是否需要镜像（cmirror）。
 */
export function calcKey(b: Board): string {
  const white: Record<string, number> = {}
  const black: Record<string, number> = {}

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = b[row]![col]
      if (!piece) continue
      const target = piece.color === 'white' ? white : black
      const char = TYPE_TO_CHAR[piece.type]
      target[char] = (target[char] ?? 0) + 1
    }
  }

  const side = (counts: Record<string, number>) =>
    PCHR.map((char) => char.repeat(counts[char] ?? 0)).join('')

  return `${side(white)}v${side(black)}`
}

/** 棋盘上有哪些棋子（按库文件的棋子编码 / 颜色索引检索） */
export function squaresFromBoard(b: Board): PieceSquaresFn {
  const lists: number[][] = []
  for (let i = 0; i < 16; i++) lists.push([])

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = b[row]![col]
      if (!piece) continue
      const colorIndex = piece.color === 'white' ? 0 : 1
      lists[(colorIndex << 3) | TYPE_TO_CODE[piece.type]]!.push(sqOf(row, col))
    }
  }

  const empty: number[] = []
  for (const list of lists) list.sort((x, y) => x - y)

  return (pieceCode: number, colorIndex: number) => lists[(colorIndex << 3) | pieceCode] ?? empty
}

/** 棋子数量（用于等级门槛判断） */
export function pieceCount(b: Board): number {
  let count = 0
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (b[row]![col]) count++
    }
  }
  return count
}

function findKing(b: Board, color: Color): Square {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = b[row]![col]
      if (piece && piece.type === 'king' && piece.color === color) return { row, col }
    }
  }
  return { row: 0, col: 0 }
}

// ============================================================
// Tablebase
// ============================================================
export class Tablebase {
  private wdl = new Map<string, WdlTable>()
  private dtz = new Map<string, DtzTable>()

  /** 上一次查询中缺失的表（用于按需加载） */
  missingWdl = new Set<string>()
  missingDtz = new Set<string>()

  /** 开始一次新查询：清空缺失记录 */
  beginProbe(): void {
    this.missingWdl.clear()
    this.missingDtz.clear()
  }

  /** 已加载的 WDL 表数量 */
  get wdlCount(): number {
    return this.wdl.size
  }

  /** 已加载的 DTZ 表数量 */
  get dtzCount(): number {
    return this.dtz.size
  }

  hasWdl(tablename: string): boolean {
    return this.wdl.has(normalizeTablename(tablename))
  }

  hasDtz(tablename: string): boolean {
    return this.dtz.has(normalizeTablename(tablename))
  }

  removeWdl(tablename: string): void {
    const table = this.wdl.get(normalizeTablename(tablename))
    if (!table) return
    this.wdl.delete(table.key)
    this.wdl.delete(table.mirroredKey)
  }

  removeDtz(tablename: string): void {
    const table = this.dtz.get(normalizeTablename(tablename))
    if (!table) return
    this.dtz.delete(table.key)
    this.dtz.delete(table.mirroredKey)
  }

  addWdl(tablename: string, data: Uint8Array): void {
    const table = new WdlTable(tablename, data)
    this.wdl.set(table.key, table)
    this.wdl.set(table.mirroredKey, table)
  }

  addDtz(tablename: string, data: Uint8Array): void {
    const table = new DtzTable(tablename, data)
    this.dtz.set(table.key, table)
    this.dtz.set(table.mirroredKey, table)
  }

  clear(): void {
    this.wdl.clear()
    this.dtz.clear()
  }

  // ----------------------------------------------------------
  // 走法生成（不使用全局追踪状态，可安全地在搜索中调用）
  // ----------------------------------------------------------
  private generateMoves(b: Board, color: Color, capturesOnly: boolean): AIDetailedMove[] {
    const moves: AIDetailedMove[] = []
    const enemy = oppositeColor(color)
    const king = findKing(b, color)

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = b[row]![col]
        if (!piece || piece.color !== color) continue

        for (const m of getPieceMoves(b, row, col, { enPassantTarget: null, lastMove: null })) {
          const isCapture = b[m.row]![m.col] !== null
          if (capturesOnly && !isCapture) continue

          const move: AIDetailedMove = {
            fromRow: row,
            fromCol: col,
            toRow: m.row,
            toCol: m.col,
            special: m.special,
            rookFrom: m.rookFrom,
            rookTo: m.rookTo,
          }
          if (piece.type === 'pawn' && (m.row === 0 || m.row === 7)) {
            move.promotion = 'queen'
          }

          const { changes } = makeMove(b, move)
          const kRow = piece.type === 'king' ? m.row : king.row
          const kCol = piece.type === 'king' ? m.col : king.col
          const legal = !isSquareAttackedFast(b, kRow, kCol, enemy)
          unmakeMove(b, changes)

          if (legal) moves.push(move)
        }
      }
    }

    return moves
  }

  /** 走子方是否被将军 */
  private inCheck(b: Board, color: Color): boolean {
    const king = findKing(b, color)
    return isSquareAttackedFast(b, king.row, king.col, oppositeColor(color))
  }

  /** 是否为将杀局面（走子方无合法走法且被将军） */
  private isCheckmate(b: Board, color: Color): boolean {
    if (!this.inCheck(b, color)) return false
    return this.generateMoves(b, color, false).length === 0
  }

  // ----------------------------------------------------------
  // WDL
  // ----------------------------------------------------------
  private probeWdlTable(b: Board, turn: Color): number | undefined {
    // 王对王：必和（库中没有 KvK 表）
    if (pieceCount(b) === 2) return 0

    const key = calcKey(b)
    const table = this.wdl.get(key)
    if (!table) {
      this.missingWdl.add(normalizeTablename(key))
      return undefined
    }
    return table.probeWdlTable(key, turn, squaresFromBoard(b))
  }

  /** alpha-beta 探测：先解析吃子（含升变），再查表 */
  private probeAb(
    b: Board,
    turn: Color,
    alpha: number,
    beta: number,
  ): { value: number; success: number } | undefined {
    const captures = this.generateMoves(b, turn, true)
    for (const move of captures) {
      const { changes } = makeMove(b, move)
      const child = this.probeAb(b, oppositeColor(turn), -beta, -alpha)
      unmakeMove(b, changes)
      if (!child) return undefined

      const value = -child.value
      if (value > alpha) {
        if (value >= beta) return { value, success: 2 }
        alpha = value
      }
    }

    const value = this.probeWdlTable(b, turn)
    if (value === undefined) return undefined

    if (alpha >= value) {
      return { value: alpha, success: 1 + (alpha > 0 ? 1 : 0) }
    }
    return { value, success: 1 }
  }

  /**
   * 查询 WDL（-2..2，从走子方视角）。
   * 有吃过路兵目标时返回 undefined（本实现不做 ep 特殊处理）。
   */
  probeWdl(b: Board, turn: Color, hasEnPassant: boolean): number | undefined {
    if (hasEnPassant) return undefined
    const result = this.probeAb(b, turn, -2, 2)
    return result ? result.value : undefined
  }

  // ----------------------------------------------------------
  // DTZ
  // ----------------------------------------------------------
  private probeDtzTable(
    b: Board,
    turn: Color,
    wdl: number,
  ): { res: number; success: number } | undefined {
    const key = calcKey(b)
    const table = this.dtz.get(key)
    if (!table) {
      this.missingDtz.add(normalizeTablename(key))
      return undefined
    }
    return table.probeDtzTable(key, turn, squaresFromBoard(b), wdl)
  }

  private probeDtzNoEp(
    b: Board,
    turn: Color,
    halfmoveClock: number,
    depth = 0,
  ): number | undefined {
    if (depth > 64) return undefined
    const ab = this.probeAb(b, turn, -2, 2)
    if (!ab) return undefined
    const wdl = ab.value
    const success = ab.success

    if (wdl === 0) return 0
    if (success === 2) return dtzBeforeZeroing(wdl)

    if (wdl > 0) {
      // 走法本身即可"归零"（例如兵推进）时，DTZ 为 1 / 101
      if (success === 3) return wdl === 2 ? 2 : 102

      for (const move of this.generateMoves(b, turn, false)) {
        const piece = b[move.fromRow]![move.fromCol]
        if (piece?.type !== 'pawn') continue
        if (b[move.toRow]![move.toCol] !== null) continue // 吃过路兵另计

        const { changes } = makeMove(b, move)
        const childWdl = this.probeWdl(b, oppositeColor(turn), false)
        unmakeMove(b, changes)
        if (childWdl === undefined) return undefined

        const value = -childWdl
        if (value === wdl) return value === 2 ? 1 : 101
      }
    }

    const tableResult = this.probeDtzTable(b, turn, wdl)
    if (!tableResult) return undefined
    if (tableResult.success >= 0) {
      return dtzBeforeZeroing(wdl) + (wdl > 0 ? tableResult.res : -tableResult.res)
    }

    // 表中没有当前走子方的数据：需要自行搜索子局面
    if (wdl > 0) {
      let best = 0xffff
      for (const move of this.generateMoves(b, turn, false)) {
        const piece = b[move.fromRow]![move.fromCol]
        if (piece?.type === 'pawn') continue
        if (b[move.toRow]![move.toCol] !== null) continue

        const childClock = halfmoveClock + 1
        const { changes } = makeMove(b, move)
        const childDtz = this.probeDtzNoEp(b, oppositeColor(turn), childClock, depth + 1)
        const mate = childDtz !== undefined && this.isCheckmate(b, oppositeColor(turn))
        unmakeMove(b, changes)
        if (childDtz === undefined) return undefined

        const value = -childDtz
        if (value === 1 && mate) best = 1
        else if (value > 0 && value + 1 < best) best = value + 1
      }
      return best
    }

    let best = -1
    for (const move of this.generateMoves(b, turn, false)) {
      const piece = b[move.fromRow]![move.fromCol]
      // 吃子或兵着会把 50 步计数器归零
      const zeroing = piece?.type === 'pawn' || b[move.toRow]![move.toCol] !== null
      const childClock = zeroing ? 0 : halfmoveClock + 1

      const { changes } = makeMove(b, move)
      let value: number
      if (childClock === 0) {
        if (wdl === -2) {
          value = -1
        } else {
          const child = this.probeAb(b, oppositeColor(turn), 1, 2)
          if (!child) {
            unmakeMove(b, changes)
            return undefined
          }
          value = child.value === 2 ? 0 : -101
        }
      } else {
        const childDtz = this.probeDtzNoEp(b, oppositeColor(turn), childClock, depth + 1)
        if (childDtz === undefined) {
          unmakeMove(b, changes)
          return undefined
        }
        value = -childDtz - 1
      }
      unmakeMove(b, changes)

      if (value < best) best = value
    }
    return best
  }

  /**
   * 查询 DTZ（走子方视角，正数表示走子方占优）。
   * 有吃过路兵目标时返回 undefined（本实现不做 ep 特殊处理）。
   */
  probeDtz(b: Board, turn: Color, hasEnPassant: boolean, halfmoveClock = 0): number | undefined {
    if (hasEnPassant) return undefined
    return this.probeDtzNoEp(b, turn, halfmoveClock)
  }
}
