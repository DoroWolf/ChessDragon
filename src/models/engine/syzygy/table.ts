// ============================================================
// Syzygy Tablebase - 表文件解析与解压（Table / PairsData）
// 移植自 python-chess 的 chess/syzygy.py（MIT License）
//
// .rtbw / .rtbz 文件是 RE-PAIR 压缩的定长记录表：
//   文件头 -> 棋子编码表 -> Huffman 表 -> 索引表 -> 数据块
// 查询流程：位置编码(idx) -> 二分定位数据块 -> Huffman 解压 -> WDL/DTZ 值
// ============================================================
import {
  TBPIECES,
  PCHR,
  binom,
  subfactor,
  PIVFAC,
  PAWNIDX,
  PFACTOR,
  FILE_TO_FILE,
  FLAP,
  PTWIST,
  offdiag,
  flipdiag,
  normalizeTablename,
  recalcKey,
  TRIANGLE,
  DIAG,
  LOWER,
  KK_IDX,
  WDL_TO_MAP,
  PA_FLAGS,
} from './tables'

import type { Color } from '../../chess'

// ============================================================
// 类型
// ============================================================
/** Huffman 解压所需的块级元数据 */
export interface PairsData {
  indextable: number
  sizetable: number
  data: number
  offset: number
  symlen: Int32Array
  sympat: number
  blocksize: number
  idxbits: number
  minLen: number
  /** Huffman 基础码字（64 位，拆成高低 32 位；必须用无符号数组） */
  baseHi: Uint32Array
  baseLo: Uint32Array
}

/** 兵残局：每种兵线（file）一份数据 */
export interface PawnFileData {
  precomp: PairsData[]
  factor: number[][]
  pieces: number[][]
  norm: number[][]
}

export interface PawnFileDataDtz {
  precomp: PairsData | null
  factor: number[]
  pieces: number[]
  norm: number[]
}

/** 由外部提供的"取某类棋子所在格"函数（结果需按方格编号升序） */
export type PieceSquaresFn = (pieceCode: number, colorIndex: number) => number[]

// ============================================================
// 字节读取工具（库文件为小端，位流为大端）
// ============================================================
export function readU8(data: Uint8Array, ptr: number): number {
  return data[ptr] ?? 0
}

export function readU16(data: Uint8Array, ptr: number): number {
  return (data[ptr] ?? 0) | ((data[ptr + 1] ?? 0) << 8)
}

export function readU32(data: Uint8Array, ptr: number): number {
  return (
    ((data[ptr] ?? 0) |
      ((data[ptr + 1] ?? 0) << 8) |
      ((data[ptr + 2] ?? 0) << 16) |
      ((data[ptr + 3] ?? 0) << 24)) >>>
    0
  )
}

export function readU32Be(data: Uint8Array, ptr: number): number {
  return (
    (((data[ptr] ?? 0) << 24) |
      ((data[ptr + 1] ?? 0) << 16) |
      ((data[ptr + 2] ?? 0) << 8) |
      (data[ptr + 3] ?? 0)) >>>
    0
  )
}

/** 64 位逻辑右移（n < 32 时可能超过 32 位，用 BigInt 兜底） */
function shr64(hi: number, lo: number, n: number): number {
  if (n <= 0) return 0
  if (n >= 64) return 0
  if (n >= 32) return hi >>> (n - 32)
  const v = (BigInt(hi) << 32n) | BigInt(lo)
  return Number(v >> BigInt(n))
}

// ============================================================
// Table：单个残局表文件（WDL 或 DTZ）
// ============================================================
export class Table {
  data: Uint8Array | null
  initialized = false

  readonly tablename: string
  key: string
  mirroredKey: string
  readonly symmetric: boolean
  readonly num: number
  readonly hasPawns: boolean
  readonly pawns: [number, number]
  encType = 0

  /** setup_pairs 计算的各区段字节数（下标含义见各 init 函数） */
  size: number[] = Array.from({ length: 24 }, () => 0)
  /** setup_pairs 回传的 flags 与"下一段起始偏移" */
  protected _flags = 0
  protected _next = 0

  constructor(tablename: string, data: Uint8Array) {
    this.data = data
    this.tablename = tablename
    this.key = normalizeTablename(tablename)
    this.mirroredKey = normalizeTablename(tablename, true)
    this.symmetric = this.key === this.mirroredKey
    // 表名去掉 "v" 后即为子力数
    this.num = tablename.length - 1
    this.hasPawns = tablename.includes('P')

    const parts = tablename.split('v')
    const whitePart = parts[0] ?? ''
    const blackPart = parts[1] ?? ''

    if (this.hasPawns) {
      const whitePawns = whitePart.split('').filter((c) => c === 'P').length
      const blackPawns = blackPart.split('').filter((c) => c === 'P').length
      // 兵少的一方作为第一组（与库文件存储方式一致）
      const swapped = blackPawns > 0 && (whitePawns === 0 || blackPawns < whitePawns)
      this.pawns = swapped ? [blackPawns, whitePawns] : [whitePawns, blackPawns]
    } else {
      this.pawns = [0, 0]
      let j = 0
      for (const pieceType of PCHR) {
        if (blackPart.split('').filter((c) => c === pieceType).length === 1) j += 1
        if (whitePart.split('').filter((c) => c === pieceType).length === 1) j += 1
      }
      // 标准象棋双方各一王 -> j >= 2，因此只会出现 0（111）与 2（K2）两种编码
      this.encType = j >= 3 ? 0 : 2
    }
  }

