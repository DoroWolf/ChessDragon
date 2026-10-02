// 用 sessionStorage 而非 URL 参数，避免 FEN 中的空格/斜杠污染地址栏与历史记录。
const STORAGE_KEY = 'chess_quickplay'

export type QuickPlayGameMode = 'ai' | 'human' | 'remote'

export interface QuickPlayPayload {
  fen: string
  gameMode: QuickPlayGameMode
}

const isQuickPlayGameMode = (value: unknown): value is QuickPlayGameMode =>
  value === 'ai' || value === 'human' || value === 'remote'

export const writeQuickPlay = (payload: QuickPlayPayload): void => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // sessionStorage 不可用（如隐私模式）：静默失败，主程序将退回首页
  }
}

export const consumeQuickPlay = (): QuickPlayPayload | null => {
  let raw: string | null = null

  try {
    raw = sessionStorage.getItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    return null
  }

  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as { fen?: unknown; gameMode?: unknown }
    if (typeof parsed.fen !== 'string' || !parsed.fen.trim()) return null
    if (!isQuickPlayGameMode(parsed.gameMode)) return null
    return { fen: parsed.fen, gameMode: parsed.gameMode }
  } catch {
    return null
  }
}
