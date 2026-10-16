import { loaded } from '@/lib/job-api'
import { listMigrationConnectors } from '@/lib/migration-connector-api'

/**
 * The built-in connectors this installation offers (none yet in production builds: the package upload is then the only
 * source). Shared by key, so the source step and the steps that name the source read the same list.
 */
export const useMigrationConnectors = () => {
  const request = useJobsApi()
  const { data, status, refresh } = useFreshAsyncData('migration-connectors', () => loaded(() => listMigrationConnectors(request)))
  const items = computed(() => data.value?.data ?? null)
  return {
    items,
    errorKey: computed(() => data.value?.errorKey ?? null),
    pending: computed(() => status.value === 'pending' || status.value === 'idle'),
    refresh,
    /** The vendor name of a connector id (as a batch's `sourceSystem` holds it), the id itself when unknown. */
    labelOf: (id: string): string => items.value?.find((connector) => connector.id === id)?.label ?? id,
  }
}