  protected u8(ptr: number): number {
    return readU8(this.data!, ptr)
  }

  protected u16(ptr: number): number {
    return readU16(this.data!, ptr)
  }

  protected u32(ptr: number): number {
    return readU32(this.data!, ptr)
  }

  protected u32be(ptr: number): number {
    return readU32Be(this.data!, ptr)
  }

  // ----------------------------------------------------------
  // 压缩块头解析
  // ----------------------------------------------------------
  protected setupPairs(dataPtr: number, tbSize: number, sizeIdx: number, wdl: boolean): PairsData {
    const d: PairsData = {
      indextable: 0,
      sizetable: 0,
      data: 0,
      offset: 0,
      symlen: new Int32Array(0),
      sympat: 0,
      blocksize: 0,
      idxbits: 0,
      minLen: 0,
      baseHi: new Uint32Array(0),
      baseLo: new Uint32Array(0),
    }

    this._flags = this.u8(dataPtr)

    // 0x80：整表同值，没有压缩数据
    if (this.u8(dataPtr) & 0x80) {
      d.idxbits = 0
      d.minLen = wdl ? this.u8(dataPtr + 1) : 0
      this._next = dataPtr + 2
      this.size[sizeIdx] = 0
      this.size[sizeIdx + 1] = 0
      this.size[sizeIdx + 2] = 0
      return d
    }

    d.blocksize = this.u8(dataPtr + 1)
    d.idxbits = this.u8(dataPtr + 2)

    const realNumBlocks = this.u32(dataPtr + 4)
    const numBlocks = realNumBlocks + this.u8(dataPtr + 3)
    const maxLen = this.u8(dataPtr + 8)
    const minLen = this.u8(dataPtr + 9)
    const h = maxLen - minLen + 1
    const numSyms = this.u16(dataPtr + 10 + 2 * h)

    d.offset = dataPtr + 10
    d.symlen = new Int32Array(h * 8 + numSyms)
    d.sympat = dataPtr + 12 + 2 * h
    d.minLen = minLen

    this._next = dataPtr + 12 + 2 * h + 3 * numSyms + (numSyms & 1)

    const numIndices = (tbSize + (1 << d.idxbits) - 1) >> d.idxbits
    this.size[sizeIdx] = 6 * numIndices
    this.size[sizeIdx + 1] = 2 * numBlocks
    this.size[sizeIdx + 2] = (1 << d.blocksize) * realNumBlocks

    const tmp = new Uint8Array(numSyms)
    for (let i = 0; i < numSyms; i++) {
      if (!tmp[i]) this.calcSymlen(d, i, tmp)
    }

    const baseVal: number[] = Array.from({ length: h }, () => 0)
    for (let i = h - 2; i >= 0; i--) {
      baseVal[i] = Math.floor(
        (baseVal[i + 1]! + this.u16(d.offset + i * 2) - this.u16(d.offset + i * 2 + 2)) / 2,
      )
    }
    d.baseHi = new Uint32Array(h)
    d.baseLo = new Uint32Array(h)
    for (let i = 0; i < h; i++) {
      const v = BigInt(baseVal[i]!) << BigInt(64 - (minLen + i))
      d.baseHi[i] = Number((v >> 32n) & 0xffffffffn)
      d.baseLo[i] = Number(v & 0xffffffffn)
    }

    d.offset -= 2 * d.minLen
    return d
  }

  /** 计算某个 Huffman 符号的解压长度（显式栈迭代，避免深递归） */
  private calcSymlen(d: PairsData, s: number, tmp: Uint8Array): void {
    const stack: number[] = [s]
    while (stack.length > 0) {
      const cur = stack[stack.length - 1]!
      if (tmp[cur]) {
        stack.pop()
        continue
      }
      const w = d.sympat + 3 * cur
      const s2 = (this.u8(w + 2) << 4) | (this.u8(w + 1) >> 4)
      if (s2 === 0x0fff) {
        d.symlen[cur] = 0
        tmp[cur] = 1
        stack.pop()
        continue
      }
      const s1 = ((this.u8(w + 1) & 0xf) << 8) | this.u8(w)
      if (!tmp[s1]) {
        stack.push(s1)
        continue
      }
      if (!tmp[s2]) {
        stack.push(s2)
        continue
      }
      d.symlen[cur] = d.symlen[s1]! + d.symlen[s2]! + 1
      tmp[cur] = 1
      stack.pop()
    }
  }

  // ----------------------------------------------------------
  // 归一化（norm）与因子（factor）表
  // ----------------------------------------------------------
  protected setNormPiece(norm: number[], pieces: number[]): void {
    norm[0] = this.encType === 0 ? 3 : 2

    let i = norm[0]!
    while (i < this.num) {
      let j = i
      while (j < this.num && pieces[j] === pieces[i]) {
        norm[i] = norm[i]! + 1
        j++
      }
      i += norm[i]!
    }
  }

