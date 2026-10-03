import type { TutorialTopic } from '../../types'

export const checkTopic: TutorialTopic = {
  id: 'check',
  titleKey: 'tutorial.topic.check',
  descKey: 'tutorial.topic.check.desc',
  steps: [
    {
      kind: 'intro',
      instruction: ['tutorial.intro.check1', 'tutorial.intro.check2'],
      demo: {
        blockers: [
          { type: 'king', color: 'black', row: 0, col: 4 },
          { type: 'queen', color: 'white', row: 4, col: 4 },
        ],
      },
    },
    {
      id: 'check-1',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.check',
      piece: { type: 'rook', color: 'white', row: 7, col: 0 },
      opponents: [
        { type: 'king', color: 'black', row: 0, col: 4 },
        { type: 'bishop', color: 'black', row: 2, col: 2 },
      ],
      target: { row: 7, col: 4 },
      replies: [{ trigger: { row: 0, col: 0 }, from: { row: 2, col: 2 }, to: { row: 0, col: 0 } }],
    },
    {
      id: 'check-2',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.check',
      piece: [
        { type: 'pawn', color: 'white', row: 5, col: 4 },
        { type: 'pawn', color: 'white', row: 6, col: 3 },
      ],
      opponents: { type: 'king', color: 'black', row: 3, col: 4 },
      target: { row: 4, col: 3, from: { row: 6, col: 3 } },
    },
  ],
}
