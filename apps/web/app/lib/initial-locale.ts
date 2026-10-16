import { isLocale, type Locale } from '@candydati/domain'

export interface InitialLocaleInput {
  /** Value of the `candydati.locale` cookie: the language the user picked. */
  readonly cookie: string | null | undefined
  /** `NUXT_PUBLIC_PLATFORM_DEFAULT_LOCALE` read at runtime: published images are built with one default, the deploy sets its own. */
  readonly platformDefault: string | undefined
}

/** The language to show first: the user's choice, else the instance default; null when neither is supported. */
export const initialLocale = ({ cookie, platformDefault }: InitialLocaleInput): Locale | null =>
  isLocale(cookie) ? cookie : isLocale(platformDefault) ? platformDefault : null
