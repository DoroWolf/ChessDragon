import type { TutorialTopic } from '../../types'

/** 认识棋子 · 王：每次只走一格 */
export const kingTopic: TutorialTopic = {
  id: 'king',
  titleKey: 'tutorial.topic.king',
  descKey: 'tutorial.topic.king.desc',
  piece: 'king',
  steps: [
    {
      kind: 'intro',
      instruction: ['tutorial.intro.king1'],
      demo: { piece: { type: 'king', color: 'white', row: 7, col: 4 } },
    },
    {
      id: 'king-1',
      kind: 'collect-coins',
      instruction: 'tutorial.challenge.instruction',
      // 王在 d4，金币在 d5：旁边一格，一步可达
      piece: { type: 'king', color: 'white', row: 7, col: 4 },
      coins: [{ row: 6, col: 5 }],
    },
    {
      id: 'king-2',
      kind: 'collect-coins',
      instruction: 'tutorial.challenge.instruction',
      piece: { type: 'king', color: 'white', row: 6, col: 5 },
      coins: [
        { row: 5, col: 4 },
        { row: 4, col: 5 }]
        ,
    },
    {
      id: 'king-3',
      kind: 'collect-coins',
      instruction: 'tutorial.challenge.instruction',
      piece: { type: 'king', color: 'white', row: 4, col: 5 },
      coins: [{ row: 5, col: 3 }],
    },
  ],
}