  protected calcFactorsPiece(factor: number[], order: number, norm: number[]): number {
    let n = 64 - norm[0]!
    let f = 1
    let i = norm[0]!
    let k = 0

    while (i < this.num || k === order) {
      if (k === order) {
        factor[0] = f
        f *= PIVFAC[this.encType]!
      } else {
        factor[i] = f
        f *= subfactor(norm[i]!, n)
        n -= norm[i]!
        i += norm[i]!
      }
      k++
    }

    return f
  }

  protected setNormPawn(norm: number[], pieces: number[]): void {
    norm[0] = this.pawns[0]
    if (this.pawns[1]) {
      norm[this.pawns[0]] = this.pawns[1]
    }

    let i = this.pawns[0] + this.pawns[1]
    while (i < this.num) {
      let j = i
      while (j < this.num && pieces[j] === pieces[i]) {
        norm[i] = norm[i]! + 1
        j++
      }
      i += norm[i]!
    }
  }

  protected calcFactorsPawn(
    factor: number[],
    order: number,
    order2: number,
    norm: number[],
    file: number,
  ): number {
    let i = norm[0]!
    if (order2 < 0x0f) i += norm[i]!
    let n = 64 - i

    let fac = 1
    let k = 0
    while (i < this.num || k === order || k === order2) {
      if (k === order) {
        factor[0] = fac
        fac *= PFACTOR[norm[0]! - 1]![file]!
      } else if (k === order2) {
        factor[norm[0]!] = fac
        fac *= subfactor(norm[norm[0]!]!, 48 - norm[0]!)
      } else {
        factor[i] = fac
        fac *= subfactor(norm[i]!, n)
        n -= norm[i]!
        i += norm[i]!
      }
      k++
    }

    return fac
  }

  /** 兵残局的实际存储兵线（左右对称折叠） */
  protected pawnFile(pos: number[]): number {
    for (let i = 1; i < this.pawns[0]; i++) {
      if (FLAP[pos[0]!]! > FLAP[pos[i]!]!) {
        const tmp = pos[0]!
        pos[0] = pos[i]!
        pos[i] = tmp
      }
    }
    return FILE_TO_FILE[pos[0]! & 0x07]!
  }

  // ----------------------------------------------------------
  // 位置编码
  // ----------------------------------------------------------
  /**
   * 无兵残局的位置编码。
   * 标准象棋中 encType 只会是 0（111：三个"单件"）或 2（K2：两个王）。
   */
  protected encodePiece(norm: number[], pos: number[], factor: number[]): number {
    const n = this.num
    const encType = this.encType

    // 利用左右 / 上下 / 对角线对称性做规范化
    if (pos[0]! & 0x04) {
      for (let i = 0; i < n; i++) pos[i] = pos[i]! ^ 0x07
    }
    if (pos[0]! & 0x20) {
      for (let i = 0; i < n; i++) pos[i] = pos[i]! ^ 0x38
    }

    let first = n - 1
    for (let k = 0; k < n; k++) {
      if (offdiag(pos[k]!) !== 0) {
        first = k
        break
      }
    }
    if (first < (encType === 0 ? 3 : 2) && offdiag(pos[first]!) > 0) {
      for (let k = 0; k < n; k++) pos[k] = flipdiag(pos[k]!)
    }

    let idx = 0
    let i = 0
    if (encType === 0) {
      const cmp0 = pos[1]! > pos[0]! ? 1 : 0
      const cmp1 = (pos[2]! > pos[0]! ? 1 : 0) + (pos[2]! > pos[1]! ? 1 : 0)

      if (offdiag(pos[0]!) !== 0) {
        idx = TRIANGLE[pos[0]!]! * 63 * 62 + (pos[1]! - cmp0) * 62 + (pos[2]! - cmp1)
      } else if (offdiag(pos[1]!) !== 0) {
        idx =
          6 * 63 * 62 + DIAG[pos[0]!]! * 28 * 62 + LOWER[pos[1]!]! * 62 + pos[2]! - cmp1
      } else if (offdiag(pos[2]!) !== 0) {
        idx =
          6 * 63 * 62 +
          4 * 28 * 62 +
          DIAG[pos[0]!]! * 7 * 28 +
          (DIAG[pos[1]!]! - cmp0) * 28 +
          LOWER[pos[2]!]!
      } else {
        idx =
          6 * 63 * 62 +
          4 * 28 * 62 +
          4 * 7 * 28 +
          DIAG[pos[0]!]! * 7 * 6 +
          (DIAG[pos[1]!]! - cmp0) * 6 +
          (DIAG[pos[2]!]! - cmp1)
      }
      i = 3
    } else {
      // encType === 2：两个王用 KK_IDX 编码
      idx = KK_IDX[TRIANGLE[pos[0]!]!]![pos[1]!]!
      i = 2
    }

    idx *= factor[0]!

    while (i < n) {
      const t = norm[i]!

      for (let j = i; j < i + t; j++) {
        for (let k = j + 1; k < i + t; k++) {
          if (pos[j]! > pos[k]!) {
            const tmp = pos[j]!
            pos[j] = pos[k]!
            pos[k] = tmp
          }
        }
      }

      let s = 0
      for (let m = i; m < i + t; m++) {
        const p = pos[m]!
        let j = 0
        for (let l = 0; l < i; l++) {
          j += p > pos[l]! ? 1 : 0
        }
        s += binom(p - j, m - i + 1)
      }

      idx += s * factor[i]!
      i += t
    }

    return idx
  }

