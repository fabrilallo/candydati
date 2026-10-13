import type { Viewer } from '@/lib/viewer'
import { loadViewer } from '@/lib/viewer'

/**
 * Signed-in user, active organization and role. `undefined` = not loaded yet, `null` = anonymous.
 * Loaded once per request on the server and handed to the browser through the payload; refreshed explicitly
 * after sign in, organization creation and invitation acceptance.
 */
export const useViewer = () => {
  const state = useState<Viewer | null | undefined>('viewer', () => undefined)
  const api = useAuthApi()

  const refresh = async (): Promise<Viewer | null> => {
    state.value = await loadViewer(api)
    return state.value
  }
  const ensure = async (): Promise<Viewer | null> => (state.value === undefined ? refresh() : state.value)
  const clear = (): void => {
    state.value = null
  }

  return { viewer: state, ensure, refresh, clear }
}
