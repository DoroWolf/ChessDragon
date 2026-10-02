// Syzygy Tablebase - 索引表常量（Index Tables）
// 移植自 python-chess 的 chess/syzygy.py（MIT License），
// 这些常量与数据格式均来自 Ronald de Man 的 Syzygy 残局库规范。
//
// 坐标系说明：库文件使用"python-chess 方格编号"——
//   square = (7 - row) * 8 + col，即 rank1 = 0..7、file a = 0。
//   本工程棋盘 row 0 = 第 8 横线、col 0 = a 线，转换见 sqOf()。

export const TBPIECES = 7

/** 三角索引：把 64 格按对称性折叠成 10 个等价类 */
export const TRIANGLE: number[] = [
  6, 0, 1, 2, 2, 1, 0, 6,
  0, 7, 3, 4, 4, 3, 7, 0,
  1, 3, 8, 5, 5, 8, 3, 1,
  2, 4, 5, 9, 9, 5, 4, 2,
  2, 4, 5, 9, 9, 5, 4, 2,
  1, 3, 8, 5, 5, 8, 3, 1,
  0, 7, 3, 4, 4, 3, 7, 0,
  6, 0, 1, 2, 2, 1, 0, 6,
]

export const INVTRIANGLE: number[] = [1, 2, 3, 10, 11, 19, 0, 9, 18, 27]

/** 下三角索引 */
export const LOWER: number[] = [
  28, 0, 1, 2, 3, 4, 5, 6,
  0, 29, 7, 8, 9, 10, 11, 12,
  1, 7, 30, 13, 14, 15, 16, 17,
  2, 8, 13, 31, 18, 19, 20, 21,
  3, 9, 14, 18, 32, 22, 23, 24,
  4, 10, 15, 19, 22, 33, 25, 26,
  5, 11, 16, 20, 23, 25, 34, 27,
  6, 12, 17, 21, 24, 26, 27, 35,
]

/** 对角线索引 */
export const DIAG: number[] = [
  0, 0, 0, 0, 0, 0, 0, 8,
  0, 1, 0, 0, 0, 0, 9, 0,
  0, 0, 2, 0, 0, 10, 0, 0,
  0, 0, 0, 3, 11, 0, 0, 0,
  0, 0, 0, 12, 4, 0, 0, 0,
  0, 0, 13, 0, 0, 5, 0, 0,
  0, 14, 0, 0, 0, 0, 6, 0,
  15, 0, 0, 0, 0, 0, 0, 7,
]

/** 兵的花式索引（flap） */
export const FLAP: number[] = [
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 6, 12, 18, 18, 12, 6, 0,
  1, 7, 13, 19, 19, 13, 7, 1,
  2, 8, 14, 20, 20, 14, 8, 2,
  3, 9, 15, 21, 21, 15, 9, 3,
  4, 10, 16, 22, 22, 16, 10, 4,
  5, 11, 17, 23, 23, 17, 11, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
]

/** 兵的 twist 索引 */
export const PTWIST: number[] = [
  0, 0, 0, 0, 0, 0, 0, 0,
  47, 35, 23, 11, 10, 22, 34, 46,
  45, 33, 21, 9, 8, 20, 32, 44,
  43, 31, 19, 7, 6, 18, 30, 42,
  41, 29, 17, 5, 4, 16, 28, 40,
  39, 27, 15, 3, 2, 14, 26, 38,
  37, 25, 13, 1, 0, 12, 24, 36,
  0, 0, 0, 0, 0, 0, 0, 0,
]

export const INVFLAP: number[] = [
  8, 16, 24, 32, 40, 48,
  9, 17, 25, 33, 41, 49,
  10, 18, 26, 34, 42, 50,
  11, 19, 27, 35, 43, 51,
]

/** 左右对称折叠后的兵线（file） */
export const FILE_TO_FILE: number[] = [0, 1, 2, 3, 3, 2, 1, 0]

