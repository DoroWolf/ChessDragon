import type { TutorialTopic } from '../../types'

/** 认识棋子 · 象：沿斜线移动 */
export const bishopTopic: TutorialTopic = {
  id: 'bishop',
  titleKey: 'tutorial.topic.bishop',
  descKey: 'tutorial.topic.bishop.desc',
  piece: 'bishop',
  steps: [
    {
      kind: 'intro',
      paragraphs: ['tutorial.intro.bishop1', 'tutorial.intro.bishop2'],
      demo: { piece: { type: 'bishop', color: 'white', row: 7, col: 2 } },
    },
    {
      id: 'bishop-1',
      kind: 'collect-coins',
      instruction: 'tutorial.challenge.instruction',
      piece: { type: 'bishop', color: 'white', row: 7, col: 2 },
      coins: [{ row: 3, col: 6 }],
    },
    {
      id: 'bishop-2',
      kind: 'collect-coins',
      instruction: 'tutorial.challenge.instruction',
      piece: { type: 'bishop', color: 'white', row: 3, col: 6 },
      coins: [
        { row: 1, col: 4 },
        { row: 0, col: 5 },
      ],
    },
    {
      id: 'bishop-3',
      kind: 'collect-coins',
      instruction: 'tutorial.challenge.instruction',
      piece: { type: 'bishop', color: 'white', row: 0, col: 5 },
      coins: [{ row: 3, col: 4 }],
    },
  ],
}
