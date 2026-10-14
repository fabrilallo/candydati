import type { CareersMediaDto, CareersPageDocument, Locale, LocalizedText, PublicCareersDto } from '@tt/domain'
import type { ComputedRef, InjectionKey } from 'vue'
import { textIn } from '@/lib/careers-site'

/** `public`: the careers page. `preview`: the same rendering inside the editor (no navigation away, no scroll jumps). */
export type CareersSiteMode = 'public' | 'preview'

export interface CareersSiteContext {
  readonly page: CareersPageDocument
  readonly media: Readonly<Record<string, CareersMediaDto>>
  readonly careers: PublicCareersDto
  readonly mode: CareersSiteMode
  /** The visitor's text for a localized field. */
  readonly tx: (text: LocalizedText | undefined) => string
}

const KEY: InjectionKey<ComputedRef<CareersSiteContext>> = Symbol('careers-site')

/**
 * Called by `CareersSite`: every section reads the page, its media and the visitor's language from here. `locale`
 * overrides the interface language for the page's own text (the editor previews the language being edited).
 */
export const provideCareersSite = (input: ComputedRef<Omit<CareersSiteContext, 'tx'> & { readonly locale?: Locale | undefined }>): ComputedRef<CareersSiteContext> => {
  const { locale } = useI18n()
  const context = computed(() => {
    const { locale: textLocale, ...rest } = input.value
    return { ...rest, tx: textIn(textLocale ?? (locale.value as Locale), input.value.page) }
  })
  provide(KEY, context)
  return context
}

export const useCareersSite = (): ComputedRef<CareersSiteContext> => {
  const context = inject(KEY)
  if (!context) throw new Error('useCareersSite outside CareersSite')
  return context
}
