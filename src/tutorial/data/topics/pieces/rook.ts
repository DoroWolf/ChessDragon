import type { TutorialTopic } from '../../types'

export const rookTopic: TutorialTopic = {
  id: 'rook',
  titleKey: 'tutorial.topic.rook',
  descKey: 'tutorial.topic.rook.desc',
  piece: 'rook',
  steps: [
    {
      kind: 'intro',
      instruction: ['tutorial.intro.rook1'],
      demo: { piece: { type: 'rook', color: 'white', row: 7, col: 0 } },
    },
    {
      id: 'rook-1',
      kind: 'collect-coins',
      instruction: 'tutorial.challenge.instruction',
      piece: { type: 'rook', color: 'white', row: 7, col: 0 },
      coins: [{ row: 3, col: 0 }],
    },
    {
      id: 'rook-2',
      kind: 'collect-coins',
      instruction: 'tutorial.challenge.instruction',
      piece: { type: 'rook', color: 'white', row: 3, col: 0 },
      coins: [
        { row: 3, col: 3 },
        { row: 1, col: 3 },
      ],
    },
    {
      id: 'rook-3',
      kind: 'collect-coins',
      instruction: 'tutorial.challenge.instruction',
      piece: { type: 'rook', color: 'white', row: 1, col: 3 },
      coins: [{ row: 5, col: 5 }],
    },
  ],
}
