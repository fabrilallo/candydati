/** Whether the navigation panel is expanded, remembered per viewer in this browser only. A convenience, never state. */
export const NAV_PANEL_KEY = 'tt.nav-panel'

export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

/** Open by default; storage can be missing or throw (private windows, blocked site data). */
export const readPanelOpen = (storage: PreferenceStorage | null): boolean => {
  try {
    return storage?.getItem(NAV_PANEL_KEY) !== 'closed'
  } catch {
    return true
  }
}

export const writePanelOpen = (storage: PreferenceStorage | null, open: boolean): void => {
  try {
    storage?.setItem(NAV_PANEL_KEY, open ? 'open' : 'closed')
  } catch {
    // Not remembered this time: the panel still works, only the choice is lost on reload.
  }
}
