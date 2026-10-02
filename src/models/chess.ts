export type Color = 'white' | 'black'
export type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king'

export interface Piece {
  type: PieceType
  color: Color
  hasMoved: boolean
}

export type Board = Array<Array<Piece | null>>

export interface Square {
  row: number
  col: number
}

export interface Move {
  row: number
  col: number
  special?: 'castle' | 'enPassant'
  rookFrom?: Square
  rookTo?: Square
  givesCheck?: boolean
}

export interface MoveOptions {
  lastMove?: { from: Square; to: Square; piece?: Piece } | null
  enPassantTarget?: Square | null
}

const makePiece = (type: PieceType, color: Color): Piece => ({ type, color, hasMoved: false })
export const createInitialBoard = (): Board => [
  [
    makePiece('rook', 'black'),
    makePiece('knight', 'black'),
    makePiece('bishop', 'black'),
    makePiece('queen', 'black'),
    makePiece('king', 'black'),
    makePiece('bishop', 'black'),
    makePiece('knight', 'black'),
    makePiece('rook', 'black'),
  ],
  Array.from({ length: 8 }, () => makePiece('pawn', 'black')),
  Array.from({ length: 8 }, () => null),
  Array.from({ length: 8 }, () => null),
  Array.from({ length: 8 }, () => null),
  Array.from({ length: 8 }, () => null),
  Array.from({ length: 8 }, () => makePiece('pawn', 'white')),
  [
    makePiece('rook', 'white'),
    makePiece('knight', 'white'),
    makePiece('bishop', 'white'),
    makePiece('queen', 'white'),
    makePiece('king', 'white'),
    makePiece('bishop', 'white'),
    makePiece('knight', 'white'),
    makePiece('rook', 'white'),
  ],
]

const inBounds = (row: number, col: number): boolean => row >= 0 && row < 8 && col >= 0 && col < 8
const isEnemy = (source: Piece, target: Piece | null): boolean =>
  target !== null && source.color !== target.color

export const isWhiteSquare = (row: number, col: number): boolean => (row + col) % 2 === 0

export const cloneBoard = (board: Board): Board => board.map((row) => row.slice())

export const getEnPassantTarget = (
  lastMove: { from: Square; to: Square } | null,
): Square | null => {
  if (!lastMove) {
    return null
  }

  if (Math.abs(lastMove.to.row - lastMove.from.row) !== 2) {
    return null
  }

  return {
    row: (lastMove.from.row + lastMove.to.row) / 2,
    col: lastMove.to.col,
  }
}

const isSquareAttacked = (
  board: Board,
  row: number,
  col: number,
  attackerColor: Color,
): boolean => {
  const pawnDirection = attackerColor === 'white' ? 1 : -1

  const pawnOffsets: Array<[number, number]> = [
    [pawnDirection, -1],
    [pawnDirection, 1],
  ]

  for (const [dRow, dCol] of pawnOffsets) {
    const pawnRow = row + dRow
    const pawnCol = col + dCol
    if (!inBounds(pawnRow, pawnCol)) {
      continue
    }

    const pawn = board[pawnRow]?.[pawnCol] ?? null
    if (pawn?.type === 'pawn' && pawn.color === attackerColor) {
      return true
    }
  }

  const knightOffsets: Array<[number, number]> = [
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
  ]

  for (const [dRow, dCol] of knightOffsets) {
    const knightRow = row + dRow
    const knightCol = col + dCol
    if (!inBounds(knightRow, knightCol)) {
      continue
    }

    const knight = board[knightRow]?.[knightCol] ?? null
    if (knight?.type === 'knight' && knight.color === attackerColor) {
      return true
    }
  }

  const directions: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]

  for (const [dRow, dCol] of directions) {
    let currentRow = row + dRow
    let currentCol = col + dCol

    while (inBounds(currentRow, currentCol)) {
      const piece = board[currentRow]?.[currentCol] ?? null
      if (!piece) {
        currentRow += dRow
        currentCol += dCol
        continue
      }

      const isDiagonal = Math.abs(dRow) === 1 && Math.abs(dCol) === 1
      const isStraight = dRow === 0 || dCol === 0

      if (piece.color === attackerColor) {
        if (
          (isDiagonal && (piece.type === 'bishop' || piece.type === 'queen')) ||
          (isStraight && (piece.type === 'rook' || piece.type === 'queen'))
        ) {
          return true
        }
      }

      break
    }
  }

  const kingOffsets: Array<[number, number]> = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ]

  for (const [dRow, dCol] of kingOffsets) {
    const kingRow = row + dRow
    const kingCol = col + dCol
    if (!inBounds(kingRow, kingCol)) {
      continue
    }

    const king = board[kingRow]?.[kingCol] ?? null
    if (king?.type === 'king' && king.color === attackerColor) {
      return true
    }
  }

  return false
}

