// ============================================================
// Syzygy Tablebase - 运行时管理器（等级门槛 + 按需懒加载）
//
// 等级门槛（按需求设定）：
//   3 级：3-4 子 WDL（KBNK 除外）+ KQK / KRK / KPvK 的 DTZ
//   4 级：3-5 子 WDL（KBNK 除外）+ KQK / KRK / KPvK / KBBK / 王兵残局的 DTZ
//   5 级：全部开放
//
// 说明：KBNK 在 3-4 级只使用内置残局知识和搜索；5 级才开放 Syzygy。
// DTZ 仅用于根节点走法排序提示，不直接决定最终走法。
//
// 表文件体积很大（单个最大 ~20MB），因此：
//   * 只有当前局面确实可用时才加载对应材料表
//   * 通过 "缺失表记录 -> 加载 -> 重试" 的方式按需补齐吃子依赖
//   * 带 LRU 上限，避免内存无限增长
// ============================================================
import type { Board, Color } from '../../chess'
import { makeMove, unmakeMove } from '../boardChange'
import type { AIDetailedMove } from '../types'
import { Tablebase, calcKey, oppositeColor, pieceCount } from './tablebase'
import { normalizeTablename } from './tables'

/** 从文件名（如 KQvKR.rtbw）加载字节；返回 null 表示该文件不存在 */
export type TableLoader = (fileName: string) => Promise<Uint8Array | null>

/** 使用残局库所需的最低 AI 等级 */
export const SYZYGY_MIN_LEVEL = 3

/**
 * 残局库分值：作为"胜负等级"的基准分，低于将杀分（MATE_SCORE = 99999），
 * 高于任何普通评估。
 *
 * 注意：这不是"最终分值"，评估函数会在此基础上继续叠加启发式分
 * （见 evaluation.ts）。残局库局面最多 5 子，启发式分（子力 + PST + 残局知识）
 * 的绝对值远小于 2500，因此各类别之间必须留出足够的间隔：
 * 5000 的间隔足以保证 胜 > 幸胜 > 和 > 幸负 > 负 的严格排序。
 */
export const TB_WIN_SCORE = 60000
export const TB_CURSED_WIN_SCORE = 55000

/** 把 WDL 值转换为评估分（走子方视角） */
export function wdlToScore(wdl: number): number {
  if (wdl >= 2) return TB_WIN_SCORE
  if (wdl === 1) return TB_CURSED_WIN_SCORE
  if (wdl === -1) return -TB_CURSED_WIN_SCORE
  if (wdl <= -2) return -TB_WIN_SCORE
  return 0
}

/** 各等级允许使用 WDL 的最大子力数（0 表示完全不使用残局库） */
export function maxWdlPieces(level: number): number {
  if (level >= 4) return 5
  if (level >= 3) return 4
  return 0
}

/** 3 级开放的 DTZ 表 */
const DTZ_LEVEL3 = ['KQvK', 'KRvK', 'KPvK']
/** 4 级在 3 级基础上追加的 DTZ 表 */
const DTZ_LEVEL4_EXTRA = ['KBBvK', 'KPvKP', 'KPPvK']

/** 该等级是否允许使用指定的 WDL 表 */
export function wdlAllowed(level: number, tablename: string): boolean {
  const key = normalizeTablename(tablename)
  if (key === 'KBNvK' && level < 5) return false
  const max = maxWdlPieces(level)
  if (max === 0) return false
  return key.length - 1 <= max
}

/** 该等级是否允许使用指定的 DTZ 表 */
export function dtzAllowed(level: number, tablename: string): boolean {
  const key = normalizeTablename(tablename)
  if (level >= 5) return true
  if (level >= 4) return DTZ_LEVEL3.includes(key) || DTZ_LEVEL4_EXTRA.includes(key)
  if (level >= 3) return DTZ_LEVEL3.includes(key)
  return false
}

/** 单次查询最多加载的表文件数（防止一次加载过多大文件） */
const MAX_FILES_PER_PREPARE = 6
/** 已加载表文件的总字节上限（超出后按 LRU 淘汰） */
const MAX_LOADED_BYTES = 96 * 1024 * 1024


export class SyzygyStore {
  private tb = new Tablebase()
  private loader: TableLoader | null
  private level = 0

  /** 已加载文件名 -> 字节数（Map 顺序即 LRU 顺序，最近使用的在末尾） */
  private loaded = new Map<string, number>()
  private loadedBytes = 0
  private inflight = new Map<string, Promise<Uint8Array | null>>()