/** 王对王索引（K2 编码），-1 表示不合法的王位置组合 */
export const KK_IDX: number[][] = [
  [
    -1, -1, -1, 0, 1, 2, 3, 4,
    -1, -1, -1, 5, 6, 7, 8, 9,
    10, 11, 12, 13, 14, 15, 16, 17,
    18, 19, 20, 21, 22, 23, 24, 25,
    26, 27, 28, 29, 30, 31, 32, 33,
    34, 35, 36, 37, 38, 39, 40, 41,
    42, 43, 44, 45, 46, 47, 48, 49,
    50, 51, 52, 53, 54, 55, 56, 57,
  ],
  [
    58, -1, -1, -1, 59, 60, 61, 62,
    63, -1, -1, -1, 64, 65, 66, 67,
    68, 69, 70, 71, 72, 73, 74, 75,
    76, 77, 78, 79, 80, 81, 82, 83,
    84, 85, 86, 87, 88, 89, 90, 91,
    92, 93, 94, 95, 96, 97, 98, 99,
    100, 101, 102, 103, 104, 105, 106, 107,
    108, 109, 110, 111, 112, 113, 114, 115,
  ],
  [
    116, 117, -1, -1, -1, 118, 119, 120,
    121, 122, -1, -1, -1, 123, 124, 125,
    126, 127, 128, 129, 130, 131, 132, 133,
    134, 135, 136, 137, 138, 139, 140, 141,
    142, 143, 144, 145, 146, 147, 148, 149,
    150, 151, 152, 153, 154, 155, 156, 157,
    158, 159, 160, 161, 162, 163, 164, 165,
    166, 167, 168, 169, 170, 171, 172, 173,
  ],
  [
    174, -1, -1, -1, 175, 176, 177, 178,
    179, -1, -1, -1, 180, 181, 182, 183,
    184, -1, -1, -1, 185, 186, 187, 188,
    189, 190, 191, 192, 193, 194, 195, 196,
    197, 198, 199, 200, 201, 202, 203, 204,
    205, 206, 207, 208, 209, 210, 211, 212,
    213, 214, 215, 216, 217, 218, 219, 220,
    221, 222, 223, 224, 225, 226, 227, 228,
  ],
  [
    229, 230, -1, -1, -1, 231, 232, 233,
    234, 235, -1, -1, -1, 236, 237, 238,
    239, 240, -1, -1, -1, 241, 242, 243,
    244, 245, 246, 247, 248, 249, 250, 251,
    252, 253, 254, 255, 256, 257, 258, 259,
    260, 261, 262, 263, 264, 265, 266, 267,
    268, 269, 270, 271, 272, 273, 274, 275,
    276, 277, 278, 279, 280, 281, 282, 283,
  ],
  [
    284, 285, 286, 287, 288, 289, 290, 291,
    292, 293, -1, -1, -1, 294, 295, 296,
    297, 298, -1, -1, -1, 299, 300, 301,
    302, 303, -1, -1, -1, 304, 305, 306,
    307, 308, 309, 310, 311, 312, 313, 314,
    315, 316, 317, 318, 319, 320, 321, 322,
    323, 324, 325, 326, 327, 328, 329, 330,
    331, 332, 333, 334, 335, 336, 337, 338,
  ],
  [
    -1, -1, 339, 340, 341, 342, 343, 344,
    -1, -1, 345, 346, 347, 348, 349, 350,
    -1, -1, 441, 351, 352, 353, 354, 355,
    -1, -1, -1, 442, 356, 357, 358, 359,
    -1, -1, -1, -1, 443, 360, 361, 362,
    -1, -1, -1, -1, -1, 444, 363, 364,
    -1, -1, -1, -1, -1, -1, 445, 365,
    -1, -1, -1, -1, -1, -1, -1, 446,
  ],
  [
    -1, -1, -1, 366, 367, 368, 369, 370,
    -1, -1, -1, 371, 372, 373, 374, 375,
    -1, -1, -1, 376, 377, 378, 379, 380,
    -1, -1, -1, 447, 381, 382, 383, 384,
    -1, -1, -1, -1, 448, 385, 386, 387,
    -1, -1, -1, -1, -1, 449, 388, 389,
    -1, -1, -1, -1, -1, -1, 450, 390,
    -1, -1, -1, -1, -1, -1, -1, 451,
  ],
  [
    452, 391, 392, 393, 394, 395, 396, 397,
    -1, -1, -1, -1, 398, 399, 400, 401,
    -1, -1, -1, -1, 402, 403, 404, 405,
    -1, -1, -1, -1, 406, 407, 408, 409,
    -1, -1, -1, -1, 453, 410, 411, 412,
    -1, -1, -1, -1, -1, 454, 413, 414,
    -1, -1, -1, -1, -1, -1, 455, 415,
    -1, -1, -1, -1, -1, -1, -1, 456,
  ],
  [
    457, 416, 417, 418, 419, 420, 421, 422,
    -1, 458, 423, 424, 425, 426, 427, 428,
    -1, -1, -1, -1, -1, 429, 430, 431,
    -1, -1, -1, -1, -1, 432, 433, 434,
    -1, -1, -1, -1, -1, 435, 436, 437,
    -1, -1, -1, -1, -1, 459, 438, 439,
    -1, -1, -1, -1, -1, -1, 460, 440,
    -1, -1, -1, -1, -1, -1, -1, 461,
  ],
]


export const PCHR = ['K', 'Q', 'R', 'B', 'N', 'P']

/** 库文件中的棋子编码：1=兵 2=马 3=象 4=车 5=后 6=王 */
export const KING_CODE = 6
export const PAWN_CODE = 1

/** WDL(-2..2) -> DTZ 表中的 map 索引 */
export const WDL_TO_MAP = [1, 3, 0, 2, 0]

/** DTZ 表 flags 中每种 WDL 对应的 PA 标志 */
export const PA_FLAGS = [8, 0, 0, 0, 4]

/** WDL(-2..2) -> DTZ 的粗略值 */
export const WDL_TO_DTZ = [-1, -101, 0, 101, 1]

/** 每种编码类型下"王组合"的基数 */
export const PIVFAC = [31332, 28056, 462]