export const getPieceMoves = (
  board: Board,
  row: number,
  col: number,
  options?: MoveOptions,
): Move[] => {
  const piece = board[row]?.[col] ?? null
  if (!piece) {
    return []
  }

  const moves: Move[] = []

  const addMove = (targetRow: number, targetCol: number): boolean => {
    if (!inBounds(targetRow, targetCol)) {
      return false
    }

    const target = board[targetRow]?.[targetCol] ?? null
    if (target === null) {
      moves.push({ row: targetRow, col: targetCol })
      return true
    }

    if (isEnemy(piece, target)) {
      moves.push({ row: targetRow, col: targetCol })
    }

    return false
  }

  const addLine = (rowStep: number, colStep: number): void => {
    let currentRow = row + rowStep
    let currentCol = col + colStep
    while (inBounds(currentRow, currentCol)) {
      if (!addMove(currentRow, currentCol)) {
        break
      }
      currentRow += rowStep
      currentCol += colStep
    }
  }

  switch (piece.type) {
    case 'pawn': {
      const direction = piece.color === 'white' ? -1 : 1
      const startRow = piece.color === 'white' ? 6 : 1
      const forwardRow = row + direction

      if (inBounds(forwardRow, col) && board[forwardRow]?.[col] === null) {
        moves.push({ row: forwardRow, col })

        const doubleForward = row + direction * 2
        if (
          row === startRow &&
          inBounds(doubleForward, col) &&
          board[doubleForward]?.[col] === null
        ) {
          moves.push({ row: doubleForward, col })
        }
      }

      for (const colStep of [-1, 1]) {
        const captureCol = col + colStep
        const captureTarget = board[forwardRow]?.[captureCol] ?? null
        const enPassantTarget =
          options?.enPassantTarget ?? getEnPassantTarget(options?.lastMove ?? null)
        const enPassantPiece = board[row]?.[captureCol] ?? null

        if (inBounds(forwardRow, captureCol) && isEnemy(piece, captureTarget)) {
          moves.push({ row: forwardRow, col: captureCol })
        }

        if (
          inBounds(forwardRow, captureCol) &&
          board[forwardRow]?.[captureCol] === null &&
          enPassantTarget &&
          forwardRow === enPassantTarget.row &&
          captureCol === enPassantTarget.col &&
          enPassantPiece &&
          enPassantPiece.type === 'pawn' &&
          isEnemy(piece, enPassantPiece)
        ) {
          moves.push({ row: forwardRow, col: captureCol, special: 'enPassant' })
        }
      }
      break
    }

    case 'knight': {
      const offsets: Array<[number, number]> = [
        [2, 1],
        [2, -1],
        [-2, 1],
        [-2, -1],
        [1, 2],
        [1, -2],
        [-1, 2],
        [-1, -2],
      ]
      for (const [dRow, dCol] of offsets) {
        const targetRow = row + dRow
        const targetCol = col + dCol
        if (inBounds(targetRow, targetCol)) {
          const target = board[targetRow]?.[targetCol] ?? null
          if (target === null || isEnemy(piece, target)) {
            moves.push({ row: targetRow, col: targetCol })
          }
        }
      }
      break
    }

    case 'bishop': {
      addLine(1, 1)
      addLine(1, -1)
      addLine(-1, 1)
      addLine(-1, -1)
      break
    }

    case 'rook': {
      addLine(1, 0)
      addLine(-1, 0)
      addLine(0, 1)
      addLine(0, -1)
      break
    }

    case 'queen': {
      addLine(1, 0)
      addLine(-1, 0)
      addLine(0, 1)
      addLine(0, -1)
      addLine(1, 1)
      addLine(1, -1)
      addLine(-1, 1)
      addLine(-1, -1)
      break
    }

    case 'king': {
      for (const dRow of [-1, 0, 1]) {
        for (const dCol of [-1, 0, 1]) {
          if (dRow === 0 && dCol === 0) {
            continue
          }
          const targetRow = row + dRow
          const targetCol = col + dCol
          if (inBounds(targetRow, targetCol)) {
            const target = board[targetRow]?.[targetCol] ?? null
            if (target === null || isEnemy(piece, target)) {
              moves.push({ row: targetRow, col: targetCol })
            }
          }
        }
      }

      if (!piece.hasMoved && (row === 0 || row === 7)) {
        const enemyColor: Color = piece.color === 'white' ? 'black' : 'white'
        const homeRow = piece.color === 'white' ? 7 : 0

        for (const direction of [-1, 1]) {
          let rookCol = col + direction
          while (inBounds(row, rookCol)) {
            const candidate = board[row]?.[rookCol] ?? null
            if (candidate) {
              if (
                candidate.type === 'rook' &&
                candidate.color === piece.color &&
                !candidate.hasMoved
              ) {
                const kingToCol = direction > 0 ? 6 : 2
                const rookToCol = direction > 0 ? 5 : 3
                const pathIsClear = [kingToCol, rookToCol].every((destination) => {
                  const startCol = destination === kingToCol ? col : rookCol
                  const step = Math.sign(destination - startCol)
                  if (step === 0) return true
                  for (let pathCol = startCol + step; pathCol !== destination + step; pathCol += step) {
                    const occupant = board[row]?.[pathCol] ?? null
                    if (occupant && pathCol !== col && pathCol !== rookCol) return false
                  }
                  return true
                })

                let kingPathIsSafe = pathIsClear
                const kingStep = Math.sign(kingToCol - col)
                for (
                  let kingCol = col;
                  kingPathIsSafe && kingStep !== 0 && kingCol !== kingToCol + kingStep;
                  kingCol += kingStep
                ) {
                  const transitBoard = cloneBoard(board)
                  transitBoard[row]![col] = null
                  if (kingCol === rookCol) transitBoard[row]![rookCol] = null
                  transitBoard[row]![kingCol] = { ...piece, hasMoved: true }
                  kingPathIsSafe = !isSquareAttacked(transitBoard, row, kingCol, enemyColor)
                }

                if (kingPathIsSafe && row === homeRow) {
                  moves.push({
                    row,
                    col: kingToCol,
                    special: 'castle',
                    rookFrom: { row, col: rookCol },
                    rookTo: { row, col: rookToCol },
                  })
                }
              }
              break
            }
            rookCol += direction
          }
        }
      }
      break
    }
  }

  return moves
}

