import type { AIDifficulty, AIStyle } from '../models/engine/types'
import { MAX_DEPTH } from '../models/engine/types'
import { searchPosition } from '../models/engine/search'
import { PositionState } from './position'
import {
  formatUciMove,
  parseGoCommand,
  parsePositionCommand,
  parseSetOption,
  type UciGoParams,
} from './protocol'

export interface UciEngineOptions {
  /** 输出一行 UCI 应答（不含换行符） */
  write: (line: string) => void
  name?: string
  author?: string
}

const STYLES: readonly AIStyle[] = ['balanced', 'aggressive', 'defensive', 'unpredictable']

/** 各强度等级的默认搜索时间（毫秒），与 App 端 searchState 的映射保持一致 */
const LEVEL_DEFAULT_TIME_MS: Record<number, number> = {
  1: 100,
  2: 200,
  3: 500,
  4: 1000,
  5: 2500,
}

/** 仅指定深度、未给时间时使用的“足够长”的时间上限，让深度而非时间决定何时停止 */
const DEPTH_ONLY_TIME_LIMIT_MS = 60_000

export class UciEngine {
  private readonly position = new PositionState()
  private level: AIDifficulty = 3
  private style: AIStyle = 'balanced'
  private useBook = true
  private useRandomness = true
  private syzygyPath = ''

  constructor(private readonly options: UciEngineOptions) {}

  /** 处理一行 UCI 命令；返回 false 表示应结束进程（quit） */
  async feed(line: string): Promise<boolean> {
    const trimmed = line.trim()
    if (!trimmed) return true

    const spaceIndex = trimmed.indexOf(' ')
    const command = (spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex)).toLowerCase()
    const rest = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1)

    switch (command) {
      case 'uci':
        this.handleUci()
        break
      case 'isready':
        this.write('readyok')
        break
      case 'ucinewgame':
        this.position.setStartpos()
        break
      case 'position':
        this.handlePosition(rest)
        break
      case 'setoption':
        this.handleSetOption(rest)
        break
      case 'go':
        await this.handleGo(rest)
        break
      case 'stop':
        // 本引擎为同步搜索：搜索期间主线程被占用，无法在本进程内响应 stop。
        // 保留该命令以避免 GUI 报错；GUI 可用 movetime / 时间控制绕开。
        break
      case 'ponderhit':
      case 'debug':
      case 'register':
        break
      case 'quit':
        return false
      default:
        this.write(`info string unknown command: ${command}`)
        break
    }

    return true
  }

  private write(line: string): void {
    this.options.write(line)
  }

  private handleUci(): void {
    this.write(`id name ${this.options.name ?? 'ChessDragon'}`)
    this.write(`id author ${this.options.author ?? 'ChessDragon'}`)
    this.write('option name Level type spin default 3 min 1 max 5')
    this.write(
      'option name Style type combo default balanced var balanced var aggressive var defensive var unpredictable',
    )
    this.write('option name UseBook type check default true')
    this.write('option name Randomness type check default true')
    this.write('option name SyzygyPath type string default <empty>')
    this.write('uciok')
  }

  private handleSetOption(rest: string): void {
    const option = parseSetOption(rest)
    if (!option) return

    switch (option.name.toLowerCase()) {
      case 'level': {
        const value = Number(option.value)
        if (Number.isFinite(value) && value >= 1 && value <= 5) {
          this.level = Math.round(value) as AIDifficulty
        }
        break
      }
      case 'style':
        if ((STYLES as readonly string[]).includes(option.value)) {
          this.style = option.value as AIStyle
        }
        break
      case 'usebook':
        this.useBook = parseBool(option.value)
        break
      case 'randomness':
        this.useRandomness = parseBool(option.value)
        break
      case 'syzygypath':
        this.syzygyPath = option.value === '<empty>' ? '' : option.value
        break
      default:
        break
    }
  }

  private handlePosition(rest: string): void {
    const command = parsePositionCommand(rest)
    if (!command) {
      this.write('info string invalid position command')
      return
    }

    if (command.kind === 'startpos') {
      this.position.setStartpos()
    } else if (!command.fen || !this.position.setFen(command.fen)) {
      this.write('info string invalid fen')
      return
    }

    for (const uci of command.moves) {
      if (!this.position.applyUciMove(uci)) {
        this.write(`info string illegal move: ${uci}`)
        break
      }
    }
  }
  private async handleGo(rest: string): Promise<void> {
    const params = parseGoCommand(rest)
    const timeLimitMs = this.resolveTimeLimit(params)
    const maxDepth =
      params.depth !== undefined && params.depth > 0
        ? Math.min(Math.floor(params.depth), MAX_DEPTH)
        : undefined

    let bestMove: Awaited<ReturnType<typeof searchPosition>> = null
    try {
      bestMove = await searchPosition({
        board: this.position.board,
        color: this.position.turn,
        difficulty: this.level,
        style: this.style,
        lastMove: this.position.lastMove,
        positionHistory: this.position.snapshotHistory(),
        maxDepth,
        timeLimitMs,
        useOpeningBook: this.useBook,
        useRandomness: this.useRandomness,
      })
    } catch (err) {
      this.write(`info string search error: ${String(err)}`)
    }

    this.write(`bestmove ${bestMove ? formatUciMove(bestMove) : '0000'}`)
  }

  /**
   * 计算本步搜索的时间预算（毫秒）。
   * 优先级：movetime > 时间控制(wtime/btime) > 仅 depth > 等级默认时间。
   */
  private resolveTimeLimit(params: UciGoParams): number | undefined {
    if (params.movetime !== undefined && params.movetime > 0) {
      // 预留少量开销，避免超时
      return Math.max(1, Math.floor(params.movetime) - 10)
    }

    if (params.wtime !== undefined || params.btime !== undefined) {
      const isWhite = this.position.turn === 'white'
      const remaining = (isWhite ? params.wtime : params.btime) ?? 0
      const increment = (isWhite ? params.winc : params.binc) ?? 0
      const movesToGo = params.movestogo && params.movestogo > 0 ? params.movestogo : 30
      const budget = remaining / movesToGo + increment * 0.8
      return Math.max(10, Math.min(budget, remaining * 0.8))
    }

    if (params.depth !== undefined && params.depth > 0) {
      return DEPTH_ONLY_TIME_LIMIT_MS
    }

    if (params.infinite) {
      // 不支持真·无限搜索；退化为等级默认时间
      return LEVEL_DEFAULT_TIME_MS[this.level] ?? 500
    }

    // 交由 initSearchState 按等级推导
    return undefined
  }

  /** 当前配置的残局库路径（供 Node 适配层按需加载） */
  get syzygyPathValue(): string {
    return this.syzygyPath
  }
}

function parseBool(value: string): boolean {
  const v = value.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'on'
}
