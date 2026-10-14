import { trackFocus } from '@/lib/restore-focus'

/** Remembers where focus was before a dialog opens, so it can return there (see lib/restore-focus.ts). */
export default defineNuxtPlugin(() => {
  trackFocus()
})