export const isKingInCheck = (board: Board, color: Color): boolean => {
  let kingPos: Square | null = null
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r]?.[c] ?? null
      if (p && p.type === 'king' && p.color === color) {
        kingPos = { row: r, col: c }
        break
      }
    }
    if (kingPos) break
  }

  if (!kingPos) return false

  const enemyColor: Color = color === 'white' ? 'black' : 'white'
  return isSquareAttacked(board, kingPos.row, kingPos.col, enemyColor)
}

export const getLegalMoves = (
  board: Board,
  row: number,
  col: number,
  options?: MoveOptions,
): Move[] => {
  const piece = board[row]?.[col] ?? null
  if (!piece) return []

  const rawMoves = getPieceMoves(board, row, col, options)
  const legal: Move[] = []
  const enemyColor: Color = piece.color === 'white' ? 'black' : 'white'

  for (const m of rawMoves) {
    const b = cloneBoard(board)

    if (m.special === 'castle' && m.rookFrom && m.rookTo) {
      const rook = b[row]?.[m.rookFrom.col] ?? null
      b[row]![col] = null
      b[m.rookFrom.row]![m.rookFrom.col] = null
      b[m.row]![m.col] = { ...piece, hasMoved: true }
      if (rook) {
        b[m.rookTo.row]![m.rookTo.col] = { ...rook, hasMoved: true }
      }
    } else if (m.special === 'enPassant') {
      b[m.row]![m.col] = { ...piece, hasMoved: true }
      b[row]![col] = null
      b[row]![m.col] = null
    } else {
      b[m.row]![m.col] = { ...piece, hasMoved: true }
      b[row]![col] = null
    }

    if (!isKingInCheck(b, piece.color)) {
      legal.push({ ...m, givesCheck: isKingInCheck(b, enemyColor) })
    }
  }

  return legal
}

