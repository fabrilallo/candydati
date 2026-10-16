import { createApiKey, listApiKeys, revokeApiKey, type ApiKeyCreateInput } from '@/lib/api-key-api'
import { errorKeyOf } from '@/lib/auth-errors'
import { loaded } from '@/lib/job-api'
import type { ApiKeyCreatedDto, ApiKeyDto } from '@candydati/domain'

/** The organization's API keys (`api_key:manage`). The secret of a new key is returned once and never kept here. */
export const useApiKeys = () => {
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData('api-keys', () => loaded(() => listApiKeys(request)))
  const keys = useSyncedData<readonly ApiKeyDto[]>(data)
  const busy = ref<string | null>(null)
  const createErrorKey = ref<string | null>(null)
  const run = useBusyRunner(busy)

  const create = async (input: ApiKeyCreateInput): Promise<ApiKeyCreatedDto | null> => {
    busy.value = 'new'
    createErrorKey.value = null
    try {
      const created = await createApiKey(request, input)
      keys.value = [created.key, ...(keys.value ?? [])]
      return created
    } catch (error) {
      createErrorKey.value = errorKeyOf(error)
      return null
    } finally {
      busy.value = null
    }
  }

  /** The key stays in the list as revoked: it is history, and the audit log points at it. */
  const revoke = async (key: ApiKeyDto): Promise<boolean> => {
    const done = await run(key.id, () => revokeApiKey(request, key.id).then(() => true), 'apiKeys.revoked')
    const revokedAt = new Date().toISOString()
    if (done) keys.value = (keys.value ?? []).map((item) => (item.id === key.id ? { ...item, revokedAt } : item))
    return done === true
  }

  return {
    keys: computed(() => keys.value),
    errorKey: computed(() => data.value?.errorKey ?? null),
    busy: computed(() => busy.value),
    createErrorKey: computed(() => createErrorKey.value),
    clearError: (): void => {
      createErrorKey.value = null
    },
    refresh,
    create,
    revoke,
  }
}