  /** 兵残局的位置编码 */
  protected encodePawn(norm: number[], pos: number[], factor: number[]): number {
    const n = this.num

    if (pos[0]! & 0x04) {
      for (let i = 0; i < n; i++) pos[i] = pos[i]! ^ 0x07
    }

    for (let i = 1; i < this.pawns[0]; i++) {
      for (let j = i + 1; j < this.pawns[0]; j++) {
        if (PTWIST[pos[i]!]! < PTWIST[pos[j]!]!) {
          const tmp = pos[i]!
          pos[i] = pos[j]!
          pos[j] = tmp
        }
      }
    }

    const t0 = this.pawns[0] - 1
    let idx = PAWNIDX[t0]![FLAP[pos[0]!]!]!
    for (let i = t0; i > 0; i--) {
      idx += binom(PTWIST[pos[i]!]!, t0 - i + 1)
    }
    idx *= factor[0]!

    // 其余兵
    let i = this.pawns[0]
    const t = i + this.pawns[1]
    if (t > i) {
      for (let j = i; j < t; j++) {
        for (let k = j + 1; k < t; k++) {
          if (pos[j]! > pos[k]!) {
            const tmp = pos[j]!
            pos[j] = pos[k]!
            pos[k] = tmp
          }
        }
      }
      let s = 0
      for (let m = i; m < t; m++) {
        const p = pos[m]!
        let j = 0
        for (let k = 0; k < i; k++) {
          j += p > pos[k]! ? 1 : 0
        }
        s += binom(p - j - 8, m - i + 1)
      }
      idx += s * factor[i]!
      i = t
    }

    while (i < n) {
      const tt = norm[i]!

      for (let j = i; j < i + tt; j++) {
        for (let k = j + 1; k < i + tt; k++) {
          if (pos[j]! > pos[k]!) {
            const tmp = pos[j]!
            pos[j] = pos[k]!
            pos[k] = tmp
          }
        }
      }

      let s = 0
      for (let m = i; m < i + tt; m++) {
        const p = pos[m]!
        let j = 0
        for (let k = 0; k < i; k++) {
          j += p > pos[k]! ? 1 : 0
        }
        s += binom(p - j, m - i + 1)
      }

      idx += s * factor[i]!
      i += tt
    }

    return idx
  }

  // ----------------------------------------------------------
  // Huffman 解压：取第 idx 条记录
  // ----------------------------------------------------------
  protected decompressPairs(d: PairsData, idx: number): number {
    // 整表同值
    if (!d.idxbits) return d.minLen

    const mainidx = idx >> d.idxbits
    let litidx = (idx & ((1 << d.idxbits) - 1)) - (1 << (d.idxbits - 1))
    let block = this.u32(d.indextable + 6 * mainidx)

    const idxOffset = this.u16(d.indextable + 6 * mainidx + 4)
    litidx += idxOffset

    if (litidx < 0) {
      while (litidx < 0) {
        block -= 1
        litidx += this.u16(d.sizetable + 2 * block) + 1
      }
    } else {
      while (litidx > this.u16(d.sizetable + 2 * block)) {
        litidx -= this.u16(d.sizetable + 2 * block) + 1
        block += 1
      }
    }

    let ptr = d.data + (block << d.blocksize)

    const m = d.minLen
    const baseIdx = -m

    // Huffman 码字为 64 位，这里用高低 32 位表示
    let codeHi = this.u32be(ptr)
    let codeLo = this.u32be(ptr + 4)
    ptr += 8
    let bitcnt = 0

    let sym = 0
    let guard = 0
    for (;;) {
      if (++guard > 4096) {
        throw new Error(`syzygy: decompress runaway (idx=${idx}, block=${block})`)
      }
      let l = m
      for (;;) {
        const bHi = d.baseHi[baseIdx + l]!
        const bLo = d.baseLo[baseIdx + l]!
        if (codeHi > bHi || (codeHi === bHi && codeLo >= bLo)) break
        l++
      }
      const bHi = d.baseHi[baseIdx + l]!
      const bLo = d.baseLo[baseIdx + l]!
      const dLo = (codeLo - bLo) >>> 0
      const borrow = codeLo < bLo ? 1 : 0
      const dHi = (codeHi - bHi - borrow) >>> 0

      sym = this.u16(d.offset + l * 2) + shr64(dHi, dLo, 64 - l)

      if (litidx < d.symlen[sym]! + 1) break
      litidx -= d.symlen[sym]! + 1

      // code <<= l
      if (l >= 32) {
        codeHi = (codeLo << (l - 32)) >>> 0
        codeLo = 0
      } else if (l > 0) {
        codeHi = ((codeHi << l) | (codeLo >>> (32 - l))) >>> 0
        codeLo = (codeLo << l) >>> 0
      }

      bitcnt += l
      if (bitcnt >= 32) {
        bitcnt -= 32
        const next = this.u32be(ptr)
        if (bitcnt === 0) {
          codeLo = (codeLo | next) >>> 0
        } else {
          codeHi = (codeHi | (next >>> (32 - bitcnt))) >>> 0
          codeLo = (codeLo | (next << bitcnt)) >>> 0
        }
        ptr += 4
      }
    }

    // 展开 RE-PAIR 符号
    const sympat = d.sympat
    let expandGuard = 0
    while (d.symlen[sym]! > 0) {
      if (++expandGuard > 4096) {
        throw new Error(`syzygy: symbol expansion runaway (sym=${sym})`)
      }
      const w = sympat + 3 * sym
      const s1 = ((this.u8(w + 1) & 0xf) << 8) | this.u8(w)
      if (litidx < d.symlen[s1]! + 1) {
        sym = s1
      } else {
        litidx -= d.symlen[s1]! + 1
        sym = (this.u8(w + 2) << 4) | (this.u8(w + 1) >> 4)
      }
    }

    const w = sympat + 3 * sym
    if (this.isDtz()) {
      return ((this.u8(w + 1) & 0x0f) << 8) | this.u8(w)
    }
    return this.u8(w)
  }

