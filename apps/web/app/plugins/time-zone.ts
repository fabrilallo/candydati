import { setDisplayTimeZone } from '@/lib/format'

/** The same zone on the server and in the browser, so rendered dates match when the page hydrates. */
export default defineNuxtPlugin(() => {
  setDisplayTimeZone(useRuntimeConfig().public.timeZone)
})
