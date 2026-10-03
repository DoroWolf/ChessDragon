import type { TutorialTopic } from '../../types'

/** 认识棋子 · 马：走「日」字，且能跳子 */
export const knightTopic: TutorialTopic = {
  id: 'knight',
  titleKey: 'tutorial.topic.knight',
  descKey: 'tutorial.topic.knight.desc',
  piece: 'knight',
  steps: [
    {
      kind: 'intro',
      instruction: ['tutorial.intro.knight1'],
      demo: { piece: { type: 'knight', color: 'white', row: 7, col: 1 } },
    },
    {
      kind: 'intro',
      instruction: ['tutorial.intro.knight2'],
      demo: {
        piece: { type: 'knight', color: 'white', row: 7, col: 1 },
        blockers: [
          { type: 'pawn', color: 'white', row: 6, col: 0 },
          { type: 'pawn', color: 'white', row: 6, col: 1 },
          { type: 'pawn', color: 'white', row: 6, col: 2 },
        ],
      },
    },
    {
      id: 'knight-1',
      kind: 'collect-coins',
      instruction: 'tutorial.challenge.instruction',
      piece: { type: 'knight', color: 'white', row: 7, col: 1 },
      coins: [{ row: 5, col: 2 }],
    },
    {
      id: 'knight-2',
      kind: 'collect-coins',
      instruction: 'tutorial.challenge.instruction',
      piece: { type: 'knight', color: 'white', row: 5, col: 2 },
      coins: [{ row: 3, col: 6 }],
    },
    {
      id: 'knight-3',
      kind: 'collect-coins',
      instruction: 'tutorial.challenge.instruction',
      piece: { type: 'knight', color: 'white', row: 3, col: 6 },
      coins: [{ row: 6, col: 3 }],
    },
  ],
}
