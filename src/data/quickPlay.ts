// ============================================================
// 「快速对局」交接数据：棋盘编辑器 -> 主程序对局设置
//   编辑器把 FEN 与目标模式写入 sessionStorage 后原地跳转到 index.html，
//   主程序读取后直接进入对应模式的设置界面，并把棋盘预置为「自定义棋盘 + FEN」。
//   使用 sessionStorage 而非 URL 参数，避免 FEN 中的空格/斜杠污染地址栏与历史记录。
// ============================================================

const STORAGE_KEY = 'chess_quickplay'

export type QuickPlayGameMode = 'ai' | 'human' | 'remote'

export interface QuickPlayPayload {
  /** 编辑器生成的 FEN */
  fen: string
  /** 目标对局模式 */
  gameMode: QuickPlayGameMode
}

const isQuickPlayGameMode = (value: unknown): value is QuickPlayGameMode =>
  value === 'ai' || value === 'human' || value === 'remote'

/** 写入交接数据（供编辑器窗口调用） */
export const writeQuickPlay = (payload: QuickPlayPayload): void => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // sessionStorage 不可用（如隐私模式）：静默失败，主程序将退回首页
  }
}

/**
 * 读取并清除交接数据。
 * 一次性消费：读取后立即删除，避免刷新页面时重复进入设置界面。
 */
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
