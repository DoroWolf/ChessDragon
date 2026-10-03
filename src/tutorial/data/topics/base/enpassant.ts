import type { TutorialTopic } from '../../types'

/**
 * 基础 · 吃过路兵：兵的特殊吃法。
 */
export const enPassantTopic: TutorialTopic = {
  id: 'enPassant',
  titleKey: 'tutorial.topic.enPassant',
  descKey: 'tutorial.topic.enPassant.desc',
  steps: [
    {
      kind: 'intro',
      instruction: ['tutorial.intro.enPassant1', 'tutorial.intro.enPassant2'],
      demo: {
        blockers: [
          { type: 'pawn', color: 'white', row: 3, col: 4 },
          { type: 'pawn', color: 'black', row: 1, col: 3 },
        ],
      },
    },
    {
      id: 'enPassant-1',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.enPassant',
      piece: { type: 'pawn', color: 'white', row: 3, col: 4 },
      opponents: { type: 'pawn', color: 'black', row: 3, col: 3, enPassant: true },
      target: { row: 2, col: 3 },
    },
  ],
}
