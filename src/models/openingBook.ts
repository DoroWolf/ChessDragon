// ============================================================
// Opening Book Module
//
// Loads Polyglot (.bin) opening books from public/opening_books/.
// Uses binary search with HTTP Range requests to avoid loading
// the entire file into memory.
// ============================================================

import type { AIDetailedMove } from './ai'
import type { Board, Color, MoveOptions } from './chess'
import { getEnPassantTarget, getPieceMoves } from './chess'
import {
  computePolyglotHash,
  getPolyglotCastlingRights,
  readUint64BE,
  readUint16BE,
  decodePolyglotMove,
} from './polyglot'
import type { PolyglotMove } from './polyglot'

// ============================================================
// Constants
// ============================================================

/** Each Polyglot book entry is 16 bytes */
const ENTRY_SIZE = 16

/** Maximum number of entries to load into memory. Beyond this, use binary
 *  search with Range requests. */
const MAX_IN_MEMORY_ENTRIES = 500_000 // ~8 MB

/** Maximum file size (in bytes) we'll attempt to load entirely.
 *  Beyond this, we require Range support. */
const MAX_FULL_LOAD_BYTES = MAX_IN_MEMORY_ENTRIES * ENTRY_SIZE

// ============================================================
// Types
// ============================================================

interface BookEntry {
  key: bigint
  move: number
  weight: number
}

interface BookFile {
  name: string
  url: string
}

interface LoadedBook {
  name: string
  url: string
  fileSize: number
  entryCount: number
  /** If fully loaded, the entries array; otherwise null */
  entries: BookEntry[] | null
  /** Fetch function bound to this book's URL */
  fetchFn: (offset: number, length: number) => Promise<Uint8Array>
}

// ============================================================
// Module state
// ============================================================

let discoveredBooks: BookFile[] | null = null
let loadedBooks: LoadedBook[] = []
let initPromise: Promise<void> | null = null

/** Prevent multiple simultaneous book loads */
let loadLock = false

// ============================================================
// Book Discovery
// ============================================================

/**
 * Discover available .bin files.
 * In production: fetch `/opening_books/` directory listing (not always available).
 * We use a manifest approach: try common book names or use a pre-defined list.
 *
 * Strategy:
 * 1. Try to fetch known book names
 * 2. Cache the result
 */
const KNOWN_BOOK_NAMES = [
  'book.bin',
  'komodo.bin',
  'gm2001.bin',
  'performance.bin',
  'varied.bin',
  'elo2400.bin',
  'Titans.bin',
  'Human.bin',
]

async function discoverBooks(): Promise<BookFile[]> {
  if (discoveredBooks) return discoveredBooks

  const basePath = '/opening_books/'
  const available: BookFile[] = []

  // Probe each known book name with a HEAD request
  const probes = KNOWN_BOOK_NAMES.map(async (name) => {
    try {
      const resp = await fetch(basePath + name, { method: 'HEAD' })
      if (resp.ok) {
        const length = resp.headers.get('content-length')
        if (length && parseInt(length, 10) > 0) {
          available.push({ name, url: basePath + name })
        }
      }
    } catch {
      // File doesn't exist or is not accessible
    }
  })

  await Promise.all(probes)

  // Sort by name for deterministic order
  available.sort((a, b) => a.name.localeCompare(b.name))
  discoveredBooks = available
  return available
}

// ============================================================
// Fetch helpers
// ============================================================

/**
 * Create a fetch function for a book URL that supports Range requests.
 */
function createFetchFn(url: string): (offset: number, length: number) => Promise<Uint8Array> {
  return async (offset: number, length: number): Promise<Uint8Array> => {
    const resp = await fetch(url, {
      headers: {
        Range: `bytes=${offset}-${offset + length - 1}`,
      },
    })

    if (!resp.ok) {
      // If Range is not supported (status 200 instead of 206), we need to
      // fall back to full download. We signal this via a special error.
      if (resp.status === 200) {
        throw new RangeNotSupportedError('Range requests not supported by server')
      }
      throw new Error(`Failed to fetch book data: ${resp.status}`)
    }

    const buffer = await resp.arrayBuffer()
    return new Uint8Array(buffer)
  }
}

class RangeNotSupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RangeNotSupportedError'
  }
}

/**
 * Load the entire book into memory (fallback when Range is not supported).
 */
async function loadEntireBook(url: string): Promise<Uint8Array> {
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`Failed to load book: ${resp.status}`)
  }
  const buffer = await resp.arrayBuffer()
  return new Uint8Array(buffer)
}

// ============================================================
// Book Loading
// ============================================================

async function loadSingleBook(file: BookFile): Promise<LoadedBook> {
  const fetchFn = createFetchFn(file.url)

  // Step 1: Get file size and check Range support
  let fileSize = 0
  let rangeSupported = true
  try {
    const headResp = await fetch(file.url, { method: 'HEAD' })
    const length = headResp.headers.get('content-length')
    fileSize = length ? parseInt(length, 10) : 0

    // Verify Range support via a 1-byte probe request
    const rangeCheck = await fetch(file.url, {
      headers: { Range: 'bytes=0-0' },
    })
    rangeSupported = rangeCheck.status === 206
  } catch {
    rangeSupported = false
  }

  if (fileSize === 0) {
    throw new Error(`Book "${file.name}" is empty`)
  }

  const entryCount = Math.floor(fileSize / ENTRY_SIZE)

  // Small book: load entirely into memory
  if (fileSize <= MAX_FULL_LOAD_BYTES) {
    const rawData = await loadEntireBook(file.url)
    const entries: BookEntry[] = []
    for (let i = 0; i < entryCount; i++) {
      const off = i * ENTRY_SIZE
      entries.push({
        key: readUint64BE(rawData, off),
        move: readUint16BE(rawData, off + 8),
        weight: readUint16BE(rawData, off + 10),
      })
    }
    return {
      name: file.name,
      url: file.url,
      fileSize: rawData.length,
      entryCount,
      entries,
      fetchFn,
    }
  }

  // Large book: require Range support for binary search
  if (!rangeSupported) {
    console.warn(
      `[OpeningBook] Book "${file.name}" is ${(fileSize / 1024 / 1024).toFixed(1)} MB ` +
      `and server does not support Range requests. Skipping.`,
    )
    throw new Error(`Book too large for full load without Range support`)
  }

  // Binary search mode — entries fetched on demand via Range requests
  return {
    name: file.name,
    url: file.url,
    fileSize,
    entryCount,
    entries: null,
    fetchFn,
  }
}

async function loadAllBooks(): Promise<void> {
  if (loadLock) {
    // Wait for existing load to complete
    while (loadLock) {
      await new Promise((r) => setTimeout(r, 10))
    }
    return
  }

  loadLock = true
  try {
    const books = await discoverBooks()
    const loaded: LoadedBook[] = []
    for (const book of books) {
      try {
        const lb = await loadSingleBook(book)
        loaded.push(lb)
      } catch (e) {
        console.warn(`[OpeningBook] Failed to load book "${book.name}":`, e)
      }
    }
    loadedBooks = loaded
  } finally {
    loadLock = false
  }
}

// ============================================================
// Binary Search in Book
// ============================================================

/**
 * Fetch a single entry at a given index from a disk-resident book.
 */
async function fetchEntry(book: LoadedBook, index: number): Promise<BookEntry> {
  if (index < 0 || index >= book.entryCount) {
    throw new Error(`Entry index ${index} out of range`)
  }
  const offset = index * ENTRY_SIZE
  const data = await book.fetchFn(offset, ENTRY_SIZE)
  return {
    key: readUint64BE(data, 0),
    move: readUint16BE(data, 8),
    weight: readUint16BE(data, 10),
  }
}

/**
 * Find the first index where entries[index].key >= targetKey.
 * Returns [found, index].
 * - If found is true, index points to the first entry with key == targetKey.
 * - If found is false, index points to where targetKey would be inserted.
 */
