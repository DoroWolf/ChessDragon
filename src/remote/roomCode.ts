// 字母表刻意剔除 I O 易混字符，方便口头或手抄传递。
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'

export const ROOM_CODE_LENGTH = 6

export const generateRoomCode = (): string => {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]!
  }
  return code
}

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

export const isValidRoomCode = (code: string): boolean =>
  code.length === ROOM_CODE_LENGTH && [...code].every((char) => ALPHABET.includes(char))

export const roomChannelName = (code: string): string => `chessdragon:room:${code}`

export const roomPeerId = (code: string): string => `chessdragon-${code.toLowerCase()}`

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
