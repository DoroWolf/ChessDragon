export type { AIDifficulty, AIStyle, AIDetailedMove } from './engine/types'
export type { SearchPositionOptions } from './engine/search'

export {
  getBestAIMove,
  searchPosition,
  getPromotionChoice,
  getTotalLegalMoveCount,
  getMaterialAdvantage,
} from './engine/search'
