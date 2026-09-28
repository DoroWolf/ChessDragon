import { ref, watch } from 'vue'

const STORAGE_KEYS = {
  SOUND_ENABLED: 'chess_sound_enabled',
  COORDINATE_MODE: 'chess_coordinate_mode',
  THEME: 'chess_theme',
} as const

export type Theme = 'light' | 'dark'

export function useSettings() {
  const savedSound = localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED)
  const isSoundEnabled = ref<boolean>(savedSound !== null ? savedSound === 'true' : true)

  const savedMode = localStorage.getItem(STORAGE_KEYS.COORDINATE_MODE) as
    | 'off'
    | 'inside'
    | 'outside'
    | null
  const coordinateLabelMode = ref<'off' | 'inside' | 'outside'>(
    savedMode && ['off', 'inside', 'outside'].includes(savedMode) ? savedMode : 'inside',
  )

  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME)
  const theme = ref<Theme>(savedTheme === 'dark' ? 'dark' : 'light')

  watch(isSoundEnabled, (newValue) => {
    localStorage.setItem(STORAGE_KEYS.SOUND_ENABLED, String(newValue))
  })

  watch(coordinateLabelMode, (newValue) => {
    localStorage.setItem(STORAGE_KEYS.COORDINATE_MODE, newValue)
  })

  // 主题：持久化并同步到 <html data-theme>，供 CSS 变量与棋盘纹理使用
  watch(
    theme,
    (newValue) => {
      localStorage.setItem(STORAGE_KEYS.THEME, newValue)
      document.documentElement.setAttribute('data-theme', newValue)
    },
    { immediate: true },
  )

  return {
    isSoundEnabled,
    coordinateLabelMode,
    theme,
  }
}