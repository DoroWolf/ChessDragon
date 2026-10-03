import type { TutorialTopic } from '../../types'

export const pawnTopic: TutorialTopic = {
  id: 'pawn',
  titleKey: 'tutorial.topic.pawn',
  descKey: 'tutorial.topic.pawn.desc',
  piece: 'pawn',
  steps: [
    {
      kind: 'intro',
      instruction: ['tutorial.intro.pawn1'],
      demo: { piece: { type: 'pawn', color: 'white', row: 6, col: 4 } },
    },
    {
      id: 'pawn-1',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.pawnMoveOne',
      failMessage: 'tutorial.challenge.pawnFail1',
      piece: { type: 'pawn', color: 'white', row: 6, col: 4 },
      target: { row: 5, col: 4 },
    },
    {
      id: 'pawn-2',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.pawnMoveTwo',
      failMessage: 'tutorial.challenge.pawnFail1',
      piece: { type: 'pawn', color: 'white', row: 6, col: 4 },
      target: { row: 4, col: 4 },
    },
    {
      id: 'pawn-capture',
      kind: 'info',
      instruction: 'tutorial.intro.pawn2',
      piece: { type: 'pawn', color: 'white', row: 4, col: 4 },
      captureSquares: [
        { row: 3, col: 3 },
        { row: 3, col: 5 },
      ],
    },
    {
      id: 'pawn-3',
      kind: 'collect-coins',
      instruction: 'tutorial.challenge.instruction',
      failMessage: 'tutorial.challenge.pawnFail2',
      piece: { type: 'pawn', color: 'white', row: 4, col: 4 },
      coins: [{ row: 1, col: 3 }],
    },
    {
      id: 'pawn-4',
      kind: 'promote',
      instruction: 'tutorial.challenge.pawnPromote',
      piece: { type: 'pawn', color: 'white', row: 1, col: 3 },
    },
  ],
}
