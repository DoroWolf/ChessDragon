import { useI18n as useVueI18n } from 'vue-i18n'
import type { MessageKey } from '../data/i18n'

export type TranslateParams = Record<string, string | number>

/**
 * 统一的 i18n 入口，内部委托给 vue-i18n 的 Composition API。
 * 返回带类型的 t(key) 与可写的 locale。
 */
export function useI18n() {
  const { t: vueT, locale } = useVueI18n()

  const t = (key: MessageKey, params?: TranslateParams): string =>
    params ? vueT(key, params) : vueT(key)

  return {
    locale,
    t,
  }
}
