import type { Color, PieceType, Square } from '../../models/chess'
import type { MessageKey } from '../../data/i18n'

/**
 * 教程数据结构定义。
 * 具体专题内容分散在 ./topics/<categoryId>/<topicId>.ts 里各自维护，本文件只放共享类型。
 */

export interface TutorialPiece extends Square {
  type: PieceType
  color: Color
  /** 对方兵刚走过两格、本方可吃过路兵（只对挑战里的 opponents 有意义） */
  enPassant?: boolean
}

/** 棋子写法：单个棋子，或一组棋子（多枚可任选其一时用数组） */
export type TutorialPieceSpec = TutorialPiece | TutorialPiece[]

interface TutorialStepBase {
  id: string
  instruction: MessageKey
}

/** 走错时对方的回应着法：玩家把 from 处的棋子走到 trigger 格即触发，对方把 reply.from 处的棋子走到 reply.to */
export interface TutorialReplyMove {
  /** 触发这次回应的着法落点；可再用 trigger.from 限定必须由哪一枚棋子走过去 */
  trigger: TutorialTarget
  /** 对方要移动的棋子当前所在格 */
  from: Square
  /** 对方棋子的落点（通常就是 trigger，也就是吃回刚走过来的棋子） */
  to: Square
  /** 这条回应触发时显示的失败提示；缺省用挑战自带的 failMessage */
  failMessage?: MessageKey
}

/** 挑战公共字段 */
interface TutorialChallengeBase extends TutorialStepBase {
  /**
   * 玩家可移动的棋子。
   * 单个棋子直接写对象；一个挑战里能任选多枚棋子移动时写成数组，
   * 玩家可以点选其中任意一枚来走（例如「应将」里有王和车可选）。
   */
  piece: TutorialPieceSpec
  /** 失败时的自定义提示；缺省用通用的失败文案 */
  failMessage?: MessageKey
  /** 棋盘上可被吃掉的对方棋子（吃子挑战用），不参与可达格阻挡以外的逻辑 */
  opponents?: TutorialPieceSpec
  /** 走错格时对方的回应着法（例如车吃回被保护的兵） */
  replies?: TutorialReplyMove[]
}

/** 讲解步骤：不可交互的演示棋盘，在 captureSquares 上显示吃子提示 */
export interface InfoStep extends TutorialStepBase {
  kind: 'info'
  piece: TutorialPiece
  captureSquares: Square[]
}

/** 吃金币挑战：把金币全部吃掉即完成（步数自由） */
export interface CollectCoinsChallenge extends TutorialChallengeBase {
  kind: 'collect-coins'
  coins: Square[]
}

/**
 * 目标格：可按需指定「必须由哪一格的白棋来完成这次移动」。
 * 省略 from 时只要走到目标格即可（不限制来源棋子）。
 */
export interface TutorialTarget extends Square {
  /** 指定必须由此格的白棋来走这一步；省略则不限制来源 */
  from?: Square
}

/** 按要求移动：把棋子走到指定目标格（例如兵「向前一格 / 两格」），走错即失败 */
export interface MoveAsRequiredChallenge extends TutorialChallengeBase {
  kind: 'move-as-required'
  /** 可接受的目标格：写单个或数组；写成数组表示这些落点任选其一达成即可 */
  target: TutorialTarget | TutorialTarget[]
}

/** 升变挑战：把兵冲到底线，弹出升变选择器挑选棋子 */
export interface PromoteChallenge extends TutorialChallengeBase {
  kind: 'promote'
}

export type TutorialChallenge =
  | CollectCoinsChallenge
  | MoveAsRequiredChallenge
  | PromoteChallenge

/** 演示棋盘：可以指定一个主角棋子（认识棋子时演示走法），也可以只摆出一个局面 */
export interface TutorialDemo {
  /**
   * 主角棋子：有值时演示它的可达格（走法轨迹）；
   * 没有主角的专题（例如吃子）省略它，此时只展示 blockers 摆出的局面。
   */
  piece?: TutorialPiece
  /** 棋盘上的棋子（陪衬用，或直接用来摆出一个局面） */
  blockers?: TutorialPiece[]
}

/** 讲解页：一组正文段落 + 可选的演示棋盘 */
export interface TutorialIntroStep {
  kind: 'intro'
  instruction: MessageKey[]
  demo?: TutorialDemo
}

export type TutorialStep = TutorialIntroStep | InfoStep | TutorialChallenge

export interface TutorialTopic {
  id: string
  titleKey: MessageKey
  descKey: MessageKey
  /** 该专题围绕的棋子；不属于单一棋子的专题（例如吃子）可以省略 */
  piece?: PieceType
  steps: TutorialStep[]
}

export interface TutorialCategory {
  id: string
  titleKey: MessageKey
  topics: TutorialTopic[]
}