// 组合数查表：BINOM[x][y]，x <= 64、y <= 8，全部可精确表示为 double
const BINOM: number[][] = (() => {
  const table: number[][] = []
  for (let x = 0; x <= 64; x++) {
    const row: number[] = Array.from({ length: 9 }, () => 0)
    for (let y = 0; y <= Math.min(8, x); y++) {
      let num = 1n
      let den = 1n
      for (let i = 0; i < y; i++) {
        num *= BigInt(x - i)
        den *= BigInt(i + 1)
      }
      row[y] = Number(num / den)
    }
    table.push(row)
  }
  return table
})()

/** 组合数 C(x, y)，越界返回 0（与参考实现一致） */
export function binom(x: number, y: number): number {
  if (x < 0 || y < 0 || y > x) return 0
  const row = BINOM[x]
  if (row && y <= 8) return row[y]!
  let num = 1n
  let den = 1n
  for (let i = 0; i < y; i++) {
    num *= BigInt(x - i)
    den *= BigInt(i + 1)
  }
  return Number(num / den)
}

/**
 * 参考实现中的 subfactor(k, n)：
 *   k = 0 -> n；k >= 1 -> C(n, k)
 */
export function subfactor(k: number, n: number): number {
  if (k === 0) return n
  return binom(n, k)
}

/** 计算 DTZ 为 0（吃子/兵着）局面之前的 DTZ 值 */
export function dtzBeforeZeroing(wdl: number): number {
  const sign = (wdl > 0 ? 1 : 0) - (wdl < 0 ? 1 : 0)
  return sign * (Math.abs(wdl) === 2 ? 1 : 101)
}

export const PAWNIDX: number[][] = []
export const PFACTOR: number[][] = []

for (let i = 0; i < 5; i++) {
  const idxRow: number[] = Array.from({ length: 24 }, () => 0)
  const factorRow: number[] = Array.from({ length: 4 }, () => 0)
  let j = 0
  // 注意：每一组（4 条兵线）的计数 s 都要从 0 重新开始
  for (let group = 0; group < 4; group++) {
    const end = 6 * (group + 1)
    let s = 0
    while (j < end) {
      idxRow[j] = s
      s += i === 0 ? 1 : binom(PTWIST[INVFLAP[j]!]!, i)
      j++
    }
    factorRow[group] = s
  }
  PAWNIDX.push(idxRow)
  PFACTOR.push(factorRow)
}


/** 本工程 (row, col) -> 库文件方格编号 */
export function sqOf(row: number, col: number): number {
  return (7 - row) * 8 + col
}

/** 库文件方格编号 -> 本工程 row */
export function rowOf(sq: number): number {
  return 7 - (sq >> 3)
}

/** 库文件方格编号 -> 本工程 col */
export function colOf(sq: number): number {
  return sq & 7
}

/** 与对角线的偏移（rank - file） */
export function offdiag(sq: number): number {
  return (sq >> 3) - (sq & 7)
}

/** 沿主对角线翻转 */
export function flipdiag(sq: number): number {
  return ((sq >> 3) | (sq << 3)) & 63
}

const TABLENAME_REGEX = /^[KQRBNP]+v[KQRBNP]+$/

function pieceOrder(char: string): number {
  return PCHR.indexOf(char)
}

function sortPieces(pieces: string): string {
  return pieces
    .split('')
    .sort((a, b) => pieceOrder(a) - pieceOrder(b))
    .join('')
}

function codesOf(pieces: string): number[] {
  return pieces.split('').map(pieceOrder)
}

function lessThan(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]!
  }
  return a.length < b.length
}

/** 把表名规范化为库文件中的标准写法（子力多的在前，同级按 KQRBNP 排序） */
export function normalizeTablename(name: string, mirror = false): string {
  const parts = name.split('v')
  const w = sortPieces(parts[0] ?? '')
  const b = sortPieces(parts[1] ?? '')

  const swap = mirror !== (w.length !== b.length ? w.length < b.length : lessThan(codesOf(b), codesOf(w)))
  return swap ? `${b}v${w}` : `${w}v${b}`
}

/** 是否为规范的残局表名（KvK 除外） */
export function isTablename(name: string): boolean {
  return (
    name.length <= TBPIECES + 1 &&
    TABLENAME_REGEX.test(name) &&
    normalizeTablename(name) === name &&
    name !== 'KvK' &&
    name.startsWith('K') &&
    name.includes('vK')
  )
}

/** 由文件中的棋子编码序列重算表名（部分残局的存储键与文件名不同） */
export function recalcKey(pieces: number[], mirror = false): string {
  const w = mirror ? 8 : 0
  const b = mirror ? 0 : 8
  const count = (code: number) => pieces.filter((p) => p === code).length
  const side = (offset: number) =>
    'K'.repeat(count(6 ^ offset)) +
    'Q'.repeat(count(5 ^ offset)) +
    'R'.repeat(count(4 ^ offset)) +
    'B'.repeat(count(3 ^ offset)) +
    'N'.repeat(count(2 ^ offset)) +
    'P'.repeat(count(1 ^ offset))
  return `${side(w)}v${side(b)}`
}

