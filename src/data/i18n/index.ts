import zhCN from './zh_cn'
import en from './en'

export type Locale = 'zh-CN' | 'en-US'

export const SUPPORTED_LOCALES: Locale[] = ['zh-CN', 'en-US']

// 使用扁平 key（配合 vue-i18n 的 flatJson 选项）
export const messages: Record<Locale, Record<string, string>> = {
  'zh-CN': zhCN,
  'en-US': en,
}

export type { MessageKey } from './zh_cn'
