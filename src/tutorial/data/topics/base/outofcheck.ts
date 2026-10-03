import type { TutorialTopic } from '../../types'

/**
 * 基础 · 应将：被将军时如何化解。
 *
 * 三种应法各一关：
 *   1. 移开王（王走到不被攻击的格子）；
 *   2. 吃掉将军的棋子；
 *   3. 用其他棋子挡住攻击线路。
 * 目标格可以写成数组（任选其一达成即可），并用 from 指定必须由哪枚棋子来走。
 */
export const outOfCheckTopic: TutorialTopic = {
  id: 'outOfCheck',
  titleKey: 'tutorial.topic.outOfCheck',
  descKey: 'tutorial.topic.outOfCheck.desc',
  steps: [
    {
      kind: 'intro',
      instruction: ['tutorial.intro.outOfCheck1'],
      demo: {
        blockers: [
          { type: 'king', color: 'white', row: 7, col: 4 },
          { type: 'queen', color: 'black', row: 5, col: 4 },
        ],
      },
    },
    {
      id: 'outOfCheck-1',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.outOfCheck1',
      piece: { type: 'king', color: 'white', row: 7, col: 4 },
      opponents: [{ type: 'queen', color: 'black', row: 5, col: 4 }],
      // 移开王：走出黑后所在的竖线即可，两个落点都算过
      target: [
        { row: 7, col: 3, from: { row: 7, col: 4 } },
        { row: 7, col: 5, from: { row: 7, col: 4 } },
      ],
    },
    {
      id: 'outOfCheck-2',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.outOfCheck2',
      piece: { type: 'king', color: 'white', row: 7, col: 4 },
      opponents: [{ type: 'queen', color: 'black', row: 6, col: 4 }],
      // 吃掉将军的棋子
      target: { row: 6, col: 4, from: { row: 7, col: 4 } },
    },
    {
      id: 'outOfCheck-3',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.outOfCheck3',
      piece: [
        { type: 'king', color: 'white', row: 0, col: 5 },
        { type: 'rook', color: 'white', row: 7, col: 4 },
      ],
      opponents: [
        { type: 'rook', color: 'black', row: 0, col: 1 },
        { type: 'rook', color: 'black', row: 1, col: 0 },
      ],
      // 用其他棋子挡住：白车走到 e8，挡在黑车与王之间
      target: { row: 0, col: 4, from: { row: 7, col: 4 } },
    },
  ],
}