  /** 子类覆写：DTZ 表的记录为 12 位 */
  protected isDtz(): boolean {
    return false
  }
}

// ============================================================
// WDL 表（Win / Draw / Loss）
// ============================================================
export class WdlTable extends Table {
  private precomp: PairsData[] = []
  private pieces: number[][] = []
  private factor: number[][] = []
  private norm: number[][] = []
  private files: PawnFileData[] = []
  private tbSize: number[] = []

  private setupPiecesPiecePiece(dataPtr: number): void {
    this.pieces[0] = []
    for (let i = 0; i < this.num; i++) this.pieces[0]![i] = this.u8(dataPtr + i + 1) & 0x0f
    const order = this.u8(dataPtr) & 0x0f
    this.setNormPiece(this.norm[0]!, this.pieces[0]!)
    this.tbSize[0] = this.calcFactorsPiece(this.factor[0]!, order, this.norm[0]!)

    this.pieces[1] = []
    for (let i = 0; i < this.num; i++) this.pieces[1]![i] = this.u8(dataPtr + i + 1) >> 4
    const order2 = this.u8(dataPtr) >> 4
    this.setNormPiece(this.norm[1]!, this.pieces[1]!)
    this.tbSize[1] = this.calcFactorsPiece(this.factor[1]!, order2, this.norm[1]!)
  }

  private setupPiecesPawn(dataPtr: number, tbSizeIdx: number, file: number): void {
    const j = 1 + (this.pawns[1] > 0 ? 1 : 0)

    const order = this.u8(dataPtr) & 0x0f
    const order2 = this.pawns[1] ? this.u8(dataPtr + 1) & 0x0f : 0x0f
    const fileData = this.files[file]!
    fileData.pieces[0] = []
    for (let i = 0; i < this.num; i++) {
      fileData.pieces[0]![i] = this.u8(dataPtr + i + j) & 0x0f
    }
    fileData.norm[0] = Array.from({ length: this.num }, () => 0)
    this.setNormPawn(fileData.norm[0]!, fileData.pieces[0]!)
    fileData.factor[0] = Array.from({ length: TBPIECES }, () => 0)
    this.tbSize[tbSizeIdx] = this.calcFactorsPawn(
      fileData.factor[0]!,
      order,
      order2,
      fileData.norm[0]!,
      file,
    )

    const orderB = this.u8(dataPtr) >> 4
    const order2B = this.pawns[1] ? this.u8(dataPtr + 1) >> 4 : 0x0f
    fileData.pieces[1] = []
    for (let i = 0; i < this.num; i++) {
      fileData.pieces[1]![i] = this.u8(dataPtr + i + j) >> 4
    }
    fileData.norm[1] = Array.from({ length: this.num }, () => 0)
    this.setNormPawn(fileData.norm[1]!, fileData.pieces[1]!)
    fileData.factor[1] = Array.from({ length: TBPIECES }, () => 0)
    this.tbSize[tbSizeIdx + 1] = this.calcFactorsPawn(
      fileData.factor[1]!,
      orderB,
      order2B,
      fileData.norm[1]!,
      file,
    )
  }

