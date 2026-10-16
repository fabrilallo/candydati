import { isLocale } from '@candydati/domain'

const LOCALE_COOKIE = 'candydati.locale'
const ONE_YEAR = 60 * 60 * 24 * 365

/** Remembers the language the user picked; without the cookie the platform default applies. */
export default defineNuxtPlugin(async (nuxtApp) => {
  const i18n = nuxtApp.$i18n as { locale: Ref<string>; setLocale: (code: 'it' | 'en') => Promise<void> }
  const cookie = useCookie<string | null>(LOCALE_COOKIE, { maxAge: ONE_YEAR, sameSite: 'lax', path: '/' })
  if (isLocale(cookie.value) && cookie.value !== i18n.locale.value) await i18n.setLocale(cookie.value)
  watch(i18n.locale, (next) => {
    cookie.value = next
  })
})