async function lowerBound(
  book: LoadedBook,
  targetKey: bigint,
): Promise<{ found: boolean; index: number }> {
  // In-memory path
  if (book.entries) {
    let lo = 0
    let hi = book.entryCount
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      const midKey = book.entries[mid]!.key
      if (midKey < targetKey) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    if (lo < book.entryCount && book.entries[lo]!.key === targetKey) {
      return { found: true, index: lo }
    }
    return { found: false, index: lo }
  }

  // Disk-resident path: binary search with Range fetches
  let lo = 0
  let hi = book.entryCount
  let found = false

  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    const entry = await fetchEntry(book, mid)
    if (entry.key < targetKey) {
      lo = mid + 1
    } else if (entry.key > targetKey) {
      hi = mid
    } else {
      // Found a matching entry - now find the first one
      // (keys are sorted, but there may be duplicates)
      hi = mid
      found = true
    }
  }

  return { found, index: lo }
}

/**
 * Collect all entries matching a given Polyglot key from a book.
 */
async function collectMatches(
  book: LoadedBook,
  polyglotKey: bigint,
): Promise<BookEntry[]> {
  const { found, index } = await lowerBound(book, polyglotKey)
  if (!found) return []

  const matches: BookEntry[] = []

  if (book.entries) {
    for (let i = index; i < book.entryCount; i++) {
      const entry = book.entries[i]!
      if (entry.key !== polyglotKey) break
      matches.push(entry)
    }
  } else {
    for (let i = index; i < book.entryCount; i++) {
      const entry = await fetchEntry(book, i)
      if (entry.key !== polyglotKey) break
      matches.push(entry)
    }
  }

  return matches
}

// ============================================================
// Move Conversion
// ============================================================

/**
 * Detect if a Polyglot move is a castle move and determine rook positions.
 * This is an approximation since Polyglot move format doesn't explicitly
 * encode castling.
 */
function detectCastle(
  _board: Board,
  move: PolyglotMove,
): { special?: 'castle'; rookFrom?: { row: number; col: number }; rookTo?: { row: number; col: number } } {
  const { fromRow, fromCol, toRow, toCol } = move

  // King-side castling: king moves two squares right
  if (Math.abs(toCol - fromCol) === 2 && fromRow === toRow) {
    if (toCol > fromCol) {
      // Kingside castle
      return {
        special: 'castle',
        rookFrom: { row: fromRow, col: 7 },
        rookTo: { row: fromRow, col: fromCol + 1 },
      }
    } else {
      // Queenside castle
      return {
        special: 'castle',
        rookFrom: { row: fromRow, col: 0 },
        rookTo: { row: fromRow, col: fromCol - 1 },
      }
    }
  }

  return {}
}

/**
 * Convert a Polyglot move to an AIDetailedMove.
 * On initial position, white king is at (7,4) and black king at (0,4).
 * We detect castling by checking if it's a king moving 2 squares horizontally.
 */
function polyglotToAIMove(
  board: Board,
  polyMove: PolyglotMove,
): AIDetailedMove | null {
  const { fromRow, fromCol, toRow, toCol, promotion } = polyMove

  // Basic bounds check
  if (
    fromRow < 0 || fromRow > 7 || fromCol < 0 || fromCol > 7 ||
    toRow < 0 || toRow > 7 || toCol < 0 || toCol > 7
  ) {
    return null
  }

  const piece = board[fromRow]![fromCol]
  if (!piece) return null

  // Check if this is a castling move
  const castle = detectCastle(board, polyMove)

  // Check for en passant: pawn moves diagonally to an empty square
  let special: 'castle' | 'enPassant' | undefined = castle.special
  if (!special && piece.type === 'pawn' && fromCol !== toCol && !board[toRow]![toCol]) {
    special = 'enPassant'
  }

  const result: AIDetailedMove = {
    fromRow,
    fromCol,
    toRow,
    toCol,
    special,
    rookFrom: castle.rookFrom,
    rookTo: castle.rookTo,
  }

  if (promotion && piece.type === 'pawn' && (toRow === 0 || toRow === 7)) {
    result.promotion = promotion
  }

  return result
}

