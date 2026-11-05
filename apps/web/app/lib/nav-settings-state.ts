/** Key under which this browser remembers that the settings part of the side menu was left collapsed. */
export const SETTINGS_COLLAPSED_KEY = 'candydati.nav.settingsCollapsed'

/**
 * Whether the settings part of the menu was left collapsed. The storage is a getter so that a browser which throws on
 * access (private mode, blocked site data) falls back to expanded instead of breaking the menu.
 */
export const readSettingsCollapsed = (storage: () => Storage): boolean => {
  try {
    return storage().getItem(SETTINGS_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/** Remembers the choice for this browser. A failed write only means the next visit starts expanded. */
export const writeSettingsCollapsed = (storage: () => Storage, collapsed: boolean): void => {
  try {
    storage().setItem(SETTINGS_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // Storage is blocked: the toggle still works for this visit.
  }
}
