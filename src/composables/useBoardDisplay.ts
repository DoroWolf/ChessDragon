import { ref, onMounted, onUnmounted } from 'vue'
import type { Board, Piece, Color } from '../models/chess'
import { isWhiteSquare, isCheckmate, isKingInCheck } from '../models/chess'
import {
  boardMoveHover,
  boardPremoveHighlighted,
  boardPremoveHover,
  boardPremoveCapture,
  boardPremovePlaceable,
  boardMoveCapture,
  boardMovePlaceable,
  pieceImg,
} from '../assets/resourcePaths'

export function useBoardDisplay() {
  const isFlipped = ref(false)

  /** 视觉坐标转为逻辑坐标（行） */
  const getActualRow = (displayRow: number): number => {
    return isFlipped.value ? 7 - displayRow : displayRow
  }

  /** 视觉坐标转为逻辑坐标（列） */
  const getActualCol = (displayCol: number): number => {
    return isFlipped.value ? 7 - displayCol : displayCol
  }

  const getDisplayedFile = (displayCol: number): string => {
    return String.fromCharCode(97 + getActualCol(displayCol - 1))
  }

  const getDisplayedRank = (displayRow: number): string => {
    return `${8 - getActualRow(displayRow - 1)}`
  }

  // --- Overlay 纹理：用于高亮选中格子、合法走法、premove、上一步移动 ---
  const getOverlayTexture = (
    board: Board,
    selectedSquare: { row: number; col: number } | null,
    possibleMoves: { row: number; col: number }[],
    isDragging: boolean,
    hoverSquare: { row: number; col: number } | null,
    row: number,
    col: number,
    premove?: { from: { row: number; col: number }; to: { row: number; col: number } } | null,
    lastMove?: { from: { row: number; col: number }; to: { row: number; col: number } } | null,
    canPremove?: boolean,
  ): string | null =>{
    // 上一步移动的高亮（起始格和目标格），优先于其他高亮
    if (lastMove) {
      if (
        (lastMove.from.row === row && lastMove.from.col === col) ||
        (lastMove.to.row === row && lastMove.to.col === col)
      ) {
        return boardMoveHover
      }
    }

    // Premove 高亮 - 目标格
    if (premove && premove.to.row === row && premove.to.col === col) {
      return boardPremoveHighlighted
    }

    // Premove 高亮 - 起始格
    if (premove && premove.from.row === row && premove.from.col === col) {
      return canPremove
        ? boardPremoveHover
        : boardMoveHover
    }

    // 当前选中格高亮（premove 模式下使用 premove 版纹理）
    if (selectedSquare?.row === row && selectedSquare?.col === col) {
      return canPremove
        ? boardPremoveHover
        : boardMoveHover
    }

    const move = possibleMoves.find(
      (candidate) => candidate.row === row && candidate.col === col,
    )

    if (move) {
      if (hoverSquare?.row === row && hoverSquare?.col === col) {
        return canPremove
          ? boardPremoveHover
          : boardMoveHover
      }

      const targetPiece = board[row]?.[col] ?? null
      if (targetPiece !== null) {
        return canPremove
          ? boardPremoveCapture
          : boardMoveCapture
      }
      return canPremove
        ? boardPremovePlaceable
        : boardMovePlaceable
    }

    return null
  }

  // --- 棋子图片 ---
  const getPieceImage = (
    piece: Piece,
    board: Board,
    isDraw: boolean,
    hasResigned: Color | null,
    timeoutWinner: Color | null,
  ): string => {
    if (piece.type === 'king') {
      if (isDraw) {
        return pieceImg(`king_draw`, piece.color)
      }
      if (hasResigned && piece.color === hasResigned) {
        return pieceImg(`king_checkmate`, piece.color)
      }
      if (timeoutWinner && piece.color !== timeoutWinner) {
        return pieceImg(`king_checkmate`, piece.color)
      }
      if (isCheckmate(board, piece.color)) {
        return pieceImg(`king_checkmate`, piece.color)
      }
      if (isKingInCheck(board, piece.color)) {
        return pieceImg(`king_check`, piece.color)
      }
    }
    return pieceImg(piece.type, piece.color)
  }

  // --- 缩放适配 ---
  const pieceScale = ref(1.5)
  const boardGridRef = ref<HTMLElement | null>(null)
  let boardResizeObserver: ResizeObserver | null = null

  const updatePieceScale = () => {
    if (boardGridRef.value) {
      const currentSquareWidth = boardGridRef.value.clientWidth / 8
      const baseSquareSize = 90
      const baseScale = 1.5
      pieceScale.value = (currentSquareWidth / baseSquareSize) * baseScale
    }
  }

  onMounted(() => {
    updatePieceScale()
    if (boardGridRef.value) {
      boardResizeObserver = new ResizeObserver(updatePieceScale)
      boardResizeObserver.observe(boardGridRef.value)
    }
  })

  onUnmounted(() => {
    if (boardResizeObserver) {
      boardResizeObserver.disconnect()
    }
  })

  const getSquareLabel = (row: number, col: number): string => {
    const file = String.fromCharCode(97 + col)
    const rank = 8 - row
    return `${file}${rank}`
  }

  return {
    isFlipped,
    getActualRow,
    getActualCol,
    getDisplayedFile,
    getDisplayedRank,
    getOverlayTexture,
    getPieceImage,
    pieceScale,
    boardGridRef,
    getSquareLabel,
    isWhiteSquare,
    updatePieceScale,
  }
}