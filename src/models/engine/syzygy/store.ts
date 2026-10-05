import type { Board, Color } from '../../chess'
import { makeMove, unmakeMove } from '../boardChange'
import type { AIDetailedMove } from '../types'
import { Tablebase, calcKey, oppositeColor, pieceCount } from './tablebase'
import { normalizeTablename } from './tables'

export type TableLoader = (fileName: string) => Promise<Uint8Array | null>

export const SYZYGY_MIN_LEVEL = 3

export const TB_WIN_SCORE = 60000
export const TB_CURSED_WIN_SCORE = 55000

export function wdlToScore(wdl: number): number {
  if (wdl >= 2) return TB_WIN_SCORE
  if (wdl === 1) return TB_CURSED_WIN_SCORE
  if (wdl === -1) return -TB_CURSED_WIN_SCORE
  if (wdl <= -2) return -TB_WIN_SCORE
  return 0
}

export function maxWdlPieces(level: number): number {
  if (level >= 4) return 5
  if (level >= 3) return 4
  return 0
}

const DTZ_LEVEL3 = ['KQvK', 'KRvK', 'KPvK']
const DTZ_LEVEL4 = ['KBBvK', 'KPvKP', 'KPPvK']

export function wdlAllowed(level: number, tablename: string): boolean {
  const key = normalizeTablename(tablename)
  if (key === 'KBNvK' && level < 5) return false
  const max = maxWdlPieces(level)
  if (max === 0) return false
  return key.length - 1 <= max
}

export function dtzAllowed(level: number, tablename: string): boolean {
  const key = normalizeTablename(tablename)
  if (level >= 5) return true
  if (level >= 4) return DTZ_LEVEL3.includes(key) || DTZ_LEVEL4.includes(key)
  if (level >= 3) return DTZ_LEVEL3.includes(key)
  return false
}

const MAX_FILES_PER_PREPARE = 6
const MAX_LOADED_BYTES = 96 * 1024 * 1024


export class SyzygyStore {
  private tb = new Tablebase()
  private loader: TableLoader | null
  private level = 0

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

  async prepare(board: Board, turn: Color, hasEnPassant: boolean): Promise<void> {
    if (!this.active || hasEnPassant) return
    const total = pieceCount(board)
    if (total > maxWdlPieces(this.level) || total < 3) return

    for (let attempt = 0; attempt < 4; attempt++) {
      this.tb.beginProbe()
      const rootWdl = this.probeWdl(board, turn, false)
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

  probeWdl(board: Board, turn: Color, hasEnPassant: boolean): number | undefined {
    if (!this.active || hasEnPassant) return undefined
    const max = maxWdlPieces(this.level)
    if (max === 0) return undefined

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

  findMoveHint(
    board: Board,
    turn: Color,
    moves: AIDetailedMove[],
    hasEnPassant: boolean,
  ): AIDetailedMove | null {
    if (!this.active || hasEnPassant) return null

    this.tb.beginProbe()
    const rootWdl = this.tb.probeWdl(board, turn, false)
    if (rootWdl === undefined || rootWdl < 2) return null

    if (!dtzAllowed(this.level, calcKey(board))) return null

    let bestMove: AIDetailedMove | null = null
    let bestWdl = -3
    let bestDtz = Number.POSITIVE_INFINITY
    let bestZeroing = false
    let sawDtz = false

    for (const move of moves) {
      const movingPiece = board[move.fromRow]![move.fromCol]
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
      if (wdl < 2) continue
      if (dtz !== undefined) sawDtz = true

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

    if (!sawDtz) return null

    return bestMove
  }
}

const store = new SyzygyStore()

export function getSyzygyStore(): SyzygyStore {
  return store
}

export function setSyzygyLoader(loader: TableLoader | null): void {
  store.setLoader(loader)
}
