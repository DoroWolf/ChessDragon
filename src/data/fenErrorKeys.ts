import type { FenErrorCode } from '../models/fen'
import type { MessageKey } from './i18n'

/**
 * FEN 各类校验失败原因对应的界面文案 key。
 * 对局设置（GameSetup）与棋盘编辑器共用，保证提示文案一致。
 */
export const FEN_ERROR_KEYS: Record<FenErrorCode, MessageKey> = {
  format: 'setup.invalidFen',
  king: 'setup.fenKingCount',
  pawnRank: 'setup.fenPawnRank',
  pieceCount: 'setup.fenPieceCount',
  castling: 'setup.fenCastling',
  enPassant: 'setup.fenEnPassant',
  illegalCheck: 'setup.fenIllegalCheck',
  checkmate: 'setup.fenCheckmate',
  stalemate: 'setup.fenStalemate',
  insufficientMaterial: 'setup.fenInsufficientMaterial',
}