  constructor(loader: TableLoader | null = null) {
    this.loader = loader
  }

  setLoader(loader: TableLoader | null): void {
    this.loader = loader
    this.reset()
  }

  /** 设置 AI 等级；等级变化会清空已加载的表 */
  setLevel(level: number): void {
    if (level === this.level) return
    this.level = level
    this.reset()
  }

  get currentLevel(): number {
    return this.level
  }

  get active(): boolean {
    return this.level >= SYZYGY_MIN_LEVEL && this.loader !== null
  }

  get tablebase(): Tablebase {
    return this.tb
  }

  private reset(): void {
    this.tb.clear()
    this.loaded.clear()
    this.loadedBytes = 0
  }

  // ----------------------------------------------------------
  // 文件加载
  // ----------------------------------------------------------
  private async fetchFile(fileName: string): Promise<Uint8Array | null> {
    const existing = this.inflight.get(fileName)
    if (existing) return existing

    const promise = (async () => {
      try {
        return this.loader ? await this.loader(fileName) : null
      } catch {
        return null
      } finally {
        this.inflight.delete(fileName)
      }
    })()

    this.inflight.set(fileName, promise)
    return promise
  }

  private track(fileName: string, bytes: number): void {
    this.loaded.set(fileName, bytes)
    this.loadedBytes += bytes

    // LRU 淘汰（至少保留一个文件）
    while (this.loadedBytes > MAX_LOADED_BYTES && this.loaded.size > 1) {
      const oldest = this.loaded.keys().next().value as string | undefined
      if (!oldest) break
      const size = this.loaded.get(oldest) ?? 0
      this.loaded.delete(oldest)
      this.loadedBytes -= size
      const key = oldest.replace(/\.(rtbw|rtbz)$/, '')
      if (oldest.endsWith('.rtbw')) this.tb.removeWdl(key)
      else this.tb.removeDtz(key)
    }
  }

  private async loadWdl(key: string): Promise<boolean> {
    const base = normalizeTablename(key)
    if (!wdlAllowed(this.level, base)) return false
    if (this.tb.hasWdl(base)) return true

    const fileName = `${base}.rtbw`
    const data = await this.fetchFile(fileName)
    if (!data) return false
    this.tb.addWdl(base, data)
    this.track(fileName, data.byteLength)
    return true
  }

  private async loadDtz(key: string): Promise<boolean> {
    const base = normalizeTablename(key)
    if (!dtzAllowed(this.level, base)) return false
    if (this.tb.hasDtz(base)) return true

    const fileName = `${base}.rtbz`
    const data = await this.fetchFile(fileName)
    if (!data) return false
    this.tb.addDtz(base, data)
    this.track(fileName, data.byteLength)
    return true
  }

  // ----------------------------------------------------------
  // 查询准备：按需补齐缺失的表
  // ----------------------------------------------------------
  async prepare(board: Board, turn: Color, hasEnPassant: boolean): Promise<void> {
    if (!this.active || hasEnPassant) return
    const total = pieceCount(board)
    if (total > maxWdlPieces(this.level) || total < 3) return

    for (let attempt = 0; attempt < 4; attempt++) {
      this.tb.beginProbe()
      const rootWdl = this.probeWdl(board, turn, false)
      // DTZ 只为"必胜"局面的根节点搜索提供走法排序提示，
      // 和棋 / 幸胜 / 败势局面无需加载体积庞大的 DTZ 表。
      if (rootWdl !== undefined && rootWdl >= 2) {
        this.probeDtz(board, turn, false, 0)
      }

      const wanted: Array<{ key: string; dtz: boolean }> = []
      for (const key of this.tb.missingWdl) wanted.push({ key, dtz: false })
      for (const key of this.tb.missingDtz) wanted.push({ key, dtz: true })
      if (wanted.length === 0) return

      let loadedAny = false
      let count = 0
      for (const item of wanted) {
        if (count >= MAX_FILES_PER_PREPARE) break
        const already = item.dtz ? this.tb.hasDtz(item.key) : this.tb.hasWdl(item.key)
        if (already) continue
        count++
        const ok = item.dtz ? await this.loadDtz(item.key) : await this.loadWdl(item.key)
        if (ok) loadedAny = true
      }
      if (!loadedAny) return
    }
  }