export const isCheckmate = (board: Board, color: Color): boolean => {
  if (!isKingInCheck(board, color)) return false

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r]?.[c] ?? null
      if (p && p.color === color) {
        const legal = getLegalMoves(board, r, c)
        if (legal.length > 0) return false
      }
    }
  }

  return true
}

export const isStalemate = (board: Board, color: Color, options?: MoveOptions): boolean => {
  if (isKingInCheck(board, color)) return false

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r]?.[c] ?? null
      if (p && p.color === color) {
        const legal = getLegalMoves(board, r, c, options)
        if (legal.length > 0) return false
      }
    }
  }

  return true
}

export const hasInsufficientMaterial = (board: Board): boolean => {
  const pieces: Array<{ piece: Piece; row: number; col: number }> = []

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r]?.[c] ?? null
      if (piece && piece.type !== 'king') {
        pieces.push({ piece, row: r, col: c })
      }
    }
  }
  // 1. 双王：死局
  if (pieces.length === 0) return true

  // 2. 含有兵、车、后：存在将死可能
  if (
    pieces.some(
      ({ piece }) => piece.type === 'pawn' || piece.type === 'rook' || piece.type === 'queen',
    )
  ) {
    return false
  }

  // 3. 全场只有一个轻子（K+B vs K 或 K+N vs K）：死局
  if (pieces.length === 1) return true

  // 4. 如果包含马（且轻子数 >= 2），在 FIDE 规则下均存在理论配合将死的可能
  if (pieces.some(({ piece }) => piece.type === 'knight')) {
    return false
  }

  // 5. 剩余棋子全为象：仅当所有象都在相同颜色格时才是死局
  let firstSquareIsWhite: boolean | null = null
  for (const { row, col } of pieces) {
    const currentIsWhite = isWhiteSquare(row, col)
    if (firstSquareIsWhite === null) {
      firstSquareIsWhite = currentIsWhite
    } else if (firstSquareIsWhite !== currentIsWhite) {
      return false // 存在异色格象，可以配合将死
    }
  }

  return true
}

export const getPositionKey = (
  board: Board,
  currentTurn: Color,
  lastMove: { from: Square; to: Square } | null,
): string => {
  const typeCodeMap: Record<PieceType, string> = {
    pawn: 'p',
    rook: 'r',
    knight: 'n',
    bishop: 'b',
    queen: 'q',
    king: 'k',
  }

  const rows = board
    .map((row, rowIndex) =>
      row
        .map((piece, col) => {
          if (!piece) return '__'
          const isHomeKing =
            piece.type === 'king' &&
            rowIndex === (piece.color === 'white' ? 7 : 0)
          const isHomeRook =
            piece.type === 'rook' &&
            rowIndex === (piece.color === 'white' ? 7 : 0)
          const castlingState = (isHomeKing || isHomeRook) && piece.hasMoved ? '1' : '0'
          return `${typeCodeMap[piece.type]}${piece.color[0]}${castlingState}`
        })
        .join(','),
    )
    .join('/')

  const enPassantTarget = getEnPassantTarget(lastMove)
  const enPassantKey = enPassantTarget ? `${enPassantTarget.row}${enPassantTarget.col}` : '-'

  return `${currentTurn}|${rows}|${enPassantKey}`
}

