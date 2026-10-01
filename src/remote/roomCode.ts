// ============================================================
// 房间码：生成 / 归一化 / 校验
//   字母表刻意剔除 I O 0 1 等易混字符，方便口头或手抄传递
// ============================================================

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** 房间码长度 */
export const ROOM_CODE_LENGTH = 6

/** 生成一个新的房间码 */
export const generateRoomCode = (): string => {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]!
  }
  return code
}

/** 归一化用户输入：大写、剔除非法字符、截断到固定长度 */
export const normalizeRoomCode = (input: string): string => {
  const upper = input.toUpperCase()
  let code = ''
  for (const char of upper) {
    if (ALPHABET.includes(char)) {
      code += char
    }
    if (code.length >= ROOM_CODE_LENGTH) break
  }
  return code
}

/** 是否为合法（可直接使用）的房间码 */
export const isValidRoomCode = (code: string): boolean =>
  code.length === ROOM_CODE_LENGTH && [...code].every((char) => ALPHABET.includes(char))

/** BroadcastChannel 频道名 */
export const roomChannelName = (code: string): string => `chessdragon:room:${code}`

/** PeerJS 节点 id（小写，仅含字母数字与连字符） */
export const roomPeerId = (code: string): string => `chessdragon-${code.toLowerCase()}`

/** Trystero 房间 id（在 appId 命名空间之下，直接复用房间码即可） */
export const trysteroRoomId = (code: string): string => `chessdragon-${code.toLowerCase()}`

/** Trystero 会话口令：由房间码派生，双方必须一致，用作端到端加密密钥 */
export const trysteroPassword = (code: string): string => `chessdragon:${code}`

/** 复制到剪贴板（失败时回退到 execCommand，与 Sidebar 的 PGN 复制保持一致） */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      return true
    } catch {
      return false
    }
  }
}
