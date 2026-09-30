// ============================================================
// AI 引擎接口文件
// 所有算法实现已拆分到 engine/ 目录：
//   engine/types.ts              - 类型定义、常量
//   engine/pieceSquareTables.ts  - Piece-Square Table（棋子位置表）
//   engine/zobrist.ts            - Zobrist 哈希
//   engine/transpositionTable.ts - 置换表 (Transposition Table)
//   engine/killerHistory.ts      - 杀手走法 & 历史表 (Killer Moves & History Table)
//   engine/boardChange.ts        - 棋盘变更 Make/Unmake
//   engine/searchState.ts        - 搜索状态管理
//   engine/moveGeneration.ts     - 走法生成
//   engine/moveOrdering.ts       - 走法排序 (Move Ordering)
//   engine/evaluation.ts         - 棋盘评估
//   engine/endgameKnowledge.ts   - 残局知识（KBNK：王+象+马 vs 王，4-5 级开放）
//   engine/quiescenceSearch.ts   - 静态搜索 (Quiescence Search)
//   engine/alphaBeta.ts          - Alpha-Beta 剪枝搜索
//   engine/iterativeDeepening.ts - 迭代加深
//   engine/search.ts             - 搜索公共 API
// ============================================================

// 类型导出
export type { AIDifficulty, AIStyle, AIDetailedMove } from './engine/types'

// 公共 API 导出
export { getBestAIMove, getPromotionChoice, getTotalLegalMoveCount, getMaterialAdvantage } from './engine/search'