/**
 * 转换坐标到棋盘记号（如 "e2"）
 */
const squareToNotation = (row: number, col: number): string => {
  const file = String.fromCharCode(97 + col) // a-h
  const rank = 8 - row // 8-1
  return `${file}${rank}`
}

/**
 * 生成走棋的代数记法（增强版，支持消歧和将棋标记）
 * @param board 当前棋盘
 * @param fromRow 起始行
 * @param fromCol 起始列
 * @param toRow 目标行
 * @param toCol 目标列
 * @param special 特殊移动类型
 * @param promotion 升变棋子类型
 * @param checkStatus 将棋状态：'check' 表示将军，'checkmate' 表示将死
 */
export const generateMoveNotation = (
  board: Board,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
  special?: 'castle' | 'enPassant',
  promotion?: PieceType,
  checkStatus?: 'check' | 'checkmate',
): string => {
  const piece = board[fromRow]?.[fromCol]
  if (!piece) return ''

  const fromSquare = squareToNotation(fromRow, fromCol)
  const toSquare = squareToNotation(toRow, toCol)

  if (special === 'castle') {
    const suffix = checkStatus === 'checkmate' ? '#' : checkStatus === 'check' ? '+' : ''
    if (toCol > fromCol) {
      return `O-O${suffix}` // 王翼易位
    } else {
      return `O-O-O${suffix}` // 后翼易位
    }
  }

  const targetPiece = board[toRow]?.[toCol]
  const isCapture = targetPiece !== null || special === 'enPassant'

  if (piece.type === 'pawn') {
    let notation = ''
    if (isCapture) {
      notation += String.fromCharCode(97 + fromCol) // 兵吃子时显示出发的文件
      notation += 'x'
    }
    notation += toSquare
    if (promotion) {
      notation += `=${promotion.charAt(0).toUpperCase()}`
    }
    const suffix = checkStatus === 'checkmate' ? '#' : checkStatus === 'check' ? '+' : ''
    notation += suffix
    return notation
  }

  let notation = piece.type.charAt(0).toUpperCase()

  const disambiguationSuffix = calculateDisambiguation(board, piece, toRow, toCol, fromRow, fromCol)
  notation += disambiguationSuffix

  if (isCapture) {
    notation += 'x'
  }

  notation += toSquare

  if (promotion) {
    notation += `=${promotion.charAt(0).toUpperCase()}`
  }

  const suffix = checkStatus === 'checkmate' ? '#' : checkStatus === 'check' ? '+' : ''
  notation += suffix

  return notation
}

/**
 * 计算棋子消歧所需的信息
 * 当多个相同类型的棋子可以移动到同一位置时，需要添加起始文件或等级来消除歧义
 */
const calculateDisambiguation = (
  board: Board,
  piece: Piece,
  toRow: number,
  toCol: number,
  fromRow: number,
  fromCol: number,
): string => {
  // 王和兵不需要消歧
  if (piece.type === 'king' || piece.type === 'pawn') {
    return ''
  }

  const candidates: Array<{ row: number; col: number }> = []

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r]?.[c]
      if (
        (r === fromRow && c === fromCol) ||
        !p ||
        p.type !== piece.type ||
        p.color !== piece.color
      ) {
        continue
      }

      const candidateMoves = getPieceMoves(board, r, c)
      const canMove = candidateMoves.some((m) => m.row === toRow && m.col === toCol)
      if (canMove) {
        candidates.push({ row: r, col: c })
      }
    }
  }

  if (candidates.length === 0) {
    return ''
  }

  const differentFiles = candidates.every((c) => c.col !== fromCol)
  if (differentFiles) {
    return String.fromCharCode(97 + fromCol)
  }

  return String(8 - fromRow)
}
