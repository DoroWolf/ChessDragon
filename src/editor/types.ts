import type { Color, PieceType } from '../models/chess'

/**
 * 调色板当前选中的工具：
 * - cursor：拖动棋子（拖到棋盘外即删除）
 * - empty：橡皮擦
 * - piece：放置指定棋子
 */
export type EditorTool =
  | { kind: 'cursor' }
  | { kind: 'empty' }
  | { kind: 'piece'; type: PieceType; color: Color }