// ============================================================
// Legality Verification
// ============================================================

/**
 * Quick check: verify that a Polyglot-derived move is among the legal moves
 * for the current position.
 */
function isMoveLegal(
  board: Board,
  candidate: AIDetailedMove,
  legalMoves: AIDetailedMove[],
): boolean {
  for (const legal of legalMoves) {
    if (
      legal.fromRow === candidate.fromRow &&
      legal.fromCol === candidate.fromCol &&
      legal.toRow === candidate.toRow &&
      legal.toCol === candidate.toCol
    ) {
      // Promotion match only if both have same promotion (or neither)
      if ((legal.promotion ?? 'queen') === (candidate.promotion ?? 'queen')) {
        return true
      }
    }
  }
  return false
}

// ============================================================
// Public API
// ============================================================

/**
 * Query the opening book for the current position.
 *
 * @param board - The current board state
 * @param color - The side to move
 * @param lastMove - The last move made (for en passant detection)
 * @param legalMoves - Pre-computed legal moves (for verification)
 * @returns An AIDetailedMove if a book move is found, or null otherwise
 */
export async function queryOpeningBook(
  board: Board,
  color: Color,
  lastMove: { from: { row: number; col: number }; to: { row: number; col: number } } | null,
  legalMoves: AIDetailedMove[],
): Promise<AIDetailedMove | null> {
  // Lazy initialization
  if (!initPromise) {
    initPromise = loadAllBooks()
  }
  await initPromise

  if (loadedBooks.length === 0) return null

  // Compute Polyglot hash for the current position
  const epTarget = getEnPassantTarget(lastMove)
  const epFile = epTarget ? epTarget.col : null
  const polyglotRights = getPolyglotCastlingRights(board)
  const hash = computePolyglotHash(board, color, epFile, polyglotRights)

  // Collect all matching entries across all loaded books
  const allMatches: BookEntry[] = []
  for (const book of loadedBooks) {
    try {
      const matches = await collectMatches(book, hash)
      allMatches.push(...matches)
    } catch (e) {
      console.warn(`[OpeningBook] Error querying book "${book.name}":`, e)
    }
  }

  if (allMatches.length === 0) return null

  // Convert to moves and filter to legal ones
  const candidates: { move: AIDetailedMove; weight: number }[] = []
  for (const entry of allMatches) {
    const polyMove = decodePolyglotMove(entry.move)
    const aiMove = polyglotToAIMove(board, polyMove)
    if (aiMove && isMoveLegal(board, aiMove, legalMoves)) {
      candidates.push({ move: aiMove, weight: entry.weight })
    }
  }

  if (candidates.length === 0) return null

  // Select a move randomly, weighted by the book entry weights.
  // Each entry's weight represents a relative probability.
  let totalWeight = 0
  for (const c of candidates) {
    totalWeight += Math.max(1, c.weight)
  }

  let roll = Math.random() * totalWeight
  for (const c of candidates) {
    roll -= Math.max(1, c.weight)
    if (roll <= 0) {
      return c.move
    }
  }

  // Fallback: return the first candidate
  return candidates[0]!.move
}

/**
 * Check if any opening books are available.
 * Does NOT trigger book loading.
 */
export function hasOpeningBooks(): boolean {
  if (loadedBooks.length > 0) return true
  return false
}

/**
 * Pre-load opening books. Call this early (e.g., on app start) to avoid
 * latency during the first move search.
 */
export function preloadOpeningBooks(): void {
  if (!initPromise) {
    initPromise = loadAllBooks()
  }
}

/**
 * Get the list of loaded book names (for debugging / UI).
 */
export function getLoadedBookNames(): string[] {
  return loadedBooks.map((b) => b.name)
}