import { watch } from 'vue'
import { createI18n } from 'vue-i18n'
import { messages, SUPPORTED_LOCALES, type Locale } from '../data/i18n'

const STORAGE_KEY = 'chess_locale'

export const DEFAULT_LOCALE: Locale = 'zh-CN'

// 默认语言：优先读取本地保存，其次根据浏览器语言判断
function detectLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && SUPPORTED_LOCALES.includes(saved as Locale)) {
    return saved as Locale
  }
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en')) {
    return 'en-US'
  }
  return DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages,
  // 字典使用扁平 key（如 'settings.title'）
  flatJson: true,
  missingWarn: false,
  fallbackWarn: false,
})

// 语言变更：持久化并同步 <html lang>
watch(
  i18n.global.locale,
  (value) => {
    localStorage.setItem(STORAGE_KEY, value)
    document.documentElement.setAttribute('lang', value)
  },
  { immediate: true },
)
