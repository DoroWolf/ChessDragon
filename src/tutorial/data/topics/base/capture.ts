import type { TutorialTopic } from '../../types'

/**
 * 基础 · 吃子：吃掉对方的棋子，并学会分辨「被保护的棋子」。
 *
 * 讲解部分用同一局面递进：先看到后可以吃兵，再引入保护兵的车，
 * 最后指出还有另一个没有被保护的兵可以安全吃掉。
 * 这里没有「主角棋子」的走法轨迹，只用 blockers 摆出局面（吃子看的是局面，不是单子的走法）。
 * 挑战部分把讲解变成可交互的关卡：吃到没保护的棋子过关，
 * 吃到有保护的棋子会触发 replies 里配置的对方回应（吃回），判定失败。
 */
export const captureTopic: TutorialTopic = {
  id: 'capture',
  titleKey: 'tutorial.topic.capture',
  descKey: 'tutorial.topic.capture.desc',
  steps: [
    {
      kind: 'intro',
      instruction: ['tutorial.intro.capture1'],
      demo: {
        blockers: [
          { type: 'queen', color: 'white', row: 3, col: 3 },
          { type: 'pawn', color: 'black', row: 3, col: 7 },
        ],
      },
    },
    {
      kind: 'intro',
      instruction: ['tutorial.intro.capture2'],
      demo: {
        blockers: [
          { type: 'queen', color: 'white', row: 3, col: 3 },
          { type: 'pawn', color: 'black', row: 3, col: 7 },
          { type: 'rook', color: 'black', row: 0, col: 7 },
        ],
      },
    },
    {
      kind: 'intro',
      instruction: ['tutorial.intro.capture3'],
      demo: {
        blockers: [
          { type: 'queen', color: 'white', row: 3, col: 3 },
          { type: 'pawn', color: 'black', row: 3, col: 0 },
          { type: 'pawn', color: 'black', row: 3, col: 7 },
          { type: 'rook', color: 'black', row: 0, col: 7 },
        ],
      },
    },
    {
      id: 'capture-1',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.capturePiece',
      piece: { type: 'queen', color: 'white', row: 3, col: 3 },
      opponents: [
        { type: 'pawn', color: 'black', row: 3, col: 0 },
        { type: 'pawn', color: 'black', row: 3, col: 7 },
        { type: 'rook', color: 'black', row: 0, col: 7 },
      ],
      // 吃左边没被保护的兵；吃右边的兵会被车吃回
      target: { row: 3, col: 0 },
      replies: [{ trigger: { row: 3, col: 7 }, from: { row: 0, col: 7 }, to: { row: 3, col: 7 } }],
    },
    {
      id: 'capture-2',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.capturePiece',
      piece: { type: 'queen', color: 'white', row: 7, col: 3 },
      opponents: [
        { type: 'pawn', color: 'black', row: 4, col: 0 },
        { type: 'pawn', color: 'black', row: 4, col: 6 },
        { type: 'queen', color: 'black', row: 2, col: 6 },
      ],
      // 吃斜前方没被保护的兵；吃另一侧的兵会被黑后沿竖线吃回
      target: { row: 4, col: 0 },
      replies: [{ trigger: { row: 4, col: 6 }, from: { row: 2, col: 6 }, to: { row: 4, col: 6 } }],
    },
    {
      id: 'capture-3',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.capturePiece',
      piece: { type: 'rook', color: 'white', row: 5, col: 3 },
      opponents: [
        { type: 'pawn', color: 'black', row: 1, col: 4 },
        { type: 'bishop', color: 'black', row: 2, col: 3 },
        { type: 'knight', color: 'black', row: 5, col: 5 },
      ],
      target: { row: 5, col: 5 },
      replies: [{ trigger: { row: 2, col: 3 }, from: { row: 1, col: 4 }, to: { row: 2, col: 3 } }],
    },    {
      id: 'capture-4',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.capturePiece',
      piece: { type: 'knight', color: 'white', row: 2, col: 6 },
      opponents: [
        { type: 'bishop', color: 'black', row: 0, col: 5 },
        { type: 'rook', color: 'black', row: 0, col: 7 },
        { type: 'pawn', color: 'black', row: 1, col: 5 },
        { type: 'pawn', color: 'black', row: 1, col: 6 },
        { type: 'pawn', color: 'black', row: 1, col: 7 },
      ],
      target: { row: 0, col: 7 },
      replies: [
        { trigger: { row: 0, col: 5 }, from: { row: 0, col: 7 }, to: { row: 0, col: 5 } }],
    },
  ],
}
