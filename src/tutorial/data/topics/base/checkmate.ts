import type { TutorialTopic } from '../../types'

/**
 * 基础 · 将杀：一步把对方的王将死。
 *
 * 三关各是一种将杀：
 *   1. 车沿底线将杀（王被己方兵堵住、无法逃出）；
 *   2. 双车「梯子将杀」；
 *   3. 王 + 后配合的将杀。
 * target 用 from 指定必须由哪枚棋子落子；replies 里把「没将死、王能逃」的走法
 * 配上王的逃跑着法和 failMessage，走出来就会提示「王依然能逃脱」。
 */
export const checkmateTopic: TutorialTopic = {
  id: 'checkmate',
  titleKey: 'tutorial.topic.checkmate',
  descKey: 'tutorial.topic.checkmate.desc',
  steps: [
    {
      kind: 'intro',
      instruction: ['tutorial.intro.checkmate1', 'tutorial.intro.checkmate2'],
      demo: {
        blockers: [
          { type: 'rook', color: 'white', row: 0, col: 4 },
          { type: 'king', color: 'black', row: 0, col: 7 },
          { type: 'pawn', color: 'black', row: 1, col: 6 },
          { type: 'pawn', color: 'black', row: 1, col: 7 },
        ],
      },
    },
    {
      id: 'checkmate-1',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.checkmate',
      piece: { type: 'rook', color: 'white', row: 7, col: 4 },
      opponents: [
        { type: 'king', color: 'black', row: 0, col: 7 },
        { type: 'pawn', color: 'black', row: 1, col: 6 },
        { type: 'pawn', color: 'black', row: 1, col: 7 },
      ],
      target: { row: 0, col: 4 },
    },
    {
      id: 'checkmate-2',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.checkmate',
      piece: [
        { type: 'rook', color: 'white', row: 5, col: 1 },
        { type: 'rook', color: 'white', row: 6, col: 2 },
      ],
      opponents: [{ type: 'king', color: 'black', row: 7, col: 5 }],
      // 由 (5,1) 的车走到 (7,1) 将杀；(6,2) 的车负责封住第 6 横线
      target: { row: 7, col: 1, from: { row: 5, col: 1 } },
      replies: [
        {
          trigger: { row: 7, col: 2, from: { row: 6, col: 2 } },
          from: { row: 7, col: 5 },
          to: { row: 6, col: 4 },
          failMessage: 'tutorial.challenge.checkmateFail',
        },
        {
          trigger: { row: 6, col: 5, from: { row: 6, col: 2 } },
          from: { row: 7, col: 5 },
          to: { row: 6, col: 5 },
        },
        {
          trigger: { row: 5, col: 5, from: { row: 5, col: 1 } },
          from: { row: 7, col: 5 },
          to: { row: 7, col: 4 },
          failMessage: 'tutorial.challenge.checkmateFail',
        },
      ],
    },
    {
      id: 'checkmate-3',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.checkmate',
      piece: [
        { type: 'queen', color: 'white', row: 1, col: 2 },
        { type: 'king', color: 'white', row: 2, col: 5 },
      ],
      opponents: [{ type: 'king', color: 'black', row: 0, col: 6 }],
      // 后走到 (1,6) 将杀（由王保护、封住逃路）
      target: { row: 1, col: 6, from: { row: 1, col: 2 } },
      replies: [
        {
          trigger: { row: 1, col: 5, from: { row: 1, col: 2 } },
          from: { row: 0, col: 6 },
          to: { row: 0, col: 7 },
          failMessage: 'tutorial.challenge.checkmateFail',
        },
        {
          trigger: { row: 0, col: 1, from: { row: 1, col: 2 } },
          from: { row: 0, col: 6 },
          to: { row: 1, col: 7 },
          failMessage: 'tutorial.challenge.checkmateFail',
        },
        {
          trigger: { row: 0, col: 2, from: { row: 1, col: 2 } },
          from: { row: 0, col: 6 },
          to: { row: 1, col: 7 },
          failMessage: 'tutorial.challenge.checkmateFail',
        },
        {
          trigger: { row: 0, col: 3, from: { row: 1, col: 2 } },
          from: { row: 0, col: 6 },
          to: { row: 1, col: 7 },
          failMessage: 'tutorial.challenge.checkmateFail',
        },
        {
          trigger: { row: 4, col: 2, from: { row: 1, col: 2 } },
          from: { row: 0, col: 6 },
          to: { row: 1, col: 7 },
          failMessage: 'tutorial.challenge.checkmateFail',
        },        {
          trigger: { row: 5, col: 6, from: { row: 1, col: 2 } },
          from: { row: 0, col: 6 },
          to: { row: 1, col: 7 },
          failMessage: 'tutorial.challenge.checkmateFail',
        },
        {
          trigger: { row: 1, col: 7, from: { row: 1, col: 2 } },
          from: { row: 0, col: 6 },
          to: { row: 1, col: 7 },
        },
      ],
    },
  ],
}
