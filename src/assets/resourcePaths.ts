// 统一管理 src/assets 中贴图和音效的资源路径
// 使用 new URL() 确保 Vite 在构建时正确处理资源哈希和路径

// ---------- 棋盘 ----------
export const boardWhite = new URL('./texture/board/board_white.png', import.meta.url).href
export const boardBlack = new URL('./texture/board/board_black.png', import.meta.url).href
export const boardMoveHover = new URL('./texture/board/board_move_hover.png', import.meta.url).href
export const boardMoveCapture = new URL('./texture/board/board_move_capture.png', import.meta.url).href
export const boardMoveHighlighted = new URL('./texture/board/board_move_highlighted.png', import.meta.url).href
export const boardMovePlaceable = new URL('./texture/board/board_move_placeable.png', import.meta.url).href
export const boardPremoveHover = new URL('./texture/board/board_premove_hover.png', import.meta.url).href
export const boardPremoveCapture = new URL('./texture/board/board_premove_capture.png', import.meta.url).href
export const boardPremoveHighlighted = new URL('./texture/board/board_premove_highlighted.png', import.meta.url).href
export const boardPremovePlaceable = new URL('./texture/board/board_premove_placeable.png', import.meta.url).href
export const titleImg = new URL('./texture/title.png', import.meta.url).href

// ---------- 棋子 ----------
export function pieceImg(type: string, color: string): string {
  return new URL(`./texture/pieces/${type}_${color}.png`, import.meta.url).href
}

// ---------- 升变 ----------
export function promotionImg(piece: string, color: string): string {
  return new URL(`./texture/promotion/promotion_${piece}_${color}.png`, import.meta.url).href
}

// ---------- 音效 ----------
export const soundMove = new URL('./sound/Move.ogg', import.meta.url).href
export const soundCapture = new URL('./sound/Capture.ogg', import.meta.url).href
export const soundCheck = new URL('./sound/Check.ogg', import.meta.url).href
export const soundVictory = new URL('./sound/Victory.ogg', import.meta.url).href
export const soundDefeat = new URL('./sound/Defeat.ogg', import.meta.url).href
export const soundDraw = new URL('./sound/Draw.ogg', import.meta.url).href