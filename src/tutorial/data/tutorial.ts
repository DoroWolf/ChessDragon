import { castlingTopic } from './topics/base/castling'
import { checkTopic } from './topics/base/check'
import { checkmateTopic } from './topics/base/checkmate'
import { outOfCheckTopic } from './topics/base/outofcheck'
import { enPassantTopic } from './topics/base/enpassant'
import { captureTopic } from './topics/base/capture'
import { bishopTopic } from './topics/pieces/bishop'
import { kingTopic } from './topics/pieces/king'
import { knightTopic } from './topics/pieces/knight'
import { pawnTopic } from './topics/pieces/pawn'
import { queenTopic } from './topics/pieces/queen'
import { rookTopic } from './topics/pieces/rook'
import type { TutorialCategory, TutorialTopic } from './types'

/**
 * 教程目录：只登记「分类 -> 专题」的归属关系。
 *
 * 每个专题的具体内容（介绍段落、演示棋盘、挑战）分散在
 * ./topics/<categoryId>/<topicId>.ts 里各自维护。
 *
 * 新增一个教程只需两步：
 *   1. 在 ./topics/<categoryId>/ 下新建 <topicId>.ts 写该专题内容；
 *   2. 把该专题登记到下面所属分类的 topics 里。
 */
export const TUTORIAL_CATEGORIES: TutorialCategory[] = [
  {
    id: 'pieces',
    titleKey: 'tutorial.category.pieces',
    topics: [rookTopic, bishopTopic, queenTopic, kingTopic, knightTopic, pawnTopic],
  },
  {
    id: 'base',
    titleKey: 'tutorial.category.base',
    topics: [captureTopic, castlingTopic, enPassantTopic, checkTopic, outOfCheckTopic, checkmateTopic],
  },
]

export const findCategory = (categoryId: string | null): TutorialCategory | null =>
  TUTORIAL_CATEGORIES.find((category) => category.id === categoryId) ?? null

export const findTopic = (
  categoryId: string | null,
  topicId: string | null,
): TutorialTopic | null =>
  findCategory(categoryId)?.topics.find((topic) => topic.id === topicId) ?? null
