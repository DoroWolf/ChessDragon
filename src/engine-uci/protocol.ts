export interface UciMove {
  fromRow: number
  fromCol: number
  toRow: number
  toCol: number
  promotion?: 'queen' | 'knight' | 'rook' | 'bishop'
}

const PROMOTION_CHARS: Record<string, 'queen' | 'knight' | 'rook' | 'bishop'> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
}

const PROMOTION_LETTERS: Record<string, string> = {
  queen: 'q',
  rook: 'r',
  bishop: 'b',
  knight: 'n',
}

/** 解析 UCI 坐标走法，如 "e2e4"、"e7e8q"；非法返回 null */
export function parseUciMove(text: string): UciMove | null {
  const s = text.trim().toLowerCase()
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(s)) return null

  const fromCol = s.charCodeAt(0) - 97
  const fromRow = 8 - Number(s[1])
  const toCol = s.charCodeAt(2) - 97
  const toRow = 8 - Number(s[3])
  const promoChar = s[4]

  return {
    fromRow,
    fromCol,
    toRow,
    toCol,
    promotion: promoChar ? PROMOTION_CHARS[promoChar] : undefined,
  }
}

/** 把带行列坐标的走法格式化为 UCI 字符串 */
export function formatUciMove(move: {
  fromRow: number
  fromCol: number
  toRow: number
  toCol: number
  promotion?: string
}): string {
  const file = (c: number): string => String.fromCharCode(97 + c)
  const rank = (r: number): string => String(8 - r)
  const promo = move.promotion ? (PROMOTION_LETTERS[move.promotion] ?? '') : ''
  return `${file(move.fromCol)}${rank(move.fromRow)}${file(move.toCol)}${rank(move.toRow)}${promo}`
}

/** 解析后的 position 命令 */
export interface UciPositionCommand {
  kind: 'startpos' | 'fen'
  fen?: string
  moves: string[]
}

/** 解析 `position` 命令参数（不含命令本身） */
export function parsePositionCommand(rest: string): UciPositionCommand | null {
  const tokens = rest.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null

  let idx = 0
  let kind: 'startpos' | 'fen'
  let fen: string | undefined

  if (tokens[0] === 'startpos') {
    kind = 'startpos'
    idx = 1
  } else if (tokens[0] === 'fen') {
    kind = 'fen'
    const movesIdx = tokens.indexOf('moves')
    const fenEnd = movesIdx === -1 ? tokens.length : movesIdx
    fen = tokens.slice(1, fenEnd).join(' ')
    if (!fen) return null
    idx = fenEnd
  } else {
    return null
  }

  const moves: string[] = []
  if (tokens[idx] === 'moves') {
    for (let i = idx + 1; i < tokens.length; i++) moves.push(tokens[i]!)
  }

  return { kind, fen, moves }
}

/** 解析后的 go 命令参数 */
export interface UciGoParams {
  wtime?: number
  btime?: number
  winc?: number
  binc?: number
  movestogo?: number
  depth?: number
  nodes?: number
  movetime?: number
  infinite?: boolean
}

function numberOrUndefined(v: string | undefined): number | undefined {
  if (v === undefined) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** 解析 `go` 命令参数（不含命令本身） */
export function parseGoCommand(args: string): UciGoParams {
  const params: UciGoParams = {}
  const tokens = args.trim().split(/\s+/).filter(Boolean)

  for (let i = 0; i < tokens.length; i++) {
    const key = tokens[i]
    const value = tokens[i + 1]
    switch (key) {
      case 'wtime':
        params.wtime = numberOrUndefined(value)
        i++
        break
      case 'btime':
        params.btime = numberOrUndefined(value)
        i++
        break
      case 'winc':
        params.winc = numberOrUndefined(value)
        i++
        break
      case 'binc':
        params.binc = numberOrUndefined(value)
        i++
        break
      case 'movestogo':
        params.movestogo = numberOrUndefined(value)
        i++
        break
      case 'depth':
        params.depth = numberOrUndefined(value)
        i++
        break
      case 'nodes':
        params.nodes = numberOrUndefined(value)
        i++
        break
      case 'movetime':
        params.movetime = numberOrUndefined(value)
        i++
        break
      case 'infinite':
        params.infinite = true
        break
      default:
        break
    }
  }

  return params
}

/** 解析后的 setoption 命令 */
export interface SetOptionCommand {
  name: string
  value: string
}

/** 解析 `setoption name <X> value <Y>` 参数（不含命令本身） */
export function parseSetOption(rest: string): SetOptionCommand | null {
  const match = /^\s*name\s+(.*?)(?:\s+value\s+(.*))?\s*$/i.exec(rest)
  if (!match) return null
  return { name: match[1]!.trim(), value: (match[2] ?? '').trim() }
}
