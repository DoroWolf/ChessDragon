import { ref, watch, computed, type Ref } from 'vue'
import type { Board, Color, PieceType } from '../models/chess'
import { isKingInCheck, cloneBoard } from '../models/chess'
import dialogueData from '../data/dialogue/zh_cn.json'

// ============================================================
// 类型定义
// ============================================================
type DialogueMap = Record<string, string>

interface BoardSnapshot {
  board: Board
  whiteInCheck: boolean
  blackInCheck: boolean
}

// ============================================================
// 台词选择工具函数
// ============================================================
function getRandomLine(category: string): string {
  const prefix = `aussir.${category}.`
  const matchingKeys = Object.keys(dialogueData as DialogueMap).filter((k) => k.startsWith(prefix))

  if (matchingKeys.length === 0) {
    // 尝试加上编号模式 (.1, .2, ...)
    const numberedKeys = Object.keys(dialogueData as DialogueMap).filter((k) =>
      k.startsWith(`aussir.${category}.`),
    )
    if (numberedKeys.length > 0) {
      const randomKey = numberedKeys[Math.floor(Math.random() * numberedKeys.length)]!
      return (dialogueData as DialogueMap)[randomKey] ?? ''
    }
    return ''
  }

  const randomKey = matchingKeys[Math.floor(Math.random() * matchingKeys.length)]!
  return (dialogueData as DialogueMap)[randomKey] ?? ''
}

function getPieceValue(type: PieceType): number {
  const values: Record<PieceType, number> = {
    pawn: 1,
    knight: 3,
    bishop: 3,
    rook: 5,
    queen: 9,
    king: 0,
  }
  return values[type]
}