  initTableWdl(): void {
    if (this.initialized) return

    this.tbSize = Array.from({ length: 8 }, () => 0)
    this.size = Array.from({ length: 24 }, () => 0)

    this.precomp = []
    this.pieces = []
    this.factor = [
      Array.from({ length: TBPIECES }, () => 0),
      Array.from({ length: TBPIECES }, () => 0),
    ]
    this.norm = [
      Array.from({ length: this.num }, () => 0),
      Array.from({ length: this.num }, () => 0),
    ]
    this.files = []
    for (let f = 0; f < 4; f++) {
      this.files[f] = { precomp: [], factor: [[], []], pieces: [[], []], norm: [[], []] }
    }

    const split = this.u8(4) & 0x01
    const files = this.u8(4) & 0x02 ? 4 : 1
    let dataPtr = 5

    if (!this.hasPawns) {
      this.setupPiecesPiecePiece(dataPtr)
      dataPtr += this.num + 1
      dataPtr += dataPtr & 0x01

      this.precomp[0] = this.setupPairs(dataPtr, this.tbSize[0]!, 0, true)
      dataPtr = this._next
      if (split) {
        this.precomp[1] = this.setupPairs(dataPtr, this.tbSize[1]!, 3, true)
        dataPtr = this._next
      } else {
        this.precomp[1] = this.precomp[0]!
      }

      this.precomp[0]!.indextable = dataPtr
      dataPtr += this.size[0]!
      if (split) {
        this.precomp[1]!.indextable = dataPtr
        dataPtr += this.size[3]!
      }

      this.precomp[0]!.sizetable = dataPtr
      dataPtr += this.size[1]!
      if (split) {
        this.precomp[1]!.sizetable = dataPtr
        dataPtr += this.size[4]!
      }

      dataPtr = (dataPtr + 0x3f) & ~0x3f
      this.precomp[0]!.data = dataPtr
      dataPtr += this.size[2]!
      if (split) {
        dataPtr = (dataPtr + 0x3f) & ~0x3f
        this.precomp[1]!.data = dataPtr
      }

      // 少数残局的存储键与文件名不同，需要按实际棋子重算
      this.key = recalcKey(this.pieces[0]!)
      this.mirroredKey = recalcKey(this.pieces[0]!, true)
    } else {
      const s = 1 + (this.pawns[1] > 0 ? 1 : 0)
      for (let f = 0; f < 4; f++) {
        this.setupPiecesPawn(dataPtr, 2 * f, f)
        dataPtr += this.num + s
      }
      dataPtr += dataPtr & 0x01

      for (let f = 0; f < files; f++) {
        this.files[f]!.precomp[0] = this.setupPairs(dataPtr, this.tbSize[2 * f]!, 6 * f, true)
        dataPtr = this._next
        if (split) {
          this.files[f]!.precomp[1] = this.setupPairs(
            dataPtr,
            this.tbSize[2 * f + 1]!,
            6 * f + 3,
            true,
          )
          dataPtr = this._next
        } else {
          this.files[f]!.precomp[1] = this.files[f]!.precomp[0]!
        }
      }

      for (let f = 0; f < files; f++) {
        this.files[f]!.precomp[0]!.indextable = dataPtr
        dataPtr += this.size[6 * f]!
        if (split) {
          this.files[f]!.precomp[1]!.indextable = dataPtr
          dataPtr += this.size[6 * f + 3]!
        }
      }

      for (let f = 0; f < files; f++) {
        this.files[f]!.precomp[0]!.sizetable = dataPtr
        dataPtr += this.size[6 * f + 1]!
        if (split) {
          this.files[f]!.precomp[1]!.sizetable = dataPtr
          dataPtr += this.size[6 * f + 4]!
        }
      }

      for (let f = 0; f < files; f++) {
        dataPtr = (dataPtr + 0x3f) & ~0x3f
        this.files[f]!.precomp[0]!.data = dataPtr
        dataPtr += this.size[6 * f + 2]!
        if (split) {
          dataPtr = (dataPtr + 0x3f) & ~0x3f
          this.files[f]!.precomp[1]!.data = dataPtr
          dataPtr += this.size[6 * f + 5]!
        }
      }
    }

    this.initialized = true
  }

  // ----------------------------------------------------------
  // 查询 WDL（返回 -2..2，未减去 2 之前为 0..4）
  // ----------------------------------------------------------
  probeWdlTable(key: string, turn: Color, squares: PieceSquaresFn): number {
    this.initTableWdl()

    if (!this.symmetric) {
      if (key !== this.key) {
        // 局面被镜像：交换双方视角
        return this.probeSide(key, turn, squares, 8, 0x38)
      }
      return this.probeSide(key, turn, squares, 0, 0)
    }

    // 对称表：只存一份数据，用镜像处理走子方
    if (turn === 'white') {
      return this.probeSide(key, turn, squares, 0, 0)
    }
    return this.probeSide(key, turn, squares, 8, 0x38)
  }

  private probeSide(
    key: string,
    turn: Color,
    squares: PieceSquaresFn,
    cmirror: number,
    mirror: number,
  ): number {
    const bside = this.symmetric ? 0 : key !== this.key ? (turn === 'white' ? 1 : 0) : turn !== 'white' ? 1 : 0

    if (!this.hasPawns) {
      const p = Array.from({ length: TBPIECES }, () => 0)
      let i = 0
      let guard = 0
      while (i < this.num) {
        if (++guard > 32) {
          throw new Error(`syzygy: piece fill runaway (key=${key}, bside=${bside}, i=${i})`)
        }
        const pieceType = this.pieces[bside]![i]! & 0x07
        const color = (this.pieces[bside]![i]! ^ cmirror) >> 3
        for (const square of squares(pieceType, color)) {
          p[i] = square
          i++
        }
      }
      const idx = this.encodePiece(this.norm[bside]!, p, this.factor[bside]!)
      return this.decompressPairs(this.precomp[bside]!, idx) - 2
    }

    const p = Array.from({ length: TBPIECES }, () => 0)
    let i = 0
    const first = this.files[0]!.pieces[0]![0]! ^ cmirror
    for (const square of squares(first & 0x07, first >> 3)) {
      p[i] = square ^ mirror
      i++
    }

    const file = this.pawnFile(p)
    const pc = this.files[file]!.pieces[bside]!
    let guard = 0
    while (i < this.num) {
      if (++guard > 32) {
        throw new Error(
          `syzygy: pawn piece fill runaway (key=${key}, file=${file}, bside=${bside}, i=${i})`,
        )
      }
      const color = (pc[i]! ^ cmirror) >> 3
      const pieceType = pc[i]! & 0x07
      for (const square of squares(pieceType, color)) {
        p[i] = square ^ mirror
        i++
      }
    }

    const idx = this.encodePawn(this.files[file]!.norm[bside]!, p, this.files[file]!.factor[bside]!)
    return this.decompressPairs(this.files[file]!.precomp[bside]!, idx) - 2
  }
}


