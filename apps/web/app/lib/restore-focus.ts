/**
 * Focus return for dialogs that are not opened by a `DialogTrigger` (opened from a menu item or from code): the primitive
 * only gives focus back to its own trigger, so without this focus falls to the page and a keyboard user starts over.
 */
let tracked: HTMLElement | null = null
let installed = false

/** Menus and dialogs are transient: focus inside them is never a place to return to. */
const TRANSIENT = '[role="dialog"], [role="alertdialog"], [role="menu"], [data-slot="sheet-content"]'

const onFocusIn = (event: FocusEvent): void => {
  const target = event.target
  if (target instanceof HTMLElement && target !== document.body && !target.closest(TRANSIENT)) tracked = target
}

/** Starts remembering the last focused element outside dialogs and menus. Safe to call many times, browser only. */
export const trackFocus = (): void => {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener('focusin', onFocusIn)
}

const lost = (): boolean => document.activeElement === null || document.activeElement === document.body

/** Called as a dialog closes: when focus ended on the page body, give it back to the element that had it before. */
export const restoreFocus = (): void => {
  const target = tracked
  setTimeout(() => {
    if (target?.isConnected && lost()) target.focus({ preventScroll: true })
  }, 0)
}

/** Test hook: forget everything. */
export const resetFocusTracking = (): void => {
  tracked = null
}
