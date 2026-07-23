import { getBestAIMove } from '../models/ai'
import type { Board, Color, Square } from '../models/chess'

// ============================================================
// 消息类型
// ============================================================
interface WorkerRequest {
  type: 'findBestMove'
  board: Board
  color: Color
  difficulty: number
  style: string
  lastMove: { from: Square; to: Square } | null
}

interface WorkerResponse {
  type: 'bestMove'
  move: Record<string, unknown> | null
}

// 全局错误处理，确保任何异常都回传主线程
self.addEventListener('error', (evt) => {
  console.error('Worker global error:', evt.message)
})

self.addEventListener('unhandledrejection', (evt) => {
  console.error('Worker unhandled rejection:', evt.reason)
})

// ============================================================
// Worker 入口
// ============================================================
self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  if (e.data.type !== 'findBestMove') return

  const { board, color, difficulty, style, lastMove } = e.data

  try {
    const move = await getBestAIMove(
      board as Board,
      color as Color,
      difficulty as 1 | 2 | 3 | 4 | 5,
      style as 'balanced' | 'aggressive' | 'defensive' | 'unpredictable',
      lastMove,
    )

    const response: WorkerResponse = {
      type: 'bestMove',
      move: move as unknown as Record<string, unknown> | null,
    }
    self.postMessage(response)
  } catch (err) {
    console.error('Worker computation error:', err)
    self.postMessage({ type: 'bestMove', move: null })
  }
}
