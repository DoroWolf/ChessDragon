import type { TutorialTopic } from '../../types'

/**
 * 基础 · 王车易位：王一次走两格、车同时跳到王的另一边。
 *
 * 挑战靠 target 指定王的落点（王翼 g1 / 后翼 c1），from 指定由王来走。
 * 框架里王走到两格远时会把对应的车一起挪过去；易位的合法性
 * （王与车之间为空、王不被将军、不经过被攻击的格）由 composable 判断。
 */
export const castlingTopic: TutorialTopic = {
  id: 'castling',
  titleKey: 'tutorial.topic.castling',
  descKey: 'tutorial.topic.castling.desc',
  steps: [
    {
      kind: 'intro',
      instruction: ['tutorial.intro.castling1'],
      demo: {
        blockers: [
          { type: 'pawn', color: 'white', row: 6, col: 5 },
          { type: 'pawn', color: 'white', row: 6, col: 6 },
          { type: 'pawn', color: 'white', row: 6, col: 7 },
          { type: 'king', color: 'white', row: 7, col: 4 },
          { type: 'rook', color: 'white', row: 7, col: 7 },
        ],
      },
    },
    {
      id: 'castling-1',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.castling1',
      piece: [
        { type: 'pawn', color: 'white', row: 6, col: 5 },
        { type: 'pawn', color: 'white', row: 6, col: 6 },
        { type: 'pawn', color: 'white', row: 6, col: 7 },
        { type: 'king', color: 'white', row: 7, col: 4 },
        { type: 'rook', color: 'white', row: 7, col: 7 },
      ],
      // 王翼易位：王从 e1 走到 g1
      target: { row: 7, col: 6, from: { row: 7, col: 4 } },
    },
    {
      id: 'castling-2',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.castling2',
      piece: [
        { type: 'pawn', color: 'white', row: 6, col: 0 },
        { type: 'pawn', color: 'white', row: 6, col: 1 },
        { type: 'pawn', color: 'white', row: 6, col: 2 },
        { type: 'king', color: 'white', row: 7, col: 4 },
        { type: 'rook', color: 'white', row: 7, col: 0 },
      ],
      // 后翼易位：王从 e1 走到 c1
      target: { row: 7, col: 2, from: { row: 7, col: 4 } },
    },
    {
      kind: 'intro',
      instruction: ['tutorial.intro.castling2', 'tutorial.intro.castling3'],
      demo: {
        blockers: [
          { type: 'pawn', color: 'white', row: 6, col: 0 },
          { type: 'pawn', color: 'white', row: 6, col: 1 },
          { type: 'pawn', color: 'white', row: 6, col: 2 },
          { type: 'pawn', color: 'white', row: 6, col: 5 },
          { type: 'pawn', color: 'white', row: 6, col: 6 },
          { type: 'pawn', color: 'white', row: 6, col: 7 },
          { type: 'king', color: 'white', row: 7, col: 4 },
          { type: 'rook', color: 'white', row: 7, col: 0 },
          { type: 'rook', color: 'white', row: 7, col: 7 },
        ],
      },
    },
    {
      id: 'castling-3',
      kind: 'move-as-required',
      instruction: 'tutorial.challenge.castling3',
      piece: [
        { type: 'pawn', color: 'white', row: 6, col: 0 },
        { type: 'pawn', color: 'white', row: 6, col: 1 },
        { type: 'pawn', color: 'white', row: 6, col: 2 },
        { type: 'pawn', color: 'white', row: 6, col: 5 },
        { type: 'pawn', color: 'white', row: 6, col: 6 },
        { type: 'pawn', color: 'white', row: 6, col: 7 },
        { type: 'king', color: 'white', row: 7, col: 4 },
        { type: 'rook', color: 'white', row: 7, col: 0 },
        { type: 'rook', color: 'white', row: 7, col: 7 },
      ],
      // 黑车控制 d 竖线：后翼易位会让王经过被攻击的 d1，所以只能王翼易位
      opponents: { type: 'rook', color: 'black', row: 0, col: 3 },
      target: { row: 7, col: 6, from: { row: 7, col: 4 } },
    },
  ],
}
