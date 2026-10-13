import { SUPPORTED_LOCALES, type Locale, type VaguePhrase } from '@tt/domain'
import type { ComputedRef, InjectionKey, MaybeRefOrGetter } from 'vue'
import type { Gaps } from '@/lib/ad-gaps'
import type { ComplianceFix } from '@/lib/compliance-fix'
import type { ComplianceMark } from '@/lib/compliance-view'
import type { Params, Translate } from '@/lib/ad-text'

/**
 * Translator in a language that may change while the page is open (the editor preview follows the language
 * picked for the ad). Synchronous: the messages of that language must already be loaded, see `preloadAdLanguages`.
 */
export const useAdText = (language: MaybeRefOrGetter<string>): ComputedRef<Translate> => {
  const { t } = useI18n()
  return computed(() => {
    const wanted = toValue(language)
    const locale: Locale = SUPPORTED_LOCALES.find((code) => code === wanted) ?? SUPPORTED_LOCALES[0]
    return (key: string, params: Params = {}) => (typeof params.count === 'number' ? t(key, params, { locale, plural: params.count }) : t(key, params, { locale }))
  })
}

/** Loads every supported language, so the preview can switch language without waiting. */
export const preloadAdLanguages = async (): Promise<void> => {
  const i18n = useNuxtApp().$i18n
  await Promise.all(SUPPORTED_LOCALES.map((code) => i18n.loadLocaleMessages(code)))
}

export type AdMode = 'public' | 'preview'

/** What every part of `JobAdView` needs, shared once instead of passed through each component. */
export interface AdContext {
  readonly mode: AdMode
  readonly language: string
  /** Translator in the language of the ad. */
  readonly x: Translate
  /** Missing §5.1 elements by slot (preview only). */
  readonly gaps: Gaps
  /** Gaps in the warning tone (after the user asked what is missing); quiet on a fresh draft. */
  readonly loudGaps: boolean
  /** Vague phrases of the last analysis, highlighted in the preview. */
  readonly phrases: readonly VaguePhrase[]
  /** Compliance findings underlined in the preview (blocking in red, doubtful in amber). */
  readonly marks: readonly ComplianceMark[]
  readonly fix: (fix: ComplianceFix) => void
  /** Heading tag `depth` levels below the ad title (`h1` in public, `h2` in the preview). */
  readonly heading: (depth: number) => string
  readonly jump: (fieldId: string) => void
}

const AD_CONTEXT: InjectionKey<ComputedRef<AdContext>> = Symbol('ad-context')

export const provideAdContext = (context: ComputedRef<AdContext>): void => provide(AD_CONTEXT, context)

export const useAdContext = (): ComputedRef<AdContext> => {
  const context = inject(AD_CONTEXT, null)
  if (!context) throw new Error('useAdContext must be used inside JobAdView')
  return context
}
