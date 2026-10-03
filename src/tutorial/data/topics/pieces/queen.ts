import type { TutorialTopic } from '../../types'

export const queenTopic: TutorialTopic = {
  id: 'queen',
  titleKey: 'tutorial.topic.queen',
  descKey: 'tutorial.topic.queen.desc',
  piece: 'queen',
  steps: [
    {
      kind: 'intro',
      instruction: ['tutorial.intro.queen1', 'tutorial.intro.queen2'],
      demo: { piece: { type: 'queen', color: 'white', row: 7, col: 3 } },
    },
    {
      id: 'queen-1',
      kind: 'collect-coins',
      instruction: 'tutorial.challenge.instruction',
      piece: { type: 'queen', color: 'white', row: 7, col: 3 },
      coins: [{ row: 3, col: 3 }],
    },
    {
      id: 'queen-2',
      kind: 'collect-coins',
      instruction: 'tutorial.challenge.instruction',
      piece: { type: 'queen', color: 'white', row: 3, col: 3 },
      coins: [
        { row: 0, col: 6 },
        { row: 0, col: 7 },
      ],
    },
    {
      id: 'queen-3',
      kind: 'collect-coins',
      instruction: 'tutorial.challenge.instruction',
      piece: { type: 'queen', color: 'white', row: 0, col: 7 },
      coins: [{ row: 6, col: 0 }],
    },
  ],
}