  // ----------------------------------------------------------
  // 同步探测（供搜索使用）
  // ----------------------------------------------------------
  probeWdl(board: Board, turn: Color, hasEnPassant: boolean): number | undefined {
    if (!this.active || hasEnPassant) return undefined
    const max = maxWdlPieces(this.level)
    if (max === 0) return undefined

    // 早退式统计子力数：常规局面扫到第 max+1 个子就返回，几乎零开销
    let count = 0
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (!board[row]![col]) continue
        if (++count > max) return undefined
      }
    }
    if (count < 3) return undefined

    return this.tb.probeWdl(board, turn, false)
  }

  probeDtz(
    board: Board,
    turn: Color,
    hasEnPassant: boolean,
    halfmoveClock = 0,
  ): number | undefined {
    if (!this.active || hasEnPassant) return undefined
    if (!dtzAllowed(this.level, calcKey(board))) return undefined
    return this.tb.probeDtz(board, turn, false, halfmoveClock)
  }

  /**
   * 为根节点搜索挑选一个 DTZ 走法提示；真正的走法仍由引擎搜索决定。
   * 只在 WDL 必胜且可用 DTZ 时提示优先搜索更快取胜/归零的候选着法。
   */
  findMoveHint(
    board: Board,
    turn: Color,
    moves: AIDetailedMove[],
    hasEnPassant: boolean,
  ): AIDetailedMove | null {
    if (!this.active || hasEnPassant) return null

    this.tb.beginProbe()
    const rootWdl = this.tb.probeWdl(board, turn, false)
    // 仅"必胜"才作为将杀参考；其余交回引擎
    if (rootWdl === undefined || rootWdl < 2) return null

    // DTZ 只是"避免 50 步杀 / 取最快将杀"的提示：该等级没有 DTZ 表就不接管
    if (!dtzAllowed(this.level, calcKey(board))) return null

    let bestMove: AIDetailedMove | null = null
    let bestWdl = -3
    let bestDtz = Number.POSITIVE_INFINITY
    let bestZeroing = false
    /** 是否真的取到了 DTZ 信息（否则说明 DTZ 表缺失，应放弃接管） */
    let sawDtz = false

    for (const move of moves) {
      const movingPiece = board[move.fromRow]![move.fromCol]
      // 归零着法：兵着或吃子（会把 50 步计数器清零，保证有进展）
      const zeroing =
        movingPiece?.type === 'pawn' ||
        board[move.toRow]![move.toCol] !== null ||
        move.special === 'enPassant'

      const { changes, newEnPassantTarget } = makeMove(board, move)
      const child = oppositeColor(turn)

      const childWdl = this.tb.probeWdl(board, child, false)
      let dtz: number | undefined
      if (childWdl !== undefined && dtzAllowed(this.level, calcKey(board))) {
        const childDtz = this.tb.probeDtz(board, child, newEnPassantTarget !== null, 0)
        if (childDtz !== undefined) dtz = -childDtz
      }
      unmakeMove(board, changes)

      if (childWdl === undefined) continue
      const wdl = -childWdl
      // 必胜局面里只考虑仍保住胜势的走法
      if (wdl < 2) continue
      if (dtz !== undefined) sawDtz = true

      // 排序规则：同为胜势时优先"归零着法"（DTZ 常有 ±1 舍入，
      // 单靠 DTZ 无法区分时会导致原地打转）；最后比 DTZ（越小越快）
      const better =
        wdl > bestWdl ||
        (wdl === bestWdl &&
          ((zeroing && !bestZeroing) ||
            (zeroing === bestZeroing && dtz !== undefined && dtz < bestDtz)))

      if (better) {
        bestWdl = wdl
        bestDtz = dtz ?? Number.POSITIVE_INFINITY
        bestZeroing = zeroing
        bestMove = move
      }
    }

    // 完全没有 DTZ 数据时，说明 DTZ 表没准备好：交回引擎（残局知识/评估更可靠）
    if (!sawDtz) return null

    return bestMove
  }
}

// ============================================================
// 全局单例（搜索与评估共用）
// ============================================================
const store = new SyzygyStore()

export function getSyzygyStore(): SyzygyStore {
  return store
}

/** 由宿主环境注入表文件加载器（浏览器 worker / Node 测试脚本） */
export function setSyzygyLoader(loader: TableLoader | null): void {
  store.setLoader(loader)
}