// ============================================================
// Composable
// ============================================================
export function useDragonDialogue(
  board: Ref<Board>,
  currentTurn: Ref<Color>,
  moveHistory: Ref<string[]>,
  gameMode: Ref<'ai' | 'human' | 'remote'>,
  playerColor: Ref<Color>,
  isGameOver: Ref<boolean>,
  gameStatusMessage: Ref<string | undefined>,
  halfmoveClock: Ref<number>,
  getPositionCount: () => number,
  isDrawByStalemate: Ref<boolean>,
  isDrawByInsufficientMaterial: Ref<boolean>,
  hasResigned: Ref<Color | null>,
  timeoutWinner: Ref<Color | null>,
) {
  // ---- 暴露的状态 ----
  const currentDialogue = ref('')
  const dialogueKey = ref(0) // 自增以触发打字机动画重播

  // ---- 内部状态 ----
  let prevSnapshot: BoardSnapshot | null = null
  let pendingDialogueText: string | null = null
  let roundStartBoard: Board | null = null // 一回合开始时的棋盘（用于回合结束后比较吃子）
  const isAIEnabled = computed(() => gameMode.value === 'ai')
  const aiColor = computed(() => (playerColor.value === 'white' ? 'black' : 'white'))

  // ---- 创建棋盘快照 ----
  function takeSnapshot(boardVal: Board): BoardSnapshot {
    return {
      board: cloneBoard(boardVal),
      whiteInCheck: isKingInCheck(boardVal, 'white'),
      blackInCheck: isKingInCheck(boardVal, 'black'),
    }
  }

  // ---- 分析棋盘变化，检测即时事件（将军/升变，不含吃子） ----
  function analyzeMoveChange(prevBoard: Board, currBoard: Board, moverColor: Color): string | null {
    const isAIMove = moverColor === aiColor.value
    const opponentColor = moverColor === 'white' ? 'black' : 'white'

    // 检测升变：mover 方兵减少、非兵非王棋子增加
    const pieceTypes: PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen']
    let isPromotion = false
    {
      const moverPawnPrev = countType(prevBoard, moverColor, 'pawn')
      const moverPawnCurr = countType(currBoard, moverColor, 'pawn')
      if (moverPawnCurr < moverPawnPrev) {
        let promotedCount = 0
        for (const t of pieceTypes) {
          if (t === 'pawn') continue
          promotedCount += Math.max(0, countType(currBoard, moverColor, t) - countType(prevBoard, moverColor, t))
        }
        if (promotedCount > 0) {
          isPromotion = true
        }
      }
    }

    // 检测将军
    const opponentInCheck = isKingInCheck(currBoard, opponentColor)

    // AI 解将检测（AI 走子前被将军，走子后未被将军）
    const aiEscapedCheck =
      isAIMove && isKingInCheck(prevBoard, aiColor.value) && !isKingInCheck(currBoard, aiColor.value)

    // 按优先级返回台词：将军/解将 > 升变
    if (isAIMove && opponentInCheck) {
      // AI 将军了玩家 → aussir.check.*
      return getRandomLine('check')
    }
    // AI 解将（必须在将军检测之后，因为 AI 解将的同时可能也将军了玩家）
    if (aiEscapedCheck) {
      return getRandomLine('out_of_check')
    }
    // 玩家将军了 AI → 不立即产生台词，等 AI 解将后再显示
    if (isPromotion) {
      return getRandomLine('promotion')
    }

    return null
  }

  // 统计指定颜色、类型的棋子数量
  function countType(board: Board, color: Color, type: PieceType): number {
    let count = 0
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r]?.[c]
        if (p && p.color === color && p.type === type) count++
      }
    }
    return count
  }

  // 比较回合初与当前棋盘，计算吃子对话
  function computeCaptureDialogue(startBoard: Board, endBoard: Board): string | null {
    const pieceTypes: PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen']
    const aiLostPieces: PieceType[] = []
    const playerLostPieces: PieceType[] = []

    for (const type of pieceTypes) {
      const aiStart = countType(startBoard, aiColor.value, type)
      const aiEnd = countType(endBoard, aiColor.value, type)
      const playerStart = countType(startBoard, playerColor.value, type)
      const playerEnd = countType(endBoard, playerColor.value, type)

      const aiLost = aiStart - aiEnd
      const playerLost = playerStart - playerEnd

      for (let i = 0; i < aiLost; i++) aiLostPieces.push(type)
      for (let i = 0; i < playerLost; i++) playerLostPieces.push(type)
    }

    if (aiLostPieces.length === 0 && playerLostPieces.length === 0) {
      return null
    }

    const aiMaterial = aiLostPieces.reduce((sum, t) => sum + getPieceValue(t), 0)
    const playerMaterial = playerLostPieces.reduce((sum, t) => sum + getPieceValue(t), 0)

    if (aiMaterial > playerMaterial) {
      return getRandomLine(`lost.${aiLostPieces[0]!}`)
    } else if (playerMaterial > aiMaterial) {
      return getRandomLine(`capture.${playerLostPieces[0]!}`)
    }
    return getRandomLine('exchange')
  }

  // ---- 根据 gameStatusMessage 确定终局台词类别 ----
  function getEndGameCategory(): string | null {
    const msg = gameStatusMessage.value
    if (!msg) return null

    const aiWins = (): boolean => {
      if (msg.includes('黑方胜利') && aiColor.value === 'black') return true
      if (msg.includes('白方胜利') && aiColor.value === 'white') return true
      return false
    }

    if (msg.includes('将死')) {
      return aiWins() ? 'win.checkmate' : 'lose.checkmate'
    }

    if (msg.includes('超时')) {
      if (timeoutWinner.value === aiColor.value) return 'win.timeout'
      if (timeoutWinner.value === playerColor.value) return 'lose.timeout'
      // 双方超时无赢家 = 和棋
      return getDrawCategory()
    }

    if (msg.includes('认输')) {
      // 认输方是玩家 → AI 赢了
      if (hasResigned.value === playerColor.value) return 'win.resign'
      return 'lose.checkmate' // 不太可能，但 fallback
    }

    if (msg.includes('和棋')) {
      return getDrawCategory()
    }

    return null
  }

  function getDrawCategory(): string {
    if (isDrawByStalemate.value) return 'draw.stalemate'
    if (halfmoveClock.value >= 100) return 'draw.50move'
    if (getPositionCount() >= 3) return 'draw.repetition'
    if (isDrawByInsufficientMaterial.value) return 'draw.stalemate' // 无独立台词，用相近类别
    if (timeoutWinner.value === null && gameStatusMessage.value?.includes('超时')) return 'draw.timeout'
    return 'draw.stalemate'
  }

  // ---- 监听走棋（moveHistory 长度变化） ----
  watch(
    () => moveHistory.value.length,
    (newLen, oldLen) => {
      if (!isAIEnabled.value) return
      if (newLen <= (oldLen ?? 0)) {
        // 悔棋等回退操作：重置快照、更新回合起始棋盘，并播放悔棋台词
        prevSnapshot = takeSnapshot(board.value)
        pendingDialogueText = null
        roundStartBoard = cloneBoard(board.value)
        const undoLine = (dialogueData as DialogueMap)['aussir.undo']
        if (undoLine) {
          currentDialogue.value = undoLine
          dialogueKey.value++
        }
        return
      }

      const prevBoard = prevSnapshot?.board
      if (!prevBoard) {
        prevSnapshot = takeSnapshot(board.value)
        return
      }

      // 走棋方是当前回合的对方
      const moverColor = currentTurn.value === 'white' ? 'black' : 'white'

      // 检测即时事件（将军、升变），普通走子不触发台词
      const eventDialogue = analyzeMoveChange(prevBoard, board.value, moverColor)
      if (eventDialogue) {
        pendingDialogueText = eventDialogue
      }

      prevSnapshot = takeSnapshot(board.value)
    },
  )

  // ---- 监听回合切换 & 游戏结束 ----
  watch(
    [currentTurn, isGameOver, gameStatusMessage],
    () => {
      if (!isAIEnabled.value) return

      // 游戏结束：立即显示终局台词
      if (isGameOver.value && gameStatusMessage.value) {
        const category = getEndGameCategory()
        if (category) {
          const line = getRandomLine(category)
          if (line) {
            currentDialogue.value = line
            dialogueKey.value++
            pendingDialogueText = null
          }
        }
        roundStartBoard = null
        return
      }

      // 轮到玩家走棋时，表示一个完整回合结束，比较回合前后吃子
      // 注意：吃子台词优先级低于将军/升变（pendingDialogueText 已有值时说明发生了将军/升变）
      if (currentTurn.value === playerColor.value) {
        if (roundStartBoard && !pendingDialogueText) {
          const captureLine = computeCaptureDialogue(roundStartBoard, board.value)
          if (captureLine) {
            pendingDialogueText = captureLine
          }
        }
        roundStartBoard = cloneBoard(board.value)
      }

      // 首次初始化回合起始棋盘
      if (!roundStartBoard) {
        roundStartBoard = cloneBoard(board.value)
      }

      if (pendingDialogueText) {
        currentDialogue.value = pendingDialogueText
        dialogueKey.value++
        pendingDialogueText = null
      }
    },
    { immediate: true },
  )

  // ---- 初始化快照 ----
  watch(
    board,
    (newBoard) => {
      if (prevSnapshot === null && newBoard && newBoard.length === 8) {
        prevSnapshot = takeSnapshot(newBoard)
      }
    },
    { immediate: true },
  )

  // ---- 初始化：游戏开始时立即显示开局台词 ----
  watch(
    [() => gameMode.value, () => moveHistory.value.length],
    ([mode, historyLen], [oldMode, oldHistoryLen]) => {
      if (mode === 'ai' && historyLen === 0) {
        // 首次进入 AI 模式（immediate 触发或 mode 从非 ai 变为 ai）
        // 或重赛/重新开局（history 从非零变为零）时播放
        const isFirstEntry = oldHistoryLen === undefined || (oldMode !== undefined && oldMode !== 'ai')
        const isRestart = oldHistoryLen !== undefined && oldHistoryLen > 0
        if (isFirstEntry || isRestart) {
          const openingLine = getRandomLine('opening')
          if (openingLine) {
            currentDialogue.value = openingLine
            dialogueKey.value++
          }
          pendingDialogueText = null
        }
      }
    },
    { immediate: true },
  )

  return {
    currentDialogue,
    dialogueKey,
    isAIEnabled,
  }
}