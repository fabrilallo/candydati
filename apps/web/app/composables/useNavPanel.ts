import { readPanelOpen, writePanelOpen, type PreferenceStorage } from '@/lib/nav-preference'

const browserStorage = (): PreferenceStorage | null => {
  try {
    return import.meta.client ? window.localStorage : null
  } catch {
    return null
  }
}

/**
 * Shell state: the desktop navigation panel (expanded or collapsed, remembered per viewer) and the mobile drawer.
 * The server always renders the panel open; the stored choice is applied once mounted.
 */
export const useNavPanel = () => {
  const panelOpen = useState('nav-panel-open', () => true)
  const drawerOpen = useState('nav-drawer-open', () => false)
  const restore = (): void => {
    panelOpen.value = readPanelOpen(browserStorage())
  }
  const togglePanel = (): void => {
    panelOpen.value = !panelOpen.value
    writePanelOpen(browserStorage(), panelOpen.value)
  }
  return { panelOpen, drawerOpen, restore, togglePanel }
}
