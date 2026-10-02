import type { Color, PieceType, Square } from '../../models/chess'
import type { MessageKey } from '../../data/i18n'

/**
 * 教程数据结构定义。
 * 具体专题内容分散在 ./topics/<categoryId>/<topicId>.ts 里各自维护，本文件只放共享类型。
 */

export interface TutorialPiece extends Square {
  type: PieceType
  color: Color
}

interface TutorialStepBase {
  id: string
  instruction: MessageKey
  piece: TutorialPiece
}

/** 挑战公共字段 */
interface TutorialChallengeBase extends TutorialStepBase {
  /** 失败时的自定义提示；缺省用通用的失败文案 */
  failMessage?: MessageKey
}

/** 讲解步骤：不可交互的演示棋盘，在 captureSquares 上显示吃子提示 */
export interface InfoStep extends TutorialStepBase {
  kind: 'info'
  captureSquares: Square[]
}

/** 吃金币挑战：把金币全部吃掉即完成（步数自由） */
export interface CollectCoinsChallenge extends TutorialChallengeBase {
  kind: 'collect-coins'
  coins: Square[]
}

/** 按要求移动：把棋子走到指定目标格（例如兵「向前一格 / 两格」），走错即失败 */
export interface MoveAsRequiredChallenge extends TutorialChallengeBase {
  kind: 'move-as-required'
  target: Square
}

/** 升变挑战：把兵冲到底线，弹出升变选择器挑选棋子 */
export interface PromoteChallenge extends TutorialChallengeBase {
  kind: 'promote'
}

export type TutorialChallenge =
  | CollectCoinsChallenge
  | MoveAsRequiredChallenge
  | PromoteChallenge

/** 演示棋盘 */
export interface TutorialDemo {
  piece: TutorialPiece
  /** 陪衬用的其他棋子（例如演示马能跳过它们），不参与可达格计算 */
  blockers?: TutorialPiece[]
}

/** 讲解页：一组正文段落 + 可选的演示棋盘 */
export interface TutorialIntroStep {
  kind: 'intro'
  paragraphs: MessageKey[]
  demo?: TutorialDemo
}

export type TutorialStep = TutorialIntroStep | InfoStep | TutorialChallenge

export interface TutorialTopic {
  id: string
  titleKey: MessageKey
  descKey: MessageKey
  piece: PieceType
  steps: TutorialStep[]
}

export interface TutorialCategory {
  id: string
  titleKey: MessageKey
  topics: TutorialTopic[]
}