// ============================================================
// DTZ 表（Distance To Zeroing）
// 注意：每个 DTZ 表只存一方（flags & 1）的数据，
// 另一方需要通过 probe_ab / 递归查询推导。
// ============================================================
export class DtzTable extends Table {
  private precomp: PairsData | null = null
  private pieces: number[] = []
  private factor: number[] = []
  private norm: number[] = []
  private files: PawnFileDataDtz[] = []
  private tbSize: number[] = []
  /** 无兵残局用 flags[0]；兵残局每兵线一个 */
  private flags: number[] = []
  private mapIdx: number[][] = []
  private pMap = 0

  protected override isDtz(): boolean {
    return true
  }

  private setupPiecesPieceDtz(dataPtr: number): void {
    this.pieces = []
    for (let i = 0; i < this.num; i++) this.pieces[i] = this.u8(dataPtr + i + 1) & 0x0f
    const order = this.u8(dataPtr) & 0x0f
    this.setNormPiece(this.norm, this.pieces)
    this.tbSize[0] = this.calcFactorsPiece(this.factor, order, this.norm)
  }

  private setupPiecesPawnDtz(dataPtr: number, tbSizeIdx: number, file: number): void {
    const j = 1 + (this.pawns[1] > 0 ? 1 : 0)
    const order = this.u8(dataPtr) & 0x0f
    const order2 = this.pawns[1] ? this.u8(dataPtr + 1) & 0x0f : 0x0f
    this.files[file]!.pieces = []
    for (let i = 0; i < this.num; i++) {
      this.files[file]!.pieces[i] = this.u8(dataPtr + i + j) & 0x0f
    }
    this.files[file]!.norm = Array.from({ length: this.num }, () => 0)
    this.setNormPawn(this.files[file]!.norm, this.files[file]!.pieces)
    this.files[file]!.factor = Array.from({ length: TBPIECES }, () => 0)
    this.tbSize[tbSizeIdx] = this.calcFactorsPawn(
      this.files[file]!.factor,
      order,
      order2,
      this.files[file]!.norm,
      file,
    )
  }

  initTableDtz(): void {
    if (this.initialized) return

    this.factor = Array.from({ length: TBPIECES }, () => 0)
    this.norm = Array.from({ length: this.num }, () => 0)
    this.tbSize = [0, 0, 0, 0]
    this.size = Array.from({ length: 24 }, () => 0)

    this.files = []
    for (let f = 0; f < 4; f++) {
      this.files[f] = { precomp: null, factor: [], pieces: [], norm: [] }
    }

    const files = this.u8(4) & 0x02 ? 4 : 1

    let dataPtr = 5

    if (!this.hasPawns) {
      this.mapIdx = [[0, 0, 0, 0]]

      this.setupPiecesPieceDtz(dataPtr)
      dataPtr += this.num + 1
      dataPtr += dataPtr & 0x01

      this.precomp = this.setupPairs(dataPtr, this.tbSize[0]!, 0, false)
      this.flags = [this._flags]
      dataPtr = this._next
      this.pMap = dataPtr
      if (this.flags[0]! & 2) {
        if (!(this.flags[0]! & 16)) {
          for (let i = 0; i < 4; i++) {
            this.mapIdx[0]![i] = dataPtr + 1 - this.pMap
            dataPtr += 1 + this.u8(dataPtr)
          }
        } else {
          for (let i = 0; i < 4; i++) {
            this.mapIdx[0]![i] = Math.floor((dataPtr + 2 - this.pMap) / 2)
            dataPtr += 2 + 2 * this.u16(dataPtr)
          }
        }
      }
      dataPtr += dataPtr & 0x01

      this.precomp.indextable = dataPtr
      dataPtr += this.size[0]!

      this.precomp.sizetable = dataPtr
      dataPtr += this.size[1]!

      dataPtr = (dataPtr + 0x3f) & ~0x3f
      this.precomp.data = dataPtr
      dataPtr += this.size[2]!

      this.key = recalcKey(this.pieces)
      this.mirroredKey = recalcKey(this.pieces, true)
    } else {
      const s = 1 + (this.pawns[1] > 0 ? 1 : 0)
      for (let f = 0; f < 4; f++) {
        this.setupPiecesPawnDtz(dataPtr, f, f)
        dataPtr += this.num + s
      }
      dataPtr += dataPtr & 0x01

      this.flags = []
      for (let f = 0; f < files; f++) {
        this.files[f]!.precomp = this.setupPairs(dataPtr, this.tbSize[f]!, 3 * f, false)
        dataPtr = this._next
        this.flags.push(this._flags)
      }

      this.mapIdx = []
      this.pMap = dataPtr
      for (let f = 0; f < files; f++) {
        const row: number[] = []
        if (this.flags[f]! & 2) {
          if (!(this.flags[f]! & 16)) {
            for (let i = 0; i < 4; i++) {
              row.push(dataPtr + 1 - this.pMap)
              dataPtr += 1 + this.u8(dataPtr)
            }
          } else {
            dataPtr += dataPtr & 0x01
            for (let i = 0; i < 4; i++) {
              row.push(Math.floor((dataPtr + 2 - this.pMap) / 2))
              dataPtr += 2 + 2 * this.u16(dataPtr)
            }
          }
        }
        this.mapIdx.push(row)
      }
      dataPtr += dataPtr & 0x01

      for (let f = 0; f < files; f++) {
        this.files[f]!.precomp!.indextable = dataPtr
        dataPtr += this.size[3 * f]!
      }

      for (let f = 0; f < files; f++) {
        this.files[f]!.precomp!.sizetable = dataPtr
        dataPtr += this.size[3 * f + 1]!
      }

      for (let f = 0; f < files; f++) {
        dataPtr = (dataPtr + 0x3f) & ~0x3f
        this.files[f]!.precomp!.data = dataPtr
        dataPtr += this.size[3 * f + 2]!
      }
    }

    this.initialized = true
  }

