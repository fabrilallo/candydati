import { listConnectedApps, revokeConnectedApp } from '@/lib/connected-app-api'
import { loaded } from '@/lib/job-api'
import type { ConnectedApp } from '@candydati/domain'

/** The apps connected to the organization through OAuth (own grants; owners and admins see everyone's). */
export const useConnectedApps = () => {
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData('connected-apps', () => loaded(() => listConnectedApps(request)))
  const apps = useSyncedData<readonly ConnectedApp[]>(data)
  const busy = ref<string | null>(null)
  const run = useBusyRunner(busy)

  /** A revoked grant is gone (its tokens with it): it leaves the list, the audit log keeps the trace. */
  const revoke = async (app: ConnectedApp): Promise<boolean> => {
    const done = await run(app.id, () => revokeConnectedApp(request, app.id).then(() => true), 'connectedApps.revoked')
    if (done) apps.value = (apps.value ?? []).filter((item) => item.id !== app.id)
    return done === true
  }

  return {
    apps: computed(() => apps.value),
    errorKey: computed(() => data.value?.errorKey ?? null),
    busy: computed(() => busy.value),
    refresh,
    revoke,
  }
}
