import { ref, watch } from 'vue'

const STORAGE_KEYS = {
  SOUND_ENABLED: 'chess_sound_enabled',
  COORDINATE_MODE: 'chess_coordinate_mode',
} as const

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

  watch(isSoundEnabled, (newValue) => {
    localStorage.setItem(STORAGE_KEYS.SOUND_ENABLED, String(newValue))
  })

  watch(coordinateLabelMode, (newValue) => {
    localStorage.setItem(STORAGE_KEYS.COORDINATE_MODE, newValue)
  })

  return {
    isSoundEnabled,
    coordinateLabelMode,
  }
}