  /**
   * 查询 DTZ 表。
   * 返回 success = -1 表示该表不含当前走子方的数据（需要上层回退搜索）。
   */
  probeDtzTable(
    key: string,
    turn: Color,
    squares: PieceSquaresFn,
    wdl: number,
  ): { res: number; success: number } {
    this.initTableDtz()

    let cmirror: number
    let mirror: number
    let bside: number
    if (!this.symmetric) {
      if (key !== this.key) {
        cmirror = 8
        mirror = 0x38
        bside = turn === 'white' ? 1 : 0
      } else {
        cmirror = 0
        mirror = 0
        bside = turn !== 'white' ? 1 : 0
      }
    } else {
      cmirror = turn === 'white' ? 0 : 8
      mirror = turn === 'white' ? 0 : 0x38
      bside = 0
    }

    const mapEntry = WDL_TO_MAP[wdl + 2]!

    if (!this.hasPawns) {
      if ((this.flags[0]! & 1) !== bside && !this.symmetric) {
        return { res: 0, success: -1 }
      }

      const p = Array.from({ length: TBPIECES }, () => 0)
      let i = 0
      let pieceGuard = 0
      while (i < this.num) {
        if (++pieceGuard > 32) {
          throw new Error(`syzygy: dtz piece fill runaway (key=${key}, i=${i})`)
        }
        const pieceType = this.pieces[i]! & 0x07
        const color = (this.pieces[i]! ^ cmirror) >> 3
        for (const square of squares(pieceType, color)) {
          p[i] = square
          i++
        }
      }

      const idx = this.encodePiece(this.norm, p, this.factor)
      let res = this.decompressPairs(this.precomp!, idx)

      if (this.flags[0]! & 2) {
        if (!(this.flags[0]! & 16)) {
          res = this.u8(this.pMap + this.mapIdx[0]![mapEntry]! + res)
        } else {
          res = this.u16(this.pMap + 2 * (this.mapIdx[0]![mapEntry]! + res))
        }
      }

      if (!(this.flags[0]! & PA_FLAGS[wdl + 2]!) || wdl & 1) res *= 2
      return { res, success: 1 }
    }

    const p = Array.from({ length: TBPIECES }, () => 0)
    let i = 0
    const first = this.files[0]!.pieces[0]! ^ cmirror
    for (const square of squares(first & 0x07, first >> 3)) {
      p[i] = square ^ mirror
      i++
    }

    const file = this.pawnFile(p)
    if ((this.flags[file]! & 1) !== bside) {
      return { res: 0, success: -1 }
    }

    const pc = this.files[file]!.pieces
    let guard = 0
    while (i < this.num) {
      if (++guard > 32) {
        throw new Error(`syzygy: dtz pawn fill runaway (key=${key}, file=${file}, i=${i})`)
      }
      const pieceType = pc[i]! & 0x07
      const color = (pc[i]! ^ cmirror) >> 3
      for (const square of squares(pieceType, color)) {
        p[i] = square ^ mirror
        i++
      }
    }

    const idx = this.encodePawn(this.files[file]!.norm, p, this.files[file]!.factor)
    let res = this.decompressPairs(this.files[file]!.precomp!, idx)

    if (this.flags[file]! & 2) {
      if (!(this.flags[file]! & 16)) {
        res = this.u8(this.pMap + this.mapIdx[file]![mapEntry]! + res)
      } else {
        res = this.u16(this.pMap + 2 * (this.mapIdx[file]![mapEntry]! + res))
      }
    }

    if (!(this.flags[file]! & PA_FLAGS[wdl + 2]!) || wdl & 1) res *= 2
    return { res, success: 1 }
  }
}
