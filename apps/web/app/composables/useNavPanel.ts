/** Shell state: the mobile navigation drawer. */
export const useNavPanel = () => {
  const drawerOpen = useState('nav-drawer-open', () => false)
  return { drawerOpen }
}
