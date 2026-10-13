import type { Locale } from '@tt/domain'
import type { Params, Translate } from '@/lib/ad-text'

/**
 * Translator in the language of an ad (not the visitor's). Loads that language's messages first, so the server
 * render and the hydration agree on the words. The second argument of `t` picks the locale explicitly.
 */
export const useAdTranslate = async (language: Locale): Promise<Translate> => {
  const { t } = useI18n()
  await useNuxtApp().$i18n.loadLocaleMessages(language)
  return (key: string, params: Params = {}) => (typeof params.count === 'number' ? t(key, params, { locale: language, plural: params.count }) : t(key, params, { locale: language }))
}

/** Translator in the visitor's language, shaped like `useAdTranslate` so pure helpers take one type. */
export const useVisitorTranslate = (): Translate => {
  const { t } = useI18n()
  return (key: string, params: Params = {}) => t(key, params)
}
