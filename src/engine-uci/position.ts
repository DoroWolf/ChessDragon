// UCI Position Management（UCI 局面管理）
// 负责 UCI 世界（FEN / 坐标走法）与引擎内部世界（Board / AIDetailedMove）之间的转换，
// 并维护走子方、上一步、计步与重复局面历史，供 searchPosition 使用。
import type { Board, Color, Square } from '../models/chess'
import { createInitialBoard, getEnPassantTarget, getPositionKey } from '../models/chess'
import { parseFen } from '../models/fen'
import type { AIDetailedMove } from '../models/engine/types'
import { makeMove } from '../models/engine/boardChange'
import { generateLegalMoves } from '../models/engine/moveGeneration'
import { findKing, setKingPos } from '../models/engine/searchState'
import { parseUciMove, type UciMove } from './protocol'

export class PositionState {
  board: Board = createInitialBoard()
  turn: Color = 'white'
  lastMove: { from: Square; to: Square } | null = null
  halfmoveClock = 0
  fullmoveNumber = 1
  /** 从初始局面到当前局面的全部局面 key（含当前），用于重复局面检测 */
  readonly positionHistory: string[] = [getPositionKey(this.board, this.turn, this.lastMove)]

  /** 重置为标准初始局面 */
  setStartpos(): void {
    this.setBoard(createInitialBoard(), 'white', null, 0, 1)
  }

  /** 依据 FEN 设置局面；格式非法时返回 false */
  setFen(fen: string): boolean {
    const parsed = parseFen(fen)
    if (!parsed) return false
    this.setBoard(
      parsed.board,
      parsed.turn,
      parsed.lastMove,
      parsed.halfmoveClock,
      parsed.fullmoveNumber,
    )
    return true
  }

  private setBoard(
    board: Board,
    turn: Color,
    lastMove: { from: Square; to: Square } | null,
    halfmoveClock: number,
    fullmoveNumber: number,
  ): void {
    this.board = board
    this.turn = turn
    this.lastMove = lastMove
    this.halfmoveClock = halfmoveClock
    this.fullmoveNumber = fullmoveNumber
    this.syncKingTracking()
    this.positionHistory.length = 0
    this.positionHistory.push(getPositionKey(this.board, this.turn, this.lastMove))
  }

  /** 引擎的合法性判断依赖全局王位追踪（见 moveGeneration.isKingInCheckFast），此处同步一次 */
  private syncKingTracking(): void {
    const wk = findKing(this.board, 'white')
    const bk = findKing(this.board, 'black')
    setKingPos('white', wk.row, wk.col)
    setKingPos('black', bk.row, bk.col)
  }

  /** 当前走子方的全部合法走法（含易位 / 吃过路兵 / 升变信息） */
  legalMoves(): AIDetailedMove[] {
    this.syncKingTracking()
    const kRow = findKing(this.board, this.turn).row
    const kCol = findKing(this.board, this.turn).col
    const epTarget = getEnPassantTarget(this.lastMove)
    return generateLegalMoves(this.board, this.turn, epTarget, false, this.lastMove, kRow, kCol)
  }

  /** 应用一步 UCI 走法，成功返回 true */
  applyUciMove(text: string): boolean {
    const parsed = parseUciMove(text)
    if (!parsed) return false
    const matched = this.matchMove(parsed)
    if (!matched) return false
    this.applyDetailedMove(matched)
    return true
  }

  /** 应用一步已解析的详细走法，并维护 turn / lastMove / 计步 / 重复历史 */
  applyDetailedMove(move: AIDetailedMove): void {
    const mover = this.turn
    const piece = this.board[move.fromRow]![move.fromCol]!
    const captured =
      move.special === 'enPassant'
        ? (this.board[move.fromRow]![move.toCol] ?? null)
        : (this.board[move.toRow]![move.toCol] ?? null)

    makeMove(this.board, move)

    this.lastMove = {
      from: { row: move.fromRow, col: move.fromCol },
      to: { row: move.toRow, col: move.toCol },
    }
    this.turn = mover === 'white' ? 'black' : 'white'

    if (piece.type === 'pawn' || captured) this.halfmoveClock = 0
    else this.halfmoveClock += 1
    if (mover === 'black') this.fullmoveNumber += 1

    this.syncKingTracking()
    this.positionHistory.push(getPositionKey(this.board, this.turn, this.lastMove))
  }

  /** 返回重复局面检测所需的历史 key 副本（含当前局面） */
  snapshotHistory(): string[] {
    return [...this.positionHistory]
  }

  private matchMove(uci: UciMove): AIDetailedMove | null {
    for (const candidate of this.legalMoves()) {
      if (
        candidate.fromRow !== uci.fromRow ||
        candidate.fromCol !== uci.fromCol ||
        candidate.toRow !== uci.toRow ||
        candidate.toCol !== uci.toCol
      ) {
        continue
      }

      // 升变走法：引擎默认生成 queen，需按 UCI 指定的棋子覆盖
      if (candidate.promotion) {
        return { ...candidate, promotion: uci.promotion ?? candidate.promotion }
      }
      // 非升变走法不允许出现升变后缀
      if (uci.promotion) continue

      return { ...candidate }
    }
    return null
  }
